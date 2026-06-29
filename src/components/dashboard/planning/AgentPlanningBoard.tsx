"use client";

import React from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type PlanningVacationSummary = {
  id: string;
  siteName: string | null;
  title: string | null;
  missionType: string | null;
  startAtIso: string | null;
  endAtIso: string | null;
};

type AgentPlanningBoardProps = {
  fromIso?: string | null;
  toIso?: string | null;
  vacations: PlanningVacationSummary[];
  className?: string;
  mode?: "screen" | "print";
  rowLabel?: string;
  showRowHeader?: boolean;
};

type WeekGroup = {
  id: string;
  days: Date[];
};

function startOfWeekMonday(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function endOfWeekSunday(date: Date) {
  const start = startOfWeekMonday(date);
  const copy = new Date(start);
  copy.setDate(copy.getDate() + 6);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function addDays(date: Date, value: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + value);
  return copy;
}

function toDayKey(dateLike?: string | Date | null) {
  if (!dateLike) return null;
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildWeekGroups(
  fromIso?: string | null,
  toIso?: string | null,
  vacations: PlanningVacationSummary[] = []
) {
  const firstStartIso =
    vacations.find((vacation) => Boolean(vacation.startAtIso))?.startAtIso ?? null;
  const lastEndIso =
    [...vacations]
      .reverse()
      .find((vacation) => Boolean(vacation.endAtIso))
      ?.endAtIso ?? null;

  const sourceStart: Date = fromIso
    ? new Date(fromIso)
    : firstStartIso
      ? new Date(firstStartIso)
      : new Date();
  const sourceEnd: Date = toIso
    ? new Date(toIso)
    : lastEndIso
      ? new Date(lastEndIso)
      : sourceStart;

  const start = startOfWeekMonday(sourceStart);
  const end = endOfWeekSunday(sourceEnd);

  const groups: WeekGroup[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 7)) {
    const days = Array.from({ length: 7 }, (_, index) => addDays(cursor, index));
    groups.push({
      id: toDayKey(cursor) ?? `week-${groups.length}`,
      days,
    });
  }

  return groups;
}

function formatWeekLabel(days: Date[]) {
  const first = days[0];
  const last = days[6];
  const formatter = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
  });
  return `Semaine du ${formatter.format(first)} au ${formatter.format(last)}`;
}

function formatHeaderDay(date: Date) {
  const formatter = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
  return formatter.format(date);
}

function formatHour(value?: string | null) {
  if (!value) return "--:--";
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isWeekend(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function AgentPlanningBoard({
  fromIso,
  toIso,
  vacations,
  className,
  mode = "screen",
  rowLabel = "Mes services",
  showRowHeader = false,
}: AgentPlanningBoardProps) {
  const sortedVacations = React.useMemo(
    () =>
      [...vacations].sort((left, right) => {
        const l = left.startAtIso ? new Date(left.startAtIso).getTime() : 0;
        const r = right.startAtIso ? new Date(right.startAtIso).getTime() : 0;
        return l - r;
      }),
    [vacations]
  );

  const vacationsByDay = React.useMemo(() => {
    return sortedVacations.reduce<Record<string, PlanningVacationSummary[]>>(
      (acc, vacation) => {
        const key = toDayKey(vacation.startAtIso);
        if (!key) return acc;
        acc[key] ??= [];
        acc[key].push(vacation);
        return acc;
      },
      {}
    );
  }, [sortedVacations]);

  const weeks = React.useMemo(
    () => buildWeekGroups(fromIso, toIso, sortedVacations),
    [fromIso, sortedVacations, toIso]
  );

  return (
    <div className={cn("space-y-4", className)}>
      {weeks.map((week) => (
        <section
          key={week.id}
          className={cn(
            "overflow-hidden rounded-[1.75rem] border shadow-sm",
            mode === "print"
              ? "rounded-xl border-slate-200 bg-white shadow-none"
              : "border-border/60 bg-background"
          )}
        >
          <div
            className={cn(
              "border-b px-5 py-4",
              mode === "print"
                ? "border-slate-200 bg-slate-50/70"
                : "border-border/50 bg-muted/20"
            )}
          >
            <p
              className={cn(
                "text-[11px] font-black uppercase tracking-[0.18em]",
                mode === "print" ? "text-slate-500" : "text-muted-foreground"
              )}
            >
              {formatWeekLabel(week.days)}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse table-fixed">
              <thead>
                <tr>
                  {showRowHeader && (
                    <th
                      className={cn(
                        "w-40 border-b px-4 py-3 text-left text-xs font-black uppercase tracking-[0.14em]",
                        mode === "print"
                          ? "border-slate-200 bg-slate-100 text-slate-600"
                          : "border-border/60 bg-muted/30 text-muted-foreground"
                      )}
                    >
                      Agent
                    </th>
                  )}
                  {week.days.map((day) => (
                    <th
                      key={day.toISOString()}
                      className={cn(
                        "border-b px-3 py-3 text-left text-xs font-black uppercase tracking-[0.14em]",
                        mode === "print"
                          ? "border-slate-200 text-slate-700"
                          : "border-border/60 text-foreground",
                        isWeekend(day)
                          ? mode === "print"
                            ? "bg-slate-100/80"
                            : "bg-amber-50/50 dark:bg-amber-500/5"
                          : mode === "print"
                            ? "bg-white"
                            : "bg-background"
                      )}
                    >
                      {formatHeaderDay(day)}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                <tr>
                  {showRowHeader && (
                    <td
                      className={cn(
                        "align-top px-4 py-4",
                        mode === "print"
                          ? "border-r border-slate-200 bg-slate-50"
                          : "border-r border-border/60 bg-muted/20"
                      )}
                    >
                      <p
                        className={cn(
                          "text-sm font-black",
                          mode === "print" ? "text-slate-900" : "text-foreground"
                        )}
                      >
                        {rowLabel}
                      </p>
                      <p
                        className={cn(
                          "mt-1 text-xs",
                          mode === "print" ? "text-slate-500" : "text-muted-foreground"
                        )}
                      >
                        Planning simplifie en lecture seule
                      </p>
                    </td>
                  )}

                  {week.days.map((day) => {
                    const key = toDayKey(day.toISOString());
                    const dayVacations = key ? vacationsByDay[key] ?? [] : [];

                    return (
                      <td
                        key={`cell-${day.toISOString()}`}
                        className={cn(
                          "align-top px-3 py-3",
                          mode === "print"
                            ? "border-l border-slate-200"
                            : "border-l border-border/60",
                          isWeekend(day)
                            ? mode === "print"
                              ? "bg-slate-50"
                              : "bg-amber-50/40 dark:bg-amber-500/5"
                            : mode === "print"
                              ? "bg-white"
                              : "bg-background"
                        )}
                      >
                        {dayVacations.length === 0 ? (
                          <div
                            className={cn(
                              "flex min-h-[104px] items-center justify-center rounded-xl border border-dashed text-xs font-semibold",
                              mode === "print"
                                ? "border-slate-200 bg-slate-50/60 text-slate-400"
                                : "border-border/50 bg-muted/20 text-muted-foreground"
                            )}
                          >
                            Repos
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {dayVacations.map((vacation) => (
                              <article
                                key={vacation.id}
                                className={cn(
                                  "rounded-xl border p-2.5",
                                  mode === "print"
                                    ? "border-slate-200 bg-white"
                                    : "border-primary/15 bg-primary/5"
                                )}
                              >
                                <p
                                  className={cn(
                                    "text-xs font-black",
                                    mode === "print"
                                      ? "text-slate-900"
                                      : "text-foreground"
                                  )}
                                >
                                  {formatHour(vacation.startAtIso)} - {formatHour(vacation.endAtIso)}
                                </p>
                                <p
                                  className={cn(
                                    "mt-1 text-xs font-semibold",
                                    mode === "print"
                                      ? "text-slate-700"
                                      : "text-foreground/90"
                                  )}
                                >
                                  {vacation.siteName || vacation.title || "Site"}
                                </p>
                                {vacation.missionType && (
                                  <div className="mt-2">
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        "rounded-full px-2 py-0.5 text-[10px] font-black",
                                        mode === "print"
                                          ? "border-slate-200 bg-slate-50 text-slate-700"
                                          : "border-primary/20 bg-background text-foreground"
                                      )}
                                    >
                                      {vacation.missionType}
                                    </Badge>
                                  </div>
                                )}
                              </article>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
