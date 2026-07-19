import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import {
  forbidden,
  isSuperAdmin,
  requireTenantUser,
} from "@/app/api/_utils/withTenant";
import {
  computeEffectiveLimits,
  getPlan,
  getSubscription,
} from "@/lib/billing/limits";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { listPlatformAuditEvents } from "@/lib/platform/audit-log";

export const runtime = "nodejs";

type RiskLevel = "ok" | "watch" | "critical";

type PlanId = "free" | "starter" | "pro" | "growth";

type TenantUserRow = {
  id: string;
  uid: string | null;
  name: string | null;
  email: string | null;
  role: string;
  status: string;
  createdAtIso: string | null;
  updatedAtIso: string | null;
};

type SupportSessionRow = {
  id: string;
  scope: string;
  status: string;
  reason: string | null;
  actorEmail: string | null;
  readOnly: boolean;
  impersonation: boolean;
  durationMinutes: number;
  startedAtIso: string | null;
  expiresAtIso: string | null;
  closedAtIso: string | null;
};

type OwnerInvitationRow = {
  id: string;
  uid: string | null;
  email: string | null;
  name: string | null;
  status: string;
  createdAuthUser: boolean;
  resetLinkCreated: boolean;
  resetLinkError: string | null;
  actorEmail: string | null;
  createdAtIso: string | null;
};

type ActivationStepRow = {
  id: string;
  label: string;
  detail: string;
  done: boolean;
  blocker: boolean;
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

function normalizeEmail(value: unknown) {
  const email = text(value).toLowerCase();
  if (!email) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function getAppBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:9002"
  ).replace(/\/+$/, "");
}

function isFirebaseUserNotFound(error: unknown) {
  return (
    (error as { code?: string } | null)?.code === "auth/user-not-found" ||
    String((error as { message?: string } | null)?.message ?? "").includes(
      "no user record"
    )
  );
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

function toMillis(value: unknown): number {
  const iso = toIso(value);
  if (!iso) return 0;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.getTime() : 0;
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  const timestamp = value as { toDate?: () => Date };
  if (typeof timestamp.toDate === "function") {
    const date = timestamp.toDate();
    return Number.isFinite(date.getTime()) ? date : null;
  }

  return null;
}

function isInRange(value: unknown, from: Date, to: Date) {
  const date = asDate(value);
  if (!date) return false;

  return date >= from && date < to;
}

function currentMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { from, to };
}

async function countQuery(
  query: FirebaseFirestore.Query,
  fallbackCount?: () => Promise<number>
) {
  try {
    const snapshot = await query.count().get();
    const count = snapshot.data().count;
    return Number.isFinite(count) ? count : 0;
  } catch (error) {
    if (fallbackCount) {
      try {
        return await fallbackCount();
      } catch (fallbackError) {
        console.warn("[platform.tenant] fallback count failed", {
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        });
      }
    }

    try {
      const fallback = await query.limit(1000).get();
      return fallback.size;
    } catch (fallbackError) {
      console.warn("[platform.tenant] count failed", {
        error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        initialError: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }
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

function tenantPlan(data: Record<string, unknown>) {
  const subscription = data.subscription as Record<string, unknown> | undefined;
  const plan = data.plan as Record<string, unknown> | undefined;

  return (
    text(subscription?.planName) ||
    text(subscription?.planId) ||
    text(plan?.name) ||
    text(data.planName) ||
    text(data.planId) ||
    "standard"
  );
}

const PLATFORM_PLAN_IDS: PlanId[] = ["free", "starter", "pro", "growth"];
const SUPPORT_SCOPES = ["diagnostic", "billing", "technical", "security"] as const;

function readPlanId(value: unknown): PlanId | null {
  const planId = text(value).toLowerCase();
  return PLATFORM_PLAN_IDS.includes(planId as PlanId) ? (planId as PlanId) : null;
}

function readSupportScope(value: unknown) {
  const scope = text(value, "diagnostic").toLowerCase();
  return SUPPORT_SCOPES.includes(scope as (typeof SUPPORT_SCOPES)[number])
    ? scope
    : "diagnostic";
}

function readDurationMinutes(value: unknown) {
  const duration = Number(value);
  if (!Number.isFinite(duration)) return 30;
  return Math.min(120, Math.max(15, Math.floor(duration)));
}

function serializeBilling(input: {
  plan: Awaited<ReturnType<typeof getPlan>>;
  subscription: Awaited<ReturnType<typeof getSubscription>>;
  limits: { agents: number; sites: number; tenants: number };
}) {
  return {
    plan: {
      id: input.plan.id,
      name: input.plan.name,
      active: input.plan.active,
      priceMonthlyCents: input.plan.priceMonthlyCents ?? null,
    },
    subscription: {
      planId: input.subscription.planId,
      status: input.subscription.status,
      addons: input.subscription.addons ?? {},
      stripeCustomerId: input.subscription.stripeCustomerId ?? null,
      stripeSubId: input.subscription.stripeSubId ?? null,
    },
    limits: input.limits,
  };
}

function tenantOwnerEmail(data: Record<string, unknown>) {
  const owner = data.owner as Record<string, unknown> | undefined;
  return (
    text(data.ownerEmail) ||
    text(data.email) ||
    text(owner?.email) ||
    null
  );
}

function riskForTenant(input: {
  status: string;
  users: number;
  agents: number;
  sites: number;
  openIncidents: number;
}) {
  const reasons: string[] = [];

  if (!["active", "trialing", "trial", "ok"].includes(input.status)) {
    reasons.push("Statut " + input.status);
  }
  if (input.users === 0) reasons.push("Aucun utilisateur actif");
  if (input.agents === 0) reasons.push("Aucun agent");
  if (input.sites === 0) reasons.push("Aucun site");
  if (input.openIncidents > 0) {
    reasons.push(input.openIncidents + " incident(s) ouvert(s)");
  }

  const critical =
    input.status === "suspended" ||
    input.status === "disabled" ||
    input.users === 0;

  return {
    riskLevel: (critical ? "critical" : reasons.length > 0 ? "watch" : "ok") as RiskLevel,
    riskReasons: reasons,
  };
}

async function countTenantVacationsMonth(
  tenantId: string,
  from: Date,
  to: Date
) {
  return countQuery(
    adminDb
      .collection("vacations")
      .where("tenantId", "==", tenantId)
      .where("startAt", ">=", from.toISOString())
      .where("startAt", "<", to.toISOString()),
    async () => {
      const snapshot = await adminDb
        .collection("vacations")
        .where("tenantId", "==", tenantId)
        .limit(5000)
        .get();

      return snapshot.docs.reduce((count, doc) => {
        const data = doc.data() as Record<string, unknown>;
        return count + (isInRange(data.startAt, from, to) ? 1 : 0);
      }, 0);
    }
  );
}

async function countTenantOpenIncidents(tenantId: string) {
  const openStatuses = new Set(["open", "investigating"]);

  return countQuery(
    adminDb
      .collection("incidents")
      .where("tenantId", "==", tenantId)
      .where("status", "in", Array.from(openStatuses)),
    async () => {
      const snapshot = await adminDb
        .collection("incidents")
        .where("tenantId", "==", tenantId)
        .limit(5000)
        .get();

      return snapshot.docs.reduce((count, doc) => {
        const data = doc.data() as Record<string, unknown>;
        const status = text(data.status).toLowerCase();
        return count + (openStatuses.has(status) ? 1 : 0);
      }, 0);
    }
  );
}

function userRow(doc: FirebaseFirestore.QueryDocumentSnapshot): TenantUserRow {
  const data = doc.data() as Record<string, unknown>;

  return {
    id: doc.id,
    uid: text(data.uid) || doc.id,
    name: text(data.name) || null,
    email: text(data.email) || null,
    role: text(data.role, "unknown"),
    status: text(data.status, "unknown"),
    createdAtIso: toIso(data.createdAt),
    updatedAtIso: toIso(data.updatedAt),
  };
}

function supportSessionRow(
  doc: FirebaseFirestore.QueryDocumentSnapshot
): SupportSessionRow {
  const data = doc.data() as Record<string, unknown>;
  const actor = data.actor as Record<string, unknown> | undefined;

  return {
    id: doc.id,
    scope: text(data.scope, "diagnostic"),
    status: text(data.status, "active"),
    reason: text(data.reason) || null,
    actorEmail: text(actor?.email) || null,
    readOnly: data.readOnly !== false,
    impersonation: Boolean(data.impersonation),
    durationMinutes: Number(data.durationMinutes) || 0,
    startedAtIso: toIso(data.startedAt ?? data.createdAt),
    expiresAtIso: toIso(data.expiresAt),
    closedAtIso: toIso(data.closedAt),
  };
}

function ownerInvitationRow(
  doc: FirebaseFirestore.QueryDocumentSnapshot
): OwnerInvitationRow {
  const data = doc.data() as Record<string, unknown>;
  const actor = data.actor as Record<string, unknown> | undefined;

  return {
    id: doc.id,
    uid: text(data.uid) || null,
    email: text(data.email) || null,
    name: text(data.name) || null,
    status: text(data.status, "prépared"),
    createdAuthUser: Boolean(data.createdAuthUser),
    resetLinkCreated: Boolean(data.resetLinkCreated),
    resetLinkError: text(data.resetLinkError) || null,
    actorEmail: text(actor?.email) || null,
    createdAtIso: toIso(data.createdAt),
  };
}

function buildOnboardingSnapshot(input: {
  tenantData: Record<string, unknown>;
  tenantId: string;
  users: TenantUserRow[];
  ownerInvitations: OwnerInvitationRow[];
  clients: number;
  sites: number;
}) {
  const onboarding = input.tenantData.onboarding as
    | Record<string, unknown>
    | undefined;
  const owner = input.tenantData.owner as Record<string, unknown> | undefined;
  const ownerUser = input.users.find((user) => {
    return user.role === "owner" && user.status === "active";
  });
  const ownerEmail =
    tenantOwnerEmail(input.tenantData) ||
    ownerUser?.email ||
    text(onboarding?.ownerEmail) ||
    null;
  const ownerUid =
    text(input.tenantData.ownerUid) ||
    text(owner?.uid) ||
    text(onboarding?.ownerUid) ||
    ownerUser?.uid ||
    null;
  const onboardingStatus =
    text(onboarding?.status) ||
    (text(input.tenantData.status) === "active"
      ? "active"
      : "pending_setup");
  const ownerInvited = Boolean(
    ownerUser ||
      ownerUid ||
      input.ownerInvitations.length > 0 ||
      ["owner_invited", "setup_in_progress", "active"].includes(
        onboardingStatus
      )
  );
  const ownerActive = Boolean(ownerUser);
  const identityReady = Boolean(tenantName(input.tenantId, input.tenantData) && ownerEmail);
  const firstClientReady = input.clients > 0;
  const firstSiteReady = input.sites > 0;

  const steps: ActivationStepRow[] = [
    {
      id: "identity",
      label: "Identité agence",
      detail: identityReady
        ? "Nom et email propriétaire renseignés."
        : "Renseigner le nom agence et l'email propriétaire.",
      done: identityReady,
      blocker: true,
    },
    {
      id: "owner_invited",
      label: "Propriétaire invite",
      detail: ownerInvited
        ? "Invitation propriétaire préparée."
        : "Preparer l'invitation owner depuis les actions support.",
      done: ownerInvited,
      blocker: true,
    },
    {
      id: "owner_active",
      label: "Compte owner actif",
      detail: ownerActive
        ? "Un compte owner actif est rattaché à l'agence."
        : "Le propriétaire doit être rattaché en role owner actif.",
      done: ownerActive,
      blocker: true,
    },
    {
      id: "first_client",
      label: "Premier client",
      detail: firstClientReady
        ? "Au moins un donneur d'ordre est créé."
        : "Créer le premier client dans l'espace agence.",
      done: firstClientReady,
      blocker: true,
    },
    {
      id: "first_site",
      label: "Premier site",
      detail: firstSiteReady
        ? "Au moins un site opérationnel est créé."
        : "Créer le premier site dans l'espace agence.",
      done: firstSiteReady,
      blocker: true,
    },
  ];

  const blockerSteps = steps.filter((step) => step.blocker);
  const doneSteps = steps.filter((step) => step.done).length;
  const doneBlockers = blockerSteps.filter((step) => step.done).length;

  return {
    status: onboardingStatus,
    ownerEmail,
    ownerUid,
    completion:
      steps.length > 0 ? Math.round((doneSteps / steps.length) * 100) : 0,
    readyToActivate: doneBlockers === blockerSteps.length,
    steps,
  };
}


function httpError(message: string, status: number) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

function readTenantStatusAction(value: unknown) {
  const status = text(value).toLowerCase();
  if (status === "active" || status === "suspended") return status;
  return null;
}

function confirmationForStatus(status: "active" | "suspended") {
  return status === "suspended" ? "SUSPENDRE" : "REACTIVER";
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!isSuperAdmin(auth.role)) {
    return forbidden("Super admin SaaS required");
  }

  const { id: rawId } = await ctx.params;
  const tenantId = decodeURIComponent(rawId ?? "").trim();
  if (!tenantId) {
    return json(400, { ok: false, error: "tenantId is required" });
  }

  const monthRange = currentMonthRange();

  try {
    const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
    if (!tenantSnap.exists) {
      return json(404, { ok: false, error: "Agence SaaS introuvable." });
    }

    const tenantData = tenantSnap.data() as Record<string, unknown>;
    const status = text(tenantData.status, "active").toLowerCase();

    const [
      users,
      agents,
      sites,
      clients,
      vacationsMonth,
      openIncidents,
      usersSnap,
      subscription,
      supportSessionsSnap,
      ownerInvitationsSnap,
    ] = await Promise.all([
      countQuery(
        adminDb
          .collection("tenantUsers")
          .where("tenantId", "==", tenantId)
          .where("status", "==", "active")
      ),
      countQuery(
        adminDb
          .collection("agents")
          .where("tenantId", "==", tenantId)
          .where("status", "==", "active")
      ),
      countQuery(
        adminDb
          .collection("sites")
          .where("tenantId", "==", tenantId)
          .where("isActive", "==", true)
      ),
      countQuery(adminDb.collection("clients").where("tenantId", "==", tenantId)),
      countTenantVacationsMonth(tenantId, monthRange.from, monthRange.to),
      countTenantOpenIncidents(tenantId),
      adminDb.collection("tenantUsers").where("tenantId", "==", tenantId).limit(50).get(),
      getSubscription(tenantId),
      adminDb
        .collection("platformSupportSessions")
        .where("tenantId", "==", tenantId)
        .limit(20)
        .get(),
      adminDb
        .collection("platformOwnerInvitations")
        .where("tenantId", "==", tenantId)
        .limit(10)
        .get(),
    ]);

    const plan = await getPlan(subscription.planId);
    const limits = computeEffectiveLimits(plan, subscription);
    const supportSessions = supportSessionsSnap.docs
      .map(supportSessionRow)
      .sort((left, right) => {
        const leftRank = left.status === "active" ? 1 : 0;
        const rightRank = right.status === "active" ? 1 : 0;
        if (leftRank !== rightRank) return rightRank - leftRank;
        return toMillis(right.startedAtIso) - toMillis(left.startedAtIso);
      });
    const ownerInvitations = ownerInvitationsSnap.docs
      .map(ownerInvitationRow)
      .sort((left, right) => toMillis(right.createdAtIso) - toMillis(left.createdAtIso));
    const tenantUsers = usersSnap.docs.map(userRow);
    const onboarding = buildOnboardingSnapshot({
      tenantData,
      tenantId,
      users: tenantUsers,
      ownerInvitations,
      clients,
      sites,
    });

    const risk = riskForTenant({
      status,
      users,
      agents,
      sites,
      openIncidents,
    });

    const signals = [
      ...(risk.riskReasons.length > 0
        ? [
            {
              id: "tenant-risk",
              tone: risk.riskLevel === "critical" ? "critical" : "warning",
              title: "Contrôle support conseille",
              detail: risk.riskReasons.join(" | "),
            },
          ]
        : [
            {
              id: "tenant-ok",
              tone: "info",
              title: "Agence stable",
              detail: "Aucun signal bloquant détecté sur les volumes principaux.",
            },
          ]),
      {
        id: "support-guardrail",
        tone: "info",
        title: "Acces support protégé",
        detail:
          "Toute future intervention dans l'espace agence devra exiger un motif et alimenter platformAuditLog.",
      },
    ];

    const auditLog = await listPlatformAuditEvents({ tenantId, limit: 10 }).catch((auditError) => {
      console.warn("[platform.tenant] audit log unavailable", {
        error: auditError instanceof Error ? auditError.message : String(auditError),
      });
      return [];
    });

    return json(200, {
      ok: true,
      generatedAtIso: new Date().toISOString(),
      tenant: {
        id: tenantId,
        name: tenantName(tenantId, tenantData),
        status,
        plan: tenantPlan(tenantData),
        ownerEmail: tenantOwnerEmail(tenantData),
        createdAtIso: toIso(tenantData.createdAt),
        updatedAtIso: toIso(tenantData.updatedAt),
      },
      counters: {
        users,
        agents,
        sites,
        clients,
        vacationsMonth,
        openIncidents,
      },
      billing: serializeBilling({ plan, subscription, limits }),
      risk,
      onboarding,
      users: tenantUsers,
      supportSessions,
      ownerInvitations,
      signals,
      auditLog,
    });
  } catch (error) {
    console.error("[platform.tenant] error", error);
    return json(500, {
      ok: false,
      error: "Impossible de charger la fiche agence SaaS.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!isSuperAdmin(auth.role)) {
    return forbidden("Super admin SaaS required");
  }

  const { id: rawId } = await ctx.params;
  const tenantId = decodeURIComponent(rawId ?? "").trim();
  if (!tenantId) {
    return json(400, { ok: false, error: "tenantId is required" });
  }

  try {
    const body = (await req.json().catch(() => null)) as
      | Record<string, unknown>
      | null;

    if (!body) {
      return json(400, { ok: false, error: "Payload JSON requis." });
    }

    const action = text(body.action).toLowerCase();
    const targetPlanId = readPlanId(body.planId);

    if (action === "change_plan" || targetPlanId) {
      if (!targetPlanId) {
        return json(400, {
          ok: false,
          error: "Plan cible invalide. Utilisez free, starter, pro ou growth.",
        });
      }

      const reason = text(body.reason);
      if (reason.length < 12) {
        return json(400, {
          ok: false,
          error: "Motif obligatoire de 12 caracteres minimum.",
        });
      }

      const confirmation = text(body.confirmation).toUpperCase();
      if (confirmation !== "CHANGER PLAN") {
        return json(400, {
          ok: false,
          error: "Confirmation invalide. Tapez CHANGER PLAN.",
        });
      }

      const tenantRef = adminDb.collection("tenants").doc(tenantId);
      const subscriptionRef = adminDb.collection("subscriptions").doc(tenantId);
      const auditRef = adminDb.collection("platformAuditLog").doc();
      const nextPlan = await getPlan(targetPlanId);
      const nextLimits = computeEffectiveLimits(nextPlan, {
        planId: targetPlanId,
        status: "active",
        addons: { multiTenant: targetPlanId === "growth" },
      });

      let result: {
        tenantId: string;
        tenantName: string;
        previousPlanId: string;
        planId: PlanId;
        auditId: string;
      } | null = null;

      await adminDb.runTransaction(async (tx) => {
        const [tenantSnap, subscriptionSnap] = await Promise.all([
          tx.get(tenantRef),
          tx.get(subscriptionRef),
        ]);

        if (!tenantSnap.exists) {
          throw httpError("Agence SaaS introuvable.", 404);
        }

        const tenantData = tenantSnap.data() as Record<string, unknown>;
        const tenantDisplayName = tenantName(tenantId, tenantData);
        const previousSubscription = subscriptionSnap.exists
          ? (subscriptionSnap.data() as Record<string, unknown>)
          : null;
        const previousPlanId = text(previousSubscription?.planId) || text(tenantData.planId) || "free";
        const previousPlanName = text(previousSubscription?.planName) || tenantPlan(tenantData);

        if (previousPlanId === targetPlanId) {
          throw httpError("Agence deja sur le plan " + nextPlan.name + ".", 409);
        }

        const addons = {
          ...((previousSubscription?.addons as Record<string, unknown> | undefined) ?? {}),
          multiTenant: targetPlanId === "growth"
            ? true
            : Boolean((previousSubscription?.addons as Record<string, unknown> | undefined)?.multiTenant),
        };

        const subscriptionPatch = {
          planId: targetPlanId,
          planName: nextPlan.name,
          status: "active",
          addons,
          effectiveLimits: nextLimits,
          changedAt: FieldValue.serverTimestamp(),
          changedBy: auth.uid,
          updatedAt: FieldValue.serverTimestamp(),
        };

        tx.set(subscriptionRef, subscriptionPatch, { merge: true });
        tx.set(
          tenantRef,
          {
            planId: targetPlanId,
            planName: nextPlan.name,
            subscription: {
              planId: targetPlanId,
              planName: nextPlan.name,
              status: "active",
              updatedAt: FieldValue.serverTimestamp(),
              updatedBy: auth.uid,
            },
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: auth.uid,
          },
          { merge: true }
        );

        tx.set(auditRef, {
          action: "tenant.change_plan",
          actionLabel: "Changement plan SaaS",
          tenantId,
          tenantName: tenantDisplayName,
          actor: {
            uid: auth.uid,
            email: auth.email,
            role: auth.role,
          },
          reason,
          status: "applied",
          tone: "warning",
          metadata: {
            previousPlanId,
            previousPlanName,
            nextPlanId: targetPlanId,
            nextPlanName: nextPlan.name,
            nextLimits,
            confirmation,
          },
          createdAt: FieldValue.serverTimestamp(),
        });

        result = {
          tenantId,
          tenantName: tenantDisplayName,
          previousPlanId,
          planId: targetPlanId,
          auditId: auditRef.id,
        };
      });

      return json(200, {
        ok: true,
        result,
      });
    }

    if (action === "activate_tenant") {
      const reason = text(body.reason);
      if (reason.length < 12) {
        return json(400, {
          ok: false,
          error: "Motif obligatoire de 12 caracteres minimum.",
        });
      }

      const confirmation = text(body.confirmation).toUpperCase();
      if (confirmation !== "ACTIVER AGENCE") {
        return json(400, {
          ok: false,
          error: "Confirmation invalide. Tapez ACTIVER AGENCE.",
        });
      }

      const tenantRef = adminDb.collection("tenants").doc(tenantId);
      const subscriptionRef = adminDb.collection("subscriptions").doc(tenantId);
      const auditRef = adminDb.collection("platformAuditLog").doc();
      const [
        tenantSnap,
        usersSnap,
        ownerInvitationsSnap,
        clients,
        sites,
      ] = await Promise.all([
        tenantRef.get(),
        adminDb.collection("tenantUsers").where("tenantId", "==", tenantId).limit(50).get(),
        adminDb
          .collection("platformOwnerInvitations")
          .where("tenantId", "==", tenantId)
          .limit(10)
          .get(),
        countQuery(adminDb.collection("clients").where("tenantId", "==", tenantId)),
        countQuery(
          adminDb
            .collection("sites")
            .where("tenantId", "==", tenantId)
            .where("isActive", "==", true)
        ),
      ]);

      if (!tenantSnap.exists) {
        return json(404, { ok: false, error: "Agence SaaS introuvable." });
      }

      const tenantData = tenantSnap.data() as Record<string, unknown>;
      const previousStatus = text(tenantData.status, "pending_setup").toLowerCase();
      if (previousStatus === "active") {
        return json(409, {
          ok: false,
          error: "Agence deja active.",
        });
      }

      const ownerInvitations = ownerInvitationsSnap.docs
        .map(ownerInvitationRow)
        .sort((left, right) => toMillis(right.createdAtIso) - toMillis(left.createdAtIso));
      const tenantUsers = usersSnap.docs.map(userRow);
      const onboarding = buildOnboardingSnapshot({
        tenantData,
        tenantId,
        users: tenantUsers,
        ownerInvitations,
        clients,
        sites,
      });

      if (!onboarding.readyToActivate) {
        return json(409, {
          ok: false,
          error: "Agence incomplète. Terminez la checklist d'activation.",
          onboarding,
        });
      }

      const tenantDisplayName = tenantName(tenantId, tenantData);
      const subscriptionSnap = await subscriptionRef.get();
      const currentSubscription = subscriptionSnap.exists
        ? (subscriptionSnap.data() as Record<string, unknown>)
        : null;

      await adminDb.runTransaction(async (tx) => {
        const freshTenantSnap = await tx.get(tenantRef);
        if (!freshTenantSnap.exists) {
          throw httpError("Agence SaaS introuvable.", 404);
        }

        const now = FieldValue.serverTimestamp();
        tx.set(
          tenantRef,
          {
            status: "active",
            onboarding: {
              status: "active",
              ownerEmail: onboarding.ownerEmail,
              ownerUid: onboarding.ownerUid,
              activatedAt: now,
              activatedBy: auth.uid,
              activationReason: reason,
              completion: onboarding.completion,
            },
            updatedAt: now,
            updatedBy: auth.uid,
          },
          { merge: true }
        );

        tx.set(
          subscriptionRef,
          {
            planId: text(currentSubscription?.planId) || text(tenantData.planId) || "free",
            planName: text(currentSubscription?.planName) || tenantPlan(tenantData),
            status: "active",
            activatedAt: now,
            activatedBy: auth.uid,
            updatedAt: now,
          },
          { merge: true }
        );

        tx.set(auditRef, {
          action: "tenant.activate",
          actionLabel: "Activation agence SaaS",
          tenantId,
          tenantName: tenantDisplayName,
          actor: {
            uid: auth.uid,
            email: auth.email,
            role: auth.role,
          },
          reason,
          status: "applied",
          tone: "info",
          metadata: {
            previousStatus,
            nextStatus: "active",
            onboarding,
            confirmation,
          },
          createdAt: now,
        });
      });

      return json(200, {
        ok: true,
        result: {
          tenantId,
          tenantName: tenantDisplayName,
          previousStatus,
          status: "active",
          onboarding,
          auditId: auditRef.id,
        },
      });
    }

    if (action === "invite_owner") {
      const reason = text(body.reason);
      if (reason.length < 12) {
        return json(400, {
          ok: false,
          error: "Motif obligatoire de 12 caracteres minimum.",
        });
      }

      const confirmation = text(body.confirmation).toUpperCase();
      if (confirmation !== "INVITER OWNER") {
        return json(400, {
          ok: false,
          error: "Confirmation invalide. Tapez INVITER OWNER.",
        });
      }

      const tenantRef = adminDb.collection("tenants").doc(tenantId);
      const tenantSnap = await tenantRef.get();
      if (!tenantSnap.exists) {
        return json(404, { ok: false, error: "Agence SaaS introuvable." });
      }

      const tenantData = tenantSnap.data() as Record<string, unknown>;
      const ownerEmail = normalizeEmail(body.ownerEmail) ?? normalizeEmail(tenantOwnerEmail(tenantData));
      if (!ownerEmail) {
        return json(400, {
          ok: false,
          error: "Email propriétaire invalide.",
        });
      }

      const ownerName =
        text(body.ownerName) ||
        text((tenantData.owner as Record<string, unknown> | undefined)?.name) ||
        "Propriétaire " + tenantName(tenantId, tenantData);

      let createdAuthUser = false;
      let targetUid = "";
      let authDisplayName: string | null = null;

      try {
        try {
          const existingUser = await adminAuth.getUserByEmail(ownerEmail);
          targetUid = existingUser.uid;
          authDisplayName = existingUser.displayName ?? null;
        } catch (error) {
          if (!isFirebaseUserNotFound(error)) throw error;

          const createdUser = await adminAuth.createUser({
            email: ownerEmail,
            displayName: ownerName,
            disabled: false,
            emailVerified: false,
          });

          createdAuthUser = true;
          targetUid = createdUser.uid;
          authDisplayName = createdUser.displayName ?? null;
        }

        if (targetUid === auth.uid) {
          if (createdAuthUser) {
            await adminAuth.deleteUser(targetUid).catch(() => undefined);
          }

          return json(400, {
            ok: false,
            error: "Vous ne pouvez pas inviter votre propre compte super admin comme propriétaire agence.",
          });
        }

        const finalName = ownerName || authDisplayName || ownerEmail;
        const userRef = adminDb.collection("tenantUsers").doc(targetUid);
        const invitationRef = adminDb.collection("platformOwnerInvitations").doc();
        const auditRef = adminDb.collection("platformAuditLog").doc();

        try {
          await adminDb.runTransaction(async (tx) => {
            const [freshTenantSnap, existingUserSnap] = await Promise.all([
              tx.get(tenantRef),
              tx.get(userRef),
            ]);

            if (!freshTenantSnap.exists) {
              throw httpError("Agence SaaS introuvable.", 404);
            }

            const existingUser = existingUserSnap.exists
              ? (existingUserSnap.data() as Record<string, unknown>)
              : null;
            const existingTenantId = text(existingUser?.tenantId);

            if (existingTenantId && existingTenantId !== tenantId) {
              throw httpError("Cet email est deja rattaché à une autre agence.", 409);
            }

            const freshTenantData = freshTenantSnap.data() as Record<string, unknown>;
            const tenantDisplayName = tenantName(tenantId, freshTenantData);
            const now = FieldValue.serverTimestamp();

            tx.set(
              userRef,
              {
                uid: targetUid,
                tenantId,
                email: ownerEmail,
                name: finalName,
                role: "owner",
                status: "active",
                invitedByUid: auth.uid,
                invitedByEmail: auth.email ?? null,
                invitedByName: auth.name ?? null,
                invitedAt: now,
                updatedAt: now,
                ...(existingUserSnap.exists ? {} : { createdAt: now }),
              },
              { merge: true }
            );

            tx.set(
              tenantRef,
              {
                ownerEmail,
                ownerUid: targetUid,
                owner: {
                  uid: targetUid,
                  email: ownerEmail,
                  name: finalName,
                },
                onboarding: {
                  status: "owner_invited",
                  ownerEmail,
                  ownerUid: targetUid,
                  ownerName: finalName,
                  invitedAt: now,
                  invitedBy: auth.uid,
                },
                updatedAt: now,
                updatedBy: auth.uid,
              },
              { merge: true }
            );

            tx.set(invitationRef, {
              tenantId,
              tenantName: tenantDisplayName,
              uid: targetUid,
              email: ownerEmail,
              name: finalName,
              status: "prépared",
              role: "owner",
              createdAuthUser,
              resetLinkCreated: false,
              actor: {
                uid: auth.uid,
                email: auth.email,
                role: auth.role,
              },
              reason,
              createdAt: now,
            });

            tx.set(auditRef, {
              action: "tenant.owner.invite",
              actionLabel: "Invitation propriétaire agence",
              tenantId,
              tenantName: tenantDisplayName,
              actor: {
                uid: auth.uid,
                email: auth.email,
                role: auth.role,
              },
              reason,
              status: "applied",
              tone: "info",
              metadata: {
                ownerEmail,
                ownerUid: targetUid,
                ownerName: finalName,
                createdAuthUser,
                invitationId: invitationRef.id,
                confirmation,
              },
              createdAt: now,
            });
          });
        } catch (error) {
          if (createdAuthUser) {
            try {
              await adminAuth.deleteUser(targetUid);
            } catch (cleanupError) {
              console.warn("[platform.owner.invite] orphan auth cleanup skipped", cleanupError);
            }
          }

          throw error;
        }

        let resetLink: string | null = null;
        let resetLinkError: string | null = null;

        try {
          resetLink = await adminAuth.generatePasswordResetLink(ownerEmail, {
            url: getAppBaseUrl() + "/login",
            handleCodeInApp: false,
          });
        } catch (error) {
          resetLinkError = error instanceof Error ? error.message : String(error);
          console.warn("[platform.owner.invite] reset link skipped", error);
        }

        await invitationRef.set(
          {
            resetLinkCreated: Boolean(resetLink),
            resetLinkError: resetLinkError ?? null,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        try {
          await adminAuth.updateUser(targetUid, {
            displayName: finalName,
            disabled: false,
          });
        } catch (error) {
          console.warn("[platform.owner.invite] auth profile sync skipped", error);
        }

        return json(createdAuthUser ? 201 : 200, {
          ok: true,
          result: {
            uid: targetUid,
            email: ownerEmail,
            name: finalName,
            role: "owner",
            createdAuthUser,
            resetLink,
            resetLinkError,
            invitationId: invitationRef.id,
            message: resetLink
              ? "Invitation propriétaire préparée. Envoyez le lien d'activation."
              : "Invitation propriétaire préparée. Lien d'activation indisponible.",
          },
        });
      } catch (error) {
        throw error;
      }
    }

    if (action === "open_support_session") {
      const reason = text(body.reason);
      if (reason.length < 12) {
        return json(400, {
          ok: false,
          error: "Motif obligatoire de 12 caracteres minimum.",
        });
      }

      const confirmation = text(body.confirmation).toUpperCase();
      if (confirmation !== "OUVRIR SUPPORT") {
        return json(400, {
          ok: false,
          error: "Confirmation invalide. Tapez OUVRIR SUPPORT.",
        });
      }

      const scope = readSupportScope(body.scope);
      const durationMinutes = readDurationMinutes(body.durationMinutes);
      const tenantRef = adminDb.collection("tenants").doc(tenantId);
      const supportSessionRef = adminDb.collection("platformSupportSessions").doc();
      const auditRef = adminDb.collection("platformAuditLog").doc();
      const expiresAt = new Date(Date.now() + durationMinutes * 60_000);

      let result: {
        tenantId: string;
        tenantName: string;
        supportSessionId: string;
        scope: string;
        expiresAtIso: string;
        auditId: string;
      } | null = null;

      await adminDb.runTransaction(async (tx) => {
        const tenantSnap = await tx.get(tenantRef);
        if (!tenantSnap.exists) {
          throw httpError("Agence SaaS introuvable.", 404);
        }

        const tenantData = tenantSnap.data() as Record<string, unknown>;
        const tenantDisplayName = tenantName(tenantId, tenantData);

        tx.set(supportSessionRef, {
          tenantId,
          tenantName: tenantDisplayName,
          actor: {
            uid: auth.uid,
            email: auth.email,
            role: auth.role,
          },
          reason,
          scope,
          durationMinutes,
          status: "active",
          readOnly: true,
          impersonation: false,
          startedAt: FieldValue.serverTimestamp(),
          expiresAt,
          createdAt: FieldValue.serverTimestamp(),
        });

        tx.set(auditRef, {
          action: "tenant.support_session.open",
          actionLabel: "Ouverture session support",
          tenantId,
          tenantName: tenantDisplayName,
          actor: {
            uid: auth.uid,
            email: auth.email,
            role: auth.role,
          },
          reason,
          status: "applied",
          tone: "info",
          metadata: {
            supportSessionId: supportSessionRef.id,
            scope,
            durationMinutes,
            readOnly: true,
            impersonation: false,
            expiresAtIso: expiresAt.toISOString(),
            confirmation,
          },
          createdAt: FieldValue.serverTimestamp(),
        });

        result = {
          tenantId,
          tenantName: tenantDisplayName,
          supportSessionId: supportSessionRef.id,
          scope,
          expiresAtIso: expiresAt.toISOString(),
          auditId: auditRef.id,
        };
      });

      return json(200, {
        ok: true,
        result,
      });
    }

    if (action === "close_support_session") {
      const supportSessionId = text(body.supportSessionId);
      if (!supportSessionId) {
        return json(400, {
          ok: false,
          error: "supportSessionId requis.",
        });
      }

      const reason = text(body.reason);
      if (reason.length < 12) {
        return json(400, {
          ok: false,
          error: "Motif obligatoire de 12 caracteres minimum.",
        });
      }

      const confirmation = text(body.confirmation).toUpperCase();
      if (confirmation !== "CLOTURER SUPPORT") {
        return json(400, {
          ok: false,
          error: "Confirmation invalide. Tapez CLOTURER SUPPORT.",
        });
      }

      const tenantRef = adminDb.collection("tenants").doc(tenantId);
      const supportSessionRef = adminDb
        .collection("platformSupportSessions")
        .doc(supportSessionId);
      const auditRef = adminDb.collection("platformAuditLog").doc();

      let result: {
        tenantId: string;
        tenantName: string;
        supportSessionId: string;
        previousStatus: string;
        status: "closed";
        auditId: string;
      } | null = null;

      await adminDb.runTransaction(async (tx) => {
        const [tenantSnap, supportSessionSnap] = await Promise.all([
          tx.get(tenantRef),
          tx.get(supportSessionRef),
        ]);

        if (!tenantSnap.exists) {
          throw httpError("Agence SaaS introuvable.", 404);
        }
        if (!supportSessionSnap.exists) {
          throw httpError("Session support introuvable.", 404);
        }

        const tenantData = tenantSnap.data() as Record<string, unknown>;
        const sessionData = supportSessionSnap.data() as Record<string, unknown>;
        const sessionTenantId = text(sessionData.tenantId);
        if (sessionTenantId !== tenantId) {
          throw httpError("Session support rattachée à une autre agence.", 403);
        }

        const previousStatus = text(sessionData.status, "active").toLowerCase();
        if (previousStatus === "closed") {
          throw httpError("Session support deja clôturée.", 409);
        }

        const tenantDisplayName = tenantName(tenantId, tenantData);

        tx.set(
          supportSessionRef,
          {
            status: "closed",
            closedAt: FieldValue.serverTimestamp(),
            closedBy: auth.uid,
            closeReason: reason,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        tx.set(auditRef, {
          action: "tenant.support_session.close",
          actionLabel: "Cloture session support",
          tenantId,
          tenantName: tenantDisplayName,
          actor: {
            uid: auth.uid,
            email: auth.email,
            role: auth.role,
          },
          reason,
          status: "applied",
          tone: "info",
          metadata: {
            supportSessionId,
            previousStatus,
            nextStatus: "closed",
            confirmation,
          },
          createdAt: FieldValue.serverTimestamp(),
        });

        result = {
          tenantId,
          tenantName: tenantDisplayName,
          supportSessionId,
          previousStatus,
          status: "closed",
          auditId: auditRef.id,
        };
      });

      return json(200, {
        ok: true,
        result,
      });
    }

    const targetStatus = readTenantStatusAction(body.status);
    if (!targetStatus) {
      return json(400, {
        ok: false,
        error: "Statut cible invalide. Utilisez active ou suspended.",
      });
    }

    const reason = text(body.reason);
    if (reason.length < 12) {
      return json(400, {
        ok: false,
        error: "Motif obligatoire de 12 caracteres minimum.",
      });
    }

    const expectedConfirmation = confirmationForStatus(targetStatus);
    const confirmation = text(body.confirmation).toUpperCase();
    if (confirmation !== expectedConfirmation) {
      return json(400, {
        ok: false,
        error: "Confirmation invalide. Tapez " + expectedConfirmation + ".",
      });
    }

    const tenantRef = adminDb.collection("tenants").doc(tenantId);
    const auditRef = adminDb.collection("platformAuditLog").doc();

    let result: {
      tenantId: string;
      tenantName: string;
      previousStatus: string;
      status: "active" | "suspended";
      auditId: string;
    } | null = null;

    await adminDb.runTransaction(async (tx) => {
      const tenantSnap = await tx.get(tenantRef);
      if (!tenantSnap.exists) {
        throw httpError("Agence SaaS introuvable.", 404);
      }

      const tenantData = tenantSnap.data() as Record<string, unknown>;
      const previousStatus = text(tenantData.status, "active").toLowerCase();
      const tenantDisplayName = tenantName(tenantId, tenantData);

      if (previousStatus === targetStatus) {
        throw httpError("Agence deja dans le statut " + targetStatus + ".", 409);
      }

      const statusPatch: Record<string, unknown> = {
        status: targetStatus,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: auth.uid,
      };

      if (targetStatus === "suspended") {
        statusPatch.suspendedAt = FieldValue.serverTimestamp();
        statusPatch.suspendedBy = auth.uid;
        statusPatch.suspensionReason = reason;
      } else {
        statusPatch.reactivatedAt = FieldValue.serverTimestamp();
        statusPatch.reactivatedBy = auth.uid;
        statusPatch.reactivationReason = reason;
        statusPatch.suspendedAt = FieldValue.delete();
        statusPatch.suspendedBy = FieldValue.delete();
        statusPatch.suspensionReason = FieldValue.delete();
      }

      tx.update(tenantRef, statusPatch);

      tx.set(auditRef, {
        action:
          targetStatus === "suspended"
            ? "tenant.suspend"
            : "tenant.reactivate",
        actionLabel:
          targetStatus === "suspended"
            ? "Suspension agence SaaS"
            : "Reactivation agence SaaS",
        tenantId,
        tenantName: tenantDisplayName,
        actor: {
          uid: auth.uid,
          email: auth.email,
          role: auth.role,
        },
        reason,
        status: "applied",
        tone: targetStatus === "suspended" ? "critical" : "info",
        metadata: {
          previousStatus,
          nextStatus: targetStatus,
          confirmation,
        },
        createdAt: FieldValue.serverTimestamp(),
      });

      result = {
        tenantId,
        tenantName: tenantDisplayName,
        previousStatus,
        status: targetStatus,
        auditId: auditRef.id,
      };
    });

    return json(200, {
      ok: true,
      result,
    });
  } catch (error) {
    const status =
      typeof (error as { status?: unknown }).status === "number"
        ? ((error as { status: number }).status)
        : 500;

    console.error("[platform.tenant.PATCH] error", error);
    return json(status, {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Impossible de modifier le statut agence SaaS.",
    });
  }
}

