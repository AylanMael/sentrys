import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import {
  canManageUsersRole,
  canReadBackoffice,
  requireTenantUser,
} from "@/app/api/_utils/withTenant";
import { adminDb } from "@/lib/firebase/admin";
import {
  normalizeAgencyDocumentProfile,
  profileFromTenant,
  type AgencyDocumentProfile,
} from "@/lib/agency/profile";
import {
  normalizeAgencyEmailSettings,
  toStoredEmailSettings,
} from "@/lib/agency/email-settings";
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

function toStoredProfile(profile: AgencyDocumentProfile) {
  return {
    displayName: profile.displayName,
    legalName: profile.legalName,
    logoUrl: profile.logoUrl,
    addressLine1: profile.addressLine1,
    addressLine2: profile.addressLine2,
    phone: profile.phone,
    email: profile.email,
    cnaps: profile.cnaps,
    siret: profile.siret,
    footerNote: profile.footerNote,
  };
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
    : null;

  return json(200, {
    ok: true,
    tenantId: auth.tenantId,
    profile: profileFromTenant(tenant),
    emailSettings: normalizeAgencyEmailSettings(
      tenant?.agencyEmailSettings,
      profileFromTenant(tenant)
    ),
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

  const rawProfile =
    body.profile && typeof body.profile === "object"
      ? (body.profile as Record<string, unknown>)
      : body;
  const tenantRef = adminDb.collection("tenants").doc(auth.tenantId);
  const tenantSnap = await tenantRef.get();
  const currentTenant = tenantSnap.exists
    ? (tenantSnap.data() as Record<string, unknown>)
    : {};
  const profile = normalizeAgencyDocumentProfile(
    rawProfile,
    String(currentTenant.name ?? "")
  );
  const rawEmailSettings =
    body.emailSettings && typeof body.emailSettings === "object"
      ? (body.emailSettings as Record<string, unknown>)
      : currentTenant.agencyEmailSettings;
  const emailSettings = normalizeAgencyEmailSettings(rawEmailSettings, profile);

  await tenantRef.set(
    {
      name: profile.displayName,
      agencyProfile: toStoredProfile(profile),
      agencyEmailSettings: toStoredEmailSettings(emailSettings),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await logActivity({
    tenantId: auth.tenantId,
    actorUid: auth.uid,
    actorEmail: auth.email ?? null,
    actorRole: auth.role ?? null,
    action: "agency_profile.updated",
    entityType: "system",
    entityId: auth.tenantId,
    message: "Identité documentaire agence mise à jour",
    severity: "info",
    meta: {
      hasLogo: Boolean(profile.logoUrl),
      hasCnaps: Boolean(profile.cnaps),
      hasSiret: Boolean(profile.siret),
      emailProvider: emailSettings.provider,
      emailSendingMode: emailSettings.sendingMode,
      emailSenderStrategy: emailSettings.senderStrategy,
    },
  });

  return json(200, {
    ok: true,
    tenantId: auth.tenantId,
    profile,
    emailSettings,
  });
}
