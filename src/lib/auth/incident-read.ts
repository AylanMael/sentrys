import { adminDb } from "@/lib/firebase/admin";
import { canReadBackoffice, isAgentRole } from "@/lib/auth/role";

type IncidentReader = { tenantId: string; uid: string; role?: string | null };

/** Incidents are shared within authorized sites, not across the entire agency. */
export async function canReadIncidentSite(auth: IncidentReader, siteId: unknown): Promise<boolean> {
  if (canReadBackoffice(auth.role)) return true;
  if (!isAgentRole(auth.role) || typeof siteId !== "string" || !siteId || siteId.includes("/")) return false;
  const site = await adminDb.collection("sites").doc(siteId).get();
  const data = site.data();
  if (!site.exists || data?.tenantId !== auth.tenantId) return false;
  return [data.accessUids, data.managerIds, data.agentIds].some(
    ids => Array.isArray(ids) && ids.every(id => typeof id === "string") && ids.includes(auth.uid),
  );
}
