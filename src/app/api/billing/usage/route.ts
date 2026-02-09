// src/app/api/billing/usage/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser } from "@/app/api/_utils/withTenant";
import {
  getPlan,
  getSubscription,
  getUsage,
  computeEffectiveLimits,
  type LimitKind,
} from "@/lib/billing/limits";

export const runtime = "nodejs";

/* ================= helpers ================= */

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function serverError(e: any, tag: string) {
  console.error(`[${tag}]`, e);
  return json(500, {
    ok: false,
    error: "Internal error",
    details: e?.message ?? String(e),
  });
}

function clampInt(v: any, def = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.floor(n);
}

function pct(used: number, limit: number) {
  used = clampInt(used, 0);
  limit = clampInt(limit, 0);
  if (limit <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
}

function toAtLimitList(atLimit: Record<string, boolean>) {
  return Object.entries(atLimit)
    .filter(([, v]) => Boolean(v))
    .map(([k]) => k);
}

/* ================= GET ================= */
/**
 * GET /api/billing/usage
 * Auth: Firebase ID token (Authorization: Bearer <token>)
 */
export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  try {
    const tenantId = auth.tenantId;

    const [sub, usage] = await Promise.all([getSubscription(tenantId), getUsage(tenantId)]);
    const plan = await getPlan(sub.planId);
    const limits = computeEffectiveLimits(plan, sub);

    // ✅ Standardise : usage.activeTenants + alias usage.tenants (si tu veux garder)
    const usedAgents = clampInt(usage.agents, 0);
    const usedSites = clampInt(usage.sites, 0);
    const usedTenants = clampInt(usage.activeTenants, 1); // multi-tenant: compteur réel
    const usageNormalized = {
      agents: usedAgents,
      sites: usedSites,
      activeTenants: usedTenants,
      // alias pratique (optionnel)
      tenants: usedTenants,
      updatedAt: usage.updatedAt ?? null,
    };

    const progress = {
      agentsPct: pct(usageNormalized.agents, limits.agents),
      sitesPct: pct(usageNormalized.sites, limits.sites),
      tenantsPct: pct(usageNormalized.activeTenants, limits.tenants),
    };

    // ✅ “quota atteint” = used >= limit  => signifie “tu ne peux plus ajouter”
    const atLimit = {
      agents: usageNormalized.agents >= limits.agents,
      sites: usageNormalized.sites >= limits.sites,
      tenants: usageNormalized.activeTenants >= limits.tenants,
    };

    const atLimitList = toAtLimitList(atLimit);
    const canCreate = {
      agents: !atLimit.agents,
      sites: !atLimit.sites,
      tenants: !atLimit.tenants,
    };

    return json(200, {
      ok: true,
      tenantId,
      plan: {
        id: plan.id,
        name: plan.name,
        priceMonthlyCents: plan.priceMonthlyCents ?? null,
        features: plan.features ?? {},
      },
      subscription: {
        planId: sub.planId,
        status: sub.status,
        addons: sub.addons ?? {},
        periodStart: sub.periodStart ?? null,
        periodEnd: sub.periodEnd ?? null,
      },
      limits,
      usage: usageNormalized,
      progress,
      atLimit,
      atLimitList,              // ✅ prêt UI
      atLimitAny: atLimitList.length > 0, // ✅ prêt UI
      canCreate,                // ✅ prêt UX (désactiver boutons)
    });
  } catch (e: any) {
    return serverError(e, "billing.usage.GET");
  }
}
