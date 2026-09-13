import { adminDb } from "@/lib/firebase/admin";
import type { TenantAuth } from "@/app/api/_utils/withTenant";
import { isContinuingMission, isUnavailableMission, suspensionMode, timestampMillis } from "./tenant-suspension";

type Principal = Extract<TenantAuth, { ok: true }>;
export const validDocumentId = (id: unknown): id is string =>
  typeof id === "string" && id.length > 0 && !id.includes("/");

/** Read inside the write transaction: suspension/reassignment races retry. */
export async function authorizeMissionWrite(
  tx: FirebaseFirestore.Transaction, auth: Principal, vacationId: unknown, siteId: unknown, requireInProgress = false,
): Promise<boolean> {
  if (auth.role !== "agent" || !validDocumentId(vacationId) || !validDocumentId(siteId)) return false;
  const member = await tx.get(adminDb.collection("tenantUsers").doc(auth.uid));
  const tenant = await tx.get(adminDb.collection("tenants").doc(auth.tenantId));
  const vacation = await tx.get(adminDb.collection("vacations").doc(vacationId));
  const current = member.data();
  if (!member.exists || current?.status !== "active" || current.role !== "agent"
    || current.tenantId !== auth.tenantId || !tenant.exists || !vacation.exists) return false;
  const agentId = typeof current.agentId === "string" && current.agentId ? current.agentId : auth.uid;
  if (agentId !== (auth.agentId || auth.uid)) return false;
  const data = vacation.data()!;
  const mode = suspensionMode(tenant.data());
  if (mode === "security" || data.tenantId !== auth.tenantId || data.siteId !== siteId
    || !Array.isArray(data.assignedAgentIds) || !data.assignedAgentIds.includes(agentId)
    || isUnavailableMission(data)) return false;
  if (requireInProgress) {
    const start = timestampMillis(data.startAt), end = timestampMillis(data.endAt);
    if (start === null || end === null || Date.now() < start || Date.now() >= end) return false;
  }
  return mode === "none" || isContinuingMission({
    tenantId: auth.tenantId, agentId, siteId, vacation: data,
    suspendedAt: tenant.data()?.suspendedAt, now: Date.now(),
  });
}
