// src/app/api/incidents/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

import { requireTenantUser, canWrite } from "@/app/api/_utils/withTenant";
import { logActivity } from "@/lib/activity/logger";
import { IncidentCreateSchema } from "@/lib/api/schemas";
import { isWithinGeofence } from "@/lib/utils/geo";

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
  return typeof t?.toDate === "function" ? t.toDate().toISOString() : null;
}

function normalizeText(v: unknown) {
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

    tags: Array.isArray(d.tags) ? d.tags.filter((x) => typeof x === "string") as string[] : [],

    isDeleted: typeof d.isDeleted === "boolean" ? d.isDeleted : false,

    search: d.search as string | null ?? null,

    createdBy: d.createdBy as string | null ?? null,
    updatedBy: d.updatedBy as string | null ?? null,

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
      const da = a.data() as { updatedAt?: { toDate?: () => Date }; createdAt?: { toDate?: () => Date } };
      const db = b.data() as { updatedAt?: { toDate?: () => Date }; createdAt?: { toDate?: () => Date } };

      const au = da?.updatedAt?.toDate?.()?.getTime?.() ?? 0;
      const bu = db?.updatedAt?.toDate?.()?.getTime?.() ?? 0;
      if (bu !== au) return bu - au;

      const ac = da?.createdAt?.toDate?.()?.getTime?.() ?? 0;
      const bc = db?.createdAt?.toDate?.()?.getTime?.() ?? 0;
      return bc - ac;
    });

    let incidents = docs.map((d) => pickIncident(d.data() as Record<string, unknown>, d.id));

    // filtre q en mémoire
    if (q) {
      incidents = incidents.filter((it) => {
        const hay =
          String(it.search ?? "").toLowerCase().trim() ||
          `${it.title ?? ""} ${it.description ?? ""} ${it.siteId ?? ""} ${it.agentId ?? ""} ${it.vacationId ?? ""}`
            .toLowerCase()
            .trim();
        return hay.includes(q);
      });
    }

    return json(200, { ok: true, tenantId: auth.tenantId, count: incidents.length, incidents });
  } catch (e: unknown) {
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

  let rawBody: any;
  try {
    rawBody = await req.json();
  } catch {
    return bad("Invalid JSON body");
  }

  // VALIDATION ZOD
  const validation = IncidentCreateSchema.safeParse(rawBody);
  if (!validation.success) {
    return bad("Données invalidés", { detail: validation.error.format() });
  }

  const values = validation.data;

  try {
    // GEOFENCING CHECK
    if (values.reportedLat && values.reportedLng) {
      const siteSnap = await adminDb.collection("sites").doc(values.siteId).get();
      if (siteSnap.exists) {
        const siteData = siteSnap.data();
        if (siteData?.latitude && siteData?.longitude) {
          const within = isWithinGeofence(
            values.reportedLat,
            values.reportedLng,
            siteData.latitude,
            siteData.longitude,
            500 // 500 mètres
          );
          if (!within) {
            return bad("Hors périmètre", {
              error: "Vous devez être à moins de 500m du site pour déclarer un incident."
            });
          }
        }
      }
    }

    const payload: Record<string, unknown> = {
      tenantId: auth.tenantId,
      title: values.title,
      description: values.description,
      severity: values.severity,
      status: values.status,
      siteId: values.siteId,
      agentId: values.agentId ?? null,
      vacationId: values.vacationId ?? null,
      tags: values.tags,

      isDeleted: false,
      search: buildSearch({
        title: values.title,
        description: values.description,
        siteId: values.siteId,
        agentId: values.agentId,
        vacationId: values.vacationId
      }),

      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: auth.uid,
      updatedBy: auth.uid,
    };

    const ref = await adminDb.collection("incidents").add(payload);
    const created = await ref.get();

    // activity log
    await logActivity({
      tenantId: auth.tenantId,
      actorUid: auth.uid,
      actorEmail: (auth as any).email ?? null,
      actorRole: auth.role ?? null,
      action: "incident.created",
      entityType: "incident",
      entityId: ref.id,
      message: `Incident créé : ${values.title}`,
      meta: {
        incidentId: ref.id,
        title: values.title,
        severity: values.severity,
        status: values.status,
        siteId: values.siteId
      },
      severity: mapSeverityToActivity(values.severity),
    });

    return json(201, {
      ok: true,
      tenantId: auth.tenantId,
      id: ref.id,
      incident: pickIncident(payload as Record<string, unknown>, ref.id),
    });
  } catch (e: unknown) {
    return serverError(e, "incidents.POST");
  }
}
