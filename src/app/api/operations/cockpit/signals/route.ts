import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import {
  canReadBackoffice,
  canWrite,
  requireTenantUser,
} from "@/app/api/_utils/withTenant";
import { normalizeText } from "@/app/api/vacations/_shared";
import { logActivity } from "@/lib/activity/logger";
import { adminDb } from "@/lib/firebase/admin";
import {
  normalizeOperationSignalStatus,
  operationSignalStateDocId,
  operationSignalStatusLabel,
  pickOperationSignalState,
  type OperationSignalStatus,
} from "@/lib/operations/cockpit-signals";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function bad(message: string) {
  return json(400, { ok: false, error: message });
}

function text(value: unknown, max = 240) {
  return normalizeText(value)?.slice(0, max) ?? "";
}

function isValidStatus(value: unknown): value is OperationSignalStatus {
  const status = String(value ?? "").trim().toLowerCase();
  return (
    status === "new" ||
    status === "seen" ||
    status === "in_progress" ||
    status === "done"
  );
}

function uniqueManualSignalId() {
  return `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseLimit(value: string | null, fallback = 100) {
  const limit = Number(value ?? "");
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.min(Math.floor(limit), 500);
}

function parseDate(value: string | null) {
  const raw = normalizeText(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}

export async function POST(req: NextRequest) {
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

  const titleSnapshot = text(body.title, 200);
  const detailSnapshot = text(body.detail, 800);
  if (!titleSnapshot) return bad("title is required");
  if (!detailSnapshot) return bad("detail is required");
  if (body.status !== undefined && !isValidStatus(body.status)) {
    return bad("Invalid status");
  }

  const signalId = uniqueManualSignalId();
  const status = normalizeOperationSignalStatus(body.status ?? "seen");
  const nowIso = new Date().toISOString();
  const note = text(body.note, 600) || null;
  const kind = "manual";
  const event = {
    status,
    previousStatus: "new" as OperationSignalStatus,
    atIso: nowIso,
    actorUid: auth.uid,
    actorEmail: auth.email ?? null,
    actorName: auth.name ?? null,
    actorRole: auth.role ?? null,
    note,
  };
  const ref = adminDb
    .collection("operationSignalStates")
    .doc(operationSignalStateDocId(auth.tenantId, signalId));

  await ref.set({
    tenantId: auth.tenantId,
    signalId,
    status,
    note,
    titleSnapshot,
    detailSnapshot,
    href: null,
    kind,
    events: [event],
    createdAt: FieldValue.serverTimestamp(),
    createdAtIso: nowIso,
    updatedAt: FieldValue.serverTimestamp(),
    updatedAtIso: nowIso,
    updatedByUid: auth.uid,
    updatedByEmail: auth.email ?? null,
    updatedByName: auth.name ?? null,
    updatedByRole: auth.role ?? null,
  });

  await logActivity({
    tenantId: auth.tenantId,
    actorUid: auth.uid,
    actorEmail: auth.email ?? null,
    actorRole: auth.role ?? null,
    action: "operations.manual_log_created",
    entityType: "system",
    entityId: signalId,
    message: `Main courante creee: ${titleSnapshot}`,
    severity: status === "done" ? "info" : "warning",
    meta: {
      signalId,
      status,
      titleSnapshot,
      detailSnapshot,
      kind,
      note,
    },
  });

  const nextSnap = await ref.get();
  return json(201, {
    ok: true,
    state: pickOperationSignalState(
      nextSnap.data() as Record<string, unknown>,
      nextSnap.id
    ),
  });
}

export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;
  if (!canReadBackoffice(auth.role)) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  const url = new URL(req.url);
  const statusParam = normalizeText(url.searchParams.get("status"));
  const status = statusParam && isValidStatus(statusParam) ? statusParam : "";
  const q = normalizeText(url.searchParams.get("q"))?.toLowerCase() ?? "";
  const actor = normalizeText(url.searchParams.get("actor"))?.toLowerCase() ?? "";
  const from = parseDate(url.searchParams.get("from"));
  const to = parseDate(url.searchParams.get("to"));
  const limit = parseLimit(url.searchParams.get("limit"));

  const snap = await adminDb
    .collection("operationSignalStates")
    .where("tenantId", "==", auth.tenantId)
    .limit(1000)
    .get();

  let states = snap.docs.map((doc) =>
    pickOperationSignalState(doc.data() as Record<string, unknown>, doc.id)
  );

  if (status) {
    states = states.filter((state) => state.status === status);
  }

  if (from) {
    states = states.filter((state) => {
      const updated = state.updatedAtIso ? new Date(state.updatedAtIso) : null;
      return updated && updated.getTime() >= from.getTime();
    });
  }

  if (to) {
    states = states.filter((state) => {
      const updated = state.updatedAtIso ? new Date(state.updatedAtIso) : null;
      return updated && updated.getTime() <= to.getTime();
    });
  }

  if (actor) {
    states = states.filter((state) => {
      return (
        state.updatedByName?.toLowerCase().includes(actor) ||
        state.updatedByEmail?.toLowerCase().includes(actor) ||
        state.updatedByRole?.toLowerCase().includes(actor)
      );
    });
  }

  if (q) {
    states = states.filter((state) => {
      const haystack = [
        state.signalId,
        state.titleSnapshot,
        state.detailSnapshot,
        state.kind,
        state.href,
        state.updatedByName,
        state.updatedByEmail,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  states.sort((left, right) => {
    const leftTime = left.updatedAtIso
      ? new Date(left.updatedAtIso).getTime()
      : 0;
    const rightTime = right.updatedAtIso
      ? new Date(right.updatedAtIso).getTime()
      : 0;
    return rightTime - leftTime;
  });

  const summary = states.reduce(
    (acc, state) => {
      acc.total += 1;
      acc[state.status] += 1;
      return acc;
    },
    {
      total: 0,
      new: 0,
      seen: 0,
      in_progress: 0,
      done: 0,
    } as Record<OperationSignalStatus | "total", number>
  );

  return json(200, {
    ok: true,
    states: states.slice(0, limit),
    summary,
    filters: {
      status: status || null,
      q: q || null,
      actor: actor || null,
      fromIso: from?.toISOString() ?? null,
      toIso: to?.toISOString() ?? null,
      limit,
    },
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

  const signalId = text(body.signalId, 200);
  if (!signalId) return bad("signalId is required");
  if (!isValidStatus(body.status)) return bad("Invalid status");

  const status = normalizeOperationSignalStatus(body.status);
  const ref = adminDb
    .collection("operationSignalStates")
    .doc(operationSignalStateDocId(auth.tenantId, signalId));
  const snap = await ref.get();
  const previousStatus = snap.exists
    ? normalizeOperationSignalStatus(snap.data()?.status)
    : "new";

  const nowIso = new Date().toISOString();
  const note = text(body.note, 600) || null;
  const titleSnapshot = text(body.title, 200) || null;
  const detailSnapshot = text(body.detail, 800) || null;
  const href = text(body.href, 300) || null;
  const kind = text(body.kind, 60) || null;
  const event = {
    status,
    previousStatus,
    atIso: nowIso,
    actorUid: auth.uid,
    actorEmail: auth.email ?? null,
    actorName: auth.name ?? null,
    actorRole: auth.role ?? null,
    note,
  };

  const payload: Record<string, unknown> = {
    tenantId: auth.tenantId,
    signalId,
    status,
    note,
    titleSnapshot,
    detailSnapshot,
    href,
    kind,
    events: FieldValue.arrayUnion(event),
    updatedAt: FieldValue.serverTimestamp(),
    updatedAtIso: nowIso,
    updatedByUid: auth.uid,
    updatedByEmail: auth.email ?? null,
    updatedByName: auth.name ?? null,
    updatedByRole: auth.role ?? null,
  };

  if (!snap.exists) {
    payload.createdAt = FieldValue.serverTimestamp();
    payload.createdAtIso = nowIso;
  }

  await ref.set(payload, { merge: true });

  const isObservationOnly = snap.exists && previousStatus === status && !!note;

  await logActivity({
    tenantId: auth.tenantId,
    actorUid: auth.uid,
    actorEmail: auth.email ?? null,
    actorRole: auth.role ?? null,
    action: isObservationOnly
      ? "operations.signal_observation_added"
      : "operations.signal_status_updated",
    entityType: "system",
    entityId: signalId,
    message: isObservationOnly
      ? `Observation ajoutee au signal cockpit: ${titleSnapshot || signalId}`
      : `Signal cockpit marque ${operationSignalStatusLabel(status).toLowerCase()}`,
    severity: isObservationOnly || status === "done" ? "info" : "warning",
    meta: {
      signalId,
      previousStatus,
      status,
      titleSnapshot,
      detailSnapshot,
      href,
      kind,
      note,
    },
  });

  const nextSnap = await ref.get();
  return json(snap.exists ? 200 : 201, {
    ok: true,
    state: pickOperationSignalState(
      nextSnap.data() as Record<string, unknown>,
      nextSnap.id
    ),
  });
}
