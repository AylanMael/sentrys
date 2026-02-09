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

    if (!canQuery) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    unsub = onSnapshot(
      qRecentIncidents(db!, tenantId!, 6),
      (snap) => {
        const rows: RecentIncident[] = snap.docs.map((d) => {
          const data = d.data() as Omit<RecentIncident, "id">;
          return { id: d.id, ...data };
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
    <Card className="rounded-3xl">
      <CardContent className="p-6">
        <div className="mb-4">
          <h3 className="text-xl font-semibold">Incidents récents</h3>
          <p className="text-sm text-muted-foreground">Un aperçu des derniers incidents signalés.</p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun incident récent.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border">
            <div className="grid grid-cols-12 gap-3 border-b bg-muted/30 px-4 py-3 text-xs font-medium text-muted-foreground">
              <div className="col-span-5">Site</div>
              <div className="col-span-3">Sévérité</div>
              <div className="col-span-2">Statut</div>
              <div className="col-span-2 text-right">Date/heure</div>
            </div>

            <div className="divide-y">
              {items.map((it) => {
                const reporter = it.createdBy?.name || it.createdBy?.email || "—";

                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => router.push(`/dashboard/incidents/${it.id}`)}
                    className={cn(
                      "grid w-full grid-cols-12 gap-3 px-4 py-3 text-left text-sm",
                      "hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    )}
                  >
                    <div className="col-span-5">
                      <div className="font-medium">{it.siteName ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">Signalé par {reporter}</div>
                    </div>

                    <div className="col-span-3">
                      <SeverityBadge v={it.severity} />
                    </div>

                    <div className="col-span-2">
                      <StatusBadge v={it.status} />
                    </div>

                    <div className="col-span-2 text-right text-muted-foreground">
                      {formatDateTimeFR(it.createdAt)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
