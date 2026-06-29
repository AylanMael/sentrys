import { NextRequest, NextResponse } from "next/server";

import {
  forbidden,
  isSuperAdmin,
  requireTenantUser,
} from "@/app/api/_utils/withTenant";
import { adminBucket, adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

type TenantOverview = {
  id: string;
  name: string;
  status: string;
  plan: string;
  ownerEmail: string | null;
  createdAtIso: string | null;
  updatedAtIso: string | null;
  counters: {
    users: number;
    agents: number;
    sites: number;
    clients: number;
    vacationsMonth: number;
    openIncidents: number;
  };
  riskLevel: "ok" | "watch" | "critical";
  riskReasons: string[];
};

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function text(value: unknown, fallback = "") {
  const str = String(value ?? "").trim();
  return str || fallback;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value || null;
  if (value instanceof Date) return value.toISOString();

  const timestamp = value as { toDate?: () => Date };
  if (typeof timestamp.toDate === "function") {
    return timestamp.toDate().toISOString();
  }

  return null;
}

function currentMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { from, to };
}

async function countQuery(query: FirebaseFirestore.Query) {
  try {
    const snapshot = await query.count().get();
    const count = snapshot.data().count;
    return Number.isFinite(count) ? count : 0;
  } catch {
    const fallback = await query.limit(1000).get();
    return fallback.size;
  }
}

function tenantName(id: string, data: Record<string, unknown>) {
  return (
    text(data.name) ||
    text(data.companyName) ||
    text(data.legalName) ||
    text(data.displayName) ||
    id
  );
}

function tenantPlan(data: Record<string, unknown>) {
  const subscription = data.subscription as Record<string, unknown> | undefined;
  const plan = data.plan as Record<string, unknown> | undefined;

  return (
    text(subscription?.planName) ||
    text(subscription?.planId) ||
    text(plan?.name) ||
    text(data.planName) ||
    text(data.planId) ||
    "standard"
  );
}

function tenantOwnerEmail(data: Record<string, unknown>) {
  const owner = data.owner as Record<string, unknown> | undefined;
  return (
    text(data.ownerEmail) ||
    text(data.email) ||
    text(owner?.email) ||
    null
  );
}

function riskForTenant(input: {
  status: string;
  users: number;
  agents: number;
  sites: number;
  openIncidents: number;
}) {
  const reasons: string[] = [];

  if (!["active", "trialing", "trial", "ok"].includes(input.status)) {
    reasons.push(`Statut ${input.status}`);
  }
  if (input.users === 0) reasons.push("Aucun utilisateur actif");
  if (input.agents === 0) reasons.push("Aucun agent");
  if (input.sites === 0) reasons.push("Aucun site");
  if (input.openIncidents > 0) {
    reasons.push(`${input.openIncidents} incident(s) ouvert(s)`);
  }

  const critical =
    input.status === "suspended" ||
    input.status === "disabled" ||
    input.users === 0;

  return {
    riskLevel: critical ? "critical" : reasons.length > 0 ? "watch" : "ok",
    riskReasons: reasons,
  } satisfies Pick<TenantOverview, "riskLevel" | "riskReasons">;
}

export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!isSuperAdmin(auth.role)) {
    return forbidden("Super admin SaaS required");
  }

  const maxRaw = Number(req.nextUrl.searchParams.get("max") ?? 80);
  const max = Math.min(Math.max(Number.isFinite(maxRaw) ? maxRaw : 80, 1), 150);
  const monthRange = currentMonthRange();

  try {
    const tenantsSnap = await adminDb
      .collection("tenants")
      .orderBy("createdAt", "desc")
      .limit(max)
      .get()
      .catch(() => adminDb.collection("tenants").limit(max).get());

    const tenants = await Promise.all(
      tenantsSnap.docs.map(async (doc) => {
        const data = doc.data() as Record<string, unknown>;
        const tenantId = doc.id;
        const status = text(data.status, "active").toLowerCase();

        const [
          users,
          agents,
          sites,
          clients,
          vacationsMonth,
          openIncidents,
        ] = await Promise.all([
          countQuery(
            adminDb
              .collection("tenantUsers")
              .where("tenantId", "==", tenantId)
              .where("status", "==", "active")
          ),
          countQuery(
            adminDb
              .collection("agents")
              .where("tenantId", "==", tenantId)
              .where("status", "==", "active")
          ),
          countQuery(
            adminDb
              .collection("sites")
              .where("tenantId", "==", tenantId)
              .where("isActive", "==", true)
          ),
          countQuery(
            adminDb.collection("clients").where("tenantId", "==", tenantId)
          ),
          countQuery(
            adminDb
              .collection("vacations")
              .where("tenantId", "==", tenantId)
              .where("startAt", ">=", monthRange.from.toISOString())
              .where("startAt", "<", monthRange.to.toISOString())
          ),
          countQuery(
            adminDb
              .collection("incidents")
              .where("tenantId", "==", tenantId)
              .where("status", "in", ["open", "investigating"])
          ),
        ]);

        const risk = riskForTenant({
          status,
          users,
          agents,
          sites,
          openIncidents,
        });

        return {
          id: tenantId,
          name: tenantName(tenantId, data),
          status,
          plan: tenantPlan(data),
          ownerEmail: tenantOwnerEmail(data),
          createdAtIso: toIso(data.createdAt),
          updatedAtIso: toIso(data.updatedAt),
          counters: {
            users,
            agents,
            sites,
            clients,
            vacationsMonth,
            openIncidents,
          },
          ...risk,
        } satisfies TenantOverview;
      })
    );

    const summary = tenants.reduce(
      (acc, tenant) => {
        acc.tenants += 1;
        if (tenant.status === "active" || tenant.status === "trial") {
          acc.activeTenants += 1;
        }
        if (tenant.riskLevel === "watch") acc.watchTenants += 1;
        if (tenant.riskLevel === "critical") acc.criticalTenants += 1;
        acc.users += tenant.counters.users;
        acc.agents += tenant.counters.agents;
        acc.sites += tenant.counters.sites;
        acc.clients += tenant.counters.clients;
        acc.vacationsMonth += tenant.counters.vacationsMonth;
        acc.openIncidents += tenant.counters.openIncidents;
        return acc;
      },
      {
        tenants: 0,
        activeTenants: 0,
        watchTenants: 0,
        criticalTenants: 0,
        users: 0,
        agents: 0,
        sites: 0,
        clients: 0,
        vacationsMonth: 0,
        openIncidents: 0,
      }
    );

    const signals = [
      ...(summary.criticalTenants > 0
        ? [
            {
              id: "critical-tenants",
              tone: "critical",
              title: "Agences en risque critique",
              detail: `${summary.criticalTenants} agence(s) necessitent une verification support.`,
              href: "#tenants",
            },
          ]
        : []),
      ...(summary.openIncidents > 0
        ? [
            {
              id: "open-incidents",
              tone: "warning",
              title: "Incidents ouverts multi-agences",
              detail: `${summary.openIncidents} incident(s) encore ouvert(s) sur le parc.`,
              href: "#tenants",
            },
          ]
        : []),
      {
        id: "audit-guardrail",
        tone: "info",
        title: "Impersonation non activee",
        detail:
          "L'acces support agence doit rester bloque tant que platformAuditLog et motif obligatoire ne sont pas finalises.",
        href: "#guardrails",
      },
    ];

    return json(200, {
      ok: true,
      generatedAtIso: new Date().toISOString(),
      requester: {
        uid: auth.uid,
        email: auth.email,
        role: auth.role,
      },
      health: {
        firestore: "connected",
        auth: "connected",
        storage: adminBucket.name ? "configured" : "not_configured",
        email: process.env.BREVO_API_KEY ? "provider_configured" : "simulation",
        environment: process.env.NODE_ENV ?? "unknown",
      },
      summary,
      tenants,
      signals,
    });
  } catch (error) {
    console.error("[platform.overview] error", error);
    return json(500, {
      ok: false,
      error: "Impossible de charger le backoffice SaaS.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
