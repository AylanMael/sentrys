import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { requireTenantUser } from "@/app/api/_utils/withTenant";

export type AdminRole = "global_admin" | "tenant_admin" | "support";

interface RequireAdminOptions {
  allowedRoles?: AdminRole[];
  targetTenantId?: string;
  allowSupportCrossTenant?: boolean;
}

export async function requireAdmin(
  req: NextRequest,
  options?: RequireAdminOptions
) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return { error: NextResponse.json({ ok: false, error: "Missing Bearer token" }, { status: 401 }) };
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      return { error: NextResponse.json({ ok: false, error: "Empty Bearer token" }, { status: 401 }) };
    }

    // 1. Validation avec checkRevoked=true
    const decodedToken = await adminAuth.verifyIdToken(token, true);

    // 2. Normalisation très défensive des rôles
    const rawRoles = decodedToken.rôles;
    const rôles: string[] = Array.isArray(rawRoles)
      ? rawRoles.filter((r) => typeof r === "string")
      : [];

    const isGlobalAdmin = rôles.includes("global_admin");
    const isSupport = rôles.includes("support");
    const isTenantAdmin = rôles.includes("tenant_admin");

    if (!isGlobalAdmin && !isSupport && !isTenantAdmin) {
      return { error: NextResponse.json({ ok: false, error: "Forbidden: No admin rôles found" }, { status: 403 }) };
    }

    // 3. Restriction par rôle autorisé strict
    if (options?.allowedRoles && options.allowedRoles.length > 0) {
      const hasAllowedRole = options.allowedRoles.some(role => rôles.includes(role));
      if (!hasAllowedRole) {
        return { error: NextResponse.json({ ok: false, error: "Forbidden: Insufficient role" }, { status: 403 }) };
      }
    }

    // Claims remain necessary, but current membership and suspension are authoritative.
    // In particular, bootstrap is recovery by a provisioned platform user, not self-provisioning.
    const current = await requireTenantUser(req);
    if (!current.ok) return { error: current.res };
    if (current.uid !== decodedToken.uid) {
      return { error: NextResponse.json({ ok: false, error: "Forbidden: Identity mismatch" }, { status: 403 }) };
    }
    const platformMember = current.role === "super_admin" && current.tenantId === "platform";
    if ((isGlobalAdmin || isSupport) && !platformMember) {
      return { error: NextResponse.json({ ok: false, error: "Forbidden: Current platform administrator required" }, { status: 403 }) };
    }
    if (!isGlobalAdmin && !isSupport && (
      !isTenantAdmin || current.tenantId === "platform"
      || !["owner", "admin", "super_admin"].includes(current.role)
      || decodedToken.tenantId !== current.tenantId
      || !options?.targetTenantId || options.targetTenantId !== current.tenantId
    )) {
      return { error: NextResponse.json({ ok: false, error: "Forbidden: Current tenant administrator and matching target required" }, { status: 403 }) };
    }

    // 4. Preserve explicit target and support cross-tenant opt-in restrictions.
    if (options?.targetTenantId) {
      if (isGlobalAdmin) {
        // Global claim plus current active platform membership.
      } else if (isSupport && options.allowSupportCrossTenant === true) {
        // Accès cross-tenant explicitement autorisé pour le support
      } else if (isTenantAdmin && current.tenantId !== "platform"
        && ["owner", "admin", "super_admin"].includes(current.role)
        && decodedToken.tenantId === current.tenantId && current.tenantId === options.targetTenantId) {
        // Le tenant_admin agit sur son propre tenant validé
      } else {
        // Tout autre cas est interdit / mismatch
        return { error: NextResponse.json({ ok: false, error: "Forbidden: Tenant mismatch / Cross-tenant action blocked" }, { status: 403 }) };
      }
    }

    return { decodedToken };
  } catch (error: unknown) {
    const err = error as { code?: string };
    console.error("[admin-auth] Token verification failed:", err?.code || error);

    // 5. Gestion distincte des origines d'erreur
    if (err?.code === "auth/id-token-revoked") {
      return { error: NextResponse.json({ ok: false, error: "Token revoked. Please reauthenticate." }, { status: 401 }) };
    }
    if (err?.code === "auth/user-disabled") {
      return { error: NextResponse.json({ ok: false, error: "User account has been disabled." }, { status: 403 }) };
    }

    return { error: NextResponse.json({ ok: false, error: "Invalid or expired token" }, { status: 401 }) };
  }
}
