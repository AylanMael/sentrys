// src/app/api/sites/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldPath, FieldValue } from "firebase-admin/firestore";

import { requireTenantUser, canWrite } from "@/app/api/_utils/withTenant";
import { assertWithinLimitsTx, adjustUsage } from "@/lib/billing/limits";
import { logActivity } from "@/lib/activity/logger";

export const runtime = "nodejs";

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

function notFound(msg = "Not found") {
  return json(404, { ok: false, error: msg });
}

function serverError(e: any, tag: string) {
  console.error(`[${tag}]`, e);
  return json(500, {
    ok: false,
    error: "Internal error",
    details: e?.message ?? String(e),
  });
}

function toIso(ts: any) {
  return ts && typeof ts.toDate === "function" ? ts.toDate().toISOString() : null;
}

function normalizeId(v: any) {
  return String(v ?? "").trim();
}

function normalizeText(v: any) {
  return String(v ?? "").trim();
}

function safeArr(v: unknown): string[] {
  return Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : [];
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

function pickSite(d: any, id: string) {
  return {
    id,
    tenantId: d.tenantId,
    name: d.name ?? null,
    clientName: d.clientName ?? null,
    siteType: d.siteType ?? "bureaux",
    riskLevel: d.riskLevel ?? 3,
    address: d.address ?? null,
    city: d.city ?? null,
    postalCode: d.postalCode ?? null,
    instructions: d.instructions ?? null,
    isActive: typeof d.isActive === "boolean" ? d.isActive : true,

    agentIds: safeArr(d.agentIds),
    managerIds: safeArr(d.managerIds),
    accessUids: safeArr(d.accessUids),

    search: d.search ?? null,

    createdBy: d.createdBy ?? null,
    updatedBy: d.updatedBy ?? null,
    createdAtIso: toIso(d.createdAt),
    updatedAtIso: toIso(d.updatedAt),
  };
}

function diff(from: any, to: any) {
  if (from === to) return null;
  return { from: from ?? null, to: to ?? null };
}

/* ================= loader ================= */

async function loadSiteOr404(siteId: string, tenantId: string) {
  const ref = adminDb.collection("sites").doc(siteId);
  const snap = await ref.get();

  if (!snap.exists) return { ok: false as const, res: notFound("Site not found") };

  const data = snap.data() as any;
  if (data?.tenantId !== tenantId) {
    return { ok: false as const, res: notFound("Site not found") };
  }

  return { ok: true as const, ref, snap, data };
}

/* ================= validations ================= */

async function validateAgentsForTenant(input: { tenantId: string; ids: string[] }) {
  const { tenantId } = input;
  const ids = uniq(input.ids.map(normalizeId)).filter(Boolean).slice(0, 200);

  if (ids.length === 0) return { ok: true as const, validIds: [], rejected: [] as any[] };

  const rejected: Array<{ id: string; reason: string }> = [];
  const valid: string[] = [];

  for (const part of chunk(ids, 10)) {
    const snap = await adminDb
      .collection("agents")
      .where("tenantId", "==", tenantId)
      .where(FieldPath.documentId(), "in", part)
      .get();

    const found = new Map<string, any>();
    snap.forEach((d) => found.set(d.id, d.data()));

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

    return json(200, {
      ok: true,
      tenantId: auth.tenantId,
      site: pickSite(loaded.data, loaded.snap.id),
    });
  } catch (e: any) {
    return serverError(e, "sites.[id].GET");
  }
}

/* ================= PATCH ================= */

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!canWrite(auth.role)) return forbidden("Insufficient rights");

  const role = String(auth.role ?? "");

  const { id } = await params;
  const siteId = normalizeId(id);
  if (!siteId) return bad("Missing site id");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body");
  }

  try {
    const loaded = await loadSiteOr404(siteId, auth.tenantId);
    if (!loaded.ok) return loaded.res;

    const prev = loaded.data as any;
    const prevIsActive = typeof prev.isActive === "boolean" ? prev.isActive : true;

    const patch: any = {};
    const warnings: any[] = [];
    const changed: string[] = [];
    const changes: Record<string, any> = {};

    let nextIsActive = prevIsActive;

    if (body.isActive !== undefined) {
      if (typeof body.isActive !== "boolean") return bad("isActive must be a boolean");
      nextIsActive = body.isActive;
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

      patch.agentIds = validated.validIds;

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
      patch.managerIds = uniq(body.managerIds.map(normalizeId).filter(Boolean)).slice(0, 200);

      changed.push("managerIds");
      changes.managerIds = { fromCount: safeArr(prev.managerIds).length, toCount: patch.managerIds.length };
    }

    if (body.accessUids !== undefined) {
      if (role !== "admin") return forbidden("accessUids: admin only");
      if (!Array.isArray(body.accessUids)) return bad("accessUids must be an array");
      patch.accessUids = uniq(body.accessUids.map(normalizeId).filter(Boolean)).slice(0, 200);

      changed.push("accessUids");
      changes.accessUids = { fromCount: safeArr(prev.accessUids).length, toCount: patch.accessUids.length };
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

    if (body.clientName !== undefined) {
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

    if (body.instructions !== undefined) {
      const v = normalizeText(body.instructions) || null;
      patch.instructions = v;

      const d = diff(prev.instructions ?? null, v);
      if (d) {
        changed.push("instructions");
        changes.instructions = d;
      }
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
        clientName: patch.clientName ?? prev.clientName ?? null,
        city: patch.city ?? prev.city ?? null,
        address: patch.address ?? prev.address ?? null,
        postalCode: patch.postalCode ?? prev.postalCode ?? null,
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
      // inactive->active déjà “réservé” par assertWithinLimitsTx
    }

    const updated = await loaded.ref.get();
    const d = updated.data() as any;

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
  } catch (e: any) {
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

  if (!canWrite(auth.role)) return forbidden("Insufficient rights");

  const { id } = await params;
  const siteId = normalizeId(id);
  if (!siteId) return bad("Missing site id");

  try {
    const loaded = await loadSiteOr404(siteId, auth.tenantId);
    if (!loaded.ok) return loaded.res;

    const prev = loaded.data as any;
    const prevIsActive = typeof prev.isActive === "boolean" ? prev.isActive : true;

    // idempotent => pas de re-log
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
  } catch (e: any) {
    return serverError(e, "sites.[id].DELETE");
  }
}
