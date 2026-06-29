import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { requireTenantUser } from "@/app/api/_utils/withTenant";
import { assertWithinLimitsTx } from "@/lib/billing/limits";
import { logActivity } from "@/lib/activity/logger";
import {
  normalizeAgentProfileField,
  normalizeAgentDocuments,
  normalizeAgentQualifications,
  type AgentProfileFields,
} from "@/lib/agents/profile";

export const runtime = "nodejs";

/* ================= types ================= */

type AgentStatus = "active" | "inactive";

type AgentDoc = {
  tenantId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  monthlyContractHours?: number | null;
  profile?: AgentProfileFields;
  status: AgentStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  createdBy?: string;
  updatedBy?: string;
  search?: string;
};

/* ================= helpers ================= */

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function bad(msg: string, extra?: Record<string, unknown>) {
  return json(400, { ok: false, error: msg, ...extra });
}

function forbidden(msg = "Forbidden", extra?: Record<string, unknown>) {
  return json(403, { ok: false, error: msg, ...extra });
}

function serverError(e: unknown, tag: string) {
  console.error(`[${tag}]`, e);
  return json(500, {
    ok: false,
    error: "Internal error",
    details: e instanceof Error ? e.message : String(e),
  });
}

function normalizeText(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeRole(v: unknown) {
  return String(v ?? "").trim().toLowerCase();
}

function canReadBackoffice(role: string | null | undefined) {
  const r = normalizeRole(role);
  return ["super_admin", "owner", "admin", "manager", "viewer"].includes(r);
}

function canManageAgents(role: string | null | undefined) {
  const r = normalizeRole(role);
  return ["super_admin", "owner", "admin", "manager"].includes(r);
}

function toIso(ts: unknown) {
  const t = ts as { toDate?: () => Date } | null | undefined;
  return typeof t?.toDate === "function" ? t.toDate().toISOString() : null;
}

function toMs(ts: unknown): number {
  const t = ts as { toDate?: () => Date } | null | undefined;
  const d = typeof t?.toDate === "function" ? t.toDate() : null;
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
  phone?: string | null,
  employeeNumber?: string | null
) {
  const parts = [firstName, lastName, email ?? "", phone ?? "", employeeNumber ?? ""]
    .map((x) => normalizeText(x).toLowerCase())
    .filter(Boolean);
  return parts.join(" ");
}

function pickProfile(d: Record<string, unknown>): AgentProfileFields {
  const rawProfile =
    d.profile && typeof d.profile === "object"
      ? (d.profile as Record<string, unknown>)
      : d;

  return {
    photoUrl: normalizeAgentProfileField(rawProfile.photoUrl),
    employeeNumber: normalizeAgentProfileField(rawProfile.employeeNumber),
    birthDate: normalizeAgentProfileField(rawProfile.birthDate),
    addressLine1: normalizeAgentProfileField(rawProfile.addressLine1),
    addressLine2: normalizeAgentProfileField(rawProfile.addressLine2),
    professionalCardNumber: normalizeAgentProfileField(
      rawProfile.professionalCardNumber
    ),
    professionalCardExpiresAt: normalizeAgentProfileField(
      rawProfile.professionalCardExpiresAt
    ),
    qualifications: normalizeAgentQualifications(rawProfile.qualifications),
    emergencyContactName: normalizeAgentProfileField(
      rawProfile.emergencyContactName
    ),
    emergencyContactPhone: normalizeAgentProfileField(
      rawProfile.emergencyContactPhone
    ),
    documents: normalizeAgentDocuments(rawProfile.documents),
    notes: normalizeAgentProfileField(rawProfile.notes),
  };
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

function normalizeMonthlyContractHours(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 400) {
    throw new Error("monthlyContractHours must be a number between 0 and 400");
  }
  return Math.round(parsed * 100) / 100;
}

function pickAgent(d: Record<string, unknown>, id: string) {
  const firstName = d.firstName as string | null ?? null;
  const lastName = d.lastName as string | null ?? null;
  const profile = pickProfile(d);

  return {
    id,
    tenantId: d.tenantId as string,
    firstName,
    lastName,
    email: d.email as string | null ?? null,
    phone: d.phone as string | null ?? null,
    monthlyContractHours:
      typeof d.monthlyContractHours === "number" ? d.monthlyContractHours : null,
    photoUrl: profile.photoUrl,
    employeeNumber: profile.employeeNumber,
    birthDate: profile.birthDate,
    addressLine1: profile.addressLine1,
    addressLine2: profile.addressLine2,
    professionalCardNumber: profile.professionalCardNumber,
    professionalCardExpiresAt: profile.professionalCardExpiresAt,
    emergencyContactName: profile.emergencyContactName,
    emergencyContactPhone: profile.emergencyContactPhone,
    documents: profile.documents,
    notes: profile.notes,
    status: (d.status ?? "active") as AgentStatus,
    search: d.search as string | null ?? null,
    qualifications: profile.qualifications,
    createdBy: d.createdBy as string | null ?? null,
    updatedBy: d.updatedBy as string | null ?? null,
    createdAtIso: toIso(d.createdAt),
    updatedAtIso: toIso(d.updatedAt),
    createdAtMs: toMs(d.createdAt),
    updatedAtMs: toMs(d.updatedAt),
  };
}

async function safeLogActivity(payload: Parameters<typeof logActivity>[0]) {
  try {
    await logActivity(payload);
  } catch (e) {
    console.warn("[activity.log] failed (non-blocking)", e);
  }
}

/* ================= GET ================= */

export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  const tenantId = auth.tenantId;
  if (!canReadBackoffice(auth.role)) {
    return forbidden("Insufficient rights");
  }

  const url = new URL(req.url);
  const ids = safeIdsParam(url.searchParams.get("ids"));
  const status = normalizeStatus(url.searchParams.get("status"));
  const q = normalizeText(url.searchParams.get("q")).toLowerCase();
  const max = parseMax(url.searchParams.get("max"), 50);
  const fetchLimit = q ? Math.min(Math.max(max * 5, 100), 500) : max;

  try {
    if (ids.length > 0) {
      const refs = ids.map((id) => adminDb.collection("agents").doc(id));
      const snaps = await adminDb.getAll(...refs);

      const found: ReturnType<typeof pickAgent>[] = [];
      snaps.forEach((snap, i) => {
        const id = ids[i];
        if (!snap.exists) return;

        const d = snap.data() as Record<string, unknown>;
        if (d?.tenantId !== tenantId) return;

        found.push(pickAgent(d, id));
      });

      const byId = new Map(found.map((a) => [a.id, a]));
      let ordered = ids.map((id) => byId.get(id)).filter(Boolean) as ReturnType<typeof pickAgent>[];

      if (status !== "all") {
        ordered = ordered.filter((a) => a.status === status);
      }
      if (q) {
        ordered = ordered.filter((a) => {
          const hay = String(
            a.search ?? buildSearch(a.firstName ?? "", a.lastName ?? "", a.email, a.phone)
          ).toLowerCase();
          return hay.includes(q);
        });
      }

      ordered = ordered.slice(0, max);

      return json(200, {
        ok: true,
        tenantId,
        count: ordered.length,
        agents: ordered,
        items: ordered,
      });
    }

    let ref: FirebaseFirestore.Query = adminDb
      .collection("agents")
      .where("tenantId", "==", tenantId);

    if (status !== "all") {
      ref = ref.where("status", "==", status).limit(fetchLimit);
    } else {
      ref = ref.orderBy("createdAt", "desc").limit(fetchLimit);
    }

    const snap = await ref.get();
    let agents = snap.docs.map((d) => pickAgent(d.data() as Record<string, unknown>, d.id));

    if (status !== "all") {
      agents.sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
    }

    if (q) {
      agents = agents.filter((a) => {
        const hay = String(
          a.search ?? buildSearch(a.firstName ?? "", a.lastName ?? "", a.email, a.phone)
        ).toLowerCase();
        return hay.includes(q);
      });
    }

    agents = agents.slice(0, max);

    return json(200, {
      ok: true,
      tenantId,
      count: agents.length,
      agents,
      items: agents,
    });
  } catch (e: unknown) {
    return serverError(e, "agents.GET");
  }
}

/* ================= POST ================= */

export async function POST(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  const tenantId = auth.tenantId;
  if (!canManageAgents(auth.role)) return forbidden("Insufficient rights");

  let body: Record<string, unknown>;
  try {
    const raw = await req.json();
    body = raw as Record<string, unknown>;
  } catch {
    return bad("Invalid JSON body");
  }

  const firstName = normalizeText(body.firstName);
  const lastName = normalizeText(body.lastName);
  const email = normalizeText(body.email) || null;
  const phone = normalizeText(body.phone) || null;
  const profile: AgentProfileFields = {
    photoUrl: normalizeAgentProfileField(body.photoUrl),
    employeeNumber: normalizeAgentProfileField(body.employeeNumber),
    birthDate: normalizeAgentProfileField(body.birthDate),
    addressLine1: normalizeAgentProfileField(body.addressLine1),
    addressLine2: normalizeAgentProfileField(body.addressLine2),
    professionalCardNumber: normalizeAgentProfileField(body.professionalCardNumber),
    professionalCardExpiresAt: normalizeAgentProfileField(
      body.professionalCardExpiresAt
    ),
    qualifications: normalizeAgentQualifications(body.qualifications),
    emergencyContactName: normalizeAgentProfileField(body.emergencyContactName),
    emergencyContactPhone: normalizeAgentProfileField(body.emergencyContactPhone),
    documents: normalizeAgentDocuments(body.documents),
    notes: normalizeAgentProfileField(body.notes),
  };
  let monthlyContractHours: number | null = null;

  const statusRaw = normalizeText(body.status).toLowerCase();
  const status: AgentStatus = statusRaw === "inactive" ? "inactive" : "active";

  if (!firstName) return bad("firstName is required");
  if (!lastName) return bad("lastName is required");

  try {
    monthlyContractHours = normalizeMonthlyContractHours(body.monthlyContractHours);
  } catch (error) {
    return bad(error instanceof Error ? error.message : "Invalid monthlyContractHours");
  }

  try {
    if (status === "active") {
      const quota = await assertWithinLimitsTx({ tenantId, kind: "agents", delta: 1 });

      if (!quota.ok) {
        await safeLogActivity({
          tenantId,
          actorUid: auth.uid,
          actorEmail: auth.email ?? null,
          actorRole: auth.role ?? null,
          action: "billing.limit_reached",
          entityType: "billing",
          entityId: "agents",
          message: `Limite atteinte : création d’agent bloquée`,
          meta: {
            kind: "agents",
            firstName,
            lastName,
            code: quota.code,
            limits: quota.limits,
            usage: quota.usage,
          },
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
      monthlyContractHours,
      profile,
      status,
      search: buildSearch(firstName, lastName, email, phone, profile.employeeNumber),
      createdAt: FieldValue.serverTimestamp() as unknown as Timestamp,
      updatedAt: FieldValue.serverTimestamp() as unknown as Timestamp,
      createdBy: auth.uid,
      updatedBy: auth.uid,
    };

    const ref = await adminDb.collection("agents").add(payload);

    await safeLogActivity({
      tenantId,
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
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
        monthlyContractHours,
        employeeNumber: profile.employeeNumber,
        status,
      },
      severity: "info",
    });

    return json(201, {
      ok: true,
      tenantId,
      id: ref.id,
      agent: pickAgent(payload as unknown as Record<string, unknown>, ref.id),
    });
  } catch (e: unknown) {
    return serverError(e, "agents.POST");
  }
}
