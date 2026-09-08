/** Shared, side-effect-free suspension policy. Never trust client-supplied mode/time. */
export type SuspensionMode = "none" | "commercial" | "security";

export function suspensionMode(tenant: Record<string, unknown> | null | undefined): SuspensionMode {
  if (!tenant) return "security";
  if (tenant.status !== "suspended") return "none";
  return tenant.suspensionMode === "commercial" ? "commercial" : "security";
}

export function timestampMillis(value: unknown): number | null {
  if (!value || typeof value !== "object" || !("toMillis" in value)
    || typeof value.toMillis !== "function") return null;
  const result = value.toMillis();
  return typeof result === "number" && Number.isFinite(result) ? result : null;
}

export function isUnavailableMission(vacation: Record<string, unknown>): boolean {
  return typeof vacation.status !== "string"
    || ["cancelled", "canceled", "closed", "completed", "absence"].includes(vacation.status.toLowerCase())
    || vacation.isDeleted === true || vacation.isAbsence === true
    || ["type", "kind", "missionType", "title", "notes"].some(key =>
      typeof vacation[key] === "string" && /absence|conge|congé|maladie|repos|rtt|vacances/i.test(vacation[key]));
}

export function isContinuingMission(input: {
  tenantId: string; agentId: string; siteId: string;
  vacation: Record<string, unknown>; suspendedAt: unknown; now: number;
}): boolean {
  const { vacation, tenantId, agentId, siteId, now } = input;
  const start = timestampMillis(vacation.startAt);
  const end = timestampMillis(vacation.endAt);
  const cutoff = timestampMillis(input.suspendedAt);
  return start !== null && end !== null && cutoff !== null
    && start <= cutoff && cutoff <= now && start <= now && now < end
    && vacation.tenantId === tenantId && vacation.siteId === siteId
    && Array.isArray(vacation.assignedAgentIds) && vacation.assignedAgentIds.includes(agentId)
    && !isUnavailableMission(vacation);
}
