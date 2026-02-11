// src/app/api/agents/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { requireTenantUser, canWrite } from "@/app/api/_utils/withTenant";
import { assertWithinLimitsTx } from "@/lib/billing/limits";
import { logActivity } from "@/lib/activity/logger";

export const runtime = "nodejs";

/* ================= types ================= */

type AgentStatus = "active" | "inactive";

type AgentDoc = {
  tenantId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  status: AgentStatus;

  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  createdBy?: string;
  updatedBy?: string;

  search?: string;
};

/* ================= helpers ================= */

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function bad(msg: string, extra?: any) {
  return json(400, { ok: false, error: msg, ...extra });
}

function forbidden(msg = "Forbidden", extra?: any) {
  return json(403, { ok: false, error: msg, ...extra });
}

function serverError(e: any, tag: string) {
  console.error(`[${tag}]`, e);
  return json(500, {
    ok: false,
    error: "Internal error",
    details: e?.message ?? String(e),
  });
}

function normalizeText(v: any) {
  return String(v ?? "").trim();
}

function toIso(ts: any) {
  return ts && typeof ts.toDate === "function" ? ts.toDate().toISOString() : null;
}

function toMs(ts: any): number {
  const d = ts?.toDate?.();
  if (!d || typeof d.getTime !== "function") return 0;
  return d.getTime();
}

function normalizeStatus(input: string | null): "all" | AgentStatus {
  const v = (input ?? "active").toLowerCase().trim();
  if (v === "all") return "all";
  if (v === "inactive") return "inactive";
  return "active";
}

function buildSearch(
  firstName: string,
  lastName: string,
  email?: string | null,
  phone?: string | null
) {
  const parts = [firstName, lastName, email ?? "", phone ?? ""]
    .map((x) => normalizeText(x).toLowerCase())
    .filter(Boolean);
  return parts.join(" ");
}

function safeIdsParam(v: string | null): string[] {
  if (!v) return [];
  const out = v
    .split(",")
    .map((s) => normalizeText(s))
    .filter(Boolean);
  return Array.from(new Set(out)).slice(0, 200);
}

function parseMax(v: string | null, def = 50) {
  const n = Number(v ?? "");
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), 200);
}

function pickAgent(d: any, id: string) {
  const firstName = d.firstName ?? null;
  const lastName = d.lastName ?? null;

  return {
    id,
    tenantId: d.tenantId,

    firstName,
    lastName,
    email: d.email ?? null,
    phone: d.phone ?? null,
    status: (d.status ?? "active") as AgentStatus,
    search: d.search ?? null,

    createdBy: d.createdBy ?? null,
    updatedBy: d.updatedBy ?? null,

    createdAtIso: toIso(d.createdAt),
    updatedAtIso: toIso(d.updatedAt),
    createdAtMs: toMs(d.createdAt),
    updatedAtMs: toMs(d.updatedAt),
  };
}

/* ================= GET ================= */

export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  const tenantId = auth.tenantId;

  const url = new URL(req.url);
  const ids = safeIdsParam(url.searchParams.get("ids"));
  const status = normalizeStatus(url.searchParams.get("status"));
  const q = normalizeText(url.searchParams.get("q")).toLowerCase();
  const max = parseMax(url.searchParams.get("max"), 50);

  try {
    if (ids.length > 0) {
      const refs = ids.map((id) => adminDb.collection("agents").doc(id));
      const snaps = await adminDb.getAll(...refs);

      const found: any[] = [];
      snaps.forEach((snap, i) => {
        const id = ids[i];
        if (!snap.exists) return;

        const d = snap.data() as any;
        if (d?.tenantId !== tenantId) return;

        found.push(pickAgent(d, id));
      });

      const byId = new Map(found.map((a) => [a.id, a]));
      const ordered = ids.map((id) => byId.get(id)).filter(Boolean);

      return json(200, { ok: true, tenantId, count: ordered.length, agents: ordered });
    }

    let ref: FirebaseFirestore.Query = adminDb
      .collection("agents")
      .where("tenantId", "==", tenantId);

    if (status !== "all") {
      ref = ref.where("status", "==", status).limit(max);
    } else {
      ref = ref.orderBy("createdAt", "desc").limit(max);
    }

    const snap = await ref.get();
    let agents = snap.docs.map((d) => pickAgent(d.data(), d.id));

    if (status !== "all") {
      agents.sort((a: any, b: any) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
    }

    if (q) {
      agents = agents.filter((a: any) => {
        const hay = String(
          a.search ??
            buildSearch(a.firstName ?? "", a.lastName ?? "", a.email, a.phone)
        ).toLowerCase();
        return hay.includes(q);
      });
    }

    return json(200, { ok: true, tenantId, count: agents.length, agents });
  } catch (e: any) {
    return serverError(e, "agents.GET");
  }
}

/* ================= POST ================= */

export async function POST(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  const tenantId = auth.tenantId;
  if (!canWrite(auth.role)) return forbidden("Insufficient rights");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body");
  }

  const firstName = normalizeText(body.firstName);
  const lastName = normalizeText(body.lastName);
  const email = normalizeText(body.email) || null;
  const phone = normalizeText(body.phone) || null;

  const statusRaw = normalizeText(body.status).toLowerCase();
  const status: AgentStatus = statusRaw === "inactive" ? "inactive" : "active";

  if (!firstName) return bad("firstName is required");
  if (!lastName) return bad("lastName is required");

  try {
    if (status === "active") {
      const quota = await assertWithinLimitsTx({ tenantId, kind: "agents", delta: 1 });

      if (!quota.ok) {
        await logActivity({
          tenantId,
          actorUid: auth.uid,
          actorEmail: (auth as any).email ?? null,
          actorRole: auth.role ?? null,
          action: "billing.limit_reached",
          entityType: "billing",
          entityId: "agents",
          message: `Limite atteinte : création d’agent bloquée`,
          meta: { kind: "agents", firstName, lastName, code: quota.code, limits: quota.limits, usage: quota.usage },
          severity: "warning",
        });

        return forbidden(quota.message, {
          code: quota.code,
          limits: quota.limits,
          usage: quota.usage,
          kind: "agents",
        });
      }
    }

    const payload: AgentDoc = {
      tenantId,
      firstName,
      lastName,
      email,
      phone,
      status,
      search: buildSearch(firstName, lastName, email, phone),

      createdAt: FieldValue.serverTimestamp() as any,
      updatedAt: FieldValue.serverTimestamp() as any,
      createdBy: auth.uid,
      updatedBy: auth.uid,
    };

    const ref = await adminDb.collection("agents").add(payload);
    const created = await ref.get();

    // ✅ activity log
    await logActivity({
      tenantId,
      actorUid: auth.uid,
      actorEmail: (auth as any).email ?? null,
      actorRole: auth.role ?? null,
      action: "agent.created",
      entityType: "agent",
      entityId: ref.id,
      message: `Agent créé : ${firstName} ${lastName}`,
      meta: {
        agentId: ref.id,
        firstName,
        lastName,
        email,
        phone,
        status,
      },
      severity: "info",
    });

    return json(201, {
      ok: true,
      tenantId,
      id: ref.id,
      agent: pickAgent(created.data(), ref.id),
    });
  } catch (e: any) {
    return serverError(e, "agents.POST");
  }
}
