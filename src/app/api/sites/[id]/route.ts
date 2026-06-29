import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { requireTenantUser } from "@/app/api/_utils/withTenant";
import { assertWithinLimitsTx, adjustUsage } from "@/lib/billing/limits";
import { logActivity } from "@/lib/activity/logger";

export const runtime = "nodejs";

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

function normalizeId(v: unknown) {
  return String(v ?? "").trim();
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

function canManagePlanning(role: string | null | undefined) {
  const r = normalizeRole(role);
  return ["super_admin", "owner", "admin", "manager"].includes(r);
}

function isAdminLike(role: string | null | undefined) {
  const r = normalizeRole(role);
  return ["super_admin", "owner", "admin"].includes(r);
}

function isAgentRole(role: string | null | undefined) {
  return normalizeRole(role) === "agent";
}

function safeArr(v: unknown): string[] {
  return Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : [];
}


function normalizeEmergencyContacts(v: unknown) {
  if (!Array.isArray(v)) return [];

  return v
    .map((item, index) => {
      const raw = (item ?? {}) as Record<string, unknown>;
      const name = normalizeText(raw.name);
      const role = normalizeText(raw.role) || null;
      const phone = normalizeText(raw.phone) || null;
      const email = normalizeText(raw.email) || null;
      const rawPriority = Number(raw.priority ?? index + 1);
      const priority = Number.isFinite(rawPriority)
        ? Math.min(Math.max(Math.floor(rawPriority), 1), 20)
        : index + 1;

      return { name, role, phone, email, priority };
    })
    .filter((contact) => contact.name && (contact.phone || contact.email))
    .slice(0, 10);
}
function uniq(arr: string[]) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function chunk<T>(arr: T[], size = 10): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function buildSearch(input: {
  name: string;
  clientName?: string | null;
  city?: string | null;
  address?: string | null;
  postalCode?: string | null;
}) {
  const { name, clientName, city, address, postalCode } = input;
  return `${name} ${clientName ?? ""} ${city ?? ""} ${address ?? ""} ${postalCode ?? ""}`
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function pickSite(d: Record<string, unknown>, id: string) {
  return {
    id,
    tenantId: d.tenantId as string,
    name: d.name as string | null ?? null,
    clientId: d.clientId as string | null ?? null,
    clientName: d.clientName as string | null ?? null,
    siteType: (d.siteType as string | undefined) ?? "bureaux",
    riskLevel: (d.riskLevel as number | undefined) ?? 3,
    address: d.address as string | null ?? null,
    city: d.city as string | null ?? null,
    postalCode: d.postalCode as string | null ?? null,
    latitude: d.latitude as number | null ?? null,
    longitude: d.longitude as number | null ?? null,
    instructions: d.instructions as string | null ?? null,
    isActive: typeof d.isActive === "boolean" ? d.isActive : true,

    agentIds: safeArr(d.agentIds),
    managerIds: safeArr(d.managerIds),
    accessUids: safeArr(d.accessUids),
    emergencyContacts: normalizeEmergencyContacts(d.emergencyContacts),

    search: d.search as string | null ?? null,

    createdBy: d.createdBy as string | null ?? null,
    updatedBy: d.updatedBy as string | null ?? null,
    createdAtIso: toIso(d.createdAt),
    updatedAtIso: toIso(d.updatedAt),
  };
}

function diff(from: unknown, to: unknown) {
  if (from === to) return null;
  return { from: from ?? null, to: to ?? null };
}

function canUserAccessSiteDoc(input: {
  uid: string;
  role: string | null | undefined;
  site: Record<string, unknown>;
}) {
  const { uid, role, site } = input;

  if (canReadBackoffice(role)) return true;
  if (!isAgentRole(role)) return false;

  const accessUids = safeArr(site?.accessUids);
  const managerIds = safeArr(site?.managerIds);
  const agentIds = safeArr(site?.agentIds);

  return accessUids.includes(uid) || managerIds.includes(uid) || agentIds.includes(uid);
}

/* ================= loader ================= */

async function loadSiteOr404(siteId: string, tenantId: string) {
  const ref = adminDb.collection("sites").doc(siteId);
  const snap = await ref.get();

  if (!snap.exists) return { ok: false as const, res: notFound("Site not found") };

  const data = snap.data() as Record<string, unknown> | undefined;
  if (data?.tenantId !== tenantId) {
    return { ok: false as const, res: notFound("Site not found") };
  }

  return { ok: true as const, ref, snap, data: data! };
}

/* ================= validations ================= */

async function validateAgentsForTenant(input: { tenantId: string; ids: string[] }) {
  const { tenantId } = input;
  const ids = uniq(input.ids.map(normalizeId)).filter(Boolean).slice(0, 200);

  if (ids.length === 0) return { ok: true as const, validIds: [], rejected: [] as Array<{ id: string; reason: string }> };

  const rejected: Array<{ id: string; reason: string }> = [];
  const valid: string[] = [];

  for (const part of chunk(ids, 10)) {
    const snap = await adminDb
      .collection("agents")
      .where("tenantId", "==", tenantId)
      .where(FieldPath.documentId(), "in", part)
      .get();

    const found = new Map<string, Record<string, unknown>>();
    snap.forEach((d) => found.set(d.id, d.data() as Record<string, unknown>));

    for (const id of part) {
      const a = found.get(id);
      if (!a) {
        rejected.push({ id, reason: "agent_not_found_or_cross_tenant" });
        continue;
      }
      const st = String(a.status ?? "active").toLowerCase();
      if (st !== "active") {
        rejected.push({ id, reason: "agent_inactive" });
        continue;
      }
      valid.push(id);
    }
  }

  return { ok: true as const, validIds: uniq(valid), rejected };
}

async function assertClientBelongsToTenant(clientId: string, tenantId: string) {
  const snap = await adminDb.collection("clients").doc(clientId).get();
  if (!snap.exists) return { ok: false as const, error: "Client not found" };

  const data = snap.data() as Record<string, unknown> | undefined;
  if (data?.tenantId !== tenantId) return { ok: false as const, error: "Client not found" };

  return { ok: true as const, client: data! };
}

/* ================= GET ================= */

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  const { id } = await params;
  const siteId = normalizeId(id);
  if (!siteId) return bad("Missing site id");

  try {
    const loaded = await loadSiteOr404(siteId, auth.tenantId);
    if (!loaded.ok) return loaded.res;

    const allowed = canUserAccessSiteDoc({
      uid: auth.uid,
      role: auth.role,
      site: loaded.data,
    });

    if (!allowed) return forbidden("Insufficient rights");

    return json(200, {
      ok: true,
      tenantId: auth.tenantId,
      site: pickSite(loaded.data, loaded.snap.id),
    });
  } catch (e: unknown) {
    return serverError(e, "sites.[id].GET");
  }
}

/* ================= PATCH ================= */

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!canManagePlanning(auth.role)) return forbidden("Insufficient rights");

  const role = normalizeRole(auth.role);

  const { id } = await params;
  const siteId = normalizeId(id);
  if (!siteId) return bad("Missing site id");

  let body: Record<string, unknown>;
  try {
    const raw = await req.json();
    body = raw as Record<string, unknown>;
  } catch {
    return bad("Invalid JSON body");
  }

  try {
    const loaded = await loadSiteOr404(siteId, auth.tenantId);
    if (!loaded.ok) return loaded.res;

    const prev = loaded.data;
    const prevIsActive = typeof prev.isActive === "boolean" ? prev.isActive : true;

    const patch: Record<string, unknown> = {};
    const warnings: Array<{ code: string; [key: string]: unknown }> = [];
    const changed: string[] = [];
    const changes: Record<string, unknown> = {};

    let nextIsActive = prevIsActive;

    let nextAgentIds = safeArr(prev.agentIds);
    let nextManagerIds = safeArr(prev.managerIds);
    let nextAccessUids = safeArr(prev.accessUids);

    if (body.isActive !== undefined) {
      if (typeof body.isActive !== "boolean") return bad("isActive must be a boolean");
      nextIsActive = body.isActive as boolean;
      patch.isActive = nextIsActive;

      const d = diff(prevIsActive, nextIsActive);
      if (d) {
        changed.push("isActive");
        changes.isActive = d;
      }

      if (!prevIsActive && nextIsActive) {
        const quota = await assertWithinLimitsTx({
          tenantId: auth.tenantId,
          kind: "sites",
          delta: 1,
        });

        if (!quota.ok) {
          await logActivity({
            tenantId: auth.tenantId,
            actorUid: auth.uid,
            actorEmail: auth.email ?? null,
            actorRole: auth.role ?? null,
            action: "billing.limit_reached",
            entityType: "billing",
            entityId: "sites",
            message: `Limite atteinte : réactivation de site bloquée`,
            meta: { kind: "sites", siteId, code: quota.code, limits: quota.limits, usage: quota.usage },
            severity: "warning",
          });

          return forbidden(quota.message, {
            code: quota.code,
            limits: quota.limits,
            usage: quota.usage,
            kind: "sites",
          });
        }
      }
    }

    if (body.agentIds !== undefined) {
      if (!Array.isArray(body.agentIds)) return bad("agentIds must be an array");

      const raw = uniq(body.agentIds.map(normalizeId)).filter(Boolean).slice(0, 200);

      const validated = await validateAgentsForTenant({
        tenantId: auth.tenantId,
        ids: raw,
      });

      nextAgentIds = validated.validIds;
      patch.agentIds = nextAgentIds;

      changed.push("agentIds");
      changes.agentIds = { fromCount: safeArr(prev.agentIds).length, toCount: validated.validIds.length };

      if (validated.rejected.length > 0) {
        warnings.push({
          code: "site_agentIds_rejected",
          rejected: validated.rejected,
          acceptedCount: validated.validIds.length,
        });
      }
    }

    if (body.managerIds !== undefined) {
      if (!Array.isArray(body.managerIds)) return bad("managerIds must be an array");
      nextManagerIds = uniq(body.managerIds.map(normalizeId).filter(Boolean)).slice(0, 200);
      patch.managerIds = nextManagerIds;

      changed.push("managerIds");
      changes.managerIds = { fromCount: safeArr(prev.managerIds).length, toCount: nextManagerIds.length };
    }

    if (body.accessUids !== undefined) {
      if (!isAdminLike(role)) return forbidden("accessUids: admin/owner/super_admin only");
      if (!Array.isArray(body.accessUids)) return bad("accessUids must be an array");
      nextAccessUids = uniq(body.accessUids.map(normalizeId).filter(Boolean)).slice(0, 200);
      patch.accessUids = nextAccessUids;

      changed.push("accessUids");
      changes.accessUids = { fromCount: safeArr(prev.accessUids).length, toCount: nextAccessUids.length };
    }

    if (body.name !== undefined) {
      const v = normalizeText(body.name);
      if (!v) return bad("name cannot be empty");
      patch.name = v;

      const d = diff(prev.name ?? null, v);
      if (d) {
        changed.push("name");
        changes.name = d;
      }
    }

    if (body.clientId !== undefined) {
      const v = normalizeId(body.clientId) || null;
      if (v) {
        const clientCheck = await assertClientBelongsToTenant(v, auth.tenantId);
        if (!clientCheck.ok) return bad("Invalid clientId", { details: clientCheck.error });
        patch.clientId = v;

        const currentClientName = normalizeText(body.clientName) || normalizeText(clientCheck.client?.name) || null;
        patch.clientName = currentClientName;
      } else {
        patch.clientId = null;
        patch.clientName = normalizeText(body.clientName) || null;
      }

      const d = diff(prev.clientId ?? null, patch.clientId ?? null);
      if (d) {
        changed.push("clientId");
        changes.clientId = d;
      }

      const dName = diff(prev.clientName ?? null, patch.clientName ?? null);
      if (dName) {
        changed.push("clientName");
        changes.clientName = dName;
      }
    } else if (body.clientName !== undefined) {
      const v = normalizeText(body.clientName) || null;
      patch.clientName = v;

      const d = diff(prev.clientName ?? null, v);
      if (d) {
        changed.push("clientName");
        changes.clientName = d;
      }
    }

    if (body.siteType !== undefined) {
      const v = normalizeText(body.siteType) || "bureaux";
      patch.siteType = v;

      const d = diff(prev.siteType ?? null, v);
      if (d) {
        changed.push("siteType");
        changes.siteType = d;
      }
    }

    if (body.riskLevel !== undefined) {
      const r = Number(body.riskLevel);
      const v = Number.isFinite(r) ? Math.min(Math.max(Math.floor(r), 1), 5) : 3;
      patch.riskLevel = v;

      const d = diff(prev.riskLevel ?? null, v);
      if (d) {
        changed.push("riskLevel");
        changes.riskLevel = d;
      }
    }

    if (body.address !== undefined) {
      const v = normalizeText(body.address) || null;
      patch.address = v;

      const d = diff(prev.address ?? null, v);
      if (d) {
        changed.push("address");
        changes.address = d;
      }
    }

    if (body.city !== undefined) {
      const v = normalizeText(body.city) || null;
      patch.city = v;

      const d = diff(prev.city ?? null, v);
      if (d) {
        changed.push("city");
        changes.city = d;
      }
    }

    if (body.postalCode !== undefined) {
      const v = normalizeText(body.postalCode) || null;
      patch.postalCode = v;

      const d = diff(prev.postalCode ?? null, v);
      if (d) {
        changed.push("postalCode");
        changes.postalCode = d;
      }
    }


    if (body.emergencyContacts !== undefined) {
      const emergencyContacts = normalizeEmergencyContacts(body.emergencyContacts);
      patch.emergencyContacts = emergencyContacts;

      changed.push("emergencyContacts");
      changes.emergencyContacts = {
        fromCount: normalizeEmergencyContacts(prev.emergencyContacts).length,
        toCount: emergencyContacts.length,
      };
    }
    if (body.instructions !== undefined) {
      const v = normalizeText(body.instructions) || null;
      patch.instructions = v;

      const d = diff(prev.instructions ?? null, v);
      if (d) {
        changed.push("instructions");
        changes.instructions = d;
      }
    }

    if (body.latitude !== undefined) {
      const v = typeof body.latitude === "number" ? body.latitude : null;
      patch.latitude = v;
      const d = diff(prev.latitude ?? null, v);
      if (d) {
        changed.push("latitude");
        changes.latitude = d;
      }
    }

    if (body.longitude !== undefined) {
      const v = typeof body.longitude === "number" ? body.longitude : null;
      patch.longitude = v;
      const d = diff(prev.longitude ?? null, v);
      if (d) {
        changed.push("longitude");
        changes.longitude = d;
      }
    }

    // Resync accessUids automatically if managerIds / agentIds changed and no explicit accessUids provided.
    if (body.accessUids === undefined && (body.agentIds !== undefined || body.managerIds !== undefined)) {
      nextAccessUids = uniq([...nextManagerIds, ...nextAgentIds]);
      patch.accessUids = nextAccessUids;

      changed.push("accessUids");
      changes.accessUids = {
        fromCount: safeArr(prev.accessUids).length,
        toCount: nextAccessUids.length,
        auto: true,
      };
    }

    if (
      patch.name !== undefined ||
      patch.clientName !== undefined ||
      patch.city !== undefined ||
      patch.address !== undefined ||
      patch.postalCode !== undefined
    ) {
      const nextName = patch.name ?? prev.name ?? "";
      if (!String(nextName).trim()) return bad("name cannot be empty");

      patch.search = buildSearch({
        name: String(nextName),
        clientName: (patch.clientName as string | null | undefined) ?? (prev.clientName as string | null | undefined) ?? null,
        city: (patch.city as string | null | undefined) ?? (prev.city as string | null | undefined) ?? null,
        address: (patch.address as string | null | undefined) ?? (prev.address as string | null | undefined) ?? null,
        postalCode: (patch.postalCode as string | null | undefined) ?? (prev.postalCode as string | null | undefined) ?? null,
      });

      changed.push("search");
    }

    patch.updatedAt = FieldValue.serverTimestamp();
    patch.updatedBy = auth.uid;

    await loaded.ref.set(patch, { merge: true });

    if (body.isActive !== undefined && prevIsActive !== nextIsActive) {
      if (prevIsActive && !nextIsActive) {
        await adjustUsage(auth.tenantId, "sites", -1);
      }
    }

    const updated = await loaded.ref.get();
    const d = updated.data() as Record<string, unknown>;

    const nextNameForMsg = String(d?.name ?? prev?.name ?? "—");
    const action = prevIsActive && !nextIsActive ? "site.archived" : "site.updated";

    await logActivity({
      tenantId: auth.tenantId,
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      actorRole: auth.role ?? null,
      action,
      entityType: "site",
      entityId: updated.id,
      message:
        action === "site.archived"
          ? `Site archivé : ${nextNameForMsg}`
          : `Site mis à jour : ${nextNameForMsg}`,
      meta: {
        siteId: updated.id,
        name: nextNameForMsg,
        prevIsActive,
        nextIsActive: typeof d?.isActive === "boolean" ? d.isActive : true,
        changed,
        changes: Object.keys(changes).length ? changes : undefined,
        warnings: warnings.length ? warnings : undefined,
      },
      severity: action === "site.archived" ? "warning" : "info",
    });

    return json(200, {
      ok: true,
      tenantId: auth.tenantId,
      warnings: warnings.length ? warnings : undefined,
      site: pickSite(d, updated.id),
    });
  } catch (e: unknown) {
    return serverError(e, "sites.[id].PATCH");
  }
}

/* ================= DELETE ================= */
/**
 * DELETE /api/sites/:id
 * => soft delete : isActive=false (+ décrémente usage si le site était actif)
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!canManagePlanning(auth.role)) return forbidden("Insufficient rights");

  const { id } = await params;
  const siteId = normalizeId(id);
  if (!siteId) return bad("Missing site id");

  try {
    const loaded = await loadSiteOr404(siteId, auth.tenantId);
    if (!loaded.ok) return loaded.res;

    const prev = loaded.data;
    const prevIsActive = typeof prev.isActive === "boolean" ? prev.isActive : true;

    if (!prevIsActive) {
      return json(200, { ok: true, id: siteId, updated: { isActive: false } });
    }

    await loaded.ref.set(
      {
        isActive: false,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: auth.uid,
      },
      { merge: true }
    );

    await adjustUsage(auth.tenantId, "sites", -1);

    await logActivity({
      tenantId: auth.tenantId,
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      actorRole: auth.role ?? null,
      action: "site.archived",
      entityType: "site",
      entityId: siteId,
      message: `Site archivé : ${prev?.name ?? "—"}`,
      meta: { siteId, name: prev?.name ?? null, prevIsActive: true, nextIsActive: false },
      severity: "warning",
    });

    return json(200, { ok: true, id: siteId, updated: { isActive: false } });
  } catch (e: unknown) {
    return serverError(e, "sites.[id].DELETE");
  }
}
