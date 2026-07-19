import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import {
  canReadBackoffice,
  canWrite,
  requireTenantUser,
} from "@/app/api/_utils/withTenant";
import { adminDb } from "@/lib/firebase/admin";
import { logActivity } from "@/lib/activity/logger";

export const runtime = "nodejs";

type ResolutionStatus =
  | "to_regularize"
  | "regularized"
  | "accepted_exception";

const RESOLUTION_STATUSES = new Set<ResolutionStatus>([
  "to_regularize",
  "regularized",
  "accepted_exception",
]);

function json(status: number, body: unknown) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function bad(message: string) {
  return json(400, { ok: false, error: message });
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function safeArr(value: unknown) {
  return Array.isArray(value)
    ? value.map((entry) => clean(entry)).filter(Boolean)
    : [];
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value || null;
  if (value instanceof Date) return value.toISOString();

  const timestamp = value as { toDate?: () => Date };
  if (typeof timestamp.toDate === "function") {
    return timestamp.toDate().toISOString();
  }

  return null;
}

function normalizeStatus(value: unknown): ResolutionStatus {
  const status = clean(value) as ResolutionStatus;
  return RESOLUTION_STATUSES.has(status) ? status : "to_regularize";
}

function periodLabel(fromIso: string | null, toIsoValue: string | null) {
  if (!fromIso || !toIsoValue) return "Periode non renseignée";

  const formatter = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return `${formatter.format(new Date(fromIso))} - ${formatter.format(
    new Date(toIsoValue)
  )}`;
}

function pickOverride(doc: FirebaseFirestore.DocumentSnapshot) {
  const data = doc.data() as Record<string, unknown>;
  const fromIso = clean(data.fromIso);
  const toIsoValue = clean(data.toIso);

  return {
    id: doc.id,
    agentId: clean(data.agentId),
    agentName: clean(data.agentName) || "Agent",
    agentEmail: clean(data.agentEmail) || null,
    agentPhone: clean(data.agentPhone) || null,
    fromIso,
    toIso: toIsoValue,
    periodLabel: periodLabel(fromIso, toIsoValue),
    vacationCount: Number(data.vacationCount ?? 0),
    vacationIds: safeArr(data.vacationIds),
    siteNames: safeArr(data.siteNames),
    channel: clean(data.channel) || "internal",
    deliveryStatus: clean(data.deliveryStatus) || null,
    sentAtIso: toIso(data.sentAt) ?? clean(data.sentAtIso) ?? null,
    sentBy: clean(data.sentBy) || null,
    complianceOverrideReason: clean(data.complianceOverrideReason) || null,
    complianceOverrideDétail: clean(data.complianceOverrideDétail) || null,
    complianceResolutionStatus: normalizeStatus(
      data.complianceResolutionStatus
    ),
    complianceResolutionNote: clean(data.complianceResolutionNote) || null,
    complianceResolutionAtIso: toIso(data.complianceResolutionAt),
    complianceResolutionByEmail:
      clean(data.complianceResolutionByEmail) || null,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;
  if (!canReadBackoffice(auth.role)) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  const url = new URL(req.url);
  const statusFilter = clean(url.searchParams.get("status"));
  const agentId = clean(url.searchParams.get("agentId"));
  const search = clean(url.searchParams.get("q")).toLowerCase();

  const snap = await adminDb
    .collection("planningDispatches")
    .where("tenantId", "==", auth.tenantId)
    .limit(500)
    .get();

  let items = snap.docs
    .filter((doc) => doc.data().complianceOverride === true)
    .map(pickOverride);

  if (agentId) {
    items = items.filter((item) => item.agentId === agentId);
  }

  if (search) {
    items = items.filter((item) => {
      const haystack = [
        item.agentName,
        item.agentEmail,
        item.agentPhone,
        item.complianceOverrideReason,
        item.complianceOverrideDétail,
        item.siteNames.join(" "),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });
  }

  const stats = items.reduce(
    (acc, item) => {
      acc.total += 1;
      acc[item.complianceResolutionStatus] += 1;
      return acc;
    },
    {
      total: 0,
      to_regularize: 0,
      regularized: 0,
      accepted_exception: 0,
    } as Record<ResolutionStatus | "total", number>
  );

  if (statusFilter && statusFilter !== "all") {
    items = items.filter(
      (item) => item.complianceResolutionStatus === statusFilter
    );
  }

  items.sort((left, right) => {
    const l = left.sentAtIso ? new Date(left.sentAtIso).getTime() : 0;
    const r = right.sentAtIso ? new Date(right.sentAtIso).getTime() : 0;
    return r - l;
  });

  return json(200, {
    ok: true,
    stats,
    items: items.slice(0, 150),
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
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }

  const id = clean(body.id);
  const status = normalizeStatus(body.status);
  const note = clean(body.note);

  if (!id) return bad("id is required");

  const ref = adminDb.collection("planningDispatches").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return json(404, { ok: false, error: "Not found" });

  const data = snap.data() as Record<string, unknown>;
  if (data.tenantId !== auth.tenantId) {
    return json(404, { ok: false, error: "Not found" });
  }

  if (data.complianceOverride !== true) {
    return bad("This dispatch is not a compliance override");
  }

  await ref.update({
    complianceResolutionStatus: status,
    complianceResolutionNote: note || null,
    complianceResolutionAt: FieldValue.serverTimestamp(),
    complianceResolutionByUid: auth.uid,
    complianceResolutionByEmail: auth.email ?? null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await logActivity({
    tenantId: auth.tenantId,
    actorUid: auth.uid,
    actorEmail: auth.email ?? null,
    actorRole: auth.role ?? null,
    action: "compliance.override.updated",
    entityType: "assignment",
    entityId: id,
    message: `Exception conformité ${status} pour ${clean(data.agentName) || "agent"}`,
    severity: status === "to_regularize" ? "warning" : "info",
    meta: {
      dispatchId: id,
      status,
      note: note || null,
      agentId: clean(data.agentId) || null,
      agentName: clean(data.agentName) || null,
    },
  });

  const nextSnap = await ref.get();

  return json(200, {
    ok: true,
    item: pickOverride(nextSnap),
  });
}
