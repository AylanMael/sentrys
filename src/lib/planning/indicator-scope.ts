import { parisMonthStart, PLANNING_TIME_ZONE } from "./paris-display";
import { parsePlanningDateTime } from "./paris-time";

export function planningIndicatorScope(input: {
  range: { from: string; to: string } | null;
  siteId: string; agentId: string; publicationFilter: string; showAbsences: boolean;
  serverConfirmed: boolean;
}) {
  const start = parsePlanningDateTime(input.range?.from);
  const end = parsePlanningDateTime(input.range?.to);
  const valid = !!start && !!end && end > start;
  const fullMonth = valid && start.getTime() === parisMonthStart(start).getTime()
    && end.getTime() === parisMonthStart(start, 1).getTime();
  const filters = [input.siteId !== "all" ? "Site filtré" : "Tous les sites",
    input.agentId !== "all" ? "Agent filtré" : "Tous les agents",
    input.publicationFilter !== "all" ? "Publication filtrée" : "Toutes publications",
    input.showAbsences ? "Absences incluses" : "Absences masquées"].join(" · ");
  const formatter = new Intl.DateTimeFormat("fr-FR", { timeZone: PLANNING_TIME_ZONE, day: "2-digit", month: "short", year: "numeric" });
  const period = valid ? `${formatter.format(start)} – ${formatter.format(new Date(end.getTime() - 1))}` : "Période en cours de chargement";
  const reason = !input.serverConfirmed ? "Données non confirmées par le serveur : comparaison suspendue."
    : !fullMonth ? "Comparaison au contrat disponible uniquement sur un mois civil complet."
    : input.siteId !== "all" || input.publicationFilter !== "all" || !input.showAbsences
      ? "Retirez les filtres de site/publication et incluez les absences pour comparer au contrat mensuel."
      : "Comparaison des heures planifiées au contrat mensuel renseigné, pas des heures pointées.";
  return { period, filters, reason, serverConfirmed: input.serverConfirmed, canCompareMonthly: input.serverConfirmed && fullMonth && input.siteId === "all" && input.publicationFilter === "all" && input.showAbsences };
}

export type MonthlyComparison = { hours: number; contract: number; delta: number; ratio: number };
export function buildMonthlyComparisons(hours: Record<string, number>, targets: Record<string, number>, enabled: boolean, selectedAgent = "all"): Record<string, MonthlyComparison> {
  if (!enabled) return {};
  return Object.fromEntries(Object.entries(targets).filter(([id, target]) => (selectedAgent === "all" || selectedAgent === id) && Number.isFinite(target) && target > 0)
    .flatMap(([id, contract]) => {
      const value = hours[id] ?? 0;
      return Number.isFinite(value) && value >= 0 ? [[id, { hours: value, contract, delta: value - contract, ratio: value / contract * 100 }]] : [];
    }));
}

export function isMonthlyAssessmentComplete(enabled: boolean, selectedAgent: string, hours: Record<string, number>, comparisons: Record<string, MonthlyComparison>) {
  return enabled && selectedAgent === "all" && Object.keys(hours).every(id => !!comparisons[id]);
}
