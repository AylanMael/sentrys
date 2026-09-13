import { timestampMillis } from "@/lib/auth/tenant-suspension";

export type AttendanceRow = {
  id: string; agentId: string; agentName: string; siteId: string; siteName: string;
  vacationId: string; startAt: string; endAt: string;
  checkedInAt: string | null; checkedOutAt: string | null;
  status: "upcoming" | "not_checked_in" | "on_duty" | "completed" | "missing_out" | "inconsistent";
};
export const attendanceLabels: Record<AttendanceRow["status"], string> = {
  upcoming: "À venir", not_checked_in: "Non pointé", on_duty: "En service",
  completed: "Service terminé", missing_out: "Sortie manquante", inconsistent: "À vérifier",
};
type Data = Record<string, unknown>;

/** Descriptive differences against the current plan, never a verdict about physical presence. */
export function attendanceObservations(row: AttendanceRow): string[] {
  if (row.status === "inconsistent") return ["Pointages incohérents : vérification nécessaire avant de comparer les horaires."];
  const start = Date.parse(row.startAt), end = Date.parse(row.endAt);
  const entry = row.checkedInAt === null ? null : Date.parse(row.checkedInAt);
  const exit = row.checkedOutAt === null ? null : Date.parse(row.checkedOutAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start
    || (entry !== null && !Number.isFinite(entry)) || (exit !== null && !Number.isFinite(exit))
    || (exit !== null && (entry === null || exit < entry))) return ["Horaires incohérents : comparaison indisponible."];
  const duration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return "moins d’une minute";
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return [hours ? `${hours} h` : "", minutes % 60 ? `${minutes % 60} min` : "", seconds % 60 ? `${seconds % 60} s` : ""].filter(Boolean).join(" ");
  };
  const messages: string[] = [];
  if (entry !== null && entry > start) messages.push(`Prise de service enregistrée avec ${duration(entry - start)} de retard par rapport au planning.`);
  if (exit !== null && exit < end) messages.push(`Fin de service enregistrée ${duration(end - exit)} avant l’heure prévue.`);
  if (row.status === "missing_out") messages.push("Fin prévue dépassée, sans pointage de sortie enregistré. Situation à vérifier.");
  if (row.status === "not_checked_in") messages.push("Aucune prise de service enregistrée. Cela ne confirme pas une absence sur le site.");
  return messages;
}

const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
export function attendanceRow(input: {
  tenantId: string; vacationId: string; agentId: string; now: number;
  vacation: Data; assignment?: Data; agent?: Data; site?: Data;
}): AttendanceRow | null {
  const { tenantId, vacationId, agentId, now, vacation: v, assignment: a, agent, site } = input;
  if (v.tenantId !== tenantId || typeof v.siteId !== "string"
    || !Array.isArray(v.assignedAgentIds) || !v.assignedAgentIds.includes(agentId)
    || (a && (a.tenantId !== tenantId || a.agentId !== agentId || a.siteId !== v.siteId || a.vacationId !== vacationId))
    || (agent && agent.tenantId !== tenantId) || (site && site.tenantId !== tenantId)) return null;
  const start = timestampMillis(v.startAt), end = timestampMillis(v.endAt);
  if (start === null || end === null || end <= start) return null;
  const entry = timestampMillis(a?.checkedInAt), exit = timestampMillis(a?.checkedOutAt);
  const inconsistent = !a || (a.status === "present" && entry === null)
    || (exit !== null && a.status !== "completed")
    || (a.status === "completed" && (entry === null || exit === null))
    || (exit !== null && (entry === null || exit < entry))
    || (entry !== null && a.status === "assigned")
    || (a.checkedInAt != null && entry === null) || (a.checkedOutAt != null && exit === null)
    || !["assigned", "present", "completed"].includes(String(a.status));
  const status: AttendanceRow["status"] = inconsistent ? "inconsistent"
    : exit !== null ? "completed" : entry !== null ? now >= end ? "missing_out" : "on_duty"
    : now < start ? "upcoming" : "not_checked_in";
  return {
    id: `${vacationId}_${agentId}`, vacationId, agentId,
    agentName: [text(agent?.firstName), text(agent?.lastName)].filter(Boolean).join(" ") || "Agent indisponible",
    siteId: v.siteId, siteName: text(site?.name) || "Site indisponible",
    startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString(),
    checkedInAt: entry === null ? null : new Date(entry).toISOString(),
    checkedOutAt: exit === null ? null : new Date(exit).toISOString(), status,
  };
}

/** Paris midnight with DST: no dependency on the server/browser local timezone. */
export function parisDayRange(day: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const utc = Date.parse(day + "T00:00:00Z");
  if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 10) !== day) return null;
  function midnight(base: number) {
    let result = base;
    const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    for (let i = 0; i < 3; i++) {
      const p = Object.fromEntries(formatter.formatToParts(new Date(result)).map(x => [x.type, x.value]));
      const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
      result += base - wall;
    }
    return new Date(result);
  }
  return { start: midnight(utc), end: midnight(utc + 86400000) };
}
