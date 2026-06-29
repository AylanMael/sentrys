import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";

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
    const rawRoles = decodedToken.roles;
    const roles: string[] = Array.isArray(rawRoles)
      ? rawRoles.filter((r) => typeof r === "string")
      : [];

    const isGlobalAdmin = roles.includes("global_admin");
    const isSupport = roles.includes("support");
    const isTenantAdmin = roles.includes("tenant_admin");

    if (!isGlobalAdmin && !isSupport && !isTenantAdmin) {
      return { error: NextResponse.json({ ok: false, error: "Forbidden: No admin roles found" }, { status: 403 }) };
    }

    // 3. Restriction par rôle autorisé strict
    if (options?.allowedRoles && options.allowedRoles.length > 0) {
      const hasAllowedRole = options.allowedRoles.some(role => roles.includes(role));
      if (!hasAllowedRole) {
        return { error: NextResponse.json({ ok: false, error: "Forbidden: Insufficient role" }, { status: 403 }) };
      }
    }

    // 4. Validation explicite du tenant (TargetTenantId)
    if (options?.targetTenantId) {
      if (isGlobalAdmin) {
        // Accès global autorisé sans condition
      } else if (isSupport && options.allowSupportCrossTenant === true) {
        // Accès cross-tenant explicitement autorisé pour le support
      } else if (isTenantAdmin && decodedToken.tenantId === options.targetTenantId) {
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
