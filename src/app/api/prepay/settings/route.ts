import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import {
  canManageUsersRole,
  canReadBackoffice,
  requireTenantUser,
} from "@/app/api/_utils/withTenant";
import { adminDb } from "@/lib/firebase/admin";
import {
  normalizePrepaySettings,
  toStoredPrepaySettings,
} from "@/lib/payroll/settings";
import { logActivity } from "@/lib/activity/logger";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function bad(message: string) {
  return json(400, { ok: false, error: message });
}

export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;
  if (!canReadBackoffice(auth.role)) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  const tenantSnap = await adminDb.collection("tenants").doc(auth.tenantId).get();
  const tenant = tenantSnap.exists
    ? (tenantSnap.data() as Record<string, unknown>)
    : {};

  return json(200, {
    ok: true,
    settings: normalizePrepaySettings(tenant.prepaySettings),
    canEdit: canManageUsersRole(auth.role),
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;
  if (!canManageUsersRole(auth.role)) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("Invalid JSON");
  }

  const settings = normalizePrepaySettings(
    body.settings && typeof body.settings === "object" ? body.settings : body
  );

  await adminDb.collection("tenants").doc(auth.tenantId).set(
    {
      prepaySettings: toStoredPrepaySettings(settings),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await logActivity({
    tenantId: auth.tenantId,
    actorUid: auth.uid,
    actorEmail: auth.email ?? null,
    actorRole: auth.role ?? null,
    action: "prepay.settings_updated",
    entityType: "billing",
    entityId: auth.tenantId,
    message: "Paramètres pré-paie mis à jour",
    severity: "info",
    meta: {
      conventionLabel: settings.conventionLabel,
      hourlyBaseRate: settings.hourlyBaseRate,
      nightPremiumPercent: settings.nightPremiumPercent,
      sundayPremiumPercent: settings.sundayPremiumPercent,
      publicHolidayPremiumPercent: settings.publicHolidayPremiumPercent,
      mayFirstPremiumPercent: settings.mayFirstPremiumPercent,
      allowanceMode: settings.allowanceMode,
      exportProfile: settings.exportProfile,
      exportDecimalSeparator: settings.exportDecimalSeparator,
      payrollRubricCodes: settings.payrollRubricCodes,
    },
  });

  return json(200, {
    ok: true,
    settings,
    canEdit: true,
  });
}
