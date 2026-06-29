import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { requireTenantUser, canReadBackoffice, canWrite } from "@/app/api/_utils/withTenant";
import { adminDb } from "@/lib/firebase/admin";
import { logActivity } from "@/lib/activity/logger";
import {
  profileFromTenant,
  type AgencyDocumentProfile,
} from "@/lib/agency/profile";
import {
  computeAgentCompliance,
  type AgentComplianceInput,
} from "@/lib/agents/compliance";
import {
  dispatchChannelNeedsEmail,
  dispatchChannelNeedsPhone,
  getDispatchDeliveryMode,
  getDispatchDeliveryStatus,
  normalizeDispatchChannel,
  type DispatchChannel,
  type DispatchDeliveryMode,
  type DispatchDeliveryStatus,
} from "@/lib/planning/dispatch";
import {
  chunk,
  normalizeText,
  parseDateTimeIso,
  safeArr,
  toIso,
} from "@/app/api/vacations/_shared";

export const runtime = "nodejs";

type DispatchVacation = {
  id: string;
  siteName: string | null;
  title: string | null;
  missionType: string | null;
  startAtIso: string | null;
  endAtIso: string | null;
  requiredQualification: string | null;
  assignedAgentIds: string[];
};

type DispatchVacationSummary = {
  id: string;
  siteName: string | null;
  title: string | null;
  missionType: string | null;
  startAtIso: string | null;
  endAtIso: string | null;
};

type DispatchRow = {
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
  complianceOverride: boolean;
  complianceOverrideReason: string | null;
  complianceOverrideDetail: string | null;
};

type BlockedRowReason = {
  reason: string;
  detail: string | null;
};

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function bad(message: string) {
  return json(400, { ok: false, error: message });
}

function agentName(agent: Record<string, unknown> | undefined, fallback: string) {
  if (!agent) return fallback;

  const firstName = normalizeText(agent.firstName);
  const lastName = normalizeText(agent.lastName);
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

  return fullName || normalizeText(agent.email) || normalizeText(agent.phone) || fallback;
}

function isPublishedAndFresh(vacation: Record<string, unknown>) {
  if (vacation.isPublished !== true) return false;

  const publishedAtIso = toIso(vacation.publishedAt);
  const updatedAtIso = toIso(vacation.updatedAt);
  if (!publishedAtIso || !updatedAtIso) return true;

  const publishedAt = new Date(publishedAtIso).getTime();
  const updatedAt = new Date(updatedAtIso).getTime();

  return (
    !Number.isFinite(publishedAt) ||
    !Number.isFinite(updatedAt) ||
    updatedAt <= publishedAt + 1000
  );
}

function firstBlockingCompliance(
  agent: Record<string, unknown> | undefined,
  vacations: DispatchVacation[]
): BlockedRowReason | null {
  if (!agent) {
    return {
      reason: "agent_not_found",
      detail: "Agent introuvable dans le dossier.",
    };
  }

  for (const vacation of vacations) {
    const compliance = computeAgentCompliance(agent as AgentComplianceInput, {
      requiredQualification: vacation.requiredQualification,
    });
    const firstBlockingAlert = compliance.blockingAlerts[0];

    if (firstBlockingAlert) {
      return {
        reason: "compliance_blocking",
        detail: `${firstBlockingAlert.title}: ${firstBlockingAlert.detail}`,
      };
    }
  }

  return null;
}

function blockedPayload(
  rows: DispatchRow[],
  reasons: Map<string, BlockedRowReason>
) {
  return rows.map((row) => {
    const reason = reasons.get(row.agentId);

    return {
      agentId: row.agentId,
      agentName: row.agentName,
      reason: reason?.reason ?? "blocked",
      detail: reason?.detail ?? null,
    };
  });
}

function pickDispatch(
  data: Record<string, unknown>,
  id: string,
  fallbackProfile: AgencyDocumentProfile
): DispatchRow & { id: string } {
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
    complianceOverride: data.complianceOverride === true,
    complianceOverrideReason: normalizeText(data.complianceOverrideReason),
    complianceOverrideDetail: normalizeText(data.complianceOverrideDetail),
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
  if (!canReadBackoffice(auth.role)) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  const url = new URL(req.url);
  const fromIso = normalizeText(url.searchParams.get("from"));
  const toIsoParam = normalizeText(url.searchParams.get("to"));
  const from = fromIso ? parseDateTimeIso(fromIso) : null;
  const to = toIsoParam ? parseDateTimeIso(toIsoParam) : null;

  if (fromIso && !from) return bad("from must be an ISO date");
  if (toIsoParam && !to) return bad("to must be an ISO date");

  const snap = await adminDb
    .collection("planningDispatches")
    .where("tenantId", "==", auth.tenantId)
    .limit(250)
    .get();
  const agencyProfile = await getAgencyProfile(auth.tenantId);

  let dispatches = snap.docs.map((doc) =>
    pickDispatch(doc.data() as Record<string, unknown>, doc.id, agencyProfile)
  );

  if (from && to) {
    dispatches = dispatches.filter(
      (dispatch) => dispatch.fromIso === from.toISOString() && dispatch.toIso === to.toISOString()
    );
  }

  dispatches.sort((left, right) => {
    const l = left.sentAtIso ? new Date(left.sentAtIso).getTime() : 0;
    const r = right.sentAtIso ? new Date(right.sentAtIso).getTime() : 0;
    return r - l;
  });

  return json(200, {
    ok: true,
    dispatches: dispatches.slice(0, 80),
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

  const requestedAgentIds = new Set(safeArr(body.agentIds));
  const requestedVacationIds = new Set(safeArr(body.vacationIds));
  const channel = normalizeDispatchChannel(body.channel);
  const forceComplianceOverride = body.forceComplianceOverride === true;
  const forceComplianceReason = normalizeText(body.forceComplianceReason);
  if (requestedAgentIds.size === 0) return bad("agentIds are required");
  if (forceComplianceOverride && forceComplianceReason.length < 8) {
    return bad("forceComplianceReason is required to force compliance");
  }

  const vacationsSnap = await adminDb
    .collection("vacations")
    .where("tenantId", "==", auth.tenantId)
    .limit(1500)
    .get();

  const vacations: DispatchVacation[] = vacationsSnap.docs.flatMap((doc) => {
    const data = doc.data() as Record<string, unknown>;
    if (requestedVacationIds.size > 0 && !requestedVacationIds.has(doc.id)) return [];
    if (!isPublishedAndFresh(data)) return [];
    if (data.status === "cancelled" || data.status === "closed") return [];

    const startAtIso = toIso(data.startAt);
    const endAtIso = toIso(data.endAt);
    if (!startAtIso || !endAtIso) return [];

    const startMs = new Date(startAtIso).getTime();
    const endMs = new Date(endAtIso).getTime();
    if (startMs >= to.getTime() || endMs <= from.getTime()) return [];

    const assignedAgentIds = safeArr(data.assignedAgentIds).filter((agentId) =>
      requestedAgentIds.has(agentId)
    );
    if (assignedAgentIds.length === 0) return [];

    return [
      {
        id: doc.id,
        siteName: normalizeText(data.siteName),
        title: normalizeText(data.title),
        missionType: normalizeText(data.missionType),
        startAtIso,
        endAtIso,
        requiredQualification: normalizeText(data.requiredQualification),
        assignedAgentIds,
      },
    ];
  });

  const agentIds = Array.from(
    new Set(vacations.flatMap((vacation) => vacation.assignedAgentIds))
  );

  if (agentIds.length === 0) {
    return json(200, {
      ok: true,
      created: 0,
      dispatches: [],
    });
  }

  const agentMap = new Map<string, Record<string, unknown>>();
  for (const part of chunk(agentIds, 200)) {
    const refs = part.map((agentId) => adminDb.collection("agents").doc(agentId));
    const snaps = await adminDb.getAll(...refs);
    snaps.forEach((snap, index) => {
      if (snap.exists) {
        agentMap.set(part[index], snap.data() as Record<string, unknown>);
      }
    });
  }

  const nowIso = new Date().toISOString();
  const agencyProfile = await getAgencyProfile(auth.tenantId);
  const rows: DispatchRow[] = agentIds.map((agentId) => {
    const agentVacations = vacations.filter((vacation) =>
      vacation.assignedAgentIds.includes(agentId)
    );
    const agent = agentMap.get(agentId);
    const siteNames = Array.from(
      new Set(
        agentVacations
          .map((vacation) => vacation.siteName || vacation.title)
          .filter((value): value is string => Boolean(value))
      )
    ).slice(0, 12);
    const complianceBlock = firstBlockingCompliance(agent, agentVacations);
    const complianceIsForced =
      complianceBlock?.reason === "compliance_blocking" &&
      forceComplianceOverride;

    return {
      agentId,
      agentName: agentName(agent, agentId),
      agentEmail: normalizeText(agent?.email),
      agentPhone: normalizeText(agent?.phone),
      fromIso: from.toISOString(),
      toIso: to.toISOString(),
      vacationIds: agentVacations.map((vacation) => vacation.id),
      vacationCount: agentVacations.length,
      siteNames,
      vacations: agentVacations.map((vacation) => ({
        id: vacation.id,
        siteName: vacation.siteName,
        title: vacation.title,
        missionType: vacation.missionType,
        startAtIso: vacation.startAtIso,
        endAtIso: vacation.endAtIso,
      })),
      channel,
      deliveryMode: getDispatchDeliveryMode(channel),
      deliveryStatus: getDispatchDeliveryStatus(channel),
      deliveryTarget:
        channel === "email"
          ? normalizeText(agent?.email)
          : channel === "whatsapp"
            ? normalizeText(agent?.phone)
            : channel === "portal"
              ? normalizeText(agent?.email) || normalizeText(agent?.phone)
              : null,
      deliveryNote:
        channel === "email"
          ? "Simulation email : aucun email reel n'a ete envoye."
          : channel === "whatsapp"
            ? "Simulation WhatsApp : aucun message reel n'a ete envoye."
            : channel === "portal"
              ? "Planning publie dans le portail agent."
              : "Diffusion journalisee en interne uniquement.",
      sentAtIso: nowIso,
      sentBy: auth.uid,
      viewedAtIso: null,
      lastViewedAtIso: null,
      viewedCount: 0,
      printedAtIso: null,
      lastPrintedAtIso: null,
      printedCount: 0,
      acknowledgedAtIso: null,
      acknowledgedByUid: null,
      acknowledgedByName: null,
      acknowledgedByEmail: null,
      agencyProfile,
      complianceOverride: complianceIsForced,
      complianceOverrideReason: complianceIsForced ? forceComplianceReason : null,
      complianceOverrideDetail: complianceBlock?.detail ?? null,
    };
  });

  const blockedRowReasons = new Map<string, BlockedRowReason>();

  rows.forEach((row) => {
    const agent = agentMap.get(row.agentId);
    const agentVacations = vacations.filter((vacation) =>
      vacation.assignedAgentIds.includes(row.agentId)
    );
    const contactReason = dispatchChannelNeedsEmail(channel)
      ? !row.agentEmail
        ? {
            reason: "missing_email",
            detail: "Email agent manquant pour ce canal.",
          }
        : null
      : dispatchChannelNeedsPhone(channel) && !row.agentPhone
        ? {
            reason: "missing_phone",
            detail: "Telephone agent manquant pour ce canal.",
          }
        : null;
    const complianceReason = firstBlockingCompliance(agent, agentVacations);

    if (contactReason) {
      blockedRowReasons.set(row.agentId, {
        reason: contactReason.reason,
        detail: complianceReason
          ? `${contactReason.detail} Blocage conformite constate: ${complianceReason.detail}`
          : contactReason.detail,
      });
      return;
    }

    if (
      complianceReason &&
      (complianceReason.reason !== "compliance_blocking" ||
        !forceComplianceOverride)
    ) {
      blockedRowReasons.set(row.agentId, complianceReason);
    }
  });
  const blockedRows = rows.filter((row) => blockedRowReasons.has(row.agentId));
  const dispatchableRows = rows.filter(
    (row) => !blockedRowReasons.has(row.agentId)
  );

  if (dispatchableRows.length === 0) {
    return json(200, {
      ok: true,
      created: 0,
      blocked: blockedPayload(blockedRows, blockedRowReasons),
      dispatches: [],
    });
  }

  const batch = adminDb.batch();
  const collectionRef = adminDb.collection("planningDispatches");
  const notificationsRef = adminDb.collection("notifications");
  const persistedRows: Array<DispatchRow & { id: string }> = [];

  dispatchableRows.forEach((row) => {
    const ref = collectionRef.doc();
    persistedRows.push({ ...row, id: ref.id });
    batch.set(ref, {
      tenantId: auth.tenantId,
      ...row,
      sentAt: FieldValue.serverTimestamp(),
      acknowledgedAt: null,
      createdAt: FieldValue.serverTimestamp(),
    });

    if (row.complianceOverride) {
      const notificationRef = notificationsRef.doc();
      batch.set(notificationRef, {
        tenantId: auth.tenantId,
        type: "compliance_override",
        severity: "warning",
        title: "Forcage conformite a regulariser",
        message: `${row.agentName} - ${row.complianceOverrideDetail ?? "dossier agent a verifier"}`,
        href: `/dashboard/conformite?agentId=${row.agentId}`,
        sourceId: ref.id,
        agentId: row.agentId,
        agentName: row.agentName,
        dispatchId: ref.id,
        createdByUid: auth.uid,
        createdByEmail: auth.email ?? null,
        readBy: {},
        readAtBy: {},
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  });

  await batch.commit();

  await logActivity({
    tenantId: auth.tenantId,
    actorUid: auth.uid,
    actorEmail: auth.email ?? null,
    actorRole: auth.role ?? null,
    action: "planning.dispatched",
    entityType: "assignment",
    entityId: `${from.toISOString()}_${to.toISOString()}`,
    message: `Planning diffuse a ${dispatchableRows.length} agent(s)`,
    severity: "info",
    meta: {
      fromIso: from.toISOString(),
      toIso: to.toISOString(),
      agentCount: dispatchableRows.length,
      blockedCount: blockedRows.length,
      complianceBlockedCount: blockedRows.filter(
        (row) => blockedRowReasons.get(row.agentId)?.reason === "compliance_blocking"
      ).length,
      complianceForcedCount: dispatchableRows.filter(
        (row) => row.complianceOverride
      ).length,
      complianceForceReason: forceComplianceOverride ? forceComplianceReason : null,
      vacationCount: vacations.length,
      channel,
      deliveryMode: getDispatchDeliveryMode(channel),
    },
  });

  return json(200, {
    ok: true,
    created: dispatchableRows.length,
    blocked: blockedPayload(blockedRows, blockedRowReasons),
    dispatches: persistedRows,
  });
}
