import type { Role } from "@/lib/types";

/**
 * Autorise uniquement si `role` fait partie des rôles autorisés.
 * Ne suppose aucune hiérarchie.
 */
export function canOneOf(
  role: Role | null | undefined,
  allowed: readonly Role[]
): boolean {
  if (!role) return false;
  return allowed.includes(role);
}
