import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { requireTenantUser, canWrite } from "@/app/api/_utils/withTenant";
import { logActivity } from "@/lib/activity/logger";

export const runtime = "nodejs";

/* ================= helpers ================= */

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
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

function normalizeText(v: unknown) {
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

function asStatus(v: unknown): IncidentStatus {
  const s = String(v ?? "").toLowerCase().trim();
  if (s === "open" || s === "investigating" || s === "resolved" || s === "closed") return s;
  return "open";
}

function asSeverity(v: unknown): IncidentSeverity {
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

function pickIncident(d: Record<string, unknown>, id: string) {
  return {
    id,
    tenantId: d.tenantId as string,
    title: d.title as string | null ?? null,
    description: d.description as string | null ?? null,
    status: asStatus(d.status),
    severity: asSeverity(d.severity),
    siteId: d.siteId as string | null ?? null,
    vacationId: d.vacationId as string | null ?? null,
    agentId: d.agentId as string | null ?? null,
    tags: Array.isArray(d.tags) ? (d.tags.filter((x) => typeof x === "string") as string[]) : [],
    isDeleted: typeof d.isDeleted === "boolean" ? d.isDeleted : false,
    search: d.search as string | null ?? null,
    createdBy: d.createdBy as string | null ?? null,
    updatedBy: d.updatedBy as string | null ?? null,
    createdAtIso: toIso(d.createdAt),
    updatedAtIso: toIso(d.updatedAt),
  };
}

function diffKeys(prev: Record<string, unknown>, patch: Record<string, unknown>): string[] {
  const keys = Object.keys(patch);
  const out: string[] = [];
  for (const k of keys) {
    // ignore metadata keys in "changes"
    if (k === "updatedAt" || k === "updatedBy" || k === "search") continue;

    const a = prev[k];
    const b = patch[k];

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

  const data = snap.data() as Record<string, unknown> | undefined;
  if (data?.tenantId !== tenantId) return { ok: false as const, res: notFound("Incident not found") };

  return { ok: true as const, ref, snap, data: data! };
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
  } catch (e: unknown) {
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

  let body: Record<string, unknown>;
  try {
    const raw = await req.json();
    body = raw as Record<string, unknown>;
  } catch {
    return bad("Invalid JSON body");
  }

  try {
    const loaded = await loadIncidentOr404(incidentId, auth.tenantId);
    if (!loaded.ok) return loaded.res;

    const prev = loaded.data;
    if (prev?.isDeleted === true) return bad("Cannot update a deleted incident");

    const patch: Record<string, unknown> = {};

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
        (body.tags as unknown[])
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim())
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
    const nextTitle = (patch.title as string | undefined) ?? (prev.title as string | undefined) ?? "";
    const nextDesc = (patch.description as string | null | undefined) ?? (prev.description as string | null | undefined) ?? null;
    const nextSiteId = (patch.siteId as string | null | undefined) ?? (prev.siteId as string | null | undefined) ?? null;
    const nextAgentId = (patch.agentId as string | null | undefined) ?? (prev.agentId as string | null | undefined) ?? null;
    const nextVacationId = (patch.vacationId as string | null | undefined) ?? (prev.vacationId as string | null | undefined) ?? null;

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
    const data = updatedSnap.data() as Record<string, unknown>;

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
      actorEmail: auth.email ?? null,
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
  } catch (e: unknown) {
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
    const { ok, res, ref, data: prev } = await loadIncidentOr404(incidentId, auth.tenantId);
    if (!ok) return res;

    if (prev?.isDeleted === true) {
      return json(200, { ok: true, id: incidentId, updated: { isDeleted: true }, noop: true });
    }

    await ref.set(
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
      actorEmail: auth.email ?? null,
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
  } catch (e: unknown) {
    return serverError(e, "incidents.[id].DELETE");
  }
}
