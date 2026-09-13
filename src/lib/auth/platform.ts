import type { NextRequest } from "next/server";
import { forbidden, requireTenantUser } from "@/app/api/_utils/withTenant";

// Platform access depends on the authenticated tenantUsers record. This guard
// does not prevent users from editing that record; Firestore rules must do that.
export async function requirePlatformUser(
  req: NextRequest,
  forbiddenMessage = "Super administrateur plateforme requis"
) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth;

  if (auth.role !== "super_admin" || auth.tenantId !== "platform") {
    return { ok: false as const, res: forbidden(forbiddenMessage) };
  }

  return auth;
}
