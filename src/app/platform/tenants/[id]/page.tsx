"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  CreditCard,
  LockKeyhole,
  Mail,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api/client-fetch";
import { normalizeRole } from "@/lib/auth/role";
import { useAuth } from "@/lib/auth-provider";
import { PLATFORM_ADMIN } from "@/lib/platform/admin";
import { cn } from "@/lib/utils";

import { formatTime, PLATFORM_PLANS } from "./format";
import {
  normalizeTenantWorkspaceTab,
  type OwnerInviteResult,
  type PlatformPlanId,
  type SupportScope,
  type TenantDétailResponse,
  type TenantWorkspaceTab,
} from "./types";
import { AccessState, MetricCard, TenantCommandCenter } from "./components/shared";
import { TenantIdentityCard, TenantPriorityCard, TenantSignalsCard } from "./components/situation-tab";
import { ActivateTenantAction, ActivationChecklistCard, OwnerInvitationAction } from "./components/activation-tab";
import { BillingGovernanceCard, PlanGovernanceAction } from "./components/billing-tab";
import { OwnerInvitationsPanel, TenantUsersTable } from "./components/access-tab";
import { StatusGovernanceAction, SupportSessionAction, SupportSessionsPanel } from "./components/support-tab";
import { TenantAuditLog } from "./components/audit-tab";

export default function PlatformTenantDétailPage() {
  const params = useParams<{ id: string }>();
  const tenantId = params?.id;
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<TenantDétailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusActionOpen, setStatusActionOpen] = useState(false);
  const [statusActionReason, setStatusActionReason] = useState("");
  const [statusActionConfirmation, setStatusActionConfirmation] = useState("");
  const [statusActionSubmitting, setStatusActionSubmitting] = useState(false);
  const [statusActionError, setStatusActionError] = useState<string | null>(null);
  const [statusActionSuccess, setStatusActionSuccess] = useState<string | null>(null);
  const [activateActionOpen, setActivateActionOpen] = useState(false);
  const [activateActionReason, setActivateActionReason] = useState("");
  const [activateActionConfirmation, setActivateActionConfirmation] = useState("");
  const [activateActionSubmitting, setActivateActionSubmitting] = useState(false);
  const [activateActionError, setActivateActionError] = useState<string | null>(null);
  const [activateActionSuccess, setActivateActionSuccess] = useState<string | null>(null);
  const [planActionOpen, setPlanActionOpen] = useState(false);
  const [planActionPlanId, setPlanActionPlanId] = useState<PlatformPlanId>("pro");
  const [planActionReason, setPlanActionReason] = useState("");
  const [planActionConfirmation, setPlanActionConfirmation] = useState("");
  const [planActionSubmitting, setPlanActionSubmitting] = useState(false);
  const [planActionError, setPlanActionError] = useState<string | null>(null);
  const [planActionSuccess, setPlanActionSuccess] = useState<string | null>(null);
  const [ownerInviteOpen, setOwnerInviteOpen] = useState(false);
  const [ownerInviteName, setOwnerInviteName] = useState("");
  const [ownerInviteEmail, setOwnerInviteEmail] = useState("");
  const [ownerInviteReason, setOwnerInviteReason] = useState("");
  const [ownerInviteConfirmation, setOwnerInviteConfirmation] = useState("");
  const [ownerInviteSubmitting, setOwnerInviteSubmitting] = useState(false);
  const [ownerInviteError, setOwnerInviteError] = useState<string | null>(null);
  const [ownerInviteResult, setOwnerInviteResult] = useState<OwnerInviteResult | null>(null);
  const [supportActionOpen, setSupportActionOpen] = useState(false);
  const [supportActionScope, setSupportActionScope] = useState<SupportScope>("diagnostic");
  const [supportActionDuration, setSupportActionDuration] = useState(30);
  const [supportActionReason, setSupportActionReason] = useState("");
  const [supportActionConfirmation, setSupportActionConfirmation] = useState("");
  const [supportActionSubmitting, setSupportActionSubmitting] = useState(false);
  const [supportActionError, setSupportActionError] = useState<string | null>(null);
  const [supportActionSuccess, setSupportActionSuccess] = useState<string | null>(null);
  const [closeSupportSessionId, setCloseSupportSessionId] = useState<string | null>(null);
  const [closeSupportReason, setCloseSupportReason] = useState("");
  const [closeSupportConfirmation, setCloseSupportConfirmation] = useState("");
  const [closeSupportSubmitting, setCloseSupportSubmitting] = useState(false);
  const [closeSupportError, setCloseSupportError] = useState<string | null>(null);
  const [closeSupportSuccess, setCloseSupportSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TenantWorkspaceTab>("situation");

  const role = useMemo(() => normalizeRole(user?.role), [user?.role]);
  const isSuperAdmin = role === "super_admin" && user?.tenantId === "platform";

  function activateTenantTab(tab: TenantWorkspaceTab) {
    setActiveTab(tab);
    if (typeof window === "undefined") return;
    window.history.pushState(null, "", window.location.pathname + "#" + tab);
  }

  async function load(isRefresh = false) {
    if (!tenantId || !isSuperAdmin) {
      setLoading(false);
      return;
    }

    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    setError(null);

    try {
      const response = await apiFetch<TenantDétailResponse>(
        "/api/platform/tenants/" + encodeURIComponent(tenantId)
      );
      setData(response);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de charger la fiche agence SaaS."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }


  async function submitActivateTenantAction() {
    const tenant = data?.tenant;
    if (!tenant) return;

    setActivateActionSubmitting(true);
    setActivateActionError(null);
    setActivateActionSuccess(null);

    try {
      await apiFetch<{ ok: true }>("/api/platform/tenants/" + encodeURIComponent(tenant.id), {
        method: "PATCH",
        body: {
          action: "activate_tenant",
          reason: activateActionReason,
          confirmation: activateActionConfirmation,
        },
      });

      setActivateActionSuccess("Agence activee et action journalisee.");
      setActivateActionReason("");
      setActivateActionConfirmation("");
      setActivateActionOpen(false);
      await load(true);
    } catch (err) {
      setActivateActionError(
        err instanceof Error
          ? err.message
          : "Impossible d'activer l'agence."
      );
    } finally {
      setActivateActionSubmitting(false);
    }
  }

  async function submitTenantPlanAction() {
    const tenant = data?.tenant;
    if (!tenant) return;

    setPlanActionSubmitting(true);
    setPlanActionError(null);
    setPlanActionSuccess(null);

    try {
      await apiFetch<{ ok: true }>("/api/platform/tenants/" + encodeURIComponent(tenant.id), {
        method: "PATCH",
        body: {
          action: "change_plan",
          planId: planActionPlanId,
          reason: planActionReason,
          confirmation: planActionConfirmation,
        },
      });

      setPlanActionSuccess("Plan modifié et action journalisee.");
      setPlanActionReason("");
      setPlanActionConfirmation("");
      setPlanActionOpen(false);
      await load(true);
    } catch (err) {
      setPlanActionError(
        err instanceof Error
          ? err.message
          : "Impossible de modifier le plan de l'agence."
      );
    } finally {
      setPlanActionSubmitting(false);
    }
  }

  async function submitOwnerInvitationAction() {
    const tenant = data?.tenant;
    if (!tenant) return;

    setOwnerInviteSubmitting(true);
    setOwnerInviteError(null);
    setOwnerInviteResult(null);

    try {
      const response = await apiFetch<{
        ok: true;
        result: OwnerInviteResult;
      }>("/api/platform/tenants/" + encodeURIComponent(tenant.id), {
        method: "PATCH",
        body: {
          action: "invite_owner",
          ownerName: ownerInviteName,
          ownerEmail: ownerInviteEmail || tenant.ownerEmail,
          reason: ownerInviteReason,
          confirmation: ownerInviteConfirmation,
        },
      });

      setOwnerInviteResult(response.result);
      setOwnerInviteReason("");
      setOwnerInviteConfirmation("");
      await load(true);
    } catch (err) {
      setOwnerInviteError(
        err instanceof Error
          ? err.message
          : "Impossible de préparer l'invitation propriétaire."
      );
    } finally {
      setOwnerInviteSubmitting(false);
    }
  }

  async function submitSupportSessionAction() {
    const tenant = data?.tenant;
    if (!tenant) return;

    setSupportActionSubmitting(true);
    setSupportActionError(null);
    setSupportActionSuccess(null);

    try {
      const response = await apiFetch<{
        ok: true;
        result?: { expiresAtIso?: string };
      }>("/api/platform/tenants/" + encodeURIComponent(tenant.id), {
        method: "PATCH",
        body: {
          action: "open_support_session",
          scope: supportActionScope,
          durationMinutes: supportActionDuration,
          reason: supportActionReason,
          confirmation: supportActionConfirmation,
        },
      });

      setSupportActionSuccess(
        "Session support ouverte jusqu'a " + formatTime(response.result?.expiresAtIso) + " et journalisee."
      );
      setSupportActionReason("");
      setSupportActionConfirmation("");
      setSupportActionOpen(false);
      await load(true);
    } catch (err) {
      setSupportActionError(
        err instanceof Error
          ? err.message
          : "Impossible d'ouvrir la session support."
      );
    } finally {
      setSupportActionSubmitting(false);
    }
  }

  async function submitCloseSupportSessionAction(sessionId: string) {
    const tenant = data?.tenant;
    if (!tenant) return;

    setCloseSupportSubmitting(true);
    setCloseSupportError(null);
    setCloseSupportSuccess(null);

    try {
      await apiFetch<{ ok: true }>("/api/platform/tenants/" + encodeURIComponent(tenant.id), {
        method: "PATCH",
        body: {
          action: "close_support_session",
          supportSessionId: sessionId,
          reason: closeSupportReason,
          confirmation: closeSupportConfirmation,
        },
      });

      setCloseSupportSuccess("Session support clôturée et journalisee.");
      setCloseSupportReason("");
      setCloseSupportConfirmation("");
      setCloseSupportSessionId(null);
      await load(true);
    } catch (err) {
      setCloseSupportError(
        err instanceof Error
          ? err.message
          : "Impossible de clôturer la session support."
      );
    } finally {
      setCloseSupportSubmitting(false);
    }
  }

  async function submitTenantStatusAction(
    targetStatus: "active" | "suspended",
    expectedConfirmation: string
  ) {
    const tenant = data?.tenant;
    if (!tenant) return;

    setStatusActionSubmitting(true);
    setStatusActionError(null);
    setStatusActionSuccess(null);

    try {
      await apiFetch<{ ok: true }>("/api/platform/tenants/" + encodeURIComponent(tenant.id), {
        method: "PATCH",
        body: {
          status: targetStatus,
          reason: statusActionReason,
          confirmation: statusActionConfirmation,
        },
      });

      setStatusActionSuccess(
        targetStatus === "suspended"
          ? "Agence suspendue et action journalisee."
          : "Agence réactivee et action journalisee."
      );
      setStatusActionReason("");
      setStatusActionConfirmation("");
      setStatusActionOpen(false);
      await load(true);
    } catch (err) {
      setStatusActionError(
        err instanceof Error
          ? err.message
          : "Impossible de modifier le statut de l'agence."
      );
    } finally {
      setStatusActionSubmitting(false);
    }
  }

  useEffect(() => {
    const syncTab = () => {
      setActiveTab(normalizeTenantWorkspaceTab(window.location.hash));
    };

    syncTab();
    window.addEventListener("hashchange", syncTab);
    window.addEventListener("popstate", syncTab);
    return () => {
      window.removeEventListener("hashchange", syncTab);
      window.removeEventListener("popstate", syncTab);
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, tenantId, isSuperAdmin]);

  if (authLoading || loading) {
    return (
      <div className="mx-auto max-w-[1500px] space-y-6 p-6">
        <Skeleton className="h-44 rounded-[2rem]" />
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-28 rounded-[2rem]" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-[2rem]" />
      </div>
    );
  }

  if (!user || !isSuperAdmin) {
    return (
      <AccessState
        title="Accès plateforme réservé"
        detail={"Cette fiche agence est reservee au super admin " + PLATFORM_ADMIN.name + "."}
        actionHref="/platform"
        actionLabel="Retour plateforme"
      />
    );
  }

  const tenant = data?.tenant;
  const billing = data?.billing;
  const counters = data?.counters;
  const onboarding = data?.onboarding ?? null;
  const signals = data?.signals ?? [];
  const activeSupportSessions = (data?.supportSessions ?? []).filter((session) => {
    return session.status === "active";
  }).length;
  const attentionSignals = signals.filter((signal) => signal.tone !== "info").length;

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_32%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--muted))/0.35)]">
      <header className="sticky top-0 z-30 border-b bg-background/82 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <Button asChild variant="outline" size="icon" className="rounded-2xl">
              <Link href="/platform#tenants" aria-label="Retour agences">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg dark:bg-white dark:text-slate-950">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <nav
                aria-label="Fil d'Ariane"
                className="flex flex-wrap items-center gap-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground"
              >
                <Link href="/platform#overview" className="transition hover:text-primary">
                  Backoffice SaaS
                </Link>
                <span>/</span>
                <Link href="/platform#tenants" className="transition hover:text-primary">
                  Agences
                </Link>
                <span>/</span>
                <span className="text-primary">Fiche agence</span>
              </nav>
              <h1 className="text-2xl font-black tracking-tight">
                {tenant?.name ?? "Agence"}
              </h1>
              <p className="mt-1 text-xs font-semibold text-muted-foreground">
                Pilotee par {PLATFORM_ADMIN.name} - {tenant?.ownerEmail ?? tenant?.id ?? tenantId}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]">
              Synchro {formatTime(data?.generatedAtIso)}
            </Badge>
            <Button
              type="button"
              variant="outline"
              onClick={() => void load(true)}
              className="rounded-2xl font-black"
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
              Rafraîchir
            </Button>
            <Button asChild variant="outline" className="rounded-2xl font-black">
              <Link href="/platform#tenants">
                Liste agences
              </Link>
            </Button>
            <Button asChild className="rounded-2xl font-black">
              <Link href="/platform#overview">
                Console SaaS
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] space-y-6 px-6 py-6">
        {error ? (
          <div className="rounded-[2rem] border border-red-500/25 bg-red-500/10 p-5 text-red-900 dark:text-red-100">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-black">Fiche indisponible</p>
                <p className="mt-1 text-sm font-semibold opacity-80">{error}</p>
              </div>
            </div>
          </div>
        ) : null}

        <TenantCommandCenter
          data={data}
          tenant={tenant}
          tenantId={tenantId}
          activeSupportSessions={activeSupportSessions}
          attentionSignals={attentionSignals}
          activeTab={activeTab}
          onTabChange={activateTenantTab}
        />

        {activeTab === "situation" ? (
          <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                <MetricCard icon={Users} label="Users" value={counters?.users ?? 0} detail="Actifs" />
                <MetricCard icon={ShieldCheck} label="Agents" value={counters?.agents ?? 0} detail="Actifs" />
                <MetricCard icon={Building2} label="Sites" value={counters?.sites ?? 0} detail="Actifs" />
                <MetricCard icon={Mail} label="Clients" value={counters?.clients ?? 0} detail="Geres" />
                <MetricCard icon={Activity} label="Vacations" value={counters?.vacationsMonth ?? 0} detail="Mois" />
                <MetricCard
                  icon={AlertTriangle}
                  label="Incidents"
                  value={counters?.openIncidents ?? 0}
                  detail="Ouverts"
                  tone={(counters?.openIncidents ?? 0) > 0 ? "warning" : "default"}
                />
              </div>
              <TenantSignalsCard signals={signals} />
            </div>

            <aside className="space-y-4">
              <TenantIdentityCard data={data} tenant={tenant} tenantId={tenantId} />
              <TenantPriorityCard
                data={data}
                activeSupportSessions={activeSupportSessions}
                attentionSignals={attentionSignals}
              />
            </aside>
          </section>
        ) : null}

        {activeTab === "activation" ? (
          <section className="grid gap-4 xl:grid-cols-[1fr_420px]">
            <ActivationChecklistCard onboarding={onboarding} />
            <Card className="rounded-[2rem] border-border/60 bg-background/90 shadow-sm">
              <CardHeader className="border-b bg-muted/20">
                <CardTitle className="flex items-center gap-2 text-xl font-black">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  Mise en service
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4">
                <ActivateTenantAction
                  tenant={tenant}
                  onboarding={onboarding}
                  open={activateActionOpen}
                  reason={activateActionReason}
                  confirmation={activateActionConfirmation}
                  submitting={activateActionSubmitting}
                  error={activateActionError}
                  success={activateActionSuccess}
                  onOpenChange={(nextOpen) => {
                    setActivateActionOpen(nextOpen);
                    setActivateActionError(null);
                    setActivateActionSuccess(null);
                  }}
                  onReasonChange={setActivateActionReason}
                  onConfirmationChange={setActivateActionConfirmation}
                  onSubmit={submitActivateTenantAction}
                />
                <OwnerInvitationAction
                  tenant={tenant}
                  open={ownerInviteOpen}
                  name={ownerInviteName}
                  email={ownerInviteEmail}
                  reason={ownerInviteReason}
                  confirmation={ownerInviteConfirmation}
                  submitting={ownerInviteSubmitting}
                  error={ownerInviteError}
                  result={ownerInviteResult}
                  onOpenChange={(nextOpen) => {
                    setOwnerInviteOpen(nextOpen);
                    setOwnerInviteError(null);
                    setOwnerInviteResult(null);
                    if (nextOpen && !ownerInviteEmail) {
                      setOwnerInviteEmail(tenant?.ownerEmail ?? "");
                    }
                  }}
                  onNameChange={setOwnerInviteName}
                  onEmailChange={setOwnerInviteEmail}
                  onReasonChange={setOwnerInviteReason}
                  onConfirmationChange={setOwnerInviteConfirmation}
                  onSubmit={submitOwnerInvitationAction}
                />
              </CardContent>
            </Card>
          </section>
        ) : null}

        {activeTab === "billing" ? (
          <section className="grid gap-4 xl:grid-cols-[1fr_420px]">
            <BillingGovernanceCard data={data} />

            <Card className="rounded-[2rem] border-border/60 bg-background/90 shadow-sm">
              <CardHeader className="border-b bg-muted/20">
                <CardTitle className="flex items-center gap-2 text-xl font-black">
                  <CreditCard className="h-5 w-5 text-primary" />
                  Pilotage abonnement
                </CardTitle>
                <p className="mt-1 text-sm font-semibold text-muted-foreground">
                  Changer le plan et les quotas uniquement quand la décision commerciale est claire.
                </p>
              </CardHeader>
              <CardContent className="space-y-3 p-4">
                <PlanGovernanceAction
                  currentPlanId={(billing?.subscription.planId ?? billing?.plan.id ?? tenant?.plan ?? "free").toLowerCase()}
                  selectedPlanId={planActionPlanId}
                  open={planActionOpen}
                  reason={planActionReason}
                  confirmation={planActionConfirmation}
                  submitting={planActionSubmitting}
                  error={planActionError}
                  success={planActionSuccess}
                  onOpenChange={(nextOpen) => {
                    setPlanActionOpen(nextOpen);
                    setPlanActionError(null);
                    setPlanActionSuccess(null);
                    if (nextOpen) {
                      const current = (billing?.subscription.planId ?? billing?.plan.id ?? "pro").toLowerCase();
                      setPlanActionPlanId(PLATFORM_PLANS.some((plan) => plan.id === current) ? (current as PlatformPlanId) : "pro");
                    }
                  }}
                  onPlanChange={setPlanActionPlanId}
                  onReasonChange={setPlanActionReason}
                  onConfirmationChange={setPlanActionConfirmation}
                  onSubmit={submitTenantPlanAction}
                />
              </CardContent>
            </Card>
          </section>
        ) : null}

        {activeTab === "support" ? (
          <section className="grid gap-4 xl:grid-cols-[1fr_420px]">
            <SupportSessionsPanel
              sessions={data?.supportSessions ?? []}
              closeSessionId={closeSupportSessionId}
              closeReason={closeSupportReason}
              closeConfirmation={closeSupportConfirmation}
              closeSubmitting={closeSupportSubmitting}
              closeError={closeSupportError}
              closeSuccess={closeSupportSuccess}
              onOpenClose={(sessionId) => {
                setCloseSupportSessionId(sessionId);
                setCloseSupportReason("");
                setCloseSupportConfirmation("");
                setCloseSupportError(null);
                setCloseSupportSuccess(null);
              }}
              onCancelClose={() => {
                setCloseSupportSessionId(null);
                setCloseSupportReason("");
                setCloseSupportConfirmation("");
                setCloseSupportError(null);
              }}
              onReasonChange={setCloseSupportReason}
              onConfirmationChange={setCloseSupportConfirmation}
              onSubmitClose={submitCloseSupportSessionAction}
            />

            <Card className="rounded-[2rem] border-border/60 bg-background/90 shadow-sm">
              <CardHeader className="border-b bg-muted/20">
                <CardTitle className="flex items-center gap-2 text-xl font-black">
                  <LockKeyhole className="h-5 w-5 text-primary" />
                  Support et actions sensibles
                </CardTitle>
                <p className="mt-1 text-sm font-semibold text-muted-foreground">
                  Ouvrir une session support ou suspendre/réactiver une agence avec motif et audit.
                </p>
              </CardHeader>
              <CardContent className="space-y-3 p-4">
                <SupportSessionAction
                  open={supportActionOpen}
                  scope={supportActionScope}
                  durationMinutes={supportActionDuration}
                  reason={supportActionReason}
                  confirmation={supportActionConfirmation}
                  submitting={supportActionSubmitting}
                  error={supportActionError}
                  success={supportActionSuccess}
                  onOpenChange={(nextOpen) => {
                    setSupportActionOpen(nextOpen);
                    setSupportActionError(null);
                    setSupportActionSuccess(null);
                  }}
                  onScopeChange={setSupportActionScope}
                  onDurationChange={setSupportActionDuration}
                  onReasonChange={setSupportActionReason}
                  onConfirmationChange={setSupportActionConfirmation}
                  onSubmit={submitSupportSessionAction}
                />
                <StatusGovernanceAction
                  tenant={tenant}
                  open={statusActionOpen}
                  reason={statusActionReason}
                  confirmation={statusActionConfirmation}
                  submitting={statusActionSubmitting}
                  error={statusActionError}
                  success={statusActionSuccess}
                  onOpenChange={(nextOpen) => {
                    setStatusActionOpen(nextOpen);
                    setStatusActionError(null);
                    setStatusActionSuccess(null);
                  }}
                  onReasonChange={setStatusActionReason}
                  onConfirmationChange={setStatusActionConfirmation}
                  onSubmit={submitTenantStatusAction}
                />
              </CardContent>
            </Card>
          </section>
        ) : null}

        {activeTab === "access" ? (
          <section className="grid gap-4 xl:grid-cols-[1fr_420px]">
            <TenantUsersTable users={data?.users ?? []} />
            <OwnerInvitationsPanel invitations={data?.ownerInvitations ?? []} />
          </section>
        ) : null}

        {activeTab === "audit" ? (
          <TenantAuditLog events={data?.auditLog ?? []} />
        ) : null}
      </main>
    </div>
  );
}
