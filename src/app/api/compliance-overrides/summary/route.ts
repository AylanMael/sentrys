import { NextRequest, NextResponse } from "next/server";

import {
  canReadBackoffice,
  requireTenantUser,
} from "@/app/api/_utils/withTenant";
import { adminDb } from "@/lib/firebase/admin";
import { ensureComplianceReminderNotifications } from "@/lib/notifications/compliance-reminders";

export const runtime = "nodejs";

type ResolutionStatus =
  | "to_regularize"
  | "regularized"
  | "accepted_exception";

function json(status: number, body: unknown) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
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
  const status = clean(value);
  if (
    status === "regularized" ||
    status === "accepted_exception" ||
    status === "to_regularize"
  ) {
    return status;
  }

  return "to_regularize";
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

export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;
  if (!canReadBackoffice(auth.role)) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  await ensureComplianceReminderNotifications(auth.tenantId).catch((error) => {
    console.error("[compliance.summary.reminders]", error);
  });

  const snap = await adminDb
    .collection("planningDispatches")
    .where("tenantId", "==", auth.tenantId)
    .limit(500)
    .get();

  const items = snap.docs
    .filter((doc) => doc.data().complianceOverride === true)
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const fromIso = clean(data.fromIso) || null;
      const toIsoValue = clean(data.toIso) || null;

      return {
        id: doc.id,
        agentId: clean(data.agentId),
        agentName: clean(data.agentName) || "Agent",
        periodLabel: periodLabel(fromIso, toIsoValue),
        siteNames: safeArr(data.siteNames),
        sentAtIso: toIso(data.sentAt) ?? clean(data.sentAtIso) ?? null,
        complianceOverrideReason:
          clean(data.complianceOverrideReason) || null,
        complianceOverrideDétail:
          clean(data.complianceOverrideDétail) || null,
        complianceResolutionStatus: normalizeStatus(
          data.complianceResolutionStatus
        ),
      };
    });

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

  const urgent = items
    .filter((item) => item.complianceResolutionStatus === "to_regularize")
    .sort((left, right) => {
      const l = left.sentAtIso ? new Date(left.sentAtIso).getTime() : 0;
      const r = right.sentAtIso ? new Date(right.sentAtIso).getTime() : 0;
      return r - l;
    })
    .slice(0, 3);

  return json(200, {
    ok: true,
    stats,
    urgent,
  });
}
