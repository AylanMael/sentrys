import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import {
  canReadBackoffice,
  canWrite,
  requireTenantUser,
} from "@/app/api/_utils/withTenant";
import { logActivity } from "@/lib/activity/logger";
import { adminDb } from "@/lib/firebase/admin";
import { normalizeMissionType } from "@/lib/planning/mission-types";

export const runtime = "nodejs";

type ClientOrderStatus =
  | "received"
  | "qualified"
  | "validated"
  | "partially_generated"
  | "planning_generated"
  | "cancelled";

type ClientOrderLineOperation = "add" | "update" | "cancel";

type ClientOrderLine = {
  id: string;
  operation: ClientOrderLineOperation;
  siteId: string;
  siteName: string | null;
  date: string;
  startTime: string;
  endTime: string;
  agentCount: number;
  missionType: string | null;
  requiredQualification: string | null;
  notes: string | null;
  sourceLineRef: string | null;
  generatedVacationIds: string[];
};

type ExistingVacationSnapshot = {
  id: string;
  data: Record<string, unknown>;
  startMs: number | null;
  endMs: number | null;
};

type PlanningPreviewLine = {
  lineId: string;
  operation: ClientOrderLineOperation;
  status: "ready" | "warning" | "blocked" | "manual" | "already_generated";
  siteId: string | null;
  siteName: string | null;
  date: string;
  startTime: string;
  endTime: string;
  agentCount: number;
  missionType: string | null;
  vacationsToCreate: number;
  duplicateVacationIds: string[];
  generatedVacationIds: string[];
  warnings: string[];
  blockers: string[];
};

type PlanningPreview = {
  sourceOrderId: string;
  window: { from: string; to: string } | null;
  limits: { candidates: number; window: number };
  predictive: true;
  summary: {
    lineCount: number;
    ready: number;
    blocked: number;
    manual: number;
    alreadyGenerated: number;
    duplicateLines: number;
    toCreate: number;
  };
  lines: PlanningPreviewLine[];
  globalWarnings: string[];
};

class PreviewWindowTooDenseError extends Error {}

type RouteContext = {
  params: Promise<{ id: string }>;
};

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function bad(error: string, extra?: Record<string, unknown>) {
  return json(400, { ok: false, error, ...extra });
}

function forbidden(error = "Forbidden") {
  return json(403, { ok: false, error });
}

function notFound() {
  return json(404, { ok: false, error: "Bon de commande introuvable" });
}

function serverError(error: unknown, tag: string) {
  console.error("[" + tag + "]", error);
  return json(500, {
    ok: false,
    error: "Internal error",
  });
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function optionalText(value: unknown) {
  const text = normalizeText(value);
  return text.length ? text : null;
}

function normalizeOperation(value: unknown): ClientOrderLineOperation {
  const text = normalizeText(value).toLowerCase();
  if (text === "update" || text === "cancel") return text;
  return "add";
}

function toIso(value: unknown) {
  const maybeTs = value as { toDate?: () => Date } | null | undefined;
  if (maybeTs && typeof maybeTs.toDate === "function") {
    return maybeTs.toDate().toISOString();
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  return null;
}

function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTime(value: string) {
  return /^\d{2}:\d{2}$/.test(value);
}

function clampAgentCount(value: unknown) {
  const n = Number(value ?? 1);
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(Math.floor(n), 1), 25);
}

function pickOrder(data: Record<string, unknown>, id: string) {
  return {
    id,
    tenantId: data.tenantId ?? null,
    clientId: data.clientId ?? null,
    clientName: data.clientName ?? null,
    reference: data.reference ?? null,
    title: data.title ?? null,
    channel: data.channel ?? "email",
    status: data.status ?? "received",
    version: data.version ?? 1,
    requesterName: data.requesterName ?? null,
    requesterEmail: data.requesterEmail ?? null,
    requesterPhone: data.requesterPhone ?? null,
    receivedAtIso: toIso(data.receivedAt),
    periodStart: data.periodStart ?? null,
    periodEnd: data.periodEnd ?? null,
    lines: Array.isArray(data.lines) ? data.lines : [],
    lineCount: data.lineCount ?? 0,
    totalRequestedVacations: data.totalRequestedVacations ?? 0,
    generatedVacationIds: Array.isArray(data.generatedVacationIds) ? data.generatedVacationIds : [],
    versions: Array.isArray(data.versions) ? data.versions : [],
    notes: data.notes ?? null,
    createdAtIso: toIso(data.createdAt),
    updatedAtIso: toIso(data.updatedAt),
    validatedAtIso: toIso(data.validatedAt),
    generatedAtIso: toIso(data.generatedAt),
    cancelledAtIso: toIso(data.cancelledAt),
  };
}

function summarize(lines: ClientOrderLine[]) {
  const totalRequestedVacations = lines.reduce((sum, line) => {
    if (line.operation !== "add") return sum;
    return sum + line.agentCount;
  }, 0);

  return {
    lineCount: lines.length,
    totalRequestedVacations,
    sitesCount: new Set(lines.map((line) => line.siteId)).size,
  };
}

function lineToRange(line: ClientOrderLine) {
  const start = new Date(line.date + "T" + line.startTime + ":00");
  let end = new Date(line.date + "T" + line.endTime + ":00");
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return null;
  }
  if (end.getTime() <= start.getTime()) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }
  return { start, end };
}

function toMillis(value: unknown) {
  const maybeTs = value as { toDate?: () => Date } | null | undefined;
  if (maybeTs && typeof maybeTs.toDate === "function") {
    const date = maybeTs.toDate();
    return Number.isFinite(date.getTime()) ? date.getTime() : null;
  }
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.getTime() : null;
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.getTime() : null;
  }
  return null;
}

function sameInstant(a: number | null, b: Date) {
  if (a === null) return false;
  return Math.abs(a - b.getTime()) < 1000;
}

function vacationFromDoc(doc: FirebaseFirestore.QueryDocumentSnapshot): ExistingVacationSnapshot {
  const data = doc.data() as Record<string, unknown>;
  return {
    id: doc.id,
    data,
    startMs: toMillis(data.startAt),
    endMs: toMillis(data.endAt),
  };
}

async function listExistingVacationsForPreview(input: {
  tenantId: string;
  from: Date;
  to: Date;
}) {
  const base = adminDb.collection("vacations").where("tenantId", "==", input.tenantId);
  const fromMs = input.from.getTime();
  const toMs = input.to.getTime();
  const scanFrom = input.from;

  const windowQuery = (windowFrom: Date, windowTo: Date) => base
    .where("startAt", ">=", windowFrom)
    .where("startAt", "<", windowTo);

  const candidateCount = (await windowQuery(scanFrom, input.to).count().get()).data().count;
  if (candidateCount > VACATION_CANDIDATE_LIMIT) {
    throw new PreviewWindowTooDenseError(
      "Periode trop large pour verifier les doublons de facon exhaustive. Reduisez la periode de la commande."
    );
  }

  const loadWindow = async (
    windowFrom: Date,
    windowTo: Date,
    depth = 0,
    knownCount?: number
  ): Promise<ExistingVacationSnapshot[]> => {
    const query = windowQuery(windowFrom, windowTo);
    const count = knownCount ?? (await query.count().get()).data().count;
    if (count <= VACATION_WINDOW_LIMIT) {
      const boundedQuery = query.orderBy("startAt", "asc").limit(VACATION_WINDOW_LIMIT);
      const snap = await boundedQuery.limit(VACATION_WINDOW_LIMIT + 1).get();
      if (snap.size > VACATION_WINDOW_LIMIT) {
        throw new PreviewWindowTooDenseError(
          "Periode trop dense pour verifier les doublons de facon exhaustive."
        );
      }
      return snap.docs.map(vacationFromDoc);
    }

    const fromTime = windowFrom.getTime();
    const toTime = windowTo.getTime();
    if (depth >= VACATION_WINDOW_MAX_DEPTH || toTime - fromTime <= 60_000) {
      throw new PreviewWindowTooDenseError(
        "Periode trop dense pour verifier les doublons de facon exhaustive."
      );
    }

    const middle = new Date(fromTime + Math.floor((toTime - fromTime) / 2));
    const left = await loadWindow(windowFrom, middle, depth + 1);
    const right = await loadWindow(middle, windowTo, depth + 1);
    return [...left, ...right];
  };

  const loaded = await loadWindow(scanFrom, input.to, 0, candidateCount);
  const unique = Array.from(new Map(loaded.map((vacation) => [vacation.id, vacation])).values());
  const items = unique.filter((item) => {
    if (item.startMs === null || item.endMs === null) return false;
    return item.startMs < toMs && item.endMs > fromMs;
  });

  return {
    items,
    warnings: [] as string[],
  };
}

const PREVIEW_MAX_RANGE_DAYS = 366;
const PREVIEW_LINE_LIMIT = 500;
const VACATION_WINDOW_LIMIT = 500;
const VACATION_WINDOW_MAX_DEPTH = 12;
const VACATION_CANDIDATE_LIMIT = 2000;

async function buildPlanningPreview(input: {
  tenantId: string;
  orderId: string;
  orderVersion: number;
  lines: ClientOrderLine[];
}) {
  if (input.lines.length > PREVIEW_LINE_LIMIT) {
    throw new PreviewWindowTooDenseError(
      "Periode trop large pour verifier les doublons de facon exhaustive."
    );
  }

  const ranges = input.lines
    .map((line) => lineToRange(line))
    .filter((range): range is { start: Date; end: Date } => Boolean(range));

  let existing: ExistingVacationSnapshot[] = [];
  const globalWarnings: string[] = [];

  if (ranges.length > 0) {
    const from = new Date(Math.min(...ranges.map((range) => range.start.getTime())));
    const to = new Date(Math.max(...ranges.map((range) => range.end.getTime())));
    if (to.getTime() - from.getTime() > PREVIEW_MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
      throw new PreviewWindowTooDenseError(
        "Periode trop large pour verifier les doublons de facon exhaustive."
      );
    }
    const loaded = await listExistingVacationsForPreview({
      tenantId: input.tenantId,
      from,
      to,
    });
    existing = loaded.items;
    globalWarnings.push(...loaded.warnings);
  }

  const lines: PlanningPreviewLine[] = input.lines.map((line) => {
    const generatedVacationIds = Array.isArray(line.generatedVacationIds)
      ? line.generatedVacationIds.filter((value) => typeof value === "string")
      : [];
    const range = lineToRange(line);
    const warnings: string[] = [];
    const blockers: string[] = [];
    const siteId = optionalText(line.siteId);

    if (!siteId) blockers.push("Site manquant");
    if (!range) blockers.push("Horaires invalides");

    if (line.operation === "cancel") {
      warnings.push("Annulation detectee: aucune vacation n'est supprimee automatiquement.");
      return {
        lineId: line.id,
        operation: line.operation,
        status: "manual",
        siteId,
        siteName: line.siteName,
        date: line.date,
        startTime: line.startTime,
        endTime: line.endTime,
        agentCount: line.agentCount,
        missionType: line.missionType,
        vacationsToCreate: 0,
        duplicateVacationIds: [],
        generatedVacationIds,
        warnings,
        blockers,
      };
    }

    if (line.operation === "update") {
      warnings.push("Modification detectee: reconciliation planning a valider avant automatisation.");
      return {
        lineId: line.id,
        operation: line.operation,
        status: "manual",
        siteId,
        siteName: line.siteName,
        date: line.date,
        startTime: line.startTime,
        endTime: line.endTime,
        agentCount: line.agentCount,
        missionType: line.missionType,
        vacationsToCreate: 0,
        duplicateVacationIds: [],
        generatedVacationIds,
        warnings,
        blockers,
      };
    }

    if (blockers.length > 0 || !range || !siteId) {
      return {
        lineId: line.id,
        operation: line.operation,
        status: "blocked",
        siteId,
        siteName: line.siteName,
        date: line.date,
        startTime: line.startTime,
        endTime: line.endTime,
        agentCount: line.agentCount,
        missionType: line.missionType,
        vacationsToCreate: 0,
        duplicateVacationIds: [],
        generatedVacationIds,
        warnings,
        blockers,
      };
    }

    const duplicates = existing.filter((vacation) => {
      const data = vacation.data;
      if (optionalText(data.status) === "cancelled") return false;
      if (optionalText(data.siteId) !== siteId) return false;
      return sameInstant(vacation.startMs, range.start) && sameInstant(vacation.endMs, range.end);
    });
    const duplicateVacationIds = duplicates.map((vacation) => vacation.id);

    if (generatedVacationIds.length > 0) {
      warnings.push("Ligne deja generee: aucune nouvelle vacation ne sera creee.");
      return {
        lineId: line.id,
        operation: line.operation,
        status: "already_generated",
        siteId,
        siteName: line.siteName,
        date: line.date,
        startTime: line.startTime,
        endTime: line.endTime,
        agentCount: line.agentCount,
        missionType: line.missionType,
        vacationsToCreate: 0,
        duplicateVacationIds,
        generatedVacationIds,
        warnings,
        blockers,
      };
    }

    if (duplicateVacationIds.length > 0) {
      warnings.push(
        "Doublon possible: " + duplicateVacationIds.length + " vacation(s) deja au meme horaire sur ce site."
      );
    }

    return {
      lineId: line.id,
      operation: line.operation,
      status: duplicateVacationIds.length > 0 ? "warning" : "ready",
      siteId,
      siteName: line.siteName,
      date: line.date,
      startTime: line.startTime,
      endTime: line.endTime,
      agentCount: line.agentCount,
      missionType: line.missionType,
      vacationsToCreate: clampAgentCount(line.agentCount),
      duplicateVacationIds,
      generatedVacationIds,
      warnings,
      blockers,
    };
  });

  const preview: PlanningPreview = {
    sourceOrderId: input.orderId,
    window: ranges.length > 0
      ? {
          from: new Date(Math.min(...ranges.map((range) => range.start.getTime()))).toISOString(),
          to: new Date(Math.max(...ranges.map((range) => range.end.getTime()))).toISOString(),
        }
      : null,
    limits: { candidates: VACATION_CANDIDATE_LIMIT, window: VACATION_WINDOW_LIMIT },
    predictive: true,
    summary: {
      lineCount: lines.length,
      ready: lines.filter((line) => line.status === "ready" || line.status === "warning").length,
      blocked: lines.filter((line) => line.status === "blocked").length,
      manual: lines.filter((line) => line.status === "manual").length,
      alreadyGenerated: lines.filter((line) => line.status === "already_generated").length,
      duplicateLines: lines.filter((line) => line.duplicateVacationIds.length > 0).length,
      toCreate: lines.reduce((sum, line) => sum + line.vacationsToCreate, 0),
    },
    lines,
    globalWarnings,
  };

  if (preview.summary.manual > 0) {
    preview.globalWarnings.push("Les lignes Modifier/Annuler sont visibles mais ne creent rien automatiquement.");
  }
  if (preview.summary.blocked > 0) {
    preview.globalWarnings.push("Corrigez les lignes bloquees avant generation.");
  }
  if (preview.summary.duplicateLines > 0) {
    preview.globalWarnings.push("Des doublons potentiels existent: controle exploitation recommande.");
  }

  return preview;
}

async function getOrder(id: string, tenantId: string) {
  const snap = await adminDb.collection("clientOrders").doc(id).get();
  if (!snap.exists) return null;

  const data = snap.data() as Record<string, unknown>;
  if (data.tenantId !== tenantId) return null;

  return { ref: snap.ref, data };
}

async function resolveSite(input: {
  tenantId: string;
  siteId: string;
  clientId: string | null;
}) {
  const snap = await adminDb.collection("sites").doc(input.siteId).get();
  if (!snap.exists) return { ok: false as const, error: "Site introuvable" };

  const data = snap.data() as Record<string, unknown>;
  if (data.tenantId !== input.tenantId) return { ok: false as const, error: "Site introuvable" };

  const siteClientId = optionalText(data.clientId);
  if (input.clientId && siteClientId && siteClientId !== input.clientId) {
    return { ok: false as const, error: "Le site ne dépend pas du client choisi" };
  }

  return {
    ok: true as const,
    siteName: optionalText(data.name),
    clientName: optionalText(data.clientName),
  };
}

async function normalizeLines(input: {
  tenantId: string;
  clientId: string | null;
  rawLines: unknown;
}) {
  if (!Array.isArray(input.rawLines) || input.rawLines.length === 0) {
    return { ok: false as const, error: "Ajoutez au moins une ligne de commande" };
  }

  const lines: ClientOrderLine[] = [];

  for (const [index, raw] of input.rawLines.entries()) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const siteId = normalizeText(item.siteId);
    const date = normalizeText(item.date);
    const startTime = normalizeText(item.startTime || item.start || "08:00");
    const endTime = normalizeText(item.endTime || item.end || "18:00");

    if (!siteId) return { ok: false as const, error: "Site obligatoire sur la ligne " + (index + 1) };
    if (!isDateOnly(date)) return { ok: false as const, error: "Date invalide sur la ligne " + (index + 1) };
    if (!isTime(startTime) || !isTime(endTime)) {
      return { ok: false as const, error: "Horaires invalides sur la ligne " + (index + 1) };
    }

    const site = await resolveSite({
      tenantId: input.tenantId,
      clientId: input.clientId,
      siteId,
    });
    if (!site.ok) return { ok: false as const, error: site.error + " sur la ligne " + (index + 1) };

    lines.push({
      id: optionalText(item.id) ?? "line_" + Date.now().toString(36) + "_" + index.toString(36),
      operation: normalizeOperation(item.operation),
      siteId,
      siteName: optionalText(item.siteName) ?? site.siteName,
      date,
      startTime,
      endTime,
      agentCount: clampAgentCount(item.agentCount),
      missionType: normalizeMissionType(item.missionType),
      requiredQualification: optionalText(item.requiredQualification),
      notes: optionalText(item.notes),
      sourceLineRef: optionalText(item.sourceLineRef),
      generatedVacationIds: Array.isArray(item.generatedVacationIds)
        ? item.generatedVacationIds.filter((value) => typeof value === "string")
        : [],
    });
  }

  return { ok: true as const, lines };
}

function buildVersionEntry(input: {
  version: number;
  status: ClientOrderStatus;
  uid: string;
  email: string | null;
  reason: string | null;
  lines: ClientOrderLine[];
}) {
  return {
    version: input.version,
    status: input.status,
    reason: input.reason,
    createdAtIso: new Date().toISOString(),
    createdBy: input.uid,
    createdByEmail: input.email,
    lineCount: input.lines.length,
    totalRequestedVacations: summarize(input.lines).totalRequestedVacations,
    lines: input.lines,
  };
}

async function createVacationsFromOrder(input: {
  tenantId: string;
  uid: string;
  orderId: string;
  orderVersion: number;
  order: Record<string, unknown>;
  lines: ClientOrderLine[];
  allowedLineIds?: Set<string>;
}) {
  const batch = adminDb.batch();
  const generatedIds: string[] = [];
  const nextLines = input.lines.map((line) => ({
    ...line,
    generatedVacationIds: Array.isArray(line.generatedVacationIds) ? [...line.generatedVacationIds] : [],
  }));
  const clientName = optionalText(input.order.clientName);

  for (const line of nextLines) {
    if (line.operation !== "add") continue;
    if (input.allowedLineIds && !input.allowedLineIds.has(line.id)) continue;
    if (line.generatedVacationIds.length > 0) continue;

    const range = lineToRange(line);
    if (!range) {
      throw new Error("Horaires invalides sur " + (line.siteName ?? line.siteId));
    }

    for (let i = 0; i < line.agentCount; i += 1) {
      const ref = adminDb.collection("vacations").doc();
      generatedIds.push(ref.id);
      line.generatedVacationIds.push(ref.id);

      batch.set(ref, {
        tenantId: input.tenantId,
        siteId: line.siteId,
        siteName: line.siteName,
        title: line.siteName ?? "Vacation client",
        clientName,
        missionType: line.missionType,
        requiredQualification: line.requiredQualification,
        notes: [
          line.notes,
          "Generee depuis bon de commande " + (optionalText(input.order.reference) ?? input.orderId) + " v" + input.orderVersion,
        ]
          .filter(Boolean)
          .join("\n"),
        startAt: range.start,
        endAt: range.end,
        requiredAgents: 1,
        assignedAgentIds: [],
        status: "planned",
        isPublished: false,
        source: "client_order",
        clientOrderId: input.orderId,
        clientOrderVersion: input.orderVersion,
        clientOrderLineId: line.id,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: input.uid,
        updatedBy: input.uid,
      });
    }
  }

  if (generatedIds.length > 0) await batch.commit();

  const allGeneratedIds = Array.from(
    new Set(nextLines.flatMap((line) => line.generatedVacationIds ?? []))
  );

  return { generatedIds, allGeneratedIds, lines: nextLines };
}

export async function GET(req: NextRequest, context: RouteContext) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!canReadBackoffice(auth.role)) return forbidden("Insufficient rights");

  const { id } = await context.params;

  try {
    const order = await getOrder(id, auth.tenantId);
    if (!order) return notFound();

    return json(200, {
      ok: true,
      tenantId: auth.tenantId,
      item: pickOrder(order.data, id),
    });
  } catch (error) {
    return serverError(error, "client-orders.GET_ONE");
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!canWrite(auth.role)) return forbidden("Insufficient rights");

  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad("Corps JSON invalide");
  }

  const action = normalizeText(body.action).toLowerCase();

  try {
    const order = await getOrder(id, auth.tenantId);
    if (!order) return notFound();

    const status = String(order.data.status ?? "received") as ClientOrderStatus;
    const currentVersion = Number(order.data.version ?? 1);
    const currentLines = Array.isArray(order.data.lines) ? (order.data.lines as ClientOrderLine[]) : [];

    if (action === "preview_planning") {
      if (JSON.stringify(body).length > 1_000 || Object.keys(body).some((key) => key !== "action")) {
        return bad("Parametres de previsualisation invalides");
      }
      if (status === "cancelled") return bad("Impossible de previsualiser un bon annule");
      if (currentLines.length === 0) return bad("Aucune ligne exploitable");

      const preview = await buildPlanningPreview({
        tenantId: auth.tenantId,
        orderId: id,
        orderVersion: currentVersion,
        lines: currentLines,
      });

      return json(200, {
        ok: true,
        tenantId: auth.tenantId,
        item: pickOrder(order.data, id),
        preview,
      });
    } else if (action === "validate") {
      if (status === "cancelled") return bad("Impossible de valider un bon annule");

      await order.ref.update({
        status: "validated",
        validatedAt: FieldValue.serverTimestamp(),
        validatedBy: auth.uid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: auth.uid,
      });

      await logActivity({
        tenantId: auth.tenantId,
        actorUid: auth.uid,
        actorEmail: auth.email ?? null,
        actorRole: auth.role ?? null,
        action: "client_order.validated",
        entityType: "system",
        entityId: id,
        message: "Bon de commande valide : " + (optionalText(order.data.title) ?? id),
        meta: { clientOrderId: id, version: currentVersion },
        severity: "info",
      });
    } else if (action === "cancel") {
      const reason = optionalText(body.reason) ?? "Annulation demandee";

      await order.ref.update({
        status: "cancelled",
        cancellationReason: reason,
        cancelledAt: FieldValue.serverTimestamp(),
        cancelledBy: auth.uid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: auth.uid,
      });

      await logActivity({
        tenantId: auth.tenantId,
        actorUid: auth.uid,
        actorEmail: auth.email ?? null,
        actorRole: auth.role ?? null,
        action: "client_order.cancelled",
        entityType: "system",
        entityId: id,
        message: "Bon de commande annule : " + reason,
        meta: { clientOrderId: id, version: currentVersion, reason },
        severity: "warning",
      });
    } else if (action === "update_version") {
      if (status === "cancelled") return bad("Impossible de versionner un bon annule");

      const clientId = optionalText(order.data.clientId);
      const normalized = await normalizeLines({
        tenantId: auth.tenantId,
        clientId,
        rawLines: body.lines,
      });
      if (!normalized.ok) return bad(normalized.error);

      const nextVersion = currentVersion + 1;
      const summary = summarize(normalized.lines);
      const reason = optionalText(body.changeReason) ?? "Mise a jour client";
      const entry = buildVersionEntry({
        version: nextVersion,
        status: "qualified",
        uid: auth.uid,
        email: auth.email ?? null,
        reason,
        lines: normalized.lines,
      });

      await order.ref.update({
        status: "qualified",
        version: nextVersion,
        lines: normalized.lines,
        lineCount: summary.lineCount,
        totalRequestedVacations: summary.totalRequestedVacations,
        sitesCount: summary.sitesCount,
        generatedVacationIds: [],
        versions: FieldValue.arrayUnion(entry),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: auth.uid,
      });

      await logActivity({
        tenantId: auth.tenantId,
        actorUid: auth.uid,
        actorEmail: auth.email ?? null,
        actorRole: auth.role ?? null,
        action: "client_order.versioned",
        entityType: "system",
        entityId: id,
        message: "Nouvelle version BDC v" + nextVersion + " : " + reason,
        meta: {
          clientOrderId: id,
          previousVersion: currentVersion,
          nextVersion,
          lineCount: summary.lineCount,
          totalRequestedVacations: summary.totalRequestedVacations,
        },
        severity: "info",
      });
    } else if (action === "generate_ready_planning") {
      if (status === "cancelled") return bad("Impossible de generer un planning depuis un bon annule");
      if (currentLines.length === 0) return bad("Aucune ligne exploitable");

      const preview = await buildPlanningPreview({
        tenantId: auth.tenantId,
        orderId: id,
        orderVersion: currentVersion,
        lines: currentLines,
      });

      const readyLineIds = new Set(
        preview.lines
          .filter((line) => line.status === "ready" && line.vacationsToCreate > 0)
          .map((line) => line.lineId)
      );

      if (readyLineIds.size === 0) {
        return bad("Aucune ligne prete a generer", { preview });
      }

      const generated = await createVacationsFromOrder({
        tenantId: auth.tenantId,
        uid: auth.uid,
        orderId: id,
        orderVersion: currentVersion,
        order: order.data,
        lines: currentLines,
        allowedLineIds: readyLineIds,
      });

      if (generated.generatedIds.length === 0) {
        return bad("Aucune nouvelle vacation a creer", { preview });
      }

      await order.ref.update({
        status: "partially_generated",
        lines: generated.lines,
        generatedVacationIds: generated.allGeneratedIds,
        partialGeneratedAt: FieldValue.serverTimestamp(),
        partialGeneratedBy: auth.uid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: auth.uid,
      });

      await logActivity({
        tenantId: auth.tenantId,
        actorUid: auth.uid,
        actorEmail: auth.email ?? null,
        actorRole: auth.role ?? null,
        action: "client_order.ready_lines_generated",
        entityType: "system",
        entityId: id,
        message: "Lignes pretes generees depuis BDC : " + generated.generatedIds.length + " vacation(s)",
        meta: {
          clientOrderId: id,
          version: currentVersion,
          generatedVacationIds: generated.generatedIds,
          allGeneratedVacationIds: generated.allGeneratedIds,
          skipped: {
            duplicateLines: preview.summary.duplicateLines,
            blocked: preview.summary.blocked,
            manual: preview.summary.manual,
          },
        },
        severity: "info",
      });
    } else if (action === "generate_planning") {
      if (status === "cancelled") return bad("Impossible de generer un planning depuis un bon annule");
      if (currentLines.length === 0) return bad("Aucune ligne exploitable");

      const preview = await buildPlanningPreview({
        tenantId: auth.tenantId,
        orderId: id,
        orderVersion: currentVersion,
        lines: currentLines,
      });

      if (preview.summary.blocked > 0) {
        return bad("Generation bloquee: corrigez les lignes incompletes avant creation", { preview });
      }

      if (preview.summary.duplicateLines > 0) {
        return bad("Generation bloquee: doublons potentiels detectes dans le planning", { preview });
      }

      if (preview.summary.toCreate <= 0) {
        return bad("Aucune nouvelle vacation a creer", { preview });
      }

      const generated = await createVacationsFromOrder({
        tenantId: auth.tenantId,
        uid: auth.uid,
        orderId: id,
        orderVersion: currentVersion,
        order: order.data,
        lines: currentLines,
      });

      await order.ref.update({
        status: "planning_generated",
        lines: generated.lines,
        generatedVacationIds: generated.allGeneratedIds,
        generatedAt: FieldValue.serverTimestamp(),
        generatedBy: auth.uid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: auth.uid,
      });

      await logActivity({
        tenantId: auth.tenantId,
        actorUid: auth.uid,
        actorEmail: auth.email ?? null,
        actorRole: auth.role ?? null,
        action: "client_order.planning_generated",
        entityType: "system",
        entityId: id,
        message: "Planning brouillon genere depuis BDC : " + generated.generatedIds.length + " vacation(s)",
        meta: {
          clientOrderId: id,
          version: currentVersion,
          generatedVacationIds: generated.generatedIds,
          allGeneratedVacationIds: generated.allGeneratedIds,
        },
        severity: generated.generatedIds.length > 0 ? "info" : "warning",
      });
    } else {
      return bad("Action inconnue", {
        allowed: ["validate", "cancel", "update_version", "preview_planning", "generate_ready_planning", "generate_planning"],
      });
    }

    const updated = await order.ref.get();
    return json(200, {
      ok: true,
      tenantId: auth.tenantId,
      item: pickOrder(updated.data() as Record<string, unknown>, id),
    });
  } catch (error) {
    if (error instanceof PreviewWindowTooDenseError) {
      return json(422, {
        ok: false,
        error: "Periode trop large pour verifier les doublons. Reduisez la periode de la commande.",
      });
    }
    return serverError(error, "client-orders.PATCH");
  }
}
