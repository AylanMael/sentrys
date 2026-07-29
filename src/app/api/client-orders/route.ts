import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

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

type ClientOrderChannel = "email" | "phone" | "portal" | "manual" | "other";
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

type SiteResolution = {
  ok: true;
  id: string;
  name: string | null;
  clientId: string | null;
  clientName: string | null;
} | {
  ok: false;
  error: string;
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

function normalizeChannel(value: unknown): ClientOrderChannel {
  const text = normalizeText(value).toLowerCase();
  if (text === "email" || text === "phone" || text === "portal" || text === "manual" || text === "other") {
    return text;
  }
  return "email";
}

function normalizeStatus(value: unknown): ClientOrderStatus | "all" {
  const text = normalizeText(value).toLowerCase();
  if (
    text === "received" ||
    text === "qualified" ||
    text === "validated" ||
    text === "partially_generated" ||
    text === "planning_generated" ||
    text === "cancelled"
  ) {
    return text;
  }
  return "all";
}

function normalizeOperation(value: unknown): ClientOrderLineOperation {
  const text = normalizeText(value).toLowerCase();
  if (text === "update" || text === "cancel") return text;
  return "add";
}

function parseMax(value: string | null, fallback = 80) {
  const n = Number(value ?? "");
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 250);
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

function buildSearch(input: {
  reference: string | null;
  title: string;
  clientName: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
  lines: ClientOrderLine[];
}) {
  return [
    input.reference,
    input.title,
    input.clientName,
    input.requesterName,
    input.requesterEmail,
    ...input.lines.map((line) => line.siteName),
    ...input.lines.map((line) => line.notes),
  ]
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ");
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

async function resolveClient(input: { tenantId: string; clientId: string | null }) {
  if (!input.clientId) {
    return { ok: true as const, clientId: null, clientName: null };
  }

  const snap = await adminDb.collection("clients").doc(input.clientId).get();
  if (!snap.exists) return { ok: false as const, error: "Client introuvable" };

  const data = snap.data() as Record<string, unknown>;
  if (data.tenantId !== input.tenantId) return { ok: false as const, error: "Client introuvable" };

  return {
    ok: true as const,
    clientId: input.clientId,
    clientName: optionalText(data.name) ?? optionalText(data.legalName),
  };
}

async function resolveSite(input: {
  tenantId: string;
  siteId: string;
  clientId: string | null;
}): Promise<SiteResolution> {
  const snap = await adminDb.collection("sites").doc(input.siteId).get();
  if (!snap.exists) return { ok: false, error: "Site introuvable" };

  const data = snap.data() as Record<string, unknown>;
  if (data.tenantId !== input.tenantId) return { ok: false, error: "Site introuvable" };

  const siteClientId = optionalText(data.clientId);
  if (input.clientId && siteClientId && siteClientId !== input.clientId) {
    return { ok: false, error: "Le site ne dépend pas du client choisi" };
  }

  return {
    ok: true,
    id: input.siteId,
    name: optionalText(data.name),
    clientId: siteClientId,
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
    if (!siteId) {
      return { ok: false as const, error: "Site obligatoire sur la ligne " + (index + 1) };
    }

    const date = normalizeText(item.date);
    const startTime = normalizeText(item.startTime || item.start || "08:00");
    const endTime = normalizeText(item.endTime || item.end || "18:00");

    if (!isDateOnly(date)) {
      return { ok: false as const, error: "Date invalide sur la ligne " + (index + 1) };
    }
    if (!isTime(startTime) || !isTime(endTime)) {
      return { ok: false as const, error: "Horaires invalides sur la ligne " + (index + 1) };
    }

    const site = await resolveSite({
      tenantId: input.tenantId,
      clientId: input.clientId,
      siteId,
    });

    if (!site.ok) {
      return { ok: false as const, error: site.error + " sur la ligne " + (index + 1) };
    }

    const stableId =
      optionalText(item.id) ??
      "line_" + Date.now().toString(36) + "_" + index.toString(36);

    lines.push({
      id: stableId,
      operation: normalizeOperation(item.operation),
      siteId,
      siteName: optionalText(item.siteName) ?? site.name,
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

export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!canReadBackoffice(auth.role)) return forbidden("Insufficient rights");

  const url = new URL(req.url);
  const max = parseMax(url.searchParams.get("max"), 120);
  const status = normalizeStatus(url.searchParams.get("status"));
  const clientId = optionalText(url.searchParams.get("clientId"));
  const q = normalizeText(url.searchParams.get("q")).toLowerCase();

  try {
    const fetchLimit = Math.min(Math.max(max * 4, 250), 1000);

    // Index-safe query: keep Firestore simple, then filter/sort in memory.
    // This avoids blocking a new tenant because a composite index is missing.
    const snap = await adminDb
      .collection("clientOrders")
      .where("tenantId", "==", auth.tenantId)
      .limit(fetchLimit)
      .get();

    let items = snap.docs.map((doc) => pickOrder(doc.data() as Record<string, unknown>, doc.id));

    if (status !== "all") {
      items = items.filter((item) => item.status === status);
    }

    if (clientId) {
      items = items.filter((item) => item.clientId === clientId);
    }

    if (q) {
      items = items.filter((item) => {
        const hay = [
          item.reference,
          item.title,
          item.clientName,
          item.requesterName,
          item.requesterEmail,
          ...(Array.isArray(item.lines) ? item.lines.map((line: any) => line.siteName || line.notes || "") : []),
        ]
          .map((value) => normalizeText(value).toLowerCase())
          .join(" ");
        return hay.includes(q);
      });
    }

    items.sort((a, b) => {
      const aMs =
        (a.updatedAtIso ? Date.parse(a.updatedAtIso) : 0) ||
        (a.createdAtIso ? Date.parse(a.createdAtIso) : 0);
      const bMs =
        (b.updatedAtIso ? Date.parse(b.updatedAtIso) : 0) ||
        (b.createdAtIso ? Date.parse(b.createdAtIso) : 0);
      return bMs - aMs;
    });

    items = items.slice(0, max);

    return json(200, {
      ok: true,
      tenantId: auth.tenantId,
      count: items.length,
      items,
    });
  } catch (error) {
    return serverError(error, "client-orders.GET");
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!canWrite(auth.role)) return forbidden("Insufficient rights");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad("Corps JSON invalide");
  }

  const clientId = optionalText(body.clientId);
  const client = await resolveClient({ tenantId: auth.tenantId, clientId });
  if (!client.ok) return bad(client.error);

  const linesResult = await normalizeLines({
    tenantId: auth.tenantId,
    clientId: client.clientId,
    rawLines: body.lines,
  });
  if (!linesResult.ok) return bad(linesResult.error);

  const title = optionalText(body.title) ?? "Bon de commande client";
  const reference = optionalText(body.reference);
  const requesterName = optionalText(body.requesterName);
  const requesterEmail = optionalText(body.requesterEmail)?.toLowerCase() ?? null;
  const requesterPhone = optionalText(body.requesterPhone);
  const receivedAtText = optionalText(body.receivedAt);
  const receivedAtDate = receivedAtText ? new Date(receivedAtText) : new Date();
  const summary = summarize(linesResult.lines);
  const status: ClientOrderStatus = "received";
  const search = buildSearch({
    reference,
    title,
    clientName: client.clientName,
    requesterName,
    requesterEmail,
    lines: linesResult.lines,
  });

  const versionEntry = buildVersionEntry({
    version: 1,
    status,
    uid: auth.uid,
    email: auth.email ?? null,
    reason: optionalText(body.changeReason) ?? "Reception initiale",
    lines: linesResult.lines,
  });

  try {
    const payload = {
      tenantId: auth.tenantId,
      clientId: client.clientId,
      clientName: client.clientName,
      reference,
      title,
      channel: normalizeChannel(body.channel),
      status,
      version: 1,
      requesterName,
      requesterEmail,
      requesterPhone,
      receivedAt: Number.isFinite(receivedAtDate.getTime())
        ? Timestamp.fromDate(receivedAtDate)
        : FieldValue.serverTimestamp(),
      periodStart: optionalText(body.periodStart),
      periodEnd: optionalText(body.periodEnd),
      lines: linesResult.lines,
      lineCount: summary.lineCount,
      totalRequestedVacations: summary.totalRequestedVacations,
      sitesCount: summary.sitesCount,
      generatedVacationIds: [],
      versions: [versionEntry],
      notes: optionalText(body.notes),
      search,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: auth.uid,
      updatedBy: auth.uid,
    };

    const ref = await adminDb.collection("clientOrders").add(payload);
    const created = await ref.get();

    await logActivity({
      tenantId: auth.tenantId,
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      actorRole: auth.role ?? null,
      action: "client_order.created",
      entityType: "system",
      entityId: ref.id,
      message: "Bon de commande cree : " + title,
      meta: {
        clientOrderId: ref.id,
        reference,
        clientId: client.clientId,
        lineCount: summary.lineCount,
        totalRequestedVacations: summary.totalRequestedVacations,
      },
      severity: "info",
    });

    return json(201, {
      ok: true,
      tenantId: auth.tenantId,
      id: ref.id,
      item: pickOrder(created.data() as Record<string, unknown>, ref.id),
    });
  } catch (error) {
    return serverError(error, "client-orders.POST");
  }
}
