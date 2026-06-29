"use client";

import { useEffect, useMemo, useState } from "react";
import { getCountFromServer, Timestamp, Query, DocumentData } from "firebase/firestore";

import { db } from "@/lib/firebase/client";
import {
  qOpenIncidents,
  qActiveAgents,
  qActiveSites,
  qIncidentsSince,
} from "@/lib/firestore/queries";
import { useAuth } from "@/lib/auth-provider";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function StatCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: number | null;
  hint?: string;
}) {
  return (
    <Card className="rounded-[2rem] glass-card border-none transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl hover:shadow-primary/10 group">
      <CardContent className="p-8">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50 group-hover:text-primary/60 transition-colors">{title}</div>
        <div className="mt-3 text-4xl font-black tracking-tighter text-foreground group-hover:premium-gradient-text transition-all duration-500">
          {value === null ? <Skeleton className="h-10 w-24 rounded-lg" /> : value}
        </div>
        {hint ? <div className="mt-3 text-[10px] font-bold text-muted-foreground/40 uppercase tracking-wider">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

function startOfMonthDate() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isPermError(e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: string })?.code;
  return message.includes("Missing or insufficient permissions") || code === "permission-denied";
}

async function safeCount(label: string, q: Query<DocumentData, DocumentData>): Promise<number | null> {
  try {
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch (e) {
    console.error(`${label} count error:`, e);
    return isPermError(e) ? null : 0;
  }
}

export function DashboardStats() {
  const { user, loading } = useAuth();
  const tenantId = user?.tenantId ?? null;

  const [openIncidents, setOpenIncidents] = useState<number | null>(null);
  const [activeAgents, setActiveAgents] = useState<number | null>(null);
  const [activeSites, setActiveSites] = useState<number | null>(null);
  const [incidentsThisMonth, setIncidentsThisMonth] = useState<number | null>(null);

  const canQuery = useMemo(() => !!db && !!tenantId && !loading, [tenantId, loading]);

  useEffect(() => {
    if (!canQuery || !db || !tenantId) return;

    let cancelled = false;

    const run = async () => {
      const since = Timestamp.fromDate(startOfMonthDate());

      const [a, b, c, d] = await Promise.all([
        safeCount("openIncidents", qOpenIncidents(db, tenantId)),
        safeCount("activeAgents", qActiveAgents(db, tenantId)),
        safeCount("activeSites", qActiveSites(db, tenantId)),
        safeCount("incidentsThisMonth", qIncidentsSince(db, tenantId, since)),
      ]);

      if (cancelled) return;

      setOpenIncidents(a);
      setActiveAgents(b);
      setActiveSites(c);
      setIncidentsThisMonth(d);
    };

    run();
    const t = setInterval(run, 60_000);

    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [canQuery, tenantId]);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatCard title="Incidents ouverts" value={openIncidents} hint="En cours de traitement" />
      <StatCard title="Agents actifs" value={activeAgents} hint="Disponibles / en service" />
      <StatCard title="Sites couverts" value={activeSites} hint="Sites actifs" />
      <StatCard title="Incidents ce mois" value={incidentsThisMonth} hint="Depuis le 1er du mois" />
      {(openIncidents === null || activeAgents === null || activeSites === null || incidentsThisMonth === null) ? (
        <div className="md:col-span-2 xl:col-span-4 text-xs text-muted-foreground">
          Certaines statistiques ne peuvent pas être chargées (permissions Firestore / rules). Vérifie les règles sur
          <code className="mx-1">agents</code>, <code className="mx-1">sites</code>, <code className="mx-1">incidents</code>.
        </div>
      ) : null}
    </div>
  );
}
