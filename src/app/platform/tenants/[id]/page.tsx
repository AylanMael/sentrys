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
  Clock,
  CreditCard,
  LockKeyhole,
  Copy,
  Mail,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/api/client-fetch";
import { normalizeRole } from "@/lib/auth/role";
import { useAuth } from "@/lib/auth-provider";
import { PLATFORM_ADMIN } from "@/lib/platform/admin";
import { cn } from "@/lib/utils";

type RiskLevel = "ok" | "watch" | "critical";
type SignalTone = "critical" | "warning" | "info";
type PlatformPlanId = "free" | "starter" | "pro" | "growth";
type SupportScope = "diagnostic" | "billing" | "technical" | "security";
type TenantWorkspaceTab = "situation" | "activation" | "billing" | "access" | "support" | "audit";

const TENANT_WORKSPACE_TABS = [
  "situation",
  "activation",
  "billing",
  "access",
  "support",
  "audit",
] as const satisfies readonly TenantWorkspaceTab[];

function normalizeTenantWorkspaceTab(
  hash: string | null | undefined
): TenantWorkspaceTab {
  const value = (hash ?? "").replace(/^#/, "").trim().toLowerCase();
  if (value === "overview") return "situation";
  if (value === "governance") return "billing";
  if (TENANT_WORKSPACE_TABS.includes(value as TenantWorkspaceTab)) {
    return value as TenantWorkspaceTab;
  }
  return "situation";
}

type TenantUserRow = {
  id: string;
  uid: string | null;
  name: string | null;
  email: string | null;
  role: string;
  status: string;
  createdAtIso: string | null;
  updatedAtIso: string | null;
};

type PlatformAuditEvent = {
  id: string;
  action: string;
  actionLabel: string;
  tenantId: string | null;
  tenantName: string | null;
  actorEmail: string | null;
  reason: string | null;
  status: string;
  tone: SignalTone;
  createdAtIso: string | null;
};

type SupportSessionRow = {
  id: string;
  scope: string;
  status: string;
  reason: string | null;
  actorEmail: string | null;
  readOnly: boolean;
  impersonation: boolean;
  durationMinutes: number;
  startedAtIso: string | null;
  expiresAtIso: string | null;
  closedAtIso: string | null;
};

type OwnerInvitationRow = {
  id: string;
  uid: string | null;
  email: string | null;
  name: string | null;
  status: string;
  createdAuthUser: boolean;
  resetLinkCreated: boolean;
  resetLinkError: string | null;
  actorEmail: string | null;
  createdAtIso: string | null;
};

type OwnerInviteResult = {
  uid: string;
  email: string;
  name: string;
  role: string;
  createdAuthUser: boolean;
  resetLink: string | null;
  resetLinkError: string | null;
  invitationId: string;
  message: string;
};

type ActivationStepRow = {
  id: string;
  label: string;
  detail: string;
  done: boolean;
  blocker: boolean;
};

type TenantDétailResponse = {
  ok: true;
  generatedAtIso: string;
  tenant: {
    id: string;
    name: string;
    status: string;
    plan: string;
    ownerEmail: string | null;
    createdAtIso: string | null;
    updatedAtIso: string | null;
  };
  counters: {
    users: number;
    agents: number;
    sites: number;
    clients: number;
    vacationsMonth: number;
    openIncidents: number;
  };
  billing: {
    plan: {
      id: string;
      name: string;
      active: boolean;
      priceMonthlyCents: number | null;
    };
    subscription: {
      planId: string;
      status: string;
      addons: Record<string, unknown>;
      stripeCustomerId: string | null;
      stripeSubId: string | null;
    };
    limits: {
      agents: number;
      sites: number;
      tenants: number;
    };
  };
  risk: {
    riskLevel: RiskLevel;
    riskReasons: string[];
  };
  onboarding: {
    status: string;
    ownerEmail: string | null;
    ownerUid: string | null;
    completion: number;
    readyToActivate: boolean;
    steps: ActivationStepRow[];
  };
  users: TenantUserRow[];
  supportSessions: SupportSessionRow[];
  ownerInvitations: OwnerInvitationRow[];
  auditLog: PlatformAuditEvent[];
  signals: Array<{
    id: string;
    tone: SignalTone;
    title: string;
    detail: string;
  }>;
};

function formatDate(value: string | null) {
  if (!value) return "Non renseigné";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Non renseigné";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatTime(value: string | null | undefined) {
  if (!value) return "--:--";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--:--";

  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function riskLabel(level: RiskLevel) {
  if (level === "critical") return "Critique";
  if (level === "watch") return "À surveiller";
  return "OK";
}

function riskClass(level: RiskLevel) {
  if (level === "critical") {
    return "border-red-500/25 bg-red-500/10 text-red-800 dark:text-red-100";
  }
  if (level === "watch") {
    return "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-100";
  }
  return "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100";
}

const SUPPORT_SCOPES: Array<{
  id: SupportScope;
  name: string;
  detail: string;
}> = [
  { id: "diagnostic", name: "Diagnostic", detail: "Lecture des signaux et contrôle rapide" },
  { id: "billing", name: "Facturation", detail: "Plan, quotas et abonnement" },
  { id: "technical", name: "Technique", detail: "Bug, données ou intégration" },
  { id: "security", name: "Sécurité", detail: "Incident sensible ou contrôle d'accès" },
];

const SUPPORT_DURATIONS = [15, 30, 60, 120];

const PLATFORM_PLANS: Array<{
  id: PlatformPlanId;
  name: string;
  price: string;
  detail: string;
}> = [
  { id: "free", name: "Free", price: "0 EUR", detail: "Découverte et très petite structure" },
  { id: "starter", name: "Starter", price: "19 EUR/mois", detail: "Petite agence locale" },
  { id: "pro", name: "Pro", price: "49 EUR/mois", detail: "Exploitation standard avec exports" },
  { id: "growth", name: "Growth", price: "99 EUR/mois", detail: "Agence multi-sites et croissance" },
];

function euros(cents: number | null | undefined) {
  if (!Number.isFinite(Number(cents))) return "Tarif catalogue";
  if (!cents) return "0 EUR";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Number(cents) / 100);
}

function supportScopeLabel(scope: string) {
  const match = SUPPORT_SCOPES.find((item) => item.id === scope);
  return match?.name ?? scope;
}

function sessionStatusClass(status: string) {
  if (status === "active") {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100";
  }
  return "border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-200";
}

function signalClass(tone: SignalTone) {
  if (tone === "critical") {
    return "border-red-500/25 bg-red-500/10 text-red-900 dark:text-red-100";
  }
  if (tone === "warning") {
    return "border-amber-500/25 bg-amber-500/10 text-amber-900 dark:text-amber-100";
  }
  return "border-sky-500/25 bg-sky-500/10 text-sky-900 dark:text-sky-100";
}

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




function SectionHeading({
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

function TenantCommandCenter({
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

function TenantTabButton({
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

function CommandStatusRow({
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

function TenantIdentityCard({
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

function TenantPriorityCard({
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

function MiniInfo({
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

function TenantSignalsCard({
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

function TenantUsersTable({ users }: { users: TenantUserRow[] }) {
  return (
    <Card className="overflow-hidden rounded-[2rem] border-border/60 bg-background/90 shadow-sm">
      <CardHeader className="border-b bg-muted/20">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="text-xl font-black">
              Comptes rattachés
            </CardTitle>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Lecture plateforme limitee aux comptes, rôles et statuts.
            </p>
          </div>
          <Badge variant="outline" className="w-fit rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]">
            {users.length} visible(s)
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Rôle</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Dernière maj</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="min-w-[220px]">
                    <p className="font-black">{item.name ?? item.email ?? item.id}</p>
                    <p className="mt-1 text-xs font-semibold text-muted-foreground">
                      {item.email ?? item.uid ?? item.id}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="rounded-full">
                    {item.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="rounded-full capitalize">
                    {item.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm font-semibold text-muted-foreground">
                  {formatDate(item.updatedAtIso ?? item.createdAtIso)}
                </TableCell>
              </TableRow>
            ))}

            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center">
                  <p className="font-black">Aucun utilisateur trouve</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Vérifiez le tenantId ou le provisioning de cette agence.
                  </p>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
function ActivationChecklistCard({
  onboarding,
}: {
  onboarding: TenantDétailResponse["onboarding"] | null;
}) {
  if (!onboarding) return null;

  return (
    <Card className="overflow-hidden rounded-[2rem] border-border/60 bg-background/85 shadow-sm">
      <CardHeader className="border-b bg-muted/20">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl font-black">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Checklist d'activation
            </CardTitle>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Contrôle les pré-requis avant de declarer l'agence opérationnelle.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-full px-3 py-1 font-black">
              {onboarding.status}
            </Badge>
            <Badge
              className={cn(
                "rounded-full border px-3 py-1 font-black",
                onboarding.readyToActivate
                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/10 dark:text-emerald-100"
                  : "border-amber-500/25 bg-amber-500/10 text-amber-800 hover:bg-amber-500/10 dark:text-amber-100"
              )}
            >
              {onboarding.completion}% prêt
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
        {onboarding.steps.map((step) => (
          <div
            key={step.id}
            className={cn(
              "rounded-2xl border p-4",
              step.done
                ? "border-emerald-500/20 bg-emerald-500/10"
                : "border-amber-500/20 bg-amber-500/10"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-black">{step.label}</p>
              {step.done ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              )}
            </div>
            <p className="mt-2 text-xs font-semibold leading-5 text-muted-foreground">
              {step.detail}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ActivateTenantAction({
  tenant,
  onboarding,
  open,
  reason,
  confirmation,
  submitting,
  error,
  success,
  onOpenChange,
  onReasonChange,
  onConfirmationChange,
  onSubmit,
}: {
  tenant: TenantDétailResponse["tenant"] | null | undefined;
  onboarding: TenantDétailResponse["onboarding"] | null;
  open: boolean;
  reason: string;
  confirmation: string;
  submitting: boolean;
  error: string | null;
  success: string | null;
  onOpenChange: (open: boolean) => void;
  onReasonChange: (reason: string) => void;
  onConfirmationChange: (confirmation: string) => void;
  onSubmit: () => Promise<void>;
}) {
  const expectedConfirmation = "ACTIVER AGENCE";
  const isAlreadyActive = String(tenant?.status ?? "").toLowerCase() === "active";
  const ready = Boolean(onboarding?.readyToActivate);
  const canSubmit =
    !isAlreadyActive &&
    ready &&
    reason.trim().length >= 12 &&
    confirmation.trim().toUpperCase() === expectedConfirmation &&
    !submitting;

  if (!open) {
    return (
      <div className="rounded-2xl border bg-muted/20 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-black">Activer l'agence</p>
            <p className="mt-1 text-sm font-semibold leading-5 text-muted-foreground">
              Passe l'agence en production lorsque la checklist est complete.
            </p>
            {success ? (
              <p className="mt-2 text-xs font-black text-emerald-700 dark:text-emerald-300">
                {success}
              </p>
            ) : null}
            {!ready && !isAlreadyActive ? (
              <p className="mt-2 text-xs font-black text-amber-700 dark:text-amber-300">
                Checklist incomplète : activation bloquée.
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant={ready && !isAlreadyActive ? "default" : "outline"}
            className="rounded-2xl font-black"
            disabled={isAlreadyActive}
            onClick={() => onOpenChange(true)}
          >
            {isAlreadyActive ? "Active" : "Activer"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-black">Activation agence SaaS</p>
          <p className="mt-1 text-sm font-semibold leading-5 text-muted-foreground">
            Cette action rend l'agence active et journalise la décision VSW Digital.
          </p>
        </div>
        <Badge variant="outline" className="w-fit rounded-full">
          Confirmation : {expectedConfirmation}
        </Badge>
      </div>

      {!ready ? (
        <p className="mt-4 rounded-2xl border border-amber-500/20 bg-background/80 p-3 text-sm font-bold text-amber-900 dark:text-amber-100">
          L'activation est bloquée tant que tous les pré-requis obligatoires ne sont pas validés.
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Motif obligatoire
          </label>
          <Textarea
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Exemple : checklist complète, propriétaire actif, premier client et premier site vérifiés."
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
            {submitting ? "Activation..." : "Activer l'agence"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function BillingGovernanceCard({ data }: { data: TenantDétailResponse | null }) {
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

function PlanGovernanceAction({
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

function OwnerInvitationAction({
  tenant,
  open,
  name,
  email,
  reason,
  confirmation,
  submitting,
  error,
  result,
  onOpenChange,
  onNameChange,
  onEmailChange,
  onReasonChange,
  onConfirmationChange,
  onSubmit,
}: {
  tenant: TenantDétailResponse["tenant"] | null | undefined;
  open: boolean;
  name: string;
  email: string;
  reason: string;
  confirmation: string;
  submitting: boolean;
  error: string | null;
  result: OwnerInviteResult | null;
  onOpenChange: (open: boolean) => void;
  onNameChange: (name: string) => void;
  onEmailChange: (email: string) => void;
  onReasonChange: (reason: string) => void;
  onConfirmationChange: (confirmation: string) => void;
  onSubmit: () => Promise<void>;
}) {
  const expectedConfirmation = "INVITER OWNER";
  const canSubmit =
    (email || tenant?.ownerEmail || "").includes("@") &&
    reason.trim().length >= 12 &&
    confirmation.trim().toUpperCase() === expectedConfirmation &&
    !submitting;

  async function copyLink() {
    if (!result?.resetLink) return;
    await navigator.clipboard.writeText(result.resetLink);
  }

  if (!open) {
    return (
      <div className="rounded-2xl border bg-muted/20 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-black">Inviter le propriétaire</p>
            <p className="mt-1 text-sm font-semibold leading-5 text-muted-foreground">
              Cree ou rattaché le compte owner de l'agence, puis prépare un lien d'activation.
            </p>
            {tenant?.ownerEmail ? (
              <p className="mt-2 text-xs font-black text-primary">{tenant.ownerEmail}</p>
            ) : null}
          </div>
          <Button type="button" variant="outline" className="rounded-2xl font-black" onClick={() => onOpenChange(true)}>
            Inviter
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-black">Invitation propriétaire agence</p>
          <p className="mt-1 text-sm font-semibold leading-5 text-muted-foreground">
            Cette action créé un accès owner et généré un lien de definition du mot de passe.
          </p>
        </div>
        <Badge variant="outline" className="w-fit rounded-full">
          Confirmation : {expectedConfirmation}
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Nom propriétaire
          </span>
          <Input
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Nom du dirigeant ou responsable"
            className="h-11 rounded-2xl bg-background/80 font-semibold"
          />
        </label>
        <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Email propriétaire
          </span>
          <Input
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder={tenant?.ownerEmail ?? "direction@agence.fr"}
            className="h-11 rounded-2xl bg-background/80 font-semibold"
          />
        </label>
      </div>

      <div className="mt-4 space-y-3">
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Motif obligatoire
          </label>
          <Textarea
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Exemple : activation du compte propriétaire après création commerciale de l'agence."
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

        {error ? (
          <p className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm font-bold text-red-800 dark:text-red-100">
            {error}
          </p>
        ) : null}

        {result ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-background/80 p-3">
            <p className="font-black">{result.message}</p>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">
              {result.createdAuthUser ? "Compte Firebase créé." : "Compte Firebase existant reutilisé."}
            </p>
            {result.resetLink ? (
              <div className="mt-3 flex flex-col gap-2 md:flex-row">
                <Input readOnly value={result.resetLink} className="h-11 rounded-2xl bg-muted/40 font-semibold" />
                <Button type="button" variant="outline" className="rounded-2xl font-black" onClick={() => void copyLink()}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copier
                </Button>
              </div>
            ) : (
              <p className="mt-2 text-sm font-bold text-amber-800 dark:text-amber-100">
                {result.resetLinkError ?? "Lien non généré. Vous pourrez reinviter le propriétaire."}
              </p>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-2xl font-black" disabled={submitting} onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
          <Button type="button" className="rounded-2xl font-black" disabled={!canSubmit} onClick={() => void onSubmit()}>
            {submitting ? "Preparation..." : "Preparer l'invitation"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SupportSessionAction({
  open,
  scope,
  durationMinutes,
  reason,
  confirmation,
  submitting,
  error,
  success,
  onOpenChange,
  onScopeChange,
  onDurationChange,
  onReasonChange,
  onConfirmationChange,
  onSubmit,
}: {
  open: boolean;
  scope: SupportScope;
  durationMinutes: number;
  reason: string;
  confirmation: string;
  submitting: boolean;
  error: string | null;
  success: string | null;
  onOpenChange: (open: boolean) => void;
  onScopeChange: (scope: SupportScope) => void;
  onDurationChange: (duration: number) => void;
  onReasonChange: (reason: string) => void;
  onConfirmationChange: (confirmation: string) => void;
  onSubmit: () => Promise<void>;
}) {
  const expectedConfirmation = "OUVRIR SUPPORT";
  const canSubmit =
    reason.trim().length >= 12 &&
    confirmation.trim().toUpperCase() === expectedConfirmation &&
    !submitting;

  if (!open) {
    return (
      <div className="rounded-2xl border bg-muted/20 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-black">Session support agence</p>
            <p className="mt-1 text-sm font-semibold leading-5 text-muted-foreground">
              Ouvre une intervention VSW Digital limitee, en lecture seule, sans impersonation et avec audit.
            </p>
            {success ? (
              <p className="mt-2 text-xs font-black text-emerald-700 dark:text-emerald-300">
                {success}
              </p>
            ) : null}
          </div>
          <Button type="button" variant="outline" className="rounded-2xl font-black" onClick={() => onOpenChange(true)}>
            Ouvrir
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-sky-500/25 bg-sky-500/10 p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-black">Ouvrir une session support</p>
          <p className="mt-1 text-sm font-semibold leading-5 text-muted-foreground">
            Cette session trace l'intervention et prépare un futur accès support contrôlé.
          </p>
        </div>
        <Badge variant="outline" className="w-fit rounded-full">
          Confirmation : {expectedConfirmation}
        </Badge>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {SUPPORT_SCOPES.map((item) => {
          const selected = scope === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onScopeChange(item.id)}
              className={cn(
                "rounded-2xl border bg-background/80 p-3 text-left transition hover:border-primary/40",
                selected && "border-primary bg-primary/10 ring-2 ring-primary/10"
              )}
            >
              <p className="font-black">{item.name}</p>
              <p className="mt-1 text-xs font-semibold text-muted-foreground">{item.detail}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {SUPPORT_DURATIONS.map((duration) => (
          <Button
            key={duration}
            type="button"
            variant={durationMinutes === duration ? "default" : "outline"}
            className="rounded-2xl font-black"
            onClick={() => onDurationChange(duration)}
          >
            {duration} min
          </Button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Motif obligatoire
          </label>
          <Textarea
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Exemple : assistance client suite a un ticket, verification d'une anomalie de quota..."
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
            {submitting ? "Ouverture..." : "Ouvrir support"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatusGovernanceAction({
  tenant,
  open,
  reason,
  confirmation,
  submitting,
  error,
  success,
  onOpenChange,
  onReasonChange,
  onConfirmationChange,
  onSubmit,
}: {
  tenant: TenantDétailResponse["tenant"] | null | undefined;
  open: boolean;
  reason: string;
  confirmation: string;
  submitting: boolean;
  error: string | null;
  success: string | null;
  onOpenChange: (open: boolean) => void;
  onReasonChange: (reason: string) => void;
  onConfirmationChange: (confirmation: string) => void;
  onSubmit: (
    targetStatus: "active" | "suspended",
    expectedConfirmation: string
  ) => Promise<void>;
}) {
  const currentStatus = String(tenant?.status ?? "active").toLowerCase();
  const isSuspended = currentStatus === "suspended";
  const targetStatus: "active" | "suspended" = isSuspended
    ? "active"
    : "suspended";
  const expectedConfirmation = isSuspended ? "REACTIVER" : "SUSPENDRE";
  const actionLabel = isSuspended ? "Reactiver l'agence" : "Suspendre l'agence";
  const actionTone = isSuspended
    ? "border-emerald-500/25 bg-emerald-500/10"
    : "border-red-500/25 bg-red-500/10";
  const canSubmit =
    reason.trim().length >= 12 &&
    confirmation.trim().toUpperCase() === expectedConfirmation &&
    !submitting;

  if (!open) {
    return (
      <div className="rounded-2xl border bg-muted/20 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-black">Suspendre / réactiver</p>
            <p className="mt-1 text-sm font-semibold leading-5 text-muted-foreground">
              Action sensible avec motif obligatoire, confirmation explicite et audit automatique.
            </p>
            {success ? (
              <p className="mt-2 text-xs font-black text-emerald-700 dark:text-emerald-300">
                {success}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant={isSuspended ? "default" : "outline"}
            className="rounded-2xl font-black"
            onClick={() => onOpenChange(true)}
          >
            {isSuspended ? "Reactiver" : "Suspendre"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-2xl border p-4", actionTone)}>
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-black">{actionLabel}</p>
          <p className="mt-1 text-sm font-semibold leading-5 text-muted-foreground">
            Cette action modifié le statut SaaS de l'agence et créé une tracé platformAuditLog.
          </p>
        </div>
        <Badge variant="outline" className="w-fit rounded-full">
          Confirmation : {expectedConfirmation}
        </Badge>
      </div>

      <div className="mt-4 space-y-3">
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Motif obligatoire
          </label>
          <Textarea
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Exemple : impaye confirme par la direction, suspension temporaire demandee..."
            className="min-h-24 rounded-2xl bg-background/80 font-semibold"
          />
          <p className="text-xs font-semibold text-muted-foreground">
            Minimum 12 caracteres. Ce motif sera visible dans l'audit plateforme.
          </p>
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

        {error ? (
          <p className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm font-bold text-red-800 dark:text-red-100">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-2xl font-black"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Annuler
          </Button>
          <Button
            type="button"
            className={cn(
              "rounded-2xl font-black",
              targetStatus === "suspended" && "bg-red-600 text-white hover:bg-red-700"
            )}
            disabled={!canSubmit}
            onClick={() => void onSubmit(targetStatus, expectedConfirmation)}
          >
            {submitting ? "Application..." : actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function OwnerInvitationsPanel({ invitations }: { invitations: OwnerInvitationRow[] }) {
  return (
    <Card className="overflow-hidden rounded-[2rem] border-border/60">
      <CardHeader className="border-b bg-muted/25">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl font-black">
              <Users className="h-5 w-5 text-primary" />
              Invitations propriétaire
            </CardTitle>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Derniers liens d'activation préparés pour le compte owner de l'agence.
            </p>
          </div>
          <Badge variant="outline" className="w-fit rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]">
            {invitations.length} invitation(s)
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 md:grid-cols-2">
        {invitations.length > 0 ? (
          invitations.map((invitation) => (
            <div key={invitation.id} className="rounded-2xl border bg-background/80 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 font-black text-emerald-800 hover:bg-emerald-500/10 dark:text-emerald-100">
                  {invitation.status}
                </Badge>
                <Badge variant="outline" className="rounded-full">
                  {invitation.resetLinkCreated ? "Lien créé" : "Lien absent"}
                </Badge>
              </div>
              <p className="mt-3 font-black">{invitation.name ?? invitation.email ?? "Propriétaire"}</p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">{invitation.email ?? "Email non renseigné"}</p>
              <p className="mt-2 text-xs font-semibold text-muted-foreground">
                {invitation.createdAuthUser ? "Compte créé" : "Compte reutilisé"} - {formatDate(invitation.createdAtIso)} a {formatTime(invitation.createdAtIso)}
              </p>
              {invitation.resetLinkError ? (
                <p className="mt-2 text-xs font-bold text-amber-800 dark:text-amber-100">
                  {invitation.resetLinkError}
                </p>
              ) : null}
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed bg-muted/20 p-5 md:col-span-2">
            <p className="font-black">Aucune invitation propriétaire</p>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Preparez l'invitation depuis les actions support encadrees.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SupportSessionsPanel({
  sessions,
  closeSessionId,
  closeReason,
  closeConfirmation,
  closeSubmitting,
  closeError,
  closeSuccess,
  onOpenClose,
  onCancelClose,
  onReasonChange,
  onConfirmationChange,
  onSubmitClose,
}: {
  sessions: SupportSessionRow[];
  closeSessionId: string | null;
  closeReason: string;
  closeConfirmation: string;
  closeSubmitting: boolean;
  closeError: string | null;
  closeSuccess: string | null;
  onOpenClose: (sessionId: string) => void;
  onCancelClose: () => void;
  onReasonChange: (reason: string) => void;
  onConfirmationChange: (confirmation: string) => void;
  onSubmitClose: (sessionId: string) => Promise<void>;
}) {
  const expectedConfirmation = "CLOTURER SUPPORT";
  const activeCount = sessions.filter((session) => session.status === "active").length;

  return (
    <Card className="overflow-hidden rounded-[2rem] border-border/60">
      <CardHeader className="border-b bg-muted/25">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl font-black">
              <LockKeyhole className="h-5 w-5 text-primary" />
              Sessions support
            </CardTitle>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Suivi des interventions VSW Digital ouvertes pour cette agence.
            </p>
          </div>
          <Badge variant="outline" className="w-fit rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]">
            {activeCount} active(s)
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {closeSuccess ? (
          <p className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm font-black text-emerald-800 dark:text-emerald-100">
            {closeSuccess}
          </p>
        ) : null}

        {sessions.length > 0 ? (
          sessions.map((session) => {
            const isActive = session.status === "active";
            const isClosing = closeSessionId === session.id;
            const canClose =
              closeReason.trim().length >= 12 &&
              closeConfirmation.trim().toUpperCase() === expectedConfirmation &&
              !closeSubmitting;

            return (
              <div key={session.id} className="rounded-2xl border bg-background/80 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={cn("rounded-full border px-3 py-1 font-black", sessionStatusClass(session.status))}>
                        {session.status === "active" ? "Active" : "Cloturee"}
                      </Badge>
                      <Badge variant="outline" className="rounded-full">
                        {supportScopeLabel(session.scope)}
                      </Badge>
                      <Badge variant="outline" className="rounded-full">
                        {session.readOnly ? "Lecture seule" : "Ecriture"}
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm font-black">
                      {session.reason ?? "Motif non renseigné"}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-muted-foreground">
                      {session.actorEmail ?? "VSW Digital"} - ouverte {formatDate(session.startedAtIso)} a {formatTime(session.startedAtIso)}
                      {session.expiresAtIso ? " - expire a " + formatTime(session.expiresAtIso) : ""}
                      {session.closedAtIso ? " - clôturée a " + formatTime(session.closedAtIso) : ""}
                    </p>
                  </div>
                  {isActive ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-2xl font-black"
                      onClick={() => onOpenClose(session.id)}
                    >
                      Cloturer
                    </Button>
                  ) : null}
                </div>

                {isClosing ? (
                  <div className="mt-4 rounded-2xl border border-slate-500/20 bg-muted/20 p-4">
                    <div className="grid gap-3 md:grid-cols-[1fr_240px]">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                          Motif de clôture
                        </label>
                        <Textarea
                          value={closeReason}
                          onChange={(event) => onReasonChange(event.target.value)}
                          placeholder="Exemple : verification terminee, anomalie expliquee au client, aucune action restante..."
                          className="min-h-24 rounded-2xl bg-background/80 font-semibold"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                          Confirmation
                        </label>
                        <Input
                          value={closeConfirmation}
                          onChange={(event) => onConfirmationChange(event.target.value)}
                          placeholder={expectedConfirmation}
                          className="h-11 rounded-2xl bg-background/80 font-black uppercase"
                        />
                        <p className="text-xs font-semibold text-muted-foreground">
                          Tapez {expectedConfirmation}.
                        </p>
                      </div>
                    </div>

                    {closeError ? (
                      <p className="mt-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm font-bold text-red-800 dark:text-red-100">
                        {closeError}
                      </p>
                    ) : null}

                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <Button type="button" variant="outline" className="rounded-2xl font-black" disabled={closeSubmitting} onClick={onCancelClose}>
                        Annuler
                      </Button>
                      <Button type="button" className="rounded-2xl font-black" disabled={!canClose} onClick={() => void onSubmitClose(session.id)}>
                        {closeSubmitting ? "Cloture..." : "Cloturer la session"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        ) : (
          <div className="rounded-2xl border border-dashed bg-muted/20 p-5">
            <p className="font-black">Aucune session support</p>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Les interventions ouvertes depuis le panneau Actions support apparaîtront ici.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TenantAuditLog({ events }: { events: PlatformAuditEvent[] }) {
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

function MetricCard({
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

function SupportAction({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-black">{title}</p>
          <p className="mt-1 text-sm font-semibold leading-5 text-muted-foreground">
            {detail}
          </p>
        </div>
        <Button disabled variant="outline" className="rounded-2xl font-black">
          <Clock className="mr-2 h-4 w-4" />
          Bientot
        </Button>
      </div>
    </div>
  );
}

function AccessState({
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
