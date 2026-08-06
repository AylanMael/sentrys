import { AlertTriangle, Building2, CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDate, formatTime, signalClass } from "../format";
import type { TenantDétailResponse } from "../types";
import { MiniInfo } from "./shared";

export function TenantIdentityCard({
  data,
  tenant,
  tenantId,
}: {
  data: TenantDétailResponse | null;
  tenant: TenantDétailResponse["tenant"] | null | undefined;
  tenantId: string | undefined;
}) {
  return (
    <Card className="rounded-[2rem] border-border/60 bg-background/90 shadow-sm">
      <CardHeader className="border-b bg-muted/20">
        <CardTitle className="flex items-center gap-2 text-lg font-black">
          <Building2 className="h-5 w-5 text-primary" />
          Identité agence
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Owner
          </p>
          <p className="mt-1 break-all text-sm font-black">
            {tenant?.ownerEmail ?? "Owner non renseigné"}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <MiniInfo label="Cree le" value={formatDate(tenant?.createdAtIso ?? null)} />
          <MiniInfo label="Maj" value={formatDate(tenant?.updatedAtIso ?? null)} />
          <MiniInfo label="Synchro" value={formatTime(data?.generatedAtIso)} />
          <MiniInfo label="ID" value={tenant?.id ?? tenantId ?? "-"} compact />
        </div>
      </CardContent>
    </Card>
  );
}

export function TenantPriorityCard({
  data,
  activeSupportSessions,
  attentionSignals,
}: {
  data: TenantDétailResponse | null;
  activeSupportSessions: number;
  attentionSignals: number;
}) {
  const onboarding = data?.onboarding ?? null;
  const nextStep = onboarding?.steps.find((step) => !step.done) ?? null;
  const riskLevel = data?.risk.riskLevel ?? "ok";
  const riskReasons = data?.risk.riskReasons ?? [];
  const hasAttention = attentionSignals > 0 || riskReasons.length > 0;
  const priorityClass =
    riskLevel === "critical"
      ? "border-red-500/25 bg-red-500/10"
      : hasAttention
        ? "border-amber-500/25 bg-amber-500/10"
        : "border-emerald-500/20 bg-emerald-500/10";
  const priorityTitle =
    riskLevel === "critical"
      ? "Action VSW prioritaire"
      : hasAttention
        ? "Point d'attention a suivre"
        : "Aucun point bloquant";

  return (
    <Card className="rounded-[2rem] border-border/60 bg-background/90 shadow-sm">
      <CardHeader className="border-b bg-muted/20">
        <CardTitle className="flex items-center gap-2 text-lg font-black">
          <AlertTriangle className="h-5 w-5 text-primary" />
          Priorite VSW
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        <div className={cn("rounded-2xl border p-4", priorityClass)}>
          <p className="font-black">{priorityTitle}</p>
          <p className="mt-1 text-sm font-semibold leading-5 text-muted-foreground">
            {riskReasons.length > 0 ? riskReasons.join(" | ") : "Les volumes principaux sont lisibles et sous contrôle."}
          </p>
        </div>
        <MiniInfo
          label="Prochaine étape"
          value={onboarding?.readyToActivate ? "Activer l'agence" : nextStep?.label ?? "Surveiller"}
        />
        <MiniInfo label="Support ouvert" value={activeSupportSessions + " session(s)"} />
      </CardContent>
    </Card>
  );
}

export function TenantSignalsCard({
  signals,
}: {
  signals: TenantDétailResponse["signals"];
}) {
  return (
    <Card className="rounded-[2rem] border-border/60 bg-background/90 shadow-sm">
      <CardHeader className="border-b bg-muted/20">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl font-black">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Signaux support
            </CardTitle>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Ce bloc resume les points d'attention sans melanger les actions sensibles.
            </p>
          </div>
          <Badge variant="outline" className="w-fit rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]">
            {signals.length} signal(aux)
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 md:grid-cols-2">
        {signals.map((signal) => (
          <div
            key={signal.id}
            className={cn("rounded-2xl border p-4", signalClass(signal.tone))}
          >
            <p className="font-black">{signal.title}</p>
            <p className="mt-2 text-sm font-semibold leading-5 opacity-80">
              {signal.detail}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
