type Data = Record<string, unknown>;
type Read = (collection: string, id: string) => Promise<Data | undefined>;
const label = (v: unknown): string | null => typeof v === "string" && v.trim() ? v.trim() : null;
const id = (v: unknown): v is string => typeof v === "string" && !!v && !v.includes("/") && v !== "." && v !== "..";

/** Page-scoped cache; legacy identities are resolved only through matching tenant records. */
export function pointageContext(tenantId: string, read: Read) {
  const cache = new Map<string, Promise<Data | undefined>>();
  async function own(collection: string, key: unknown) {
    if (!id(key)) return undefined;
    const path = `${collection}/${key}`;
    if (!cache.has(path)) cache.set(path, read(collection, key).then(d => d?.tenantId === tenantId ? d : undefined));
    return cache.get(path);
  }
  return async (event: Data) => {
    if (event.tenantId !== tenantId || !["assignment.checked_in", "assignment.checked_out"].includes(String(event.action))) return {};
    const meta = event.meta && typeof event.meta === "object" ? event.meta as Data : {};
    let agentId = id(meta.agentId) ? meta.agentId : null;
    // Older events stored the authenticated UID, not the agent's name.
    if (!agentId) {
      const member = await own("tenantUsers", event.actorUid);
      const assignment = await own("assignments", event.entityId);
      // The original journal retains the deterministic assignment key vacationId_agentId.
      // Matching current links alone would misattribute history if both were changed.
      if (id(member?.agentId) && id(meta.vacationId)
        && assignment?.vacationId === meta.vacationId
        && event.entityId === `${meta.vacationId}_${member.agentId}`
        && assignment?.agentId === member.agentId) agentId = member.agentId;
    }
    const agent = await own("agents", agentId);
    const site = await own("sites", meta.siteId);
    const currentName = agent ? [label(agent.firstName), label(agent.lastName)].filter(Boolean).join(" ") : null;
    return {
      actorName: label(event.actorName) || currentName || "Agent non identifiable",
      agentId: agent ? agentId : null,
      siteName: label(meta.siteName) || label(site?.name),
    };
  };
}
