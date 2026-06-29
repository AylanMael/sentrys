"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onSnapshot } from "firebase/firestore";
import type { Unsubscribe, Timestamp } from "firebase/firestore";

import { db } from "@/lib/firebase/client";
import { qRecentIncidents } from "@/lib/firestore/queries";
import { useAuth } from "@/lib/auth-provider";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Severity = "Faible" | "Moyenne" | "Élevée" | string;
type Status = "Ouvert" | "Clos" | string;

type RecentIncident = {
  id: string;
  siteName?: string | null;
  severity?: Severity | null;
  status?: Status | null;
  createdAt?: Timestamp | null;
  createdBy?: { uid?: string; name?: string | null; email?: string | null } | null;
};

function formatDateTimeFR(ts?: Timestamp | null) {
  try {
    const d = ts?.toDate?.();
    if (!d) return "—";
    return d.toLocaleString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function SeverityBadge({ v }: { v?: Severity | null }) {
  const vv = String(v ?? "").toLowerCase();
  const variant = vv === "élevée" ? "destructive" : vv === "moyenne" ? "secondary" : "outline";
  return <Badge variant={variant}>{v ?? "—"}</Badge>;
}

function StatusBadge({ v }: { v?: Status | null }) {
  const vv = String(v ?? "").toLowerCase();
  const variant = vv === "ouvert" ? "destructive" : "outline";
  return <Badge variant={variant}>{v ?? "—"}</Badge>;
}

export function RecentIncidentsCard() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const tenantId = user?.tenantId ?? null;

  const [items, setItems] = useState<RecentIncident[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const canQuery = useMemo(() => !!db && !!tenantId && !loading, [tenantId, loading]);

  useEffect(() => {
    let unsub: Unsubscribe | null = null;

    if (!canQuery || !tenantId) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    unsub = onSnapshot(
      qRecentIncidents(db, tenantId, 6),
      (snap) => {
        const rows: RecentIncident[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            siteName: data.siteName as string | undefined | null,
            severity: data.severity as string | undefined | null,
            status: data.status as string | undefined | null,
            createdAt: data.createdAt as Timestamp | undefined | null,
            createdBy: data.createdBy as RecentIncident["createdBy"],
          };
        });
        setItems(rows);
        setIsLoading(false);
      },
      (err) => {
        console.error("RecentIncidents onSnapshot error:", err);
        setItems([]);
        setIsLoading(false);
      }
    );

    return () => unsub?.();
  }, [canQuery, tenantId]);

  return (
    <div className="p-10 flex flex-col h-full">
      <div className="mb-8 relative z-10">
        <div className="flex items-center gap-4 mb-2">
          <h3 className="text-2xl font-black tracking-tighter text-foreground">Incidents Récents</h3>
          <Badge className="bg-primary/10 text-primary border-none text-[10px] font-black uppercase tracking-widest px-3 py-1">Direct</Badge>
        </div>
        <p className="text-sm font-bold text-muted-foreground/60 leading-relaxed">État des lieux des 6 derniers signalements prioritaires.</p>
      </div>

      {isLoading ? (
        <div className="space-y-4 py-4">
          <Skeleton className="h-16 w-full rounded-2xl opacity-10" />
          <Skeleton className="h-16 w-full rounded-2xl opacity-10" />
          <Skeleton className="h-16 w-full rounded-2xl opacity-10" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 py-10 text-center opacity-30 grayscale underline-offset-4 decoration-dotted">
           <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Calme Plat Opérationnel</p>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <div className="divide-y divide-white/5">
            {items.map((it) => {
              const reporter = it.createdBy?.name || it.createdBy?.email || "—";
              const severity = String(it.severity ?? "").toLowerCase();

              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => router.push(`/dashboard/incidents/${it.id}`)}
                  className="group flex flex-col w-full py-6 text-left hover:px-2 transition-all duration-500 ease-out border-b last:border-none border-white/5"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex flex-col">
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/40 mb-1 group-hover:text-primary/60 transition-colors">
                        {it.siteName ?? "Site non défini"}
                      </div>
                      <div className="text-base font-black tracking-tight group-hover:premium-gradient-text transition-all duration-500 text-foreground">
                        {reporter}
                      </div>
                    </div>
                    <Badge variant="outline" className={cn(
                        "rounded-xl font-black text-[9px] uppercase tracking-widest py-1 px-3 border-none",
                        severity === 'élevée' ? "bg-destructive/10 text-destructive" :
                        severity === 'moyenne' ? "bg-orange-500/10 text-orange-600" :
                        "bg-white/5 text-muted-foreground/60"
                    )}>
                      {it.severity ?? '—'}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between mt-auto">
                    <div className="flex items-center gap-2">
                       <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", it.status === 'Ouvert' ? "bg-destructive" : "bg-green-500")}></div>
                       <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">{it.status}</span>
                    </div>
                    <div className="text-[10px] font-black text-muted-foreground/20 uppercase tracking-[0.1em]">
                      {formatDateTimeFR(it.createdAt)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
