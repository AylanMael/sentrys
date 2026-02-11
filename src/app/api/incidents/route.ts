// src/app/api/incidents/route.ts
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

function parseMax(v: string | null, def = 50) {
  const n = Number(v ?? "");
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), 200);
}

function parseBool(v: string | null): boolean | null {
  if (v == null) return null;
  const x = v.toLowerCase().trim();
  if (["1", "true", "yes", "y"].includes(x)) return true;
  if (["0", "false", "no", "n"].includes(x)) return false;
  return null;
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

function uniq(arr: string[]) {
  return Array.from(new Set(arr.map((x) => String(x)).filter(Boolean)));
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

/* ================= GET ================= */
/**
 * GET /api/incidents?max=50&q=...&status=open&severity=high&siteId=...&agentId=...&vacationId=...&includeDeleted=false
 *
 * NB: on évite les index composites => filtre q en mémoire
 */
export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  const url = new URL(req.url);
  const max = parseMax(url.searchParams.get("max"), 50);

  const q = normalizeText(url.searchParams.get("q")).toLowerCase();
  const statusParam = normalizeText(url.searchParams.get("status"));
  const severityParam = normalizeText(url.searchParams.get("severity"));
  const siteId = normalizeText(url.searchParams.get("siteId")) || "";
  const agentId = normalizeText(url.searchParams.get("agentId")) || "";
  const vacationId = normalizeText(url.searchParams.get("vacationId")) || "";
  const includeDeleted = parseBool(url.searchParams.get("includeDeleted")) ?? false;

  try {
    let ref: FirebaseFirestore.Query = adminDb
      .collection("incidents")
      .where("tenantId", "==", auth.tenantId);

    if (!includeDeleted) ref = ref.where("isDeleted", "==", false);

    // ⚠️ chaque where supplémentaire peut demander un index si on ajoute orderBy.
    // Ici => pas de orderBy (pour rester simple), tri en mémoire.
    if (statusParam) ref = ref.where("status", "==", asStatus(statusParam));
    if (severityParam) ref = ref.where("severity", "==", asSeverity(severityParam));
    if (siteId) ref = ref.where("siteId", "==", siteId);
    if (agentId) ref = ref.where("agentId", "==", agentId);
    if (vacationId) ref = ref.where("vacationId", "==", vacationId);

    const snap = await ref.limit(max).get();

    // ✅ Tri fiable sur timestamps Firestore (data.createdAt/updatedAt), puis mapping UI
    const docs = snap.docs.slice();

    docs.sort((a, b) => {
      const da = a.data() as any;
      const db = b.data() as any;

      const au = da?.updatedAt?.toDate?.()?.getTime?.() ?? 0;
      const bu = db?.updatedAt?.toDate?.()?.getTime?.() ?? 0;
      if (bu !== au) return bu - au;

      const ac = da?.createdAt?.toDate?.()?.getTime?.() ?? 0;
      const bc = db?.createdAt?.toDate?.()?.getTime?.() ?? 0;
      return bc - ac;
    });

    let incidents = docs.map((d) => pickIncident(d.data(), d.id));

    // filtre q en mémoire
    if (q) {
      incidents = incidents.filter((it: any) => {
        const hay =
          String(it.search ?? "").toLowerCase().trim() ||
          `${it.title ?? ""} ${it.description ?? ""} ${it.siteId ?? ""} ${it.agentId ?? ""} ${it.vacationId ?? ""}`
            .toLowerCase()
            .trim();
        return hay.includes(q);
      });
    }

    return json(200, { ok: true, tenantId: auth.tenantId, count: incidents.length, incidents });
  } catch (e: any) {
    return serverError(e, "incidents.GET");
  }
}

/* ================= POST ================= */
/**
 * POST /api/incidents
 * body: { title, description?, severity?, status?, siteId?, agentId?, vacationId?, tags? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!canWrite(auth.role)) return forbidden("Insufficient rights");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body");
  }

  const title = normalizeText(body.title);
  if (!title) return bad("title is required");

  const description = normalizeText(body.description) || null;

  const severity = asSeverity(body.severity);
  const status = asStatus(body.status);

  const siteId = normalizeText(body.siteId) || null;
  const agentId = normalizeText(body.agentId) || null;
  const vacationId = normalizeText(body.vacationId) || null;

  const tags = Array.isArray(body.tags)
    ? uniq(
        body.tags
          .filter((x: any) => typeof x === "string")
          .map((x: string) => x.trim())
          .filter(Boolean)
      ).slice(0, 20)
    : [];

  const search = buildSearch({ title, description, siteId, agentId, vacationId });

  try {
    const payload: any = {
      tenantId: auth.tenantId,
      title,
      description,
      severity,
      status,
      siteId,
      agentId,
      vacationId,
      tags,

      isDeleted: false,
      search,

      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: auth.uid,
      updatedBy: auth.uid,
    };

    const ref = await adminDb.collection("incidents").add(payload);
    const created = await ref.get();

    // ✅ activity log
    await logActivity({
      tenantId: auth.tenantId,
      actorUid: auth.uid,
      actorEmail: (auth as any).email ?? null,
      actorRole: auth.role ?? null,
      action: "incident.created",
      entityType: "incident",
      entityId: ref.id,
      message: `Incident créé : ${title}`,
      meta: { incidentId: ref.id, title, severity, status, siteId, agentId, vacationId },
      severity: mapSeverityToActivity(severity),
    });

    return json(201, {
      ok: true,
      tenantId: auth.tenantId,
      id: ref.id,
      incident: pickIncident(created.data(), ref.id),
    });
  } catch (e: any) {
    return serverError(e, "incidents.POST");
  }
}
