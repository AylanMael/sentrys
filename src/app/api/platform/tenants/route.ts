import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import {
  forbidden,
  isSuperAdmin,
  requireTenantUser,
} from "@/app/api/_utils/withTenant";
import { computeEffectiveLimits, getPlan } from "@/lib/billing/limits";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

type PlatformPlanId = "free" | "starter" | "pro" | "growth";

const PLATFORM_PLAN_IDS: PlatformPlanId[] = ["free", "starter", "pro", "growth"];

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function text(value: unknown, fallback = "") {
  const str = String(value ?? "").trim();
  return str || fallback;
}

function readPlanId(value: unknown): PlatformPlanId | null {
  const planId = text(value, "starter").toLowerCase();
  return PLATFORM_PLAN_IDS.includes(planId as PlatformPlanId)
    ? (planId as PlatformPlanId)
    : null;
}

function normalizeEmail(value: unknown) {
  const email = text(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 44);
}

async function buildTenantId(name: string) {
  const base = slugify(name) || "agence";

  for (let index = 0; index < 20; index += 1) {
    const candidate = index === 0 ? base : base + "-" + (index + 1);
    const snap = await adminDb.collection("tenants").doc(candidate).get();
    if (!snap.exists) return candidate;
  }

  return base + "-" + Date.now().toString(36);
}

export async function POST(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!isSuperAdmin(auth.role)) {
    return forbidden("Super admin SaaS required");
  }

  try {
    const body = (await req.json().catch(() => null)) as
      | Record<string, unknown>
      | null;

    if (!body) {
      return json(400, { ok: false, error: "Payload JSON requis." });
    }

    const name = text(body.name);
    if (name.length < 2) {
      return json(400, {
        ok: false,
        error: "Nom d'agence obligatoire.",
      });
    }

    const ownerEmail = normalizeEmail(body.ownerEmail);
    if (!ownerEmail) {
      return json(400, {
        ok: false,
        error: "Email propriétaire invalide.",
      });
    }

    const planId = readPlanId(body.planId);
    if (!planId) {
      return json(400, {
        ok: false,
        error: "Plan initial invalide. Utilisez free, starter, pro ou growth.",
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
    if (confirmation !== "CREER AGENCE") {
      return json(400, {
        ok: false,
        error: "Confirmation invalide. Tapez CREER AGENCE.",
      });
    }

    const tenantId = await buildTenantId(name);
    const plan = await getPlan(planId);
    const addons = { multiTenant: planId === "growth" };
    const limits = computeEffectiveLimits(plan, {
      planId,
      status: "trialing",
      addons,
    });

    const tenantRef = adminDb.collection("tenants").doc(tenantId);
    const subscriptionRef = adminDb.collection("subscriptions").doc(tenantId);
    const usageRef = adminDb.collection("usage").doc(tenantId);
    const auditRef = adminDb.collection("platformAuditLog").doc();

    await adminDb.runTransaction(async (tx) => {
      const existingTenant = await tx.get(tenantRef);
      if (existingTenant.exists) {
        throw new Error("TENANT_ALREADY_EXISTS");
      }

      tx.create(tenantRef, {
        name,
        companyName: name,
        displayName: name,
        ownerEmail,
        email: ownerEmail,
        owner: {
          email: ownerEmail,
        },
        status: "pending_setup",
        planId,
        planName: plan.name,
        subscription: {
          planId,
          planName: plan.name,
          status: "trialing",
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: auth.uid,
        },
        onboarding: {
          status: "owner_to_invite",
          ownerEmail,
          createdFrom: "platform",
          createdBy: auth.uid,
        },
        createdAt: FieldValue.serverTimestamp(),
        createdBy: auth.uid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: auth.uid,
      });

      tx.set(subscriptionRef, {
        planId,
        planName: plan.name,
        status: "trialing",
        addons,
        effectiveLimits: limits,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: auth.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });

      tx.set(usageRef, {
        agents: 0,
        sites: 0,
        activeTenants: 1,
        updatedAt: FieldValue.serverTimestamp(),
      });

      tx.set(auditRef, {
        action: "tenant.create",
        actionLabel: "Création agence SaaS",
        tenantId,
        tenantName: name,
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
          planId,
          planName: plan.name,
          limits,
          confirmation,
          onboardingStatus: "owner_to_invite",
        },
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    return json(201, {
      ok: true,
      tenant: {
        id: tenantId,
        name,
        ownerEmail,
        status: "pending_setup",
        planId,
        planName: plan.name,
        limits,
      },
    });
  } catch (error) {
    const alreadyExists =
      error instanceof Error && error.message === "TENANT_ALREADY_EXISTS";

    console.error("[platform.tenants.POST] error", error);
    return json(alreadyExists ? 409 : 500, {
      ok: false,
      error: alreadyExists
        ? "Une agence avec cet identifiant existe deja."
        : "Impossible de créer l'agence SaaS.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
