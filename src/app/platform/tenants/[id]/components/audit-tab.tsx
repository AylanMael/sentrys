import { Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDate, signalClass } from "../format";
import type { PlatformAuditEvent } from "../types";

export function TenantAuditLog({ events }: { events: PlatformAuditEvent[] }) {
  return (
    <Card className="overflow-hidden rounded-[2rem] border-border/60">
      <CardHeader className="border-b bg-muted/25">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl font-black">
              <Clock className="h-5 w-5 text-primary" />
              Historique plateforme agence
            </CardTitle>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Journal VSW Digital lie a cette agence. Motif obligatoire pour toute action sensible.
            </p>
          </div>
          <Badge variant="outline" className="w-fit rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]">
            {events.length} tracé(s)
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {events.length > 0 ? (
          events.map((event) => (
            <div key={event.id} className={cn("rounded-2xl border p-4", signalClass(event.tone))}>
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="font-black">{event.actionLabel}</p>
                  <p className="mt-1 text-sm font-semibold leading-5 opacity-80">
                    {event.reason ?? "Motif non renseigné"}
                  </p>
                </div>
                <Badge variant="outline" className="w-fit rounded-full">
                  {event.status}
                </Badge>
              </div>
              <p className="mt-3 text-[10px] font-black uppercase tracking-[0.14em] opacity-60">
                {formatDate(event.createdAtIso)} - {event.actorEmail ?? "system"}
              </p>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed bg-muted/20 p-5">
            <p className="font-black">Aucune action plateforme sur cette agence</p>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Les futures suspensions, changements de plan et accès support apparaîtront ici.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
