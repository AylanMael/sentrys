import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock,
  CreditCard,
  LockKeyhole,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { riskClass, riskLabel } from "../format";
import type { TenantDétailResponse, TenantWorkspaceTab } from "../types";

export function SectionHeading({
  eyebrow,
  title,
  detail,
}: {
  eyebrow: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">
        {eyebrow}
      </p>
      <h2 className="text-xl font-black tracking-tight">{title}</h2>
      <p className="max-w-3xl text-sm font-semibold leading-6 text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}

export function TenantCommandCenter({
  data,
  tenant,
  tenantId,
  activeSupportSessions,
  attentionSignals,
  activeTab,
  onTabChange,
}: {
  data: TenantDétailResponse | null;
  tenant: TenantDétailResponse["tenant"] | null | undefined;
  tenantId: string | undefined;
  activeSupportSessions: number;
  attentionSignals: number;
  activeTab: TenantWorkspaceTab;
  onTabChange: (tab: TenantWorkspaceTab) => void;
}) {
  const onboarding = data?.onboarding ?? null;
  const risk = data?.risk;
  const nextStep = onboarding?.steps.find((step) => !step.done) ?? null;
  const ready = Boolean(onboarding?.readyToActivate);
  const status = tenant?.status ?? "unknown";
  const plan = data?.billing?.plan.name ?? tenant?.plan ?? "standard";

  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-200/70 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/72">
      <div className="grid gap-0 xl:grid-cols-[1fr_380px]">
        <div className="p-4 lg:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-primary hover:bg-primary/10">
              SaaS
            </Badge>
            <Badge variant="outline" className="rounded-full capitalize">
              {status}
            </Badge>
            <Badge variant="outline" className="rounded-full">
              {plan}
            </Badge>
            {risk ? (
              <Badge className={cn("rounded-full border px-3 py-1 font-black", riskClass(risk.riskLevel))}>
                {riskLabel(risk.riskLevel)}
              </Badge>
            ) : null}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
            <div className="min-w-0">
              <h2 className="truncate text-3xl font-black tracking-tight">
                {tenant?.name ?? "Agence SaaS"}
              </h2>
              <p className="mt-1 truncate text-sm font-semibold text-muted-foreground">
                {tenant?.ownerEmail ?? tenant?.id ?? tenantId}
              </p>
            </div>
            <div className="rounded-2xl border bg-slate-50/80 p-3 dark:bg-slate-900/70">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Prochain pas
              </p>
              <p className="mt-1 truncate text-sm font-black">
                {ready ? "Activer l'agence" : nextStep?.label ?? "Surveiller"}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
            <TenantTabButton icon={Activity} label="Situation" active={activeTab === "situation"} onClick={() => onTabChange("situation")} />
            <TenantTabButton icon={CheckCircle2} label="Activation" active={activeTab === "activation"} onClick={() => onTabChange("activation")} />
            <TenantTabButton icon={CreditCard} label="Abonnement" active={activeTab === "billing"} onClick={() => onTabChange("billing")} />
            <TenantTabButton icon={Users} label="Accès" active={activeTab === "access"} onClick={() => onTabChange("access")} />
            <TenantTabButton icon={LockKeyhole} label="Support" active={activeTab === "support"} onClick={() => onTabChange("support")} />
            <TenantTabButton icon={Clock} label="Audit" active={activeTab === "audit"} onClick={() => onTabChange("audit")} />
          </div>
        </div>

        <div className="border-t bg-slate-50/75 p-4 dark:bg-slate-900/45 xl:border-l xl:border-t-0">
          <div className="grid grid-cols-2 gap-3">
            <CommandStatusRow label="Checklist" value={(onboarding?.completion ?? 0) + "%"} detail={ready ? "Pret" : "A finir"} />
            <CommandStatusRow label="Support" value={String(activeSupportSessions)} detail="Ouvert" />
            <CommandStatusRow label="Signaux" value={String(attentionSignals)} detail="A traiter" tone={attentionSignals > 0 ? "warning" : "default"} />
            <CommandStatusRow label="Tenant" value={tenant?.id ?? tenantId ?? "-"} detail="ID" compact />
          </div>
        </div>
      </div>
    </section>
  );
}

export function TenantTabButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-12 items-center justify-center gap-2 rounded-2xl border px-3 text-sm font-black transition",
        active
          ? "border-slate-950 bg-slate-950 text-white shadow-sm dark:border-white dark:bg-white dark:text-slate-950"
          : "bg-background/80 text-muted-foreground hover:border-primary/40 hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function CommandStatusRow({
  label,
  value,
  detail,
  tone = "default",
  compact = false,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "warning" | "critical";
  compact?: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-background/80 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </p>
          <p
            className={cn(
              "mt-1 font-black",
              compact ? "truncate text-sm" : "text-2xl",
              tone === "warning" && "text-amber-700 dark:text-amber-300",
              tone === "critical" && "text-red-700 dark:text-red-300"
            )}
          >
            {value}
          </p>
        </div>
        <p className="max-w-[120px] text-right text-xs font-semibold leading-5 text-muted-foreground">
          {detail}
        </p>
      </div>
    </div>
  );
}

export function MiniInfo({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-muted/15 p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1 font-black", compact ? "truncate text-xs" : "text-sm")}>
        {value}
      </p>
    </div>
  );
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  detail: string;
  tone?: "default" | "warning";
}) {
  return (
    <Card
      className={cn(
        "rounded-[2rem] border-border/60",
        tone === "warning" && "border-amber-500/25 bg-amber-500/10"
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 text-3xl font-black tracking-tight">{value}</p>
          </div>
          <div className="rounded-2xl bg-primary/10 p-2.5 text-primary">
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="mt-2 text-xs font-semibold text-muted-foreground">
          {detail}
        </p>
      </CardContent>
    </Card>
  );
}

export function AccessState({
  title,
  detail,
  actionHref,
  actionLabel,
}: {
  title: string;
  detail: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/25 p-6">
      <Card className="max-w-xl rounded-[2rem] border-border/60">
        <CardContent className="p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
            <LockKeyhole className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-2xl font-black tracking-tight">{title}</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-muted-foreground">
            {detail}
          </p>
          <Button asChild className="mt-6 h-11 rounded-2xl font-black">
            <Link href={actionHref}>
              {actionLabel}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

