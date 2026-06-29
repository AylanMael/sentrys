import { NextRequest, NextResponse } from "next/server";

import {
  canReadBackoffice,
  isAgent,
  requireTenantUser,
} from "@/app/api/_utils/withTenant";
import { adminDb } from "@/lib/firebase/admin";
import {
  profileFromTenant,
  type AgencyDocumentProfile,
} from "@/lib/agency/profile";
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
  agencyProfile: AgencyDocumentProfile;
};

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function pickDispatch(
  data: Record<string, unknown>,
  id: string,
  fallbackProfile: AgencyDocumentProfile
): AgentDispatchRow {
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
          .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
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
    agencyProfile: profileFromTenant({
      name: fallbackProfile.displayName,
      agencyProfile: data.agencyProfile ?? fallbackProfile,
    }),
  };
}

async function getAgencyProfile(tenantId: string) {
  const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
  const tenant = tenantSnap.exists
    ? (tenantSnap.data() as Record<string, unknown>)
    : null;
  return profileFromTenant(tenant);
}

export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  const canInspect = canReadBackoffice(auth.role);
  const isFieldAgent = isAgent(auth.role);
  if (!canInspect && !isFieldAgent) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  const url = new URL(req.url);
  const requestedAgentId = normalizeText(url.searchParams.get("agentId"));

  let targetAgentIds: string[] = [];

  if (canInspect && requestedAgentId) {
    targetAgentIds = [requestedAgentId];
  } else {
    const authEmail = normalizeText(auth.email)?.toLowerCase() ?? null;
    const agentsSnap = await adminDb
      .collection("agents")
      .where("tenantId", "==", auth.tenantId)
      .limit(500)
      .get();

    targetAgentIds = agentsSnap.docs
      .filter((doc) => {
        const data = doc.data() as Record<string, unknown>;
        const email = normalizeText(data.email)?.toLowerCase() ?? null;
        return doc.id === auth.uid || (authEmail !== null && email === authEmail);
      })
      .map((doc) => doc.id);
  }

  if (targetAgentIds.length === 0) {
    return json(200, { ok: true, dispatches: [], agentIds: [] });
  }

  const dispatchesSnap = await adminDb
    .collection("planningDispatches")
    .where("tenantId", "==", auth.tenantId)
    .limit(400)
    .get();
  const agencyProfile = await getAgencyProfile(auth.tenantId);

  const dispatches = dispatchesSnap.docs
    .map((doc) =>
      pickDispatch(doc.data() as Record<string, unknown>, doc.id, agencyProfile)
    )
    .filter(
      (dispatch) =>
        dispatch.channel === "portal" &&
        targetAgentIds.includes(dispatch.agentId)
    )
    .sort((left, right) => {
      const l = left.sentAtIso ? new Date(left.sentAtIso).getTime() : 0;
      const r = right.sentAtIso ? new Date(right.sentAtIso).getTime() : 0;
      return r - l;
    });

  return json(200, {
    ok: true,
    agentIds: targetAgentIds,
    dispatches,
  });
}
