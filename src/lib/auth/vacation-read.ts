import { canReadBackoffice, isAgentRole } from "./role";

type Reader = { uid: string; tenantId: string; role?: string | null; agentId?: string | null };

/** Additional vacation-level gate; callers must retain their existing site gate. */
export function canReadAssignedVacation(auth: Reader, vacation: Record<string, unknown>): boolean {
  if (vacation.tenantId !== auth.tenantId) return false;
  if (canReadBackoffice(auth.role)) return true;
  return isAgentRole(auth.role) && Array.isArray(vacation.assignedAgentIds)
    && vacation.assignedAgentIds.includes(auth.agentId || auth.uid);
}
