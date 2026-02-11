// src/app/api/incidents/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

import { requireTenantUser, canWrite } from "@/app/api/_utils/withTenant";
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
  return json(500, { ok: false, error: "Internal error", details: e?.message ?? String(e) });
}

function toIso(ts: any) {
  return ts && typeof ts.toDate === "function" ? ts.toDate().toISOString() : null;
}

function normalizeText(v: any) {
  return String(v ?? "").trim();
}

function safeArr(v: unknown): string[] {
  return Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : [];
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.map((x) => String(x)).filter(Boolean)));
}

type IncidentStatus = "open" | "investigating" | "resolved" | "closed";
type IncidentSeverity = "low" | "medium" | "high" | "critical";

function asStatus(v: any): IncidentStatus {
  const s = String(v ?? "").toLowerCase().trim();
  if (s === "open" || s === "investigating" || s === "resolved" || s === "closed") return s;
  return "open";
}

function asSeverity(v: any): IncidentSeverity {
  const s = String(v ?? "").toLowerCase().trim();
  if (s === "low" || s === "medium" || s === "high" || s === "critical") return s;
  return "medium";
}

function mapSeverityToActivity(sev: IncidentSeverity): "info" | "warning" | "critical" {
  if (sev === "critical") return "critical";
  if (sev === "high") return "warning";
  return "info";
}

function buildSearch(input: {
  title: string;
  description?: string | null;
  siteId?: string | null;
  agentId?: string | null;
  vacationId?: string | null;
}) {
  const parts = [
    input.title,
    input.description ?? "",
    input.siteId ?? "",
    input.agentId ?? "",
    input.vacationId ?? "",
  ]
    .map((x) => normalizeText(x).toLowerCase())
    .filter(Boolean);
  return parts.join(" ");
}

function pickIncident(d: any, id: string) {
  return {
    id,
    tenantId: d.tenantId,
    title: d.title ?? null,
    description: d.description ?? null,
    status: asStatus(d.status),
    severity: asSeverity(d.severity),
    siteId: d.siteId ?? null,
    vacationId: d.vacationId ?? null,
    agentId: d.agentId ?? null,
    tags: Array.isArray(d.tags) ? d.tags.filter((x: any) => typeof x === "string") : [],
    isDeleted: typeof d.isDeleted === "boolean" ? d.isDeleted : false,
    search: d.search ?? null,
    createdBy: d.createdBy ?? null,
    updatedBy: d.updatedBy ?? null,
    createdAtIso: toIso(d.createdAt),
    updatedAtIso: toIso(d.updatedAt),
  };
}

function diffKeys(prev: any, patch: any): string[] {
  const keys = Object.keys(patch ?? {});
  const out: string[] = [];
  for (const k of keys) {
    // ignore metadata keys in "changes"
    if (k === "updatedAt" || k === "updatedBy" || k === "search") continue;

    const a = (prev as any)?.[k];
    const b = (patch as any)?.[k];

    // basic deep-ish comparison for arrays
    if (Array.isArray(a) || Array.isArray(b)) {
      const aa = JSON.stringify(a ?? []);
      const bb = JSON.stringify(b ?? []);
      if (aa !== bb) out.push(k);
      continue;
    }

    if (a !== b) out.push(k);
  }
  return out;
}

/* ================= loader ================= */

async function loadIncidentOr404(incidentId: string, tenantId: string) {
  const ref = adminDb.collection("incidents").doc(incidentId);
  const snap = await ref.get();

  if (!snap.exists) return { ok: false as const, res: notFound("Incident not found") };

  const data = snap.data() as any;
  if (data?.tenantId !== tenantId) return { ok: false as const, res: notFound("Incident not found") };

  return { ok: true as const, ref, snap, data };
}

/* ================= GET ================= */
/**
 * GET /api/incidents/:id
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  const { id } = await params;
  const incidentId = normalizeText(id);
  if (!incidentId) return bad("Missing incident id");

  try {
    const loaded = await loadIncidentOr404(incidentId, auth.tenantId);
    if (!loaded.ok) return loaded.res;

    return json(200, {
      ok: true,
      tenantId: auth.tenantId,
      incident: pickIncident(loaded.data, loaded.snap.id),
    });
  } catch (e: any) {
    return serverError(e, "incidents.[id].GET");
  }
}

/* ================= PATCH ================= */
/**
 * PATCH /api/incidents/:id
 * body: { title?, description?, severity?, status?, siteId?, agentId?, vacationId?, tags? }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!canWrite(auth.role)) return forbidden("Insufficient rights");

  const { id } = await params;
  const incidentId = normalizeText(id);
  if (!incidentId) return bad("Missing incident id");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body");
  }

  try {
    const loaded = await loadIncidentOr404(incidentId, auth.tenantId);
    if (!loaded.ok) return loaded.res;

    const prev = loaded.data as any;
    if (prev?.isDeleted === true) return bad("Cannot update a deleted incident");

    const patch: any = {};

    if (body.title !== undefined) {
      const v = normalizeText(body.title);
      if (!v) return bad("title cannot be empty");
      patch.title = v;
    }

    if (body.description !== undefined) patch.description = normalizeText(body.description) || null;
    if (body.severity !== undefined) patch.severity = asSeverity(body.severity);

    let nextStatus: IncidentStatus = asStatus(prev.status);
    if (body.status !== undefined) {
      nextStatus = asStatus(body.status);
      patch.status = nextStatus;
    }

    if (body.siteId !== undefined) patch.siteId = normalizeText(body.siteId) || null;
    if (body.agentId !== undefined) patch.agentId = normalizeText(body.agentId) || null;
    if (body.vacationId !== undefined) patch.vacationId = normalizeText(body.vacationId) || null;

    if (body.tags !== undefined) {
      if (!Array.isArray(body.tags)) return bad("tags must be an array");
      patch.tags = uniq(
        body.tags
          .filter((x: any) => typeof x === "string")
          .map((x: string) => x.trim())
          .filter(Boolean)
      ).slice(0, 20);
    }

    // PATCH vide => on évite écriture + log
    const meaningfulKeys = Object.keys(patch);
    if (meaningfulKeys.length === 0) {
      return json(200, {
        ok: true,
        tenantId: auth.tenantId,
        incident: pickIncident(prev, incidentId),
        noop: true,
      });
    }

    // ✅ recalcul search
    const nextTitle = patch.title ?? prev.title ?? "";
    const nextDesc = patch.description ?? prev.description ?? null;
    const nextSiteId = patch.siteId ?? prev.siteId ?? null;
    const nextAgentId = patch.agentId ?? prev.agentId ?? null;
    const nextVacationId = patch.vacationId ?? prev.vacationId ?? null;
    patch.search = buildSearch({
      title: nextTitle,
      description: nextDesc,
      siteId: nextSiteId,
      agentId: nextAgentId,
      vacationId: nextVacationId,
    });

    patch.updatedAt = FieldValue.serverTimestamp();
    patch.updatedBy = auth.uid;

    const changed = diffKeys(prev, patch);

    await loaded.ref.set(patch, { merge: true });

    const updatedSnap = await loaded.ref.get();
    const data = updatedSnap.data() as any;

    // ✅ activity log (status-based message)
    const sev = asSeverity(data?.severity);
    const st = asStatus(data?.status);

    const action = st === "closed" && asStatus(prev?.status) !== "closed"
      ? "incident.closed"
      : "incident.updated";

    const title = data?.title ?? "—";

    await logActivity({
      tenantId: auth.tenantId,
      actorUid: auth.uid,
      actorEmail: (auth as any).email ?? null,
      actorRole: auth.role ?? null,
      action,
      entityType: "incident",
      entityId: updatedSnap.id,
      message:
        action === "incident.closed"
          ? `Incident clôturé : ${title}`
          : `Incident mis à jour : ${title}`,
      meta: {
        incidentId: updatedSnap.id,
        changedFields: changed,
        before: {
          status: asStatus(prev?.status),
          severity: asSeverity(prev?.severity),
          siteId: prev?.siteId ?? null,
          agentId: prev?.agentId ?? null,
          vacationId: prev?.vacationId ?? null,
          tags: safeArr(prev?.tags),
        },
        after: {
          status: st,
          severity: sev,
          siteId: data?.siteId ?? null,
          agentId: data?.agentId ?? null,
          vacationId: data?.vacationId ?? null,
          tags: safeArr(data?.tags),
        },
      },
      severity: action === "incident.closed" ? "info" : mapSeverityToActivity(sev),
    });

    return json(200, {
      ok: true,
      tenantId: auth.tenantId,
      incident: pickIncident(data, updatedSnap.id),
    });
  } catch (e: any) {
    return serverError(e, "incidents.[id].PATCH");
  }
}

/* ================= DELETE ================= */
/**
 * DELETE /api/incidents/:id
 * => soft delete: isDeleted=true
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!canWrite(auth.role)) return forbidden("Insufficient rights");

  const { id } = await params;
  const incidentId = normalizeText(id);
  if (!incidentId) return bad("Missing incident id");

  try {
    const loaded = await loadIncidentOr404(incidentId, auth.tenantId);
    if (!loaded.ok) return loaded.res;

    const prev = loaded.data as any;

    if (prev?.isDeleted === true) {
      return json(200, { ok: true, id: incidentId, updated: { isDeleted: true }, noop: true });
    }

    await loaded.ref.set(
      {
        isDeleted: true,
        status: "closed",
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: auth.uid,
      },
      { merge: true }
    );

    const title = prev?.title ?? "—";
    const sev = asSeverity(prev?.severity);

    await logActivity({
      tenantId: auth.tenantId,
      actorUid: auth.uid,
      actorEmail: (auth as any).email ?? null,
      actorRole: auth.role ?? null,
      action: "incident.deleted",
      entityType: "incident",
      entityId: incidentId,
      message: `Incident supprimé (soft) : ${title}`,
      meta: {
        incidentId,
        statusBefore: asStatus(prev?.status),
        severity: sev,
        siteId: prev?.siteId ?? null,
        agentId: prev?.agentId ?? null,
        vacationId: prev?.vacationId ?? null,
      },
      severity: "warning",
    });

    return json(200, { ok: true, id: incidentId, updated: { isDeleted: true } });
  } catch (e: any) {
    return serverError(e, "incidents.[id].DELETE");
  }
}
