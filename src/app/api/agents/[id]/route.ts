import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

import { requireTenantUser } from "@/app/api/_utils/withTenant";
import { assertWithinLimitsTx, adjustUsage } from "@/lib/billing/limits";
import { logActivity } from "@/lib/activity/logger";
import {
  normalizeAgentProfileField,
  normalizeAgentDocuments,
  normalizeAgentEquipmentItems,
  normalizeAgentQualifications,
  type AgentProfileFields,
} from "@/lib/agents/profile";

export const runtime = "nodejs";

type AgentStatus = "active" | "inactive";

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

function notFound(msg = "Not found") {
  return json(404, { ok: false, error: msg });
}

function serverError(e: unknown, tag: string) {
  console.error(`[${tag}]`, e);
  return json(500, {
    ok: false,
    error: "Internal error",
    details: e instanceof Error ? e.message : String(e),
  });
}

function toIso(ts: unknown) {
  const t = ts as { toDate?: () => Date } | null | undefined;
  return t && typeof t.toDate === "function" ? t.toDate().toISOString() : null;
}

function normalizeText(s: unknown) {
  return String(s ?? "").trim();
}

function normalizeRole(v: unknown) {
  return String(v ?? "").trim().toLowerCase();
}

function canReadBackoffice(role: string | null | undefined) {
  const r = normalizeRole(role);
  return ["super_admin", "owner", "admin", "manager", "viewer"].includes(r);
}

function canManagePlanning(role: string | null | undefined) {
  const r = normalizeRole(role);
  return ["super_admin", "owner", "admin", "manager"].includes(r);
}

function isAgentRole(role: string | null | undefined) {
  return normalizeRole(role) === "agent";
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
    equipmentItems: normalizeAgentEquipmentItems(rawProfile.equipmentItems),
    notes: normalizeAgentProfileField(rawProfile.notes),
  };
}

function pickAgent(d: Record<string, unknown>, id: string) {
  const profile = pickProfile(d);

  return {
    id,
    tenantId: d.tenantId as string,
    firstName: d.firstName as string | null ?? null,
    lastName: d.lastName as string | null ?? null,
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
    qualifications: profile.qualifications,
    emergencyContactName: profile.emergencyContactName,
    emergencyContactPhone: profile.emergencyContactPhone,
    documents: profile.documents,
    equipmentItems: profile.equipmentItems,
    notes: profile.notes,
    status: (d.status ?? "active") as AgentStatus,
    search: d.search as string | null ?? null,

    createdBy: d.createdBy as string | null ?? null,
    updatedBy: d.updatedBy as string | null ?? null,

    createdAtIso: toIso(d.createdAt),
    updatedAtIso: toIso(d.updatedAt),
  };
}

function fullName(a: Record<string, unknown> | null | undefined) {
  const fn = normalizeText(a?.firstName);
  const ln = normalizeText(a?.lastName);
  const x = `${fn} ${ln}`.trim();
  return x || "Agent";
}

function normalizeStatus(v: unknown): AgentStatus {
  const s = normalizeText(v).toLowerCase();
  return s === "inactive" ? "inactive" : "active";
}

function normalizeMonthlyContractHours(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 400) {
    throw new Error("monthlyContractHours must be a number between 0 and 400");
  }
  return Math.round(parsed * 100) / 100;
}

async function safeLogActivity(payload: Parameters<typeof logActivity>[0]) {
  try {
    await logActivity(payload);
  } catch (e) {
    console.warn("[activity.log] failed (non-blocking)", e);
  }
}

/* ================= loader ================= */

async function loadAgentOr404(agentId: string, tenantId: string) {
  const ref = adminDb.collection("agents").doc(agentId);
  const snap = await ref.get();

  if (!snap.exists) return { ok: false as const, res: notFound("Agent not found") };

  const data = snap.data() as Record<string, unknown> | undefined;
  if (data?.tenantId !== tenantId) {
    return { ok: false as const, res: notFound("Agent not found") };
  }

  return { ok: true as const, ref, snap, data: data! };
}

/* ================= GET ================= */
/**
 * GET /api/agents/:id
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  const { id } = await params;
  const agentId = normalizeText(id);
  if (!agentId) return bad("Missing agent id");

  const role = normalizeRole(auth.role);
  if (!canReadBackoffice(role) && !isAgentRole(role)) {
    return forbidden("Insufficient rights");
  }

  try {
    const loaded = await loadAgentOr404(agentId, auth.tenantId);
    if (!loaded.ok) return loaded.res;

    return json(200, {
      ok: true,
      tenantId: auth.tenantId,
      agent: pickAgent(loaded.data, loaded.snap.id),
    });
  } catch (e: unknown) {
    return serverError(e, "agents.[id].GET");
  }
}

/* ================= PATCH ================= */
/**
 * PATCH /api/agents/:id
 * body: { firstName?, lastName?, email?, phone?, status? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!canManagePlanning(auth.role)) return forbidden("Insufficient rights");

  const { id } = await params;
  const agentId = normalizeText(id);
  if (!agentId) return bad("Missing agent id");

  let body: Record<string, unknown>;
  try {
    const raw = await req.json();
    body = raw as Record<string, unknown>;
  } catch {
    return bad("Invalid JSON body");
  }

  try {
    const loaded = await loadAgentOr404(agentId, auth.tenantId);
    if (!loaded.ok) return loaded.res;

    const prev = loaded.data;

    const prevStatus: AgentStatus = normalizeStatus(prev?.status);

    const patch: Record<string, unknown> = {};
    const profilePatch: Partial<AgentProfileFields> = {};
    const changes: Record<string, unknown> = {};

    if (body.firstName !== undefined) {
      const v = normalizeText(body.firstName);
      if (!v) return bad("firstName cannot be empty");
      patch.firstName = v;
      if (v !== (prev.firstName ?? null)) changes.firstName = { from: prev.firstName ?? null, to: v };
    }

    if (body.lastName !== undefined) {
      const v = normalizeText(body.lastName);
      if (!v) return bad("lastName cannot be empty");
      patch.lastName = v;
      if (v !== (prev.lastName ?? null)) changes.lastName = { from: prev.lastName ?? null, to: v };
    }

    if (body.email !== undefined) {
      const v = normalizeText(body.email) || null;
      patch.email = v;
      if (v !== (prev.email ?? null)) changes.email = { from: prev.email ?? null, to: v };
    }

    if (body.phone !== undefined) {
      const v = normalizeText(body.phone) || null;
      patch.phone = v;
      if (v !== (prev.phone ?? null)) changes.phone = { from: prev.phone ?? null, to: v };
    }

    if (body.monthlyContractHours !== undefined) {
      let value: number | null;
      try {
        value = normalizeMonthlyContractHours(body.monthlyContractHours);
      } catch (error) {
        return bad(error instanceof Error ? error.message : "Invalid monthlyContractHours");
      }

      const previousValue =
        typeof prev.monthlyContractHours === "number" ? prev.monthlyContractHours : null;

      patch.monthlyContractHours = value;
      if (value !== previousValue) {
        changes.monthlyContractHours = {
          from: previousValue,
          to: value,
        };
      }
    }

    const profileFields = [
      "photoUrl",
      "employeeNumber",
      "birthDate",
      "addressLine1",
      "addressLine2",
      "professionalCardNumber",
      "professionalCardExpiresAt",
      "emergencyContactName",
      "emergencyContactPhone",
      "notes",
    ] as const;

    const previousProfile = pickProfile(prev);

    profileFields.forEach((field) => {
      if (body[field] === undefined) return;

      const value = normalizeAgentProfileField(body[field]);
      profilePatch[field] = value;

      if (value !== (previousProfile[field] ?? null)) {
        changes[field] = {
          from: previousProfile[field] ?? null,
          to: value,
        };
      }
    });

    if (body.qualifications !== undefined) {
      const value = normalizeAgentQualifications(body.qualifications);
      profilePatch.qualifications = value;
      if (JSON.stringify(value) !== JSON.stringify(previousProfile.qualifications ?? [])) {
        changes.qualifications = {
          from: previousProfile.qualifications ?? [],
          to: value,
        };
      }
    }

    if (body.documents !== undefined) {
      const value = normalizeAgentDocuments(body.documents);
      profilePatch.documents = value;
      if (JSON.stringify(value) !== JSON.stringify(previousProfile.documents ?? [])) {
        changes.documents = {
          from: previousProfile.documents ?? [],
          to: value,
        };
      }
    }

    if (body.equipmentItems !== undefined) {
      const value = normalizeAgentEquipmentItems(body.equipmentItems);
      profilePatch.equipmentItems = value;
      if (JSON.stringify(value) !== JSON.stringify(previousProfile.equipmentItems ?? [])) {
        changes.equipmentItems = {
          fromCount: previousProfile.equipmentItems?.length ?? 0,
          toCount: value.length,
          assignedCount: value.filter((item) => item.status === "assigned").length,
        };
      }
    }
    let nextStatus: AgentStatus = prevStatus;
    if (body.status !== undefined) {
      nextStatus = normalizeStatus(body.status);
      patch.status = nextStatus;
      if (nextStatus !== prevStatus) changes.status = { from: prevStatus, to: nextStatus };
    }

    const statusChanged = prevStatus !== nextStatus;

    if (prevStatus === "inactive" && nextStatus === "active") {
      const quota = await assertWithinLimitsTx({
        tenantId: auth.tenantId,
        kind: "agents",
        delta: 1,
      });

      if (!quota.ok) {
        return forbidden(quota.message, {
          code: quota.code,
          limits: quota.limits,
          usage: quota.usage,
          kind: "agents",
        });
      }
    }

    const nextFirst = (patch.firstName as string | undefined) ?? (prev.firstName as string | undefined);
    const nextLast = (patch.lastName as string | undefined) ?? (prev.lastName as string | undefined);
    const nextEmail = (patch.email as string | null | undefined) ?? (prev.email as string | null | undefined) ?? null;
    const nextPhone = (patch.phone as string | null | undefined) ?? (prev.phone as string | null | undefined) ?? null;
    const nextProfile = { ...previousProfile, ...profilePatch };

    if (!normalizeText(nextFirst) || !normalizeText(nextLast)) {
      return bad("firstName/lastName cannot be empty");
    }

    if (Object.keys(profilePatch).length > 0) {
      patch.profile = nextProfile;
    }

    patch.search = buildSearch(
      nextFirst as string,
      nextLast as string,
      nextEmail,
      nextPhone,
      nextProfile.employeeNumber
    );
    patch.updatedAt = FieldValue.serverTimestamp();
    patch.updatedBy = auth.uid;

    await loaded.ref.set(patch, { merge: true });

    if (statusChanged) {
      if (prevStatus === "active" && nextStatus === "inactive") {
        await adjustUsage(auth.tenantId, "agents", -1);
      }
    }

    const updatedSnap = await loaded.ref.get();
    const data = updatedSnap.data() as Record<string, unknown>;

    const label = fullName({ ...prev, ...patch });

    const action = statusChanged
      ? nextStatus === "active"
        ? "agent.activated"
        : "agent.deactivated"
      : "agent.updated";

    const message = statusChanged
      ? nextStatus === "active"
        ? `${label} réactivé`
        : `${label} désactivé`
      : `${label} mis à jour`;

    await safeLogActivity({
      tenantId: auth.tenantId,
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      actorRole: auth.role ?? null,
      action,
      entityType: "agent",
      entityId: updatedSnap.id,
      message,
      severity: statusChanged && nextStatus === "inactive" ? "warning" : "info",
      meta: {
        agentId: updatedSnap.id,
        changes: Object.keys(changes).length ? changes : undefined,
      },
    });

    return json(200, {
      ok: true,
      tenantId: auth.tenantId,
      agent: pickAgent(data, updatedSnap.id),
    });
  } catch (e: unknown) {
    return serverError(e, "agents.[id].PATCH");
  }
}

/* ================= DELETE ================= */
/**
 * DELETE /api/agents/:id
 * => soft delete: status=inactive (+ décrémente usage si l'agent était actif)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!canManagePlanning(auth.role)) return forbidden("Insufficient rights");

  const { id } = await params;
  const agentId = normalizeText(id);
  if (!agentId) return bad("Missing agent id");

  try {
    const loaded = await loadAgentOr404(agentId, auth.tenantId);
    if (!loaded.ok) return loaded.res;

    const prev = loaded.data;
    const prevStatus: AgentStatus = normalizeStatus(prev?.status);

    if (prevStatus === "inactive") {
      return json(200, { ok: true, id: agentId, updated: { status: "inactive" } });
    }

    await loaded.ref.set(
      {
        status: "inactive",
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: auth.uid,
      },
      { merge: true }
    );

    await adjustUsage(auth.tenantId, "agents", -1);

    await safeLogActivity({
      tenantId: auth.tenantId,
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      actorRole: auth.role ?? null,
      action: "agent.deactivated",
      entityType: "agent",
      entityId: agentId,
      message: `${fullName(prev)} désactivé`,
      meta: { agentId, prevStatus: "active", nextStatus: "inactive" },
      severity: "warning",
    });

    return json(200, { ok: true, id: agentId, updated: { status: "inactive" } });
  } catch (e: unknown) {
    return serverError(e, "agents.[id].DELETE");
  }
}
