import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import {
  canManageUsersRole,
  canReadBackoffice,
  requireTenantUser,
} from "@/app/api/_utils/withTenant";
import { logActivity } from "@/lib/activity/logger";
import { adminDb } from "@/lib/firebase/admin";
import { profileFromTenant } from "@/lib/agency/profile";

export const runtime = "nodejs";

type OnboardingStep = {
  id: string;
  label: string;
  detail: string;
  done: boolean;
  blocker: boolean;
  href: string;
  actionLabel: string;
};

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function text(value: unknown, fallback = "") {
  const str = String(value ?? "").trim();
  return str || fallback;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value || null;

  const timestamp = value as { toDate?: () => Date };
  if (typeof timestamp.toDate === "function") {
    return timestamp.toDate().toISOString();
  }

  return null;
}

async function safeCount(query: FirebaseFirestore.Query) {
  try {
    const snapshot = await query.count().get();
    const count = snapshot.data().count;
    return Number.isFinite(count) ? count : 0;
  } catch {
    const snapshot = await query.limit(1000).get();
    return snapshot.size;
  }
}

function isActiveTenant(status: string) {
  return ["active", "trial", "trialing", "ok"].includes(status);
}

function tenantName(id: string, data: Record<string, unknown>) {
  return (
    text(data.name) ||
    text(data.companyName) ||
    text(data.legalName) ||
    text(data.displayName) ||
    id
  );
}

async function buildOnboarding(tenantId: string, currentUid: string) {
  const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
  const tenantData = tenantSnap.exists
    ? (tenantSnap.data() as Record<string, unknown>)
    : {};
  const profile = profileFromTenant(tenantData);
  const owner = tenantData.owner as Record<string, unknown> | undefined;
  const onboardingData = tenantData.onboarding as
    | Record<string, unknown>
    | undefined;
  const status = text(tenantData.status, "pending_setup").toLowerCase();
  const ownerEmail =
    text(tenantData.ownerEmail) ||
    text(owner?.email) ||
    text(onboardingData?.ownerEmail) ||
    null;

  const [usersSnap, clients, sites] = await Promise.all([
    adminDb
      .collection("tenantUsers")
      .where("tenantId", "==", tenantId)
      .limit(100)
      .get(),
    safeCount(adminDb.collection("clients").where("tenantId", "==", tenantId)),
    safeCount(adminDb.collection("sites").where("tenantId", "==", tenantId)),
  ]);

  const users = usersSnap.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return {
      uid: doc.id,
      role: text(data.role).toLowerCase(),
      status: text(data.status, "active").toLowerCase(),
      email: text(data.email) || null,
    };
  });
  const ownerUser = users.find((user) => {
    return user.role === "owner" && user.status === "active";
  });
  const ownerActive = Boolean(ownerUser || text(owner?.uid) || text(onboardingData?.ownerUid));
  const identityReady = Boolean(profile.displayName && (profile.email || ownerEmail));
  const firstClientReady = clients > 0;
  const firstSiteReady = sites > 0;
  const brandingReady = Boolean(profile.logoUrl);

  const steps: OnboardingStep[] = [
    {
      id: "identity",
      label: "Identité agence",
      detail: identityReady
        ? "Nom et email agence renseignés."
        : "Renseignez le nom, l'email, le telephone et les mentions utiles.",
      done: identityReady,
      blocker: true,
      href: "/dashboard/settings",
      actionLabel: "Compléter",
    },
    {
      id: "owner",
      label: "Compte propriétaire",
      detail: ownerActive
        ? "Un propriétaire est rattaché à l'agence."
        : "Le compte propriétaire doit être actif avant la mise en service.",
      done: ownerActive,
      blocker: true,
      href: "/dashboard/users",
      actionLabel: "Vérifier",
    },
    {
      id: "client",
      label: "Premier client",
      detail: firstClientReady
        ? clients + " client(s) créé(s)."
        : "Ajoutez le premier donneur d'ordre pour structurer l'exploitation.",
      done: firstClientReady,
      blocker: true,
      href: "/dashboard/clients/new",
      actionLabel: "Ajouter",
    },
    {
      id: "site",
      label: "Premier site",
      detail: firstSiteReady
        ? sites + " site(s) créé(s)."
        : "Créez le premier site opérationnel rattaché a un client.",
      done: firstSiteReady,
      blocker: true,
      href: "/dashboard/sites",
      actionLabel: "Créer",
    },
    {
      id: "branding",
      label: "Logo et documents",
      detail: brandingReady
        ? "Le logo est prêt pour les PDF et envois."
        : "Ajoutez le logo pour professionnaliser les PDF agent, site et client.",
      done: brandingReady,
      blocker: false,
      href: "/dashboard/settings",
      actionLabel: "Soigner",
    },
  ];

  const blockerSteps = steps.filter((step) => step.blocker);
  const doneSteps = steps.filter((step) => step.done).length;
  const doneBlockers = blockerSteps.filter((step) => step.done).length;
  const readyToRequest = doneBlockers === blockerSteps.length;
  const activationRequested =
    text(onboardingData?.status).toLowerCase() === "activation_requested";

  return {
    tenant: {
      id: tenantId,
      name: tenantName(tenantId, tenantData),
      status,
      ownerEmail,
      createdAtIso: toIso(tenantData.createdAt),
      updatedAtIso: toIso(tenantData.updatedAt),
    },
    profile,
    counters: {
      users: users.length,
      clients,
      sites,
    },
    onboarding: {
      status: text(onboardingData?.status) || (isActiveTenant(status) ? "active" : "pending_setup"),
      completion: Math.round((doneSteps / steps.length) * 100),
      readyToRequest,
      activationRequested,
      active: isActiveTenant(status),
      requestedAtIso: toIso(onboardingData?.activationRequestedAt),
      requestedBy: text(onboardingData?.activationRequestedBy) || null,
      currentUserIsRequester: text(onboardingData?.activationRequestedBy) === currentUid,
      steps,
    },
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (auth.tenantId === "platform") {
    return json(403, { ok: false, error: "Onboarding agence reserve aux tenants clients." });
  }

  if (!canReadBackoffice(auth.role)) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  try {
    const snapshot = await buildOnboarding(auth.tenantId, auth.uid);
    return json(200, {
      ok: true,
      tenantId: auth.tenantId,
      ...snapshot,
    });
  } catch (error) {
    console.error("[onboarding.status.GET]", error);
    return json(500, {
      ok: false,
      error: "Impossible de charger l'onboarding agence.",
    });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (auth.tenantId === "platform") {
    return json(403, { ok: false, error: "Onboarding agence reserve aux tenants clients." });
  }

  if (!canManageUsersRole(auth.role)) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  const action = text(body.action).toLowerCase();
  if (action !== "request_activation") {
    return json(400, { ok: false, error: "Action invalide." });
  }

  const reason =
    text(body.reason) ||
    "Demande d'activation envoyée par l'agence depuis l'onboarding.";

  try {
    const snapshot = await buildOnboarding(auth.tenantId, auth.uid);

    if (snapshot.onboarding.active) {
      return json(409, {
        ok: false,
        error: "Cette agence est deja active.",
        onboarding: snapshot.onboarding,
      });
    }

    if (!snapshot.onboarding.readyToRequest) {
      return json(409, {
        ok: false,
        error: "Complétez les pré-requis obligatoires avant de demander l'activation.",
        onboarding: snapshot.onboarding,
      });
    }

    const now = FieldValue.serverTimestamp();
    const tenantRef = adminDb.collection("tenants").doc(auth.tenantId);
    const auditRef = adminDb.collection("platformAuditLog").doc();

    await adminDb.runTransaction(async (tx) => {
      tx.set(
        tenantRef,
        {
          onboarding: {
            status: "activation_requested",
            completion: snapshot.onboarding.completion,
            activationRequestedAt: now,
            activationRequestedBy: auth.uid,
            activationRequestedByEmail: auth.email ?? null,
          },
          updatedAt: now,
          updatedBy: auth.uid,
        },
        { merge: true }
      );

      tx.set(auditRef, {
        action: "tenant.activation.request",
        actionLabel: "Demande activation agence",
        tenantId: auth.tenantId,
        tenantName: snapshot.tenant.name,
        actor: {
          uid: auth.uid,
          email: auth.email,
          role: auth.role,
        },
        reason,
        status: "pending",
        tone: "warning",
        metadata: {
          completion: snapshot.onboarding.completion,
          counters: snapshot.counters,
        },
        createdAt: now,
      });
    });

    await logActivity({
      tenantId: auth.tenantId,
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      actorRole: auth.role ?? null,
      action: "tenant.activation.request",
      entityType: "system",
      entityId: auth.tenantId,
      message: "Demande d'activation envoyée a VSW Digital",
      severity: "info",
      meta: {
        completion: snapshot.onboarding.completion,
        auditId: auditRef.id,
      },
    });

    const updated = await buildOnboarding(auth.tenantId, auth.uid);
    return json(200, {
      ok: true,
      tenantId: auth.tenantId,
      ...updated,
    });
  } catch (error) {
    console.error("[onboarding.status.PATCH]", error);
    return json(500, {
      ok: false,
      error: "Impossible d'envoyer la demande d'activation.",
    });
  }
}
