import { VacationEvent } from "./stats";

export type ConflictType = "DOUBLE_ASSIGNMENT" | "UNDERSTAFFED" | "REST_PERIOD_VIOLATION";

export type ConflictSeverity = "info" | "warn" | "critical";

export type ConflictMeta = {
  type: ConflictType;
  severity: ConflictSeverity;
  message: string;
  relatedEventIds?: string[];
  agentId?: string;
};

export type ConflictIndex = Map<string, ConflictMeta[]>;

function push(index: ConflictIndex, eventId: string, meta: ConflictMeta) {
  const arr = index.get(eventId) ?? [];
  arr.push(meta);
  index.set(eventId, arr);
}

function getAssignedAgentIds(e: VacationEvent): string[] {
  return Array.isArray(e.assignedAgentIds) ? e.assignedAgentIds : [];
}

function getRequiredAgents(e: VacationEvent): number {
  return typeof e.requiredAgents === "number" ? e.requiredAgents : 0;
}

export function buildConflictIndex(events: VacationEvent[]): ConflictIndex {
  const index: ConflictIndex = new Map();

  // --- Understaffed ---
  for (const e of events) {
    const required = getRequiredAgents(e);
    if (required <= 0) continue;

    const assigned = getAssignedAgentIds(e).length;
    if (assigned < required) {
      const severity: ConflictSeverity = assigned === 0 ? "critical" : "warn";
      push(index, String(e.id), {
        type: "UNDERSTAFFED",
        severity,
        message: `Sous-staffé (${assigned}/${required})`,
      });
    }
  }

  // --- Agent-based Conflicts (Double Assignment & Rest Period) ---
  const byAgent = new Map<string, VacationEvent[]>();
  for (const e of events) {
    const agentIds = getAssignedAgentIds(e);
    for (const agentId of agentIds) {
      const arr = byAgent.get(agentId) ?? [];
      arr.push(e);
      byAgent.set(agentId, arr);
    }
  }

  const REST_PERIOD_MS = 11 * 60 * 60 * 1000; // 11 hours

  for (const [agentId, list] of byAgent) {
    const sorted = [...list].sort(
      (a, b) => new Date(a.start as any).getTime() - new Date(b.start as any).getTime()
    );

    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      const aId = String(a.id);
      if (!a.start || !a.end) continue;
      const aEnd = new Date(a.end as any).getTime();

      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j];
        const bId = String(b.id);
        if (!b.start || !b.end) continue;
        const bStart = new Date(b.start as any).getTime();

        // 1. Double Assignment (Overlaps)
        if (bStart < aEnd) {
          const siteA = a.siteName || "Site inconnu";
          const siteB = b.siteName || "Site inconnu";
          push(index, aId, {
            type: "DOUBLE_ASSIGNMENT",
            severity: "critical",
            agentId,
            relatedEventIds: [bId],
            message: `Chevauchement critique avec une mission sur [${siteB}]`,
          });
          push(index, bId, {
            type: "DOUBLE_ASSIGNMENT",
            severity: "critical",
            agentId,
            relatedEventIds: [aId],
            message: `Chevauchement critique avec une mission sur [${siteA}]`,
          });
        }
        // 2. Rest Period Violation (Gap < 11h)
        else if ((bStart - aEnd) < REST_PERIOD_MS) {
          const restHours = ((bStart - aEnd) / (1000 * 60 * 60)).toFixed(1);
          const siteA = a.siteName || "Site inconnu";
          const siteB = b.siteName || "Site inconnu";

          push(index, aId, {
            type: "REST_PERIOD_VIOLATION",
            severity: "warn",
            agentId,
            relatedEventIds: [bId],
            message: `Repos insuffisant (${restHours}h) avant la mission sur [${siteB}]`,
          });
          push(index, bId, {
            type: "REST_PERIOD_VIOLATION",
            severity: "warn",
            agentId,
            relatedEventIds: [aId],
            message: `Repos insuffisant (${restHours}h) après la mission sur [${siteA}]`,
          });
        }

        // Optimisation: if b starts much later than a ends, we can stop evaluating rest for this 'a'
        if ((bStart - aEnd) > REST_PERIOD_MS) break;
      }
    }
  }

  return index;
}

export function getWorstSeverity(metas: ConflictMeta[] | undefined): ConflictSeverity | null {
  if (!metas || metas.length === 0) return null;
  if (metas.some(m => m.severity === "critical")) return "critical";
  if (metas.some(m => m.severity === "warn")) return "warn";
  return "info";
}
