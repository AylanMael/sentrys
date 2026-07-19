import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import {
  canReadBackoffice,
  canWrite,
  requireTenantUser,
} from "@/app/api/_utils/withTenant";
import {
  normalizeText,
  parseDateTimeIso,
  parseMax,
} from "@/app/api/vacations/_shared";
import { adminDb } from "@/lib/firebase/admin";
import { logActivity } from "@/lib/activity/logger";

export const runtime = "nodejs";

type ValidationVerdict = "ok" | "warning" | "blocking";
type ValidationAction =
  | "review"
  | "publish"
  | "forced_publish"
  | "agent_dispatch_open"
  | "site_dispatch_open";

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function bad(message: string) {
  return json(400, { ok: false, error: message });
}

function clampNumber(value: unknown, min: number, max: number, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeVerdict(value: unknown): ValidationVerdict {
  const text = normalizeText(value).toLowerCase();
  if (text === "ok" || text === "warning" || text === "blocking") {
    return text;
  }
  return "blocking";
}

function normalizeAction(value: unknown): ValidationAction {
  const text = normalizeText(value).toLowerCase();
  if (
    text === "review" ||
    text === "publish" ||
    text === "forced_publish" ||
    text === "agent_dispatch_open" ||
    text === "site_dispatch_open"
  ) {
    return text;
  }
  return "review";
}

function normalizeMetricBag(value: unknown) {
  if (!value || typeof value !== "object") return {};

  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(source).map(([key, raw]) => [
      key,
      clampNumber(raw, 0, 100000, 0),
    ])
  );
}

function normalizeRisks(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((entry): entry is Record<string, unknown> => {
      return !!entry && typeof entry === "object";
    })
    .map((entry) => ({
      title: normalizeText(entry.title).slice(0, 120),
      description: normalizeText(entry.description).slice(0, 240),
      count: clampNumber(entry.count, 0, 100000, 0),
      tone: normalizeVerdict(entry.tone),
    }))
    .filter((entry) => entry.title)
    .slice(0, 12);
}

function pickValidation(data: Record<string, unknown>, id: string) {
  return {
    id,
    fromIso: normalizeText(data.fromIso),
    toIso: normalizeText(data.toIso),
    action: normalizeAction(data.action),
    verdict: normalizeVerdict(data.verdict),
    score: clampNumber(data.score, 0, 100, 0),
    coverage: clampNumber(data.coverage, 0, 100, 0),
    vacationCount: clampNumber(data.vacationCount, 0, 100000, 0),
    agentCount: clampNumber(data.agentCount, 0, 100000, 0),
    siteCount: clampNumber(data.siteCount, 0, 100000, 0),
    draftCount: clampNumber(data.draftCount, 0, 100000, 0),
    metrics: normalizeMetricBag(data.metrics),
    risks: normalizeRisks(data.risks),
    createdAtIso: normalizeText(data.createdAtIso),
    actorUid: normalizeText(data.actorUid),
    actorEmail: normalizeText(data.actorEmail),
    actorName: normalizeText(data.actorName),
    actorRole: normalizeText(data.actorRole),
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;
  if (!canReadBackoffice(auth.role)) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  const url = new URL(req.url);
  const fromIso = normalizeText(url.searchParams.get("from"));
  const toIso = normalizeText(url.searchParams.get("to"));
  const max = parseMax(url.searchParams.get("max"), 40);

  const from = fromIso ? parseDateTimeIso(fromIso) : null;
  const to = toIso ? parseDateTimeIso(toIso) : null;
  if (fromIso && !from) return bad("from must be an ISO date");
  if (toIso && !to) return bad("to must be an ISO date");

  const snap = await adminDb
    .collection("planningValidations")
    .where("tenantId", "==", auth.tenantId)
    .limit(250)
    .get();

  let validations = snap.docs.map((doc) =>
    pickValidation(doc.data() as Record<string, unknown>, doc.id)
  );

  if (from && to) {
    validations = validations.filter(
      (entry) =>
        entry.fromIso === from.toISOString() && entry.toIso === to.toISOString()
    );
  }

  validations.sort((left, right) => {
    const l = left.createdAtIso ? new Date(left.createdAtIso).getTime() : 0;
    const r = right.createdAtIso ? new Date(right.createdAtIso).getTime() : 0;
    return r - l;
  });

  return json(200, {
    ok: true,
    validations: validations.slice(0, max),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }

  const from = parseDateTimeIso(body.from);
  const to = parseDateTimeIso(body.to);
  if (!from || !to) return bad("from/to are required (ISO date)");
  if (to.getTime() <= from.getTime()) return bad("to must be after from");

  const action = normalizeAction(body.action);
  const verdict = normalizeVerdict(body.verdict);
  const score = clampNumber(body.score, 0, 100, 0);
  const coverage = clampNumber(body.coverage, 0, 100, 0);
  const createdAtIso = new Date().toISOString();
  const payload = {
    tenantId: auth.tenantId,
    fromIso: from.toISOString(),
    toIso: to.toISOString(),
    action,
    verdict,
    score,
    coverage,
    vacationCount: clampNumber(body.vacationCount, 0, 100000, 0),
    agentCount: clampNumber(body.agentCount, 0, 100000, 0),
    siteCount: clampNumber(body.siteCount, 0, 100000, 0),
    draftCount: clampNumber(body.draftCount, 0, 100000, 0),
    metrics: normalizeMetricBag(body.metrics),
    risks: normalizeRisks(body.risks),
    actorUid: auth.uid,
    actorEmail: auth.email ?? null,
    actorName: auth.name ?? null,
    actorRole: auth.role ?? null,
    createdAtIso,
    createdAt: FieldValue.serverTimestamp(),
  };

  const ref = adminDb.collection("planningValidations").doc();
  await ref.set(payload);

  await logActivity({
    tenantId: auth.tenantId,
    actorUid: auth.uid,
    actorEmail: auth.email ?? null,
    actorRole: auth.role ?? null,
    action: "planning.validation_recorded",
    entityType: "assignment",
    entityId: `${payload.fromIso}_${payload.toIso}`,
    message: `Contrôle planning journalise (${verdict}, score ${score})`,
    severity: verdict === "blocking" ? "warning" : "info",
    meta: {
      action,
      verdict,
      score,
      coverage,
      fromIso: payload.fromIso,
      toIso: payload.toIso,
      vacationCount: payload.vacationCount,
      agentCount: payload.agentCount,
      siteCount: payload.siteCount,
      draftCount: payload.draftCount,
    },
  });

  return json(201, {
    ok: true,
    validation: pickValidation(payload, ref.id),
  });
}
