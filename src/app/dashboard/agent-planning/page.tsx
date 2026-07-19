"use client";

import React from "react";
import {
  CalendarClock,
  CheckCircle2,
  Loader2,
  Printer,
  Send,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client-fetch";
import { AgentPlanningBoard } from "@/components/dashboard/planning/AgentPlanningBoard";

type DispatchVacationSummary = {
  id: string;
  siteName: string | null;
  title: string | null;
  missionType: string | null;
  startAtIso: string | null;
  endAtIso: string | null;
};

type AgentDispatchRow = {
  id: string;
  agentId: string;
  agentName: string;
  fromIso: string;
  toIso: string;
  vacationCount: number;
  siteNames: string[];
  vacations: DispatchVacationSummary[];
  channel: "portal" | "internal";
  sentAtIso: string | null;
  acknowledgedAtIso: string | null;
  acknowledgedByUid: string | null;
  acknowledgedByName: string | null;
  acknowledgedByEmail: string | null;
};

type AgentDispatchResponse = {
  ok: boolean;
  dispatches: AgentDispatchRow[];
};

type AcknowledgeDispatchResponse = {
  ok: boolean;
  dispatch: AgentDispatchRow;
};

function cacheDispatchForPrint(dispatch: AgentDispatchRow) {
  try {
    window.localStorage.setItem(
      `sentrys:print-dispatch:${dispatch.id}`,
      JSON.stringify(dispatch)
    );
  } catch {
    // Non bloquant: on retombera sur l'API si le cache local échoue.
  }
}

function formatRange(from?: string | null, to?: string | null) {
  if (!from || !to) return "Periode";

  const formatter = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return `${formatter.format(new Date(from))} - ${formatter.format(new Date(to))}`;
}

function formatSentAt(value?: string | null) {
  if (!value) return "Planning diffusé";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatAcknowledgedAt(value?: string | null) {
  if (!value) return "En attente";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function AgentPlanningPage() {
  const [dispatches, setDispatches] = React.useState<AgentDispatchRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [acknowledgingId, setAcknowledgingId] = React.useState<string | null>(
    null
  );

  const pendingAcknowledgements = React.useMemo(
    () =>
      dispatches.filter(
        (dispatch) =>
          dispatch.channel === "portal" && !dispatch.acknowledgedAtIso
      ).length,
    [dispatches]
  );

  React.useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const response = await apiFetch<AgentDispatchResponse>(
          "/api/agent-dispatches"
        );
        if (!mounted) return;
        setDispatches(response.dispatches ?? []);
      } catch (loadError) {
        if (!mounted) return;
        setLoadError(
          loadError instanceof Error
            ? loadError.message
            : "Impossible de charger les diffusions."
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const acknowledgeDispatch = React.useCallback(async (dispatchId: string) => {
    setAcknowledgingId(dispatchId);
    setActionError(null);

    try {
      const response = await apiFetch<AcknowledgeDispatchResponse>(
        `/api/agent-dispatches/${dispatchId}/ack`,
        {
          method: "POST",
        }
      );

      setDispatches((previous) =>
        previous.map((dispatch) =>
          dispatch.id === dispatchId ? response.dispatch : dispatch
        )
      );
    } catch (ackError) {
      setActionError(
        ackError instanceof Error
          ? ackError.message
          : "Impossible de confirmer la réception."
      );
    } finally {
      setAcknowledgingId(null);
    }
  }, []);

  const openPrintableVersion = React.useCallback((dispatch: AgentDispatchRow) => {
    cacheDispatchForPrint(dispatch);
    window.open(
      `/agent-planning/print/${dispatch.id}?autoprint=1`,
      "_blank",
      "noopener,noreferrer"
    );
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="rounded-[2rem] border border-border/50 bg-background/90 p-8 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <Badge
              variant="outline"
              className="rounded-full border-sky-500/30 bg-sky-500/10 px-4 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300"
            >
              Portail agent
            </Badge>
            <h1 className="mt-3 text-3xl font-black tracking-tight">
              Mes plannings diffusés
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Retrouvez ici les plannings envoyés par l&apos;exploitation pour votre
              portail agent.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Card className="border-border/60">
              <CardContent className="p-4 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                  Diffusions
                </p>
                <p className="mt-1 text-3xl font-black">{dispatches.length}</p>
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardContent className="p-4 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                  Vacations
                </p>
                <p className="mt-1 text-3xl font-black">
                  {dispatches.reduce(
                    (total, dispatch) => total + dispatch.vacationCount,
                    0
                  )}
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardContent className="p-4 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                  A confirmer
                </p>
                <p className="mt-1 text-3xl font-black">
                  {pendingAcknowledgements}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[240px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : loadError ? (
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="p-6 text-sm text-red-700 dark:text-red-300">
            {loadError}
          </CardContent>
        </Card>
      ) : dispatches.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex min-h-[220px] flex-col items-center justify-center p-8 text-center">
            <Send className="h-10 w-10 text-muted-foreground" />
            <p className="mt-4 text-lg font-black">Aucun planning diffusé</p>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              L&apos;exploitation n&apos;a pas encore envoyé de planning dans votre
              portail.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {actionError && (
            <Card className="border-red-500/20 bg-red-500/5">
              <CardContent className="p-4 text-sm text-red-700 dark:text-red-300">
                {actionError}
              </CardContent>
            </Card>
          )}
          {dispatches.map((dispatch) => (
            <Card key={dispatch.id} className="overflow-hidden border-border/60">
              <CardHeader className="border-b border-border/50 bg-muted/20">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle className="text-xl font-black">
                      {formatRange(dispatch.fromIso, dispatch.toIso)}
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Diffuse le {formatSentAt(dispatch.sentAtIso)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className="rounded-full border-sky-500/30 bg-sky-500/10 px-3 py-1 font-black text-sky-700 dark:text-sky-300"
                    >
                      Portail
                    </Badge>
                    <Badge
                      variant="outline"
                      className="rounded-full bg-background px-3 py-1 font-black"
                    >
                      {dispatch.vacationCount} vacation(s)
                    </Badge>
                    <Badge
                      variant="outline"
                      className={
                        dispatch.acknowledgedAtIso
                          ? "rounded-full border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-black text-emerald-700 dark:text-emerald-300"
                          : "rounded-full border-amber-500/30 bg-amber-500/10 px-3 py-1 font-black text-amber-700 dark:text-amber-300"
                      }
                    >
                      {dispatch.acknowledgedAtIso ? "Confirme" : "En attente"}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                <div className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-muted/20 p-4">
                  <div>
                    <p className="text-sm font-black">
                      {dispatch.acknowledgedAtIso
                        ? "Reception confirmee"
                        : "Confirmation attendue"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {dispatch.acknowledgedAtIso
                        ? `Confirme le ${formatAcknowledgedAt(
                            dispatch.acknowledgedAtIso
                          )}`
                        : "Confirmez votre lecture pour rassurer l'exploitation."}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => openPrintableVersion(dispatch)}
                      className="min-w-[220px]"
                    >
                      <Printer className="mr-2 h-4 w-4" />
                      Imprimer / PDF
                    </Button>
                    <Button
                      type="button"
                      onClick={() => acknowledgeDispatch(dispatch.id)}
                      disabled={
                        Boolean(dispatch.acknowledgedAtIso) ||
                        acknowledgingId === dispatch.id
                      }
                      className="min-w-[220px] bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      {acknowledgingId === dispatch.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                      )}
                      {dispatch.acknowledgedAtIso
                        ? "Planning deja confirme"
                        : "J'ai pris connaissance"}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {dispatch.siteNames.map((siteName) => (
                    <Badge
                      key={`${dispatch.id}-${siteName}`}
                      variant="outline"
                      className="rounded-full border-border/60 bg-muted/20"
                    >
                      {siteName}
                    </Badge>
                  ))}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarClock className="h-4 w-4" />
                    Vue planning simplifiee, proche du tableau exploitation.
                  </div>

                  <AgentPlanningBoard
                    fromIso={dispatch.fromIso}
                    toIso={dispatch.toIso}
                    vacations={dispatch.vacations}
                    rowLabel={dispatch.agentName}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
