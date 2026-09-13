import { isContinuingMission, isUnavailableMission, suspensionMode, timestampMillis } from "@/lib/auth/tenant-suspension";

export type TerrainMission = {
  id: string; vacationId: string; siteId: string; siteName: string;
  startAt: string; endAt: string; status: string;
  phase: "upcoming" | "ongoing" | "ended";
  canAct: boolean;
};

/** Minimal agent DTO: never return a site document or another agent's data. */
export function terrainMission(input: {
  id: string; tenantId: string; agentId: string; now: number;
  assignment: Record<string, unknown>; vacation: Record<string, unknown>;
  site: Record<string, unknown>; tenant: Record<string, unknown>;
}): TerrainMission | null {
  const { assignment: a, vacation: v, site: s, tenant, tenantId, agentId, now } = input;
  const start = timestampMillis(v.startAt), end = timestampMillis(v.endAt);
  if (a.tenantId !== tenantId || a.agentId !== agentId || v.tenantId !== tenantId
    || s.tenantId !== tenantId || a.siteId !== v.siteId
    || typeof a.siteId !== "string" || typeof a.vacationId !== "string"
    || !Array.isArray(v.assignedAgentIds) || !v.assignedAgentIds.includes(agentId)
    || start === null || end === null || end <= start || isUnavailableMission(v)
    || !["assigned", "present", "completed"].includes(String(a.status))
    || suspensionMode(tenant) === "security") return null;
  const phase = a.status === "completed" || now >= end ? "ended" : now < start ? "upcoming" : "ongoing";
  return {
    id: input.id, vacationId: a.vacationId, siteId: a.siteId,
    siteName: typeof s.name === "string" && s.name.trim() ? s.name : "Site sans libellé",
    startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString(),
    status: String(a.status), phase,
    canAct: phase === "ongoing" && (suspensionMode(tenant) === "none" || isContinuingMission({
      tenantId, agentId, siteId: a.siteId, vacation: v, now, suspendedAt: tenant.suspendedAt,
    })),
  };
}
