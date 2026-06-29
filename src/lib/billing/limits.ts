// src/lib/billing/limits.ts
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export type LimitKind = "agents" | "sites" | "tenants";

export type Plan = {
  id: string;
  name: string;
  active: boolean;
  priceMonthlyCents?: number;
  baseLimits: { agents: number; sites: number; tenants: number };
  features?: Record<string, boolean>;
};

export type Subscription = {
  planId: string;
  status: "trialing" | "active" | "past_due" | "canceled" | "incomplete" | "incomplete_expired";
  addons?: {
    extraAgents?: number;
    extraSites?: number;
    extraTenants?: number;
    multiTenant?: boolean; // option vendable
  };
  effectiveLimits?: { agents: number; sites: number; tenants: number }; // snapshot optionnel
  periodStart?: any;
  periodEnd?: any;
  stripeCustomerId?: string;
  stripeSubId?: string;
};

export type Usage = {
  agents: number;
  sites: number;
  activeTenants: number; // utile quand on vend le multi-tenant
  updatedAt?: any;
};

const DEFAULT_PLANS: Record<string, Plan> = {
  free: {
    id: "free",
    name: "Free",
    active: true,
    priceMonthlyCents: 0,
    baseLimits: { agents: 5, sites: 2, tenants: 1 },
    features: { vacations: true, incidents: true, reporting: false },
  },
  starter: {
    id: "starter",
    name: "Starter",
    active: true,
    priceMonthlyCents: 1900,
    baseLimits: { agents: 15, sites: 5, tenants: 1 },
    features: { vacations: true, incidents: true, reporting: true },
  },
  pro: {
    id: "pro",
    name: "Pro",
    active: true,
    priceMonthlyCents: 4900,
    baseLimits: { agents: 25, sites: 10, tenants: 1 },
    features: { vacations: true, incidents: true, reporting: true },
  },
  growth: {
    id: "growth",
    name: "Growth",
    active: true,
    priceMonthlyCents: 9900,
    baseLimits: { agents: 60, sites: 25, tenants: 2 },
    features: { vacations: true, incidents: true, reporting: true },
  },
};

function clampInt(v: unknown, def = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.floor(n);
}

function max0(n: number) {
  return n < 0 ? 0 : n;
}

function envLimit(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function applyLocalDevelopmentLimits(input: {
  agents: number;
  sites: number;
  tenants: number;
}) {
  if (process.env.NODE_ENV === "production") return input;

  return {
    agents: Math.max(input.agents, envLimit("SENTRYS_DEV_LIMIT_AGENTS", 100)),
    sites: Math.max(input.sites, envLimit("SENTRYS_DEV_LIMIT_SITES", 50)),
    tenants: Math.max(input.tenants, envLimit("SENTRYS_DEV_LIMIT_TENANTS", 3)),
  };
}

/**
 * Charge un plan :
 * 1) tente Firestore `plans/{planId}`
 * 2) fallback sur DEFAULT_PLANS
 */
export async function getPlan(planId: string): Promise<Plan> {
  const id = String(planId || "free").trim() || "free";

  try {
    const snap = await adminDb.collection("plans").doc(id).get();
    if (snap.exists) {
      const p = snap.data() as any;
      return {
        id,
        name: String(p?.name ?? id),
        active: Boolean(p?.active ?? true),
        priceMonthlyCents: p?.priceMonthlyCents ?? undefined,
        baseLimits: {
          agents: clampInt(p?.baseLimits?.agents, DEFAULT_PLANS.free.baseLimits.agents),
          sites: clampInt(p?.baseLimits?.sites, DEFAULT_PLANS.free.baseLimits.sites),
          tenants: clampInt(p?.baseLimits?.tenants, DEFAULT_PLANS.free.baseLimits.tenants),
        },
        features: p?.features ?? {},
      };
    }
  } catch {
    // ignore, fallback
  }

  return DEFAULT_PLANS[id] ?? DEFAULT_PLANS.free;
}

/**
 * Charge la subscription d'un tenant.
 * Si absente : retourne une "free" active.
 */
export async function getSubscription(tenantId: string): Promise<Subscription> {
  const tid = String(tenantId || "").trim();
  if (!tid) {
    // devrait jamais arriver, mais on sécurise
    return { planId: "free", status: "active", addons: { multiTenant: false } };
  }

  const snap = await adminDb.collection("subscriptions").doc(tid).get();
  if (!snap.exists) {
    return { planId: "free", status: "active", addons: { multiTenant: false } };
  }

  const s = snap.data() as any;
  return {
    planId: String(s?.planId ?? "free"),
    status: (String(s?.status ?? "active") as any) || "active",
    addons: {
      extraAgents: clampInt(s?.addons?.extraAgents, 0),
      extraSites: clampInt(s?.addons?.extraSites, 0),
      extraTenants: clampInt(s?.addons?.extraTenants, 0),
      multiTenant: Boolean(s?.addons?.multiTenant ?? false),
    },
    effectiveLimits: s?.effectiveLimits
      ? {
          agents: clampInt(s.effectiveLimits.agents, 0),
          sites: clampInt(s.effectiveLimits.sites, 0),
          tenants: clampInt(s.effectiveLimits.tenants, 0),
        }
      : undefined,
    periodStart: s?.periodStart,
    periodEnd: s?.periodEnd,
    stripeCustomerId: s?.stripeCustomerId,
    stripeSubId: s?.stripeSubId,
  };
}

export function computeEffectiveLimits(plan: Plan, sub: Subscription) {
  // si snapshot existe, on peut s'en servir (pratique)
  if (sub.effectiveLimits) {
    return applyLocalDevelopmentLimits({
      agents: max0(clampInt(sub.effectiveLimits.agents, plan.baseLimits.agents)),
      sites: max0(clampInt(sub.effectiveLimits.sites, plan.baseLimits.sites)),
      tenants: max0(clampInt(sub.effectiveLimits.tenants, plan.baseLimits.tenants)),
    });
  }

  const extraAgents = max0(clampInt(sub.addons?.extraAgents, 0));
  const extraSites = max0(clampInt(sub.addons?.extraSites, 0));
  const extraTenants = max0(clampInt(sub.addons?.extraTenants, 0));

  // multi-tenant : vendu en option. Si non activé, on force tenants = 1.
  const multiTenantEnabled = Boolean(sub.addons?.multiTenant);

  return applyLocalDevelopmentLimits({
    agents: max0(plan.baseLimits.agents + extraAgents),
    sites: max0(plan.baseLimits.sites + extraSites),
    tenants: max0((multiTenantEnabled ? plan.baseLimits.tenants + extraTenants : 1)),
  });
}

/**
 * Usage doc: `usage/{tenantId}`
 * créé si absent.
 */
export async function getUsage(tenantId: string): Promise<Usage> {
  const ref = adminDb.collection("usage").doc(tenantId);
  const snap = await ref.get();
  if (!snap.exists) {
    const init: Usage = { agents: 0, sites: 0, activeTenants: 1, updatedAt: FieldValue.serverTimestamp() };
    await ref.set(init, { merge: true });
    return { agents: 0, sites: 0, activeTenants: 1 };
  }
  const u = snap.data() as any;
  return {
    agents: clampInt(u?.agents, 0),
    sites: clampInt(u?.sites, 0),
    activeTenants: clampInt(u?.activeTenants, 1),
    updatedAt: u?.updatedAt,
  };
}

export type LimitCheckResult =
  | { ok: true; limits: { agents: number; sites: number; tenants: number }; usage: Usage }
  | { ok: false; code: "LIMIT_REACHED" | "SUBSCRIPTION_INACTIVE"; message: string; limits: any; usage: Usage };

function isSubscriptionActive(status: Subscription["status"]) {
  // Tu peux durcir : ex refuser past_due.
  return status === "active" || status === "trialing" || status === "past_due";
}

/**
 * Vérifie quota en TRANSACTION (anti-concurrence).
 * kind = agents / sites / tenants
 * delta = combien tu veux consommer (ex: +1)
 */
export async function assertWithinLimitsTx(input: {
  tenantId: string;
  kind: LimitKind;
  delta?: number; // default 1
}) : Promise<LimitCheckResult> {
  const tenantId = String(input.tenantId || "").trim();
  const kind = input.kind;
  const delta = Math.max(1, clampInt(input.delta, 1));

  if (!tenantId) {
    return {
      ok: false,
      code: "SUBSCRIPTION_INACTIVE",
      message: "tenantId manquant",
      limits: { agents: 0, sites: 0, tenants: 0 },
      usage: { agents: 0, sites: 0, activeTenants: 0 },
    };
  }

  const usageRef = adminDb.collection("usage").doc(tenantId);
  const subRef = adminDb.collection("subscriptions").doc(tenantId);

  return adminDb.runTransaction(async (tx) => {
    const [subSnap, usageSnap] = await Promise.all([tx.get(subRef), tx.get(usageRef)]);

    const sub: Subscription = subSnap.exists
      ? ({
          planId: String((subSnap.data() as any)?.planId ?? "free"),
          status: (String((subSnap.data() as any)?.status ?? "active") as any) || "active",
          addons: (subSnap.data() as any)?.addons ?? {},
          effectiveLimits: (subSnap.data() as any)?.effectiveLimits ?? undefined,
        } as any)
      : { planId: "free", status: "active", addons: { multiTenant: false } };

    if (!isSubscriptionActive(sub.status)) {
      const plan = await getPlan(sub.planId);
      const limits = computeEffectiveLimits(plan, sub);
      const usage: Usage = usageSnap.exists
        ? {
            agents: clampInt((usageSnap.data() as any)?.agents, 0),
            sites: clampInt((usageSnap.data() as any)?.sites, 0),
            activeTenants: clampInt((usageSnap.data() as any)?.activeTenants, 1),
          }
        : { agents: 0, sites: 0, activeTenants: 1 };

      return {
        ok: false as const,
        code: "SUBSCRIPTION_INACTIVE",
        message: "Abonnement inactif",
        limits,
        usage,
      };
    }

    const plan = await getPlan(sub.planId);
    const limits = computeEffectiveLimits(plan, sub);

    const usage: Usage = usageSnap.exists
      ? {
          agents: clampInt((usageSnap.data() as any)?.agents, 0),
          sites: clampInt((usageSnap.data() as any)?.sites, 0),
          activeTenants: clampInt((usageSnap.data() as any)?.activeTenants, 1),
        }
      : { agents: 0, sites: 0, activeTenants: 1 };

    const current = kind === "tenants" ? usage.activeTenants : usage[kind];
    const limit = limits[kind];

    if (current + delta > limit) {
      return {
        ok: false as const,
        code: "LIMIT_REACHED",
        message: `Quota atteint (${kind}). ${current}/${limit}`,
        limits,
        usage,
      };
    }

    // ✅ On consomme immédiatement (réservation) en transaction.
    // Comme ça, même deux POST en même temps ne dépasseront pas.
    if (!usageSnap.exists) {
      tx.set(usageRef, { agents: 0, sites: 0, activeTenants: 1 }, { merge: true });
    }

    if (kind === "tenants") {
      tx.set(
        usageRef,
        {
          activeTenants: FieldValue.increment(delta),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      tx.set(
        usageRef,
        {
          [kind]: FieldValue.increment(delta),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    return { ok: true as const, limits, usage };
  });
}

/**
 * Ajuste un compteur usage (ex: après DELETE agent/site)
 * delta peut être négatif.
 */
export async function adjustUsage(tenantId: string, kind: LimitKind, delta: number) {
  const ref = adminDb.collection("usage").doc(tenantId);
  await ref.set(
    {
      [kind === "tenants" ? "activeTenants" : kind]: FieldValue.increment(delta),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
