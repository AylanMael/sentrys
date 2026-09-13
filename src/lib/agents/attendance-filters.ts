import { attendanceObservations, type AttendanceRow } from "./attendance";

export const attendanceFilters = [
  { value: "all", label: "Toutes" },
  { value: "not_checked_in", label: "Non pointés" },
  { value: "on_duty", label: "En service" },
  { value: "missing_out", label: "Sorties manquantes" },
  { value: "attention", label: "Écarts à vérifier" },
] as const;
export type AttendanceFilter = typeof attendanceFilters[number]["value"];
const normalize = (value: string) => value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");

/** Filters only the supplied page(s); never claims completeness or mutates rows. */
export function filterAttendanceRows(rows: AttendanceRow[], filter: AttendanceFilter, agent: string, site: string): AttendanceRow[] {
  const agentQuery = normalize(agent), siteQuery = normalize(site);
  return rows.filter(row => normalize(row.agentName).includes(agentQuery)
    && normalize(row.siteName).includes(siteQuery)
    && (filter === "all" || (filter === "attention" ? attendanceObservations(row).length > 0 : row.status === filter)));
}
