export const MISSION_TYPE_OPTIONS = [
  "ADS",
  "SSIAP 1",
  "SSIAP 2",
  "SSIAP 3",
  "Agent cynophile",
  "Ronde mobile",
  "Accueil / filtrage",
  "Contrôle d'accès",
  "Surete evenementielle",
  "Intervention",
] as const;

export type MissionType = (typeof MISSION_TYPE_OPTIONS)[number];

export function normalizeMissionType(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}
