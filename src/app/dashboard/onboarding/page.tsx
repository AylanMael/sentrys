"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  Flag,
  Loader2,
  Mail,
  Rocket,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, getApiErrorMessage } from "@/lib/api/client-fetch";
import { useAuth } from "@/lib/auth-provider";
import { cn } from "@/lib/utils";

type OnboardingStep = {
  id: string;
  label: string;
  detail: string;
  done: boolean;
  blocker: boolean;
  href: string;
  actionLabel: string;
};

type OnboardingResponse = {
  ok: true;
  tenantId: string;
  tenant: {
    id: string;
    name: string;
    status: string;
    ownerEmail: string | null;
    createdAtIso: string | null;
    updatedAtIso: string | null;
  };
  profile: {
    displayName: string;
    legalName: string | null;
    logoUrl: string | null;
    phone: string | null;
    email: string | null;
    cnaps: string | null;
    siret: string | null;
  };
  counters: {
    users: number;
    clients: number;
    sites: number;
  };
  onboarding: {
    status: string;
    completion: number;
    readyToRequest: boolean;
    activationRequested: boolean;
    active: boolean;
    requestedAtIso: string | null;
    currentUserIsRequester: boolean;
    steps: OnboardingStep[];
  };
};

function formatDate(value: string | null) {
  if (!value) return "Non envoyé";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Non envoyé";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function stepIcon(id: string) {
  if (id === "identity") return Building2;
  if (id === "owner") return UserRoundCheck;
  if (id === "client") return Mail;
  if (id === "site") return ShieldCheck;
  return FileText;
}

function statusLabel(status: string, requested: boolean, active: boolean) {
  if (active) return "Agence active";
  if (requested) return "Activation demandee";
  if (status === "pending_setup") return "En configuration";
  return status || "En configuration";
}

function statusTone(requested: boolean, active: boolean) {
  if (active) return "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100";
  if (requested) return "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-100";
  return "border-sky-500/25 bg-sky-500/10 text-sky-800 dark:text-sky-100";
}

export default function AgencyOnboardingPage() {
  const { user, refresh } = useAuth();
  const [data, setData] = useState<OnboardingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch<OnboardingResponse>("/api/onboarding/status");
      setData(response);
    } catch (err) {
      setError(getApiErrorMessage(err, "Impossible de charger l'onboarding."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const onboarding = data?.onboarding;
  const isActive = Boolean(onboarding?.active);
  const ready = Boolean(onboarding?.readyToRequest);
  const requested = Boolean(onboarding?.activationRequested);

  const blockers = useMemo(() => {
    return onboarding?.steps.filter((step) => step.blocker && !step.done) ?? [];
  }, [onboarding?.steps]);

  const optionalSteps = useMemo(() => {
    return onboarding?.steps.filter((step) => !step.blocker) ?? [];
  }, [onboarding?.steps]);

  const nextStep = useMemo(() => {
    return blockers[0] ?? optionalSteps.find((step) => !step.done) ?? null;
  }, [blockers, optionalSteps]);

  async function requestActivation() {
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await apiFetch<OnboardingResponse>("/api/onboarding/status", {
        method: "PATCH",
        body: {
          action: "request_activation",
          reason,
        },
      });

      setData(response);
      setReason("");
      setSuccess("Demande envoyée a VSW Digital. Vous pouvez continuer a compléter l'agence pendant la validation.");
      await refresh();
    } catch (err) {
      setError(getApiErrorMessage(err, "Impossible d'envoyer la demande."));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="rounded-[2rem] border bg-background/80 p-8 text-center shadow-sm">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-sm font-black uppercase tracking-[0.18em] text-muted-foreground">
            Preparation du démarrage
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1420px] space-y-5">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_34%),linear-gradient(135deg,#ffffff,#f7fbff_48%,#f8fafc)] shadow-sm dark:border-white/10 dark:bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_34%),linear-gradient(135deg,hsl(var(--background)),hsl(var(--muted))/0.28)]">
        <div className="grid gap-0 xl:grid-cols-[1fr_380px]">
          <div className="p-6 md:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-primary hover:bg-primary/10">
                Assistant de mise en service
              </Badge>
              <Badge
                variant="outline"
                className={cn("rounded-full px-3 py-1 font-black", statusTone(requested, isActive))}
              >
                {statusLabel(data?.tenant.status ?? "pending_setup", requested, isActive)}
              </Badge>
            </div>

            <h1 className="mt-5 max-w-4xl text-3xl font-black tracking-tight md:text-4xl">
              Votre agence est en configuration
            </h1>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-muted-foreground">
              On prépare l'espace {data?.tenant.name ?? user?.name ?? "agence"} avant exploitation :
              identité, propriétaire, premier client, premier site, puis validation VSW Digital.
              Tant que l'agence n'est pas activee, Sentrys vous guide vers l'essentiel.
            </p>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <HeroSignal
                icon={Building2}
                label="Identité"
                value={data?.profile.displayName || data?.tenant.name || "A compléter"}
              />
              <HeroSignal
                icon={Mail}
                label="Email agence"
                value={data?.profile.email || data?.tenant.ownerEmail || "A renseignér"}
              />
              <HeroSignal
                icon={Flag}
                label="Prochaine action"
                value={isActive ? "Exploiter" : requested ? "Attendre VSW" : nextStep?.label ?? "Activation"}
              />
            </div>
          </div>

          <div className="border-t bg-white/72 p-6 dark:bg-background/55 xl:border-l xl:border-t-0">
            <div className="rounded-[1.5rem] border bg-background/90 p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
                Progression agence
              </p>
              <div className="mt-3 flex items-end justify-between gap-4">
                <p className="text-5xl font-black tracking-tight">
                  {onboarding?.completion ?? 0}%
                </p>
                <Badge variant="outline" className="rounded-full font-black">
                  {blockers.length} requis
                </Badge>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", ready ? "bg-emerald-500" : "bg-primary")}
                  style={{ width: (onboarding?.completion ?? 0) + "%" }}
                />
              </div>
              <p className="mt-4 text-sm font-semibold leading-6 text-muted-foreground">
                {isActive
                  ? "Agence active. Le tableau de bord exploitation est disponible."
                  : requested
                    ? "Demande reçue. VSW Digital peut vérifier et activer l'agence."
                    : ready
                      ? "Les pré-requis sont prêts. Vous pouvez demander l'activation."
                      : "Complétez les points requis ci-dessous, dans l'ordre propose."}
              </p>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm font-bold text-red-800 dark:text-red-100">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-800 dark:text-emerald-100">
          {success}
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1fr_410px]">
        <div className="space-y-4">
          <Card className="overflow-hidden rounded-[2rem] border-border/70 bg-background/95 shadow-sm">
            <CardHeader className="border-b bg-muted/20 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl font-black">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    Checklist de mise en service
                  </CardTitle>
                  <p className="mt-1 text-sm font-semibold text-muted-foreground">
                    Les actions sont volontairement limitees : on évite la confusion au démarrage.
                  </p>
                </div>
                <Badge variant="outline" className="rounded-full px-3 py-1 font-black">
                  {(onboarding?.steps ?? []).filter((step) => step.done).length}/{onboarding?.steps.length ?? 0} OK
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="divide-y p-0">
              {(onboarding?.steps ?? []).map((step, index) => {
                const Icon = stepIcon(step.id);
                const isNext = !step.done && step.id === nextStep?.id;

                return (
                  <div
                    key={step.id}
                    className={cn(
                      "grid gap-3 p-4 transition md:grid-cols-[56px_1fr_auto] md:items-center",
                      isNext ? "bg-blue-50/70 dark:bg-blue-950/20" : "bg-background",
                      step.done ? "text-foreground" : "text-foreground"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-2xl border text-sm font-black",
                        step.done
                          ? "border-emerald-500/25 bg-emerald-500 text-white"
                          : isNext
                            ? "border-primary/25 bg-primary text-primary-foreground"
                            : "border-border bg-muted/30 text-muted-foreground"
                      )}
                    >
                      {step.done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black">
                          {index + 1}. {step.label}
                        </p>
                        {isNext ? (
                          <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">
                            A faire maintenant
                          </Badge>
                        ) : null}
                        {!step.blocker ? (
                          <Badge variant="outline" className="rounded-full">
                            Recommande
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm font-semibold leading-5 text-muted-foreground">
                        {step.detail}
                      </p>
                    </div>

                    <Button
                      asChild
                      variant={step.done ? "outline" : isNext ? "default" : "secondary"}
                      className="rounded-2xl font-black"
                    >
                      <Link href={step.href}>
                        {step.done ? "Vérifier" : step.actionLabel}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="rounded-[2rem] border-border/70 bg-background/95 shadow-sm">
            <CardHeader className="border-b bg-muted/20 px-5 py-4">
              <CardTitle className="flex items-center gap-2 text-xl font-black">
                <Rocket className="h-5 w-5 text-primary" />
                Validation VSW Digital
              </CardTitle>
              <p className="text-sm font-semibold text-muted-foreground">
                Une activation propre protégé la plateforme et évite les agences incomplètes.
              </p>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <div className="grid grid-cols-3 gap-2">
                <MiniKpi label="Users" value={data?.counters.users ?? 0} />
                <MiniKpi label="Clients" value={data?.counters.clients ?? 0} />
                <MiniKpi label="Sites" value={data?.counters.sites ?? 0} />
              </div>

              {requested ? (
                <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
                  <div className="flex items-start gap-3">
                    <Clock className="mt-0.5 h-5 w-5 text-amber-700 dark:text-amber-300" />
                    <div>
                      <p className="font-black">Demande en attente</p>
                      <p className="mt-1 text-sm font-semibold text-muted-foreground">
                        Envoyee le {formatDate(onboarding?.requestedAtIso ?? null)}.
                      </p>
                    </div>
                  </div>
                </div>
              ) : isActive ? (
                <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
                  <p className="font-black text-emerald-800 dark:text-emerald-100">
                    Agence activee
                  </p>
                  <p className="mt-1 text-sm font-semibold text-muted-foreground">
                    L'exploitation peut maintenant utilisér l'ensemble des modules autorisés.
                  </p>
                </div>
              ) : (
                <>
                  {!ready ? (
                    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
                      <p className="font-black text-amber-800 dark:text-amber-100">
                        Encore {blockers.length} point(s) requis
                      </p>
                      <p className="mt-1 text-sm font-semibold text-muted-foreground">
                        Le bouton d'activation se debloqué dès que les pré-requis obligatoires sont termines.
                      </p>
                    </div>
                  ) : null}

                  <Textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Message optionnel pour VSW Digital : contexte commercial, urgence, commentaire de mise en service..."
                    className="min-h-28 rounded-2xl font-semibold"
                    disabled={!ready}
                  />
                  <Button
                    type="button"
                    className="h-12 w-full rounded-2xl font-black"
                    disabled={!ready || submitting}
                    onClick={() => void requestActivation()}
                  >
                    {submitting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-4 w-4" />
                    )}
                    {ready ? "Demander l'activation" : "Pré-requis incomplets"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border-border/70 bg-background/95 shadow-sm">
            <CardContent className="p-5">
              <p className="font-black">Accès autorisés avant activation</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-muted-foreground">
                Le propriétaire peut uniquement préparer le socle : paramètres, utilisateurs,
                clients et sites. Les modules exploitation restent gardes par le parcours.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <QuickLink href="/dashboard/settings" label="Paramètres" />
                <QuickLink href="/dashboard/users" label="Utilisateurs" />
                <QuickLink href="/dashboard/clients" label="Clients" />
                <QuickLink href="/dashboard/sites" label="Sites" />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

function HeroSignal({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border bg-white/72 p-4 shadow-sm dark:bg-background/60">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </p>
          <p className="truncate text-sm font-black">{value}</p>
        </div>
      </div>
    </div>
  );
}

function MiniKpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-muted/20 p-3 text-center">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild variant="outline" className="justify-start rounded-2xl font-black">
      <Link href={href}>{label}</Link>
    </Button>
  );
}
