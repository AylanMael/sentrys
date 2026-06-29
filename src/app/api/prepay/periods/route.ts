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
} from "@/app/api/vacations/_shared";
import { logActivity } from "@/lib/activity/logger";
import { adminDb } from "@/lib/firebase/admin";
import {
  emptyPrepayPeriod,
  nextPrepayPeriodStatus,
  normalizePrepayPeriodAction,
  normalizePrepayPeriodStatus,
  normalizePrepaySummarySnapshot,
  pickPrepayPeriod,
  prepayPeriodDocId,
  type PrepayPeriodAction,
} from "@/lib/payroll/workflow";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function bad(message: string) {
  return json(400, { ok: false, error: message });
}

function actionMessage(action: PrepayPeriodAction) {
  if (action === "check") return "Pre-paie controlee";
  if (action === "validate") return "Pre-paie validee";
  if (action === "lock") return "Pre-paie verrouillee";
  if (action === "mark_exported") return "Pre-paie marquee exportee";
  return "Pre-paie rouverte";
}

function periodRef(tenantId: string, fromIso: string, toIso: string) {
  const id = prepayPeriodDocId(tenantId, fromIso, toIso);
  return adminDb.collection("prepayPeriods").doc(id);
}

export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;
  if (!canReadBackoffice(auth.role)) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  const url = new URL(req.url);
  const from = parseDateTimeIso(url.searchParams.get("from"));
  const to = parseDateTimeIso(url.searchParams.get("to"));

  if (!from || !to) return bad("from/to are required (ISO date)");
  if (to.getTime() <= from.getTime()) return bad("to must be after from");

  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const ref = periodRef(auth.tenantId, fromIso, toIso);
  const snap = await ref.get();

  if (!snap.exists) {
    return json(200, {
      ok: true,
      period: emptyPrepayPeriod({
        id: ref.id,
        tenantId: auth.tenantId,
        fromIso,
        toIso,
      }),
    });
  }

  const data = snap.data() as Record<string, unknown>;
  if (data.tenantId !== auth.tenantId) {
    return json(404, { ok: false, error: "Not found" });
  }

  return json(200, {
    ok: true,
    period: pickPrepayPeriod(data, snap.id),
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("Invalid JSON");
  }

  const from = parseDateTimeIso(body.from);
  const to = parseDateTimeIso(body.to);
  if (!from || !to) return bad("from/to are required (ISO date)");
  if (to.getTime() <= from.getTime()) return bad("to must be after from");

  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const ref = periodRef(auth.tenantId, fromIso, toIso);
  const snap = await ref.get();
  const currentStatus = snap.exists
    ? normalizePrepayPeriodStatus(snap.data()?.status)
    : "draft";
  const action = normalizePrepayPeriodAction(body.action);
  const transition = nextPrepayPeriodStatus(currentStatus, action);
  if (!transition.ok) return bad(transition.error);

  const nowIso = new Date().toISOString();
  const summarySnapshot = normalizePrepaySummarySnapshot(body.summary);
  const note = normalizeText(body.note)?.slice(0, 240) ?? null;
  const event = {
    action,
    status: transition.status,
    atIso: nowIso,
    actorUid: auth.uid,
    actorEmail: auth.email ?? null,
    actorName: auth.name ?? null,
    actorRole: auth.role ?? null,
    note,
    summarySnapshot,
  };

  const payload: Record<string, unknown> = {
    tenantId: auth.tenantId,
    fromIso,
    toIso,
    status: transition.status,
    summarySnapshot,
    events: FieldValue.arrayUnion(event),
    updatedAt: FieldValue.serverTimestamp(),
    updatedAtIso: nowIso,
    updatedByUid: auth.uid,
    updatedByEmail: auth.email ?? null,
    updatedByRole: auth.role ?? null,
  };

  if (!snap.exists) {
    payload.createdAt = FieldValue.serverTimestamp();
    payload.createdAtIso = nowIso;
  }

  if (transition.status === "exported") {
    payload.exportedAt = FieldValue.serverTimestamp();
    payload.exportedAtIso = nowIso;
  }

  await ref.set(payload, { merge: true });

  await logActivity({
    tenantId: auth.tenantId,
    actorUid: auth.uid,
    actorEmail: auth.email ?? null,
    actorRole: auth.role ?? null,
    action: `prepay.period_${action}`,
    entityType: "billing",
    entityId: ref.id,
    message: `${actionMessage(action)} (${fromIso.slice(0, 10)} - ${toIso.slice(0, 10)})`,
    severity: action === "reopen" ? "warning" : "info",
    meta: {
      fromIso,
      toIso,
      status: transition.status,
      previousStatus: currentStatus,
      summarySnapshot,
      note,
    },
  });

  const nextSnap = await ref.get();
  const period = pickPrepayPeriod(
    nextSnap.data() as Record<string, unknown>,
    nextSnap.id
  );

  return json(snap.exists ? 200 : 201, {
    ok: true,
    period,
  });
}
