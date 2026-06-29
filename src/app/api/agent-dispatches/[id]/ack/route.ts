import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import {
  canReadBackoffice,
  isAgent,
  requireTenantUser,
} from "@/app/api/_utils/withTenant";
import { logActivity } from "@/lib/activity/logger";
import { adminDb } from "@/lib/firebase/admin";
import {
  getDispatchDeliveryMode,
  getDispatchDeliveryStatus,
  normalizeDispatchChannel,
  type DispatchChannel,
  type DispatchDeliveryMode,
  type DispatchDeliveryStatus,
} from "@/lib/planning/dispatch";
import { normalizeText, safeArr, toIso } from "@/app/api/vacations/_shared";

export const runtime = "nodejs";

type DispatchVacationSummary = {
  id: string;
  siteName: string | null;
  title: string | null;
  missionType: string | null;
  startAtIso: string | null;
  endAtIso: string | null;
};

type AgentDispatchRow = {
  id: string;
  agentId: string;
  agentName: string;
  agentEmail: string | null;
  agentPhone: string | null;
  fromIso: string;
  toIso: string;
  vacationIds: string[];
  vacationCount: number;
  siteNames: string[];
  vacations: DispatchVacationSummary[];
  channel: DispatchChannel;
  deliveryMode: DispatchDeliveryMode;
  deliveryStatus: DispatchDeliveryStatus;
  deliveryTarget: string | null;
  deliveryNote: string | null;
  sentAtIso: string | null;
  sentBy: string;
  viewedAtIso: string | null;
  lastViewedAtIso: string | null;
  viewedCount: number;
  printedAtIso: string | null;
  lastPrintedAtIso: string | null;
  printedCount: number;
  acknowledgedAtIso: string | null;
  acknowledgedByUid: string | null;
  acknowledgedByName: string | null;
  acknowledgedByEmail: string | null;
};

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function pickDispatch(data: Record<string, unknown>, id: string): AgentDispatchRow {
  const channel = normalizeDispatchChannel(data.channel);

  return {
    id,
    agentId: String(data.agentId ?? ""),
    agentName: String(data.agentName ?? "Agent"),
    agentEmail: normalizeText(data.agentEmail),
    agentPhone: normalizeText(data.agentPhone),
    fromIso: String(data.fromIso ?? ""),
    toIso: String(data.toIso ?? ""),
    vacationIds: safeArr(data.vacationIds),
    vacationCount: Number(data.vacationCount ?? 0),
    siteNames: safeArr(data.siteNames),
    vacations: Array.isArray(data.vacations)
      ? data.vacations
          .filter(
            (value): value is Record<string, unknown> =>
              Boolean(value) && typeof value === "object"
          )
          .map((vacation) => ({
            id: String(vacation.id ?? ""),
            siteName: normalizeText(vacation.siteName),
            title: normalizeText(vacation.title),
            missionType: normalizeText(vacation.missionType),
            startAtIso: normalizeText(vacation.startAtIso),
            endAtIso: normalizeText(vacation.endAtIso),
          }))
      : [],
    channel,
    deliveryMode:
      data.deliveryMode === "simulation" ||
      data.deliveryMode === "portal" ||
      data.deliveryMode === "log"
        ? data.deliveryMode
        : getDispatchDeliveryMode(channel),
    deliveryStatus:
      data.deliveryStatus === "portal_published" ||
      data.deliveryStatus === "simulated" ||
      data.deliveryStatus === "logged" ||
      data.deliveryStatus === "blocked"
        ? data.deliveryStatus
        : getDispatchDeliveryStatus(channel),
    deliveryTarget: normalizeText(data.deliveryTarget),
    deliveryNote: normalizeText(data.deliveryNote),
    sentAtIso: toIso(data.sentAt),
    sentBy: String(data.sentBy ?? ""),
    viewedAtIso: toIso(data.viewedAt),
    lastViewedAtIso: toIso(data.lastViewedAt),
    viewedCount: Number(data.viewedCount ?? 0),
    printedAtIso: toIso(data.printedAt),
    lastPrintedAtIso: toIso(data.lastPrintedAt),
    printedCount: Number(data.printedCount ?? 0),
    acknowledgedAtIso: toIso(data.acknowledgedAt),
    acknowledgedByUid: normalizeText(data.acknowledgedByUid),
    acknowledgedByName: normalizeText(data.acknowledgedByName),
    acknowledgedByEmail: normalizeText(data.acknowledgedByEmail),
  };
}

async function resolveAllowedAgentIds(tenantId: string, uid: string, email: string | null) {
  const authEmail = normalizeText(email)?.toLowerCase() ?? null;
  const agentsSnap = await adminDb
    .collection("agents")
    .where("tenantId", "==", tenantId)
    .limit(500)
    .get();

  return agentsSnap.docs
    .filter((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const agentEmail = normalizeText(data.email)?.toLowerCase() ?? null;
      return doc.id === uid || (authEmail !== null && agentEmail === authEmail);
    })
    .map((doc) => doc.id);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  const canInspect = canReadBackoffice(auth.role);
  const isFieldAgent = isAgent(auth.role);
  if (!canInspect && !isFieldAgent) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  const { id } = await params;
  const dispatchId = normalizeText(id);
  if (!dispatchId) {
    return json(400, { ok: false, error: "Missing dispatch id" });
  }

  const ref = adminDb.collection("planningDispatches").doc(dispatchId);
  const snap = await ref.get();
  if (!snap.exists) {
    return json(404, { ok: false, error: "Dispatch not found" });
  }

  const data = snap.data() as Record<string, unknown>;
  if (normalizeText(data.tenantId) !== auth.tenantId) {
    return json(404, { ok: false, error: "Dispatch not found" });
  }

  if (data.channel !== "portal") {
    return json(400, {
      ok: false,
      error: "Only portal dispatches can be acknowledged",
    });
  }

  if (!canInspect) {
    const allowedAgentIds = await resolveAllowedAgentIds(
      auth.tenantId,
      auth.uid,
      auth.email
    );

    if (!allowedAgentIds.includes(String(data.agentId ?? ""))) {
      return json(403, { ok: false, error: "Forbidden" });
    }
  }

  if (toIso(data.acknowledgedAt)) {
    return json(200, {
      ok: true,
      dispatch: pickDispatch(data, snap.id),
    });
  }

  const acknowledgedByName =
    auth.name ??
    normalizeText(data.agentName) ??
    normalizeText(auth.email) ??
    "Agent";
  const acknowledgedByEmail = normalizeText(auth.email);

  await ref.set(
    {
      acknowledgedAt: FieldValue.serverTimestamp(),
      acknowledgedByUid: auth.uid,
      acknowledgedByName,
      acknowledgedByEmail,
    },
    { merge: true }
  );

  await logActivity({
    tenantId: auth.tenantId,
    actorUid: auth.uid,
    actorEmail: auth.email ?? null,
    actorRole: auth.role ?? null,
    action: "planning.acknowledged",
    entityType: "assignment",
    entityId: dispatchId,
    message: `Planning confirme par ${acknowledgedByName}`,
    severity: "info",
    meta: {
      dispatchId,
      agentId: normalizeText(data.agentId),
      channel: "portal",
      fromIso: normalizeText(data.fromIso),
      toIso: normalizeText(data.toIso),
    },
  });

  const updated = await ref.get();

  return json(200, {
    ok: true,
    dispatch: pickDispatch(
      updated.data() as Record<string, unknown>,
      updated.id
    ),
  });
}
