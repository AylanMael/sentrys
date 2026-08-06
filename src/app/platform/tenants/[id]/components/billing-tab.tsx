import { CreditCard } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { euros, PLATFORM_PLANS } from "../format";
import type { PlatformPlanId, TenantDétailResponse } from "../types";

export function BillingGovernanceCard({ data }: { data: TenantDétailResponse | null }) {
  const billing = data?.billing;
  const counters = data?.counters;

  if (!billing) return null;

  const rows = [
    { label: "Agents", current: counters?.agents ?? 0, limit: billing.limits.agents },
    { label: "Sites", current: counters?.sites ?? 0, limit: billing.limits.sites },
    { label: "Unites", current: 1, limit: billing.limits.tenants },
  ];

  return (
    <Card className="rounded-[2rem] border-border/60 bg-background/85 shadow-sm">
      <CardHeader className="border-b bg-muted/20">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl font-black">
              <CreditCard className="h-5 w-5 text-primary" />
              Abonnement et quotas
            </CardTitle>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Vue commerciale et garde-fous de capacite pour cette agence cliente.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="rounded-full bg-primary/10 px-3 py-1 font-black text-primary hover:bg-primary/10">
              {billing.plan.name}
            </Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1 font-black">
              {euros(billing.plan.priceMonthlyCents)}
            </Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1 font-black capitalize">
              {billing.subscription.status}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 md:grid-cols-3">
        {rows.map((row) => {
          const percent = row.limit > 0 ? Math.min(100, Math.round((row.current / row.limit) * 100)) : 0;
          return (
            <div key={row.label} className="rounded-2xl border bg-muted/15 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  {row.label}
                </p>
                <p className="text-sm font-black">{row.current}/{row.limit}</p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full", percent >= 90 ? "bg-red-500" : percent >= 70 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: percent + "%" }} />
              </div>
              <p className="mt-2 text-xs font-semibold text-muted-foreground">
                {percent}% du quota utilisé
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function PlanGovernanceAction({
  currentPlanId,
  selectedPlanId,
  open,
  reason,
  confirmation,
  submitting,
  error,
  success,
  onOpenChange,
  onPlanChange,
  onReasonChange,
  onConfirmationChange,
  onSubmit,
}: {
  currentPlanId: string;
  selectedPlanId: PlatformPlanId;
  open: boolean;
  reason: string;
  confirmation: string;
  submitting: boolean;
  error: string | null;
  success: string | null;
  onOpenChange: (open: boolean) => void;
  onPlanChange: (planId: PlatformPlanId) => void;
  onReasonChange: (reason: string) => void;
  onConfirmationChange: (confirmation: string) => void;
  onSubmit: () => Promise<void>;
}) {
  const expectedConfirmation = "CHANGER PLAN";
  const isSamePlan = selectedPlanId === currentPlanId;
  const canSubmit =
    !isSamePlan &&
    reason.trim().length >= 12 &&
    confirmation.trim().toUpperCase() === expectedConfirmation &&
    !submitting;

  if (!open) {
    return (
      <div className="rounded-2xl border bg-muted/20 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-black">Changer le plan</p>
            <p className="mt-1 text-sm font-semibold leading-5 text-muted-foreground">
              Ajuste l'abonnement interne, les quotas et le registre d'audit. Stripe sera branche ensuite.
            </p>
            {success ? (
              <p className="mt-2 text-xs font-black text-emerald-700 dark:text-emerald-300">
                {success}
              </p>
            ) : null}
          </div>
          <Button type="button" variant="outline" className="rounded-2xl font-black" onClick={() => onOpenChange(true)}>
            Modifier
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-black">Changement de plan SaaS</p>
          <p className="mt-1 text-sm font-semibold leading-5 text-muted-foreground">
            Choisissez le forfait cible. Le changement est applique aux quotas après double confirmation.
          </p>
        </div>
        <Badge variant="outline" className="w-fit rounded-full">
          Confirmation : {expectedConfirmation}
        </Badge>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {PLATFORM_PLANS.map((plan) => {
          const selected = selectedPlanId === plan.id;
          const current = currentPlanId === plan.id;
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => onPlanChange(plan.id)}
              className={cn(
                "rounded-2xl border bg-background/80 p-3 text-left transition hover:border-primary/40",
                selected && "border-primary bg-primary/10 ring-2 ring-primary/10"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-black">{plan.name}</p>
                  <p className="mt-1 text-xs font-semibold text-muted-foreground">{plan.detail}</p>
                </div>
                {current ? <Badge variant="outline" className="rounded-full">Actuel</Badge> : null}
              </div>
              <p className="mt-2 text-sm font-black text-primary">{plan.price}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-4 space-y-3">
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Motif obligatoire
          </label>
          <Textarea
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Exemple : passage au plan Pro valide par le client, besoin de quotas supplementaires..."
            className="min-h-24 rounded-2xl bg-background/80 font-semibold"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Double confirmation
          </label>
          <Input
            value={confirmation}
            onChange={(event) => onConfirmationChange(event.target.value)}
            placeholder={"Tapez " + expectedConfirmation}
            className="h-11 rounded-2xl bg-background/80 font-black uppercase"
          />
        </div>

        {isSamePlan ? (
          <p className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm font-bold text-amber-900 dark:text-amber-100">
            Selectionnez un plan different du plan actuel.
          </p>
        ) : null}

        {error ? (
          <p className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm font-bold text-red-800 dark:text-red-100">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-2xl font-black" disabled={submitting} onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" className="rounded-2xl font-black" disabled={!canSubmit} onClick={() => void onSubmit()}>
            {submitting ? "Application..." : "Changer le plan"}
          </Button>
        </div>
      </div>
    </div>
  );
}
