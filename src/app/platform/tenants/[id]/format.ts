import type { PlatformPlanId, RiskLevel, SignalTone, SupportScope } from "./types";

export function formatDate(value: string | null) {
  if (!value) return "Non renseigné";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Non renseigné";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatTime(value: string | null | undefined) {
  if (!value) return "--:--";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--:--";

  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function riskLabel(level: RiskLevel) {
  if (level === "critical") return "Critique";
  if (level === "watch") return "À surveiller";
  return "OK";
}

export function riskClass(level: RiskLevel) {
  if (level === "critical") {
    return "border-red-500/25 bg-red-500/10 text-red-800 dark:text-red-100";
  }
  if (level === "watch") {
    return "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-100";
  }
  return "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100";
}

export const SUPPORT_SCOPES: Array<{
  id: SupportScope;
  name: string;
  detail: string;
}> = [
  { id: "diagnostic", name: "Diagnostic", detail: "Lecture des signaux et contrôle rapide" },
  { id: "billing", name: "Facturation", detail: "Plan, quotas et abonnement" },
  { id: "technical", name: "Technique", detail: "Bug, données ou intégration" },
  { id: "security", name: "Sécurité", detail: "Incident sensible ou contrôle d'accès" },
];

export const SUPPORT_DURATIONS = [15, 30, 60, 120];

export const PLATFORM_PLANS: Array<{
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

export function euros(cents: number | null | undefined) {
  if (!Number.isFinite(Number(cents))) return "Tarif catalogue";
  if (!cents) return "0 EUR";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Number(cents) / 100);
}

export function supportScopeLabel(scope: string) {
  const match = SUPPORT_SCOPES.find((item) => item.id === scope);
  return match?.name ?? scope;
}

export function sessionStatusClass(status: string) {
  if (status === "active") {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100";
  }
  return "border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-200";
}

export function signalClass(tone: SignalTone) {
  if (tone === "critical") {
    return "border-red-500/25 bg-red-500/10 text-red-900 dark:text-red-100";
  }
  if (tone === "warning") {
    return "border-amber-500/25 bg-amber-500/10 text-amber-900 dark:text-amber-100";
  }
  return "border-sky-500/25 bg-sky-500/10 text-sky-900 dark:text-sky-100";
}
