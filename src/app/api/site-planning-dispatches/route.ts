import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import {
  canReadBackoffice,
  canWrite,
  requireTenantUser,
} from "@/app/api/_utils/withTenant";
import { adminDb } from "@/lib/firebase/admin";
import { logActivity } from "@/lib/activity/logger";
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
import {
  chunk,
  normalizeText,
  parseDateTimeIso,
  safeArr,
  toIso,
} from "@/app/api/vacations/_shared";

export const runtime = "nodejs";

type SiteDispatchSite = {
  id: string;
  name: string;
  clientId: string | null;
  clientName: string | null;
};

type SiteDispatchVacation = {
  id: string;
  siteId: string | null;
  siteName: string | null;
  title: string | null;
  missionType: string | null;
  startAtIso: string | null;
  endAtIso: string | null;
  assignedAgentIds: string[];
  requiredAgents: number;
  publicationStatus: "draft" | "published" | "modified";
};

type SitePlanningDispatchRow = {
  clientId: string | null;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  contactName: string | null;
  fromIso: string;
  toIso: string;
  siteIds: string[];
  siteCount: number;
  siteNames: string[];
  vacationIds: string[];
  vacationCount: number;
  readyVacationCount: number;
  draftCount: number;
  modifiedCount: number;
  missingAgentCount: number;
  plannedAgentCount: number;
  channel: DispatchChannel;
  deliveryMode: DispatchDeliveryMode;
  deliveryStatus: DispatchDeliveryStatus;
  deliveryTarget: string | null;
  deliveryNote: string | null;
  pdfUrl: string;
  sentAtIso: string | null;
  sentBy: string;
  agencyProfile: AgencyDocumentProfile;
};

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function bad(message: string) {
  return json(400, { ok: false, error: message });
}

function getClientDispatchChannel(value: unknown): DispatchChannel {
  const channel = normalizeDispatchChannel(value);
  return channel === "internal" ? "internal" : "email";
}

function dateParam(value: Date) {
  return value.toISOString();
}

function buildPdfUrl(input: {
  fromIso: string;
  toIso: string;
  clientId: string | null;
  siteIds: string[];
}) {
  const params = new URLSearchParams({
    from: input.fromIso,
    to: input.toIso,
  });

  if (input.clientId) {
    params.set("clientId", input.clientId);
  } else if (input.siteIds.length === 1) {
    params.set("siteId", input.siteIds[0]);
  }

  return `/site-planning/print?${params.toString()}`;
}

function isActiveVacation(data: Record<string, unknown>) {
  return data.status !== "cancelled" && data.status !== "closed";
}

function publicationStatus(data: Record<string, unknown>) {
  if (data.isPublished !== true) return "draft" as const;

  const publishedAtIso = toIso(data.publishedAt);
  const updatedAtIso = toIso(data.updatedAt);
  if (!publishedAtIso || !updatedAtIso) return "published" as const;

  const publishedAt = new Date(publishedAtIso).getTime();
  const updatedAt = new Date(updatedAtIso).getTime();

  if (
    Number.isFinite(publishedAt) &&
    Number.isFinite(updatedAt) &&
    updatedAt > publishedAt + 1000
  ) {
    return "modified" as const;
  }

  return "published" as const;
}

function missingAgents(vacation: SiteDispatchVacation) {
  const required = Math.max(1, Number(vacation.requiredAgents || 1));
  return Math.max(0, required - vacation.assignedAgentIds.length);
}

function pickDispatch(
  data: Record<string, unknown>,
  id: string,
  fallbackProfile: AgencyDocumentProfile
): SitePlanningDispatchRow & { id: string } {
  const channel = getClientDispatchChannel(data.channel);

  return {
    id,
    clientId: normalizeText(data.clientId),
    clientName: normalizeText(data.clientName) || "Client",
    clientEmail: normalizeText(data.clientEmail),
    clientPhone: normalizeText(data.clientPhone),
    contactName: normalizeText(data.contactName),
    fromIso: String(data.fromIso ?? ""),
    toIso: String(data.toIso ?? ""),
    siteIds: safeArr(data.siteIds),
    siteCount: Number(data.siteCount ?? 0),
    siteNames: safeArr(data.siteNames),
    vacationIds: safeArr(data.vacationIds),
    vacationCount: Number(data.vacationCount ?? 0),
    readyVacationCount: Number(data.readyVacationCount ?? 0),
    draftCount: Number(data.draftCount ?? 0),
    modifiedCount: Number(data.modifiedCount ?? 0),
    missingAgentCount: Number(data.missingAgentCount ?? 0),
    plannedAgentCount: Number(data.plannedAgentCount ?? 0),
    channel,
    deliveryMode:
      data.deliveryMode === "simulation" || data.deliveryMode === "log"
        ? data.deliveryMode
        : getDispatchDeliveryMode(channel),
    deliveryStatus:
      data.deliveryStatus === "simulated" ||
      data.deliveryStatus === "logged" ||
      data.deliveryStatus === "blocked"
        ? data.deliveryStatus
        : getDispatchDeliveryStatus(channel),
    deliveryTarget: normalizeText(data.deliveryTarget),
    deliveryNote: normalizeText(data.deliveryNote),
    pdfUrl: normalizeText(data.pdfUrl) || "/site-planning/print",
    sentAtIso: toIso(data.sentAt) || normalizeText(data.sentAtIso),
    sentBy: String(data.sentBy ?? ""),
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

async function loadSites(input: {
  tenantId: string;
  siteIds: string[];
  clientId: string | null;
}) {
  const sites: SiteDispatchSite[] = [];

  if (input.siteIds.length > 0) {
    for (const part of chunk(input.siteIds, 200)) {
      const refs = part.map((siteId) => adminDb.collection("sites").doc(siteId));
      const snaps = await adminDb.getAll(...refs);

      snaps.forEach((snap) => {
        if (!snap.exists) return;

        const data = snap.data() as Record<string, unknown>;
        if (data.tenantId !== input.tenantId) return;

        sites.push({
          id: snap.id,
          name: normalizeText(data.name) || "Site",
          clientId: normalizeText(data.clientId),
          clientName: normalizeText(data.clientName),
        });
      });
    }

    return sites;
  }

  if (!input.clientId) return sites;

  const snap = await adminDb
    .collection("sites")
    .where("tenantId", "==", input.tenantId)
    .where("clientId", "==", input.clientId)
    .limit(250)
    .get();

  snap.docs.forEach((doc) => {
    const data = doc.data() as Record<string, unknown>;
    sites.push({
      id: doc.id,
      name: normalizeText(data.name) || "Site",
      clientId: normalizeText(data.clientId),
      clientName: normalizeText(data.clientName),
    });
  });

  return sites;
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
  const clientId = normalizeText(url.searchParams.get("clientId"));
  const siteId = normalizeText(url.searchParams.get("siteId"));
  const from = fromIso ? parseDateTimeIso(fromIso) : null;
  const to = toIsoParam ? parseDateTimeIso(toIsoParam) : null;

  if (fromIso && !from) return bad("from must be an ISO date");
  if (toIsoParam && !to) return bad("to must be an ISO date");

  const snap = await adminDb
    .collection("sitePlanningDispatches")
    .where("tenantId", "==", auth.tenantId)
    .limit(250)
    .get();
  const agencyProfile = await getAgencyProfile(auth.tenantId);

  let dispatches = snap.docs.map((doc) =>
    pickDispatch(doc.data() as Record<string, unknown>, doc.id, agencyProfile)
  );

  if (from && to) {
    dispatches = dispatches.filter(
      (dispatch) =>
        dispatch.fromIso === from.toISOString() &&
        dispatch.toIso === to.toISOString()
    );
  }

  if (clientId) {
    dispatches = dispatches.filter((dispatch) => dispatch.clientId === clientId);
  }

  if (siteId) {
    dispatches = dispatches.filter((dispatch) =>
      dispatch.siteIds.includes(siteId)
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

  const channel = getClientDispatchChannel(body.channel);
  const requestedSiteIds = safeArr(body.siteIds);
  const requestedClientId = normalizeText(body.clientId);

  if (requestedSiteIds.length === 0 && !requestedClientId) {
    return bad("siteIds or clientId are required");
  }

  const sites = await loadSites({
    tenantId: auth.tenantId,
    siteIds: requestedSiteIds,
    clientId: requestedClientId,
  });
  const siteIds = Array.from(new Set(sites.map((site) => site.id)));

  if (siteIds.length === 0) {
    return json(200, { ok: true, created: 0, blocked: [], dispatches: [] });
  }

  const siteIdSet = new Set(siteIds);
  const vacationsSnap = await adminDb
    .collection("vacations")
    .where("tenantId", "==", auth.tenantId)
    .limit(2000)
    .get();

  const vacations: SiteDispatchVacation[] = vacationsSnap.docs.flatMap((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const siteId = normalizeText(data.siteId);
    if (!siteId || !siteIdSet.has(siteId)) return [];
    if (!isActiveVacation(data)) return [];

    const startAtIso = toIso(data.startAt);
    const endAtIso = toIso(data.endAt);
    if (!startAtIso || !endAtIso) return [];

    const startMs = new Date(startAtIso).getTime();
    const endMs = new Date(endAtIso).getTime();
    if (startMs >= to.getTime() || endMs <= from.getTime()) return [];

    return [
      {
        id: doc.id,
        siteId,
        siteName: normalizeText(data.siteName),
        title: normalizeText(data.title),
        missionType: normalizeText(data.missionType),
        startAtIso,
        endAtIso,
        assignedAgentIds: safeArr(data.assignedAgentIds),
        requiredAgents: Number(data.requiredAgents ?? 1),
        publicationStatus: publicationStatus(data),
      },
    ];
  });

  const clientIds = Array.from(
    new Set(sites.map((site) => site.clientId).filter(Boolean) as string[])
  );
  const clientMap = new Map<string, Record<string, unknown>>();

  for (const part of chunk(clientIds, 200)) {
    const refs = part.map((clientId) => adminDb.collection("clients").doc(clientId));
    const snaps = await adminDb.getAll(...refs);

    snaps.forEach((snap, index) => {
      if (!snap.exists) return;

      const data = snap.data() as Record<string, unknown>;
      if (data.tenantId !== auth.tenantId) return;

      clientMap.set(part[index], data);
    });
  }

  const groups = new Map<string, SiteDispatchSite[]>();
  sites.forEach((site) => {
    const key = site.clientId ? `client:${site.clientId}` : `site:${site.id}`;
    groups.set(key, [...(groups.get(key) ?? []), site]);
  });

  const nowIso = new Date().toISOString();
  const fromIso = dateParam(from);
  const toIsoParam = dateParam(to);
  const agencyProfile = await getAgencyProfile(auth.tenantId);

  const rows: SitePlanningDispatchRow[] = Array.from(groups.values()).map(
    (groupSites) => {
      const clientId = groupSites[0]?.clientId ?? null;
      const client = clientId ? clientMap.get(clientId) : null;
      const clientName =
        normalizeText(client?.name) ||
        groupSites[0]?.clientName ||
        (groupSites.length === 1 ? groupSites[0].name : "Client non renseigne");
      const clientEmail =
        normalizeText(client?.billingEmail) || normalizeText(client?.email);
      const groupSiteIds = groupSites.map((site) => site.id);
      const groupSiteIdSet = new Set(groupSiteIds);
      const groupVacations = vacations.filter(
        (vacation) => vacation.siteId && groupSiteIdSet.has(vacation.siteId)
      );
      const readyVacations = groupVacations.filter(
        (vacation) =>
          vacation.publicationStatus === "published" &&
          vacation.assignedAgentIds.length > 0
      );
      const plannedAgentIds = new Set<string>();

      groupVacations.forEach((vacation) => {
        vacation.assignedAgentIds.forEach((agentId) =>
          plannedAgentIds.add(agentId)
        );
      });

      return {
        clientId,
        clientName,
        clientEmail,
        clientPhone: normalizeText(client?.phone),
        contactName: normalizeText(client?.contactName),
        fromIso,
        toIso: toIsoParam,
        siteIds: groupSiteIds,
        siteCount: groupSites.length,
        siteNames: groupSites.map((site) => site.name).slice(0, 40),
        vacationIds: groupVacations.map((vacation) => vacation.id),
        vacationCount: groupVacations.length,
        readyVacationCount: readyVacations.length,
        draftCount: groupVacations.filter(
          (vacation) => vacation.publicationStatus === "draft"
        ).length,
        modifiedCount: groupVacations.filter(
          (vacation) => vacation.publicationStatus === "modified"
        ).length,
        missingAgentCount: groupVacations.reduce(
          (total, vacation) => total + missingAgents(vacation),
          0
        ),
        plannedAgentCount: plannedAgentIds.size,
        channel,
        deliveryMode: getDispatchDeliveryMode(channel),
        deliveryStatus: getDispatchDeliveryStatus(channel),
        deliveryTarget: channel === "email" ? clientEmail : null,
        deliveryNote:
          channel === "email"
            ? "Preparation email : PDF client pret, aucun email reel n'a ete envoye."
            : "Remise client journalisee en interne uniquement.",
        pdfUrl: buildPdfUrl({
          fromIso,
          toIso: toIsoParam,
          clientId,
          siteIds: groupSiteIds,
        }),
        sentAtIso: nowIso,
        sentBy: auth.uid,
        agencyProfile,
      };
    }
  );

  const blockedRows = rows.filter((row) => channel === "email" && !row.clientEmail);
  const dispatchableRows = rows.filter(
    (row) => !blockedRows.some((blocked) => blocked.clientId === row.clientId)
  );

  if (dispatchableRows.length === 0) {
    return json(200, {
      ok: true,
      created: 0,
      blocked: blockedRows.map((row) => ({
        clientId: row.clientId,
        clientName: row.clientName,
        reason: "missing_email",
      })),
      dispatches: [],
    });
  }

  const batch = adminDb.batch();
  const collectionRef = adminDb.collection("sitePlanningDispatches");
  const persistedRows: Array<SitePlanningDispatchRow & { id: string }> = [];

  dispatchableRows.forEach((row) => {
    const ref = collectionRef.doc();
    persistedRows.push({ ...row, id: ref.id });
    batch.set(ref, {
      tenantId: auth.tenantId,
      ...row,
      sentAt: FieldValue.serverTimestamp(),
      sentAtIso: nowIso,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();

  await logActivity({
    tenantId: auth.tenantId,
    actorUid: auth.uid,
    actorEmail: auth.email ?? null,
    actorRole: auth.role ?? null,
    action: "site-planning.prepared",
    entityType: "site",
    entityId: `${fromIso}_${toIsoParam}`,
    message: `Remise client preparee pour ${dispatchableRows.length} client(s)`,
    severity: "info",
    meta: {
      fromIso,
      toIso: toIsoParam,
      clientCount: dispatchableRows.length,
      blockedCount: blockedRows.length,
      siteCount: dispatchableRows.reduce((total, row) => total + row.siteCount, 0),
      vacationCount: dispatchableRows.reduce(
        (total, row) => total + row.vacationCount,
        0
      ),
      channel,
      deliveryMode: getDispatchDeliveryMode(channel),
    },
  });

  return json(200, {
    ok: true,
    created: dispatchableRows.length,
    blocked: blockedRows.map((row) => ({
      clientId: row.clientId,
      clientName: row.clientName,
      reason: "missing_email",
    })),
    dispatches: persistedRows,
  });
}
