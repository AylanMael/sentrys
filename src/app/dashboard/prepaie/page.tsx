"use client";

import * as React from "react";
import {
  AlertTriangle,
  Calculator,
  CalendarRange,
  CheckCircle2,
  Download,
  FileCheck2,
  FileSpreadsheet,
  History,
  LockKeyhole,
  Moon,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Sun,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { useAppFeedback } from "@/hooks/use-app-feedback";
import { apiFetch, getApiErrorMessage } from "@/lib/api/client-fetch";
import { cn } from "@/lib/utils";
import {
  buildPrepayCabinetCsv,
  buildPrepayCsv,
  prepayCabinetCsvFilename,
  prepayCsvFilename,
} from "@/lib/payroll/export";
import type { PrepayReport } from "@/lib/payroll/prepay";
import {
  DEFAULT_PREPAY_RUBRIC_CODES,
  DEFAULT_PREPAY_SETTINGS,
  type PrepayRubricCodes,
  type PrepaySettings,
} from "@/lib/payroll/settings";
import type {
  PrepayPeriod,
  PrepayPeriodAction,
  PrepayPeriodStatus,
} from "@/lib/payroll/workflow";

type PrepayResponse = {
  ok: boolean;
  report: PrepayReport;
};

type PrepayPeriodResponse = {
  ok: boolean;
  period: PrepayPeriod;
};

const PERIOD_STATUS_META: Record<
  PrepayPeriodStatus,
  { label: string; tone: string; description: string }
> = {
  draft: {
    label: "Brouillon",
    tone: "border-slate-300 bg-slate-100 text-slate-700",
    description: "Calcul de travail, pas encore controle.",
  },
  checked: {
    label: "Controle",
    tone: "border-sky-300 bg-sky-100 text-sky-800",
    description: "Les variables ont ete controlees par l'exploitation.",
  },
  validated: {
    label: "Valide",
    tone: "border-emerald-300 bg-emerald-100 text-emerald-800",
    description: "La periode est prete pour verrouillage.",
  },
  locked: {
    label: "Verrouille",
    tone: "border-amber-300 bg-amber-100 text-amber-900",
    description: "La periode est gelee avant export paie.",
  },
  exported: {
    label: "Exporte",
    tone: "border-violet-300 bg-violet-100 text-violet-800",
    description: "La pre-paie a ete transmise ou marquee exportee.",
  },
};

const PERIOD_ACTION_META: Record<
  PrepayPeriodAction,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  check: {
    label: "Controler",
    icon: CheckCircle2,
  },
  validate: {
    label: "Valider",
    icon: ShieldCheck,
  },
  lock: {
    label: "Verrouiller",
    icon: LockKeyhole,
  },
  mark_exported: {
    label: "Marquer exporte",
    icon: Download,
  },
  reopen: {
    label: "Rouvrir",
    icon: RotateCcw,
  },
};

const RUBRIC_FIELDS: Array<{
  key: keyof PrepayRubricCodes;
  label: string;
  hint: string;
}> = [
  {
    key: "payableHours",
    label: "Heures payables",
    hint: "Base heures travaillees",
  },
  {
    key: "nightHours",
    label: "Heures nuit",
    hint: "Majoration nuit",
  },
  {
    key: "sundayHours",
    label: "Dimanche",
    hint: "Majoration dimanche",
  },
  {
    key: "publicHolidayHours",
    label: "Jours feries",
    hint: "Hors 1er mai si separe",
  },
  {
    key: "mayFirstHours",
    label: "1er mai",
    hint: "Traitement specifique",
  },
  {
    key: "overtimeIndicative",
    label: "HS indicatives",
    hint: "A arbitrer paie",
  },
  {
    key: "absenceHours",
    label: "Absences",
    hint: "A qualifier",
  },
  {
    key: "mealAllowance",
    label: "Panier",
    hint: "Indemnite repas",
  },
  {
    key: "transportAllowance",
    label: "Transport",
    hint: "Indemnite transport",
  },
];

type PrepaieView = "controle" | "donnees" | "cycle" | "reglages";

const PREPAIE_VIEWS: Array<{
  id: PrepaieView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "controle", label: "Controle", icon: ShieldCheck },
  { id: "donnees", label: "Donnees", icon: FileSpreadsheet },
  { id: "cycle", label: "Cycle", icon: History },
  { id: "reglages", label: "Reglages", icon: Settings2 },
];
type PrepayPreflightVerdict = "ready" | "warning" | "blocking";
type PrepayPreflightSeverity = "ok" | "warning" | "blocking";

type PrepayPreflightItem = {
  id: string;
  severity: PrepayPreflightSeverity;
  title: string;
  description: string;
  action?: string;
};

type PrepayPreflight = {
  verdict: PrepayPreflightVerdict;
  blockingCount: number;
  warningCount: number;
  okCount: number;
  items: PrepayPreflightItem[];
};

const PREFLIGHT_META: Record<
  PrepayPreflightVerdict,
  { label: string; tone: string; title: string; description: string }
> = {
  ready: {
    label: "Pret a transmettre",
    tone: "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100",
    title: "Export paie propre",
    description:
      "Le CSV cabinet et la synthese PDF peuvent etre transmis au gestionnaire de paie.",
  },
  warning: {
    label: "A verifier",
    tone: "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100",
    title: "Transmission possible avec vigilance",
    description:
      "Des points non bloquants meritent une validation avant envoi au cabinet.",
  },
  blocking: {
    label: "Bloquant",
    tone: "border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-100",
    title: "Ne pas transmettre en l'etat",
    description:
      "Des donnees critiques risquent de fausser l'import paie ou la paie finale.",
  },
};

function monthStartInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function nextMonthStartInput() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
}

function inputDateToIso(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
}

function hours(value: number) {
  return `${value.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} h`;
}

function money(value: number) {
  return value.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function periodActions(status: PrepayPeriodStatus): PrepayPeriodAction[] {
  const actions: PrepayPeriodAction[] = [];

  if (status === "draft") actions.push("check");
  if (status === "checked") actions.push("validate");
  if (status === "validated") actions.push("lock");
  if (status === "locked") actions.push("mark_exported");
  if (status !== "draft") actions.push("reopen");

  return actions;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function actionLabel(action: PrepayPeriodAction) {
  return PERIOD_ACTION_META[action]?.label ?? action;
}

function reportIssueCount(report: PrepayReport | null) {
  if (!report) return 0;
  return (
    report.summary.anomalyCount +
    report.summary.unassignedVacationCount +
    report.summary.draftVacationCount
  );
}

function prepaySummaryPrintUrl(report: PrepayReport | null) {
  const params = new URLSearchParams();
  if (report) {
    params.set("from", report.fromIso);
    params.set("to", report.toIso);
  }
  return `/prepay/summary${params.toString() ? `?${params.toString()}` : ""}`;
}

function defaultRubricLabels(settings: PrepaySettings) {
  return RUBRIC_FIELDS.filter((field) => {
    const current = settings.payrollRubricCodes[field.key]?.trim();
    const defaultCode = DEFAULT_PREPAY_RUBRIC_CODES[field.key];
    return current === defaultCode;
  }).map((field) => field.label);
}

function emptyRubricLabels(settings: PrepaySettings) {
  return RUBRIC_FIELDS.filter((field) => {
    return !settings.payrollRubricCodes[field.key]?.trim();
  }).map((field) => field.label);
}

function buildPrepayPreflight(
  report: PrepayReport | null,
  period: PrepayPeriod | null
): PrepayPreflight {
  const items: PrepayPreflightItem[] = [];

  if (!report) {
    return {
      verdict: "blocking",
      blockingCount: 1,
      warningCount: 0,
      okCount: 0,
      items: [
        {
          id: "missing-report",
          severity: "blocking",
          title: "Calcul pre-paie absent",
          description: "Lancez le calcul avant de preparer un export paie.",
          action: "Cliquer sur Calculer.",
        },
      ],
    };
  }

  if (report.rows.length === 0) {
    items.push({
      id: "empty-report",
      severity: "blocking",
      title: "Aucune ligne agent",
      description: "La periode ne contient aucune ligne de pre-paie exploitable.",
      action: "Verifier la periode et les vacations planifiees.",
    });
  }

  const periodStatus = period?.status ?? "draft";
  if (periodStatus !== "locked" && periodStatus !== "exported") {
    items.push({
      id: "period-unlocked",
      severity: "blocking",
      title: "Periode non verrouillee",
      description:
        "Le cycle pre-paie doit etre verrouille avant transmission au cabinet.",
      action: "Controler, valider puis verrouiller la periode.",
    });
  } else {
    items.push({
      id: "period-locked",
      severity: "ok",
      title:
        periodStatus === "exported"
          ? "Periode deja marquee exportee"
          : "Periode verrouillee",
      description:
        periodStatus === "exported"
          ? "La periode a deja ete transmise ou marquee comme exportee."
          : "La periode est gelee pour l'export paie.",
      action:
        periodStatus === "exported"
          ? "Verifier qu'il ne s'agit pas d'un deuxieme envoi."
          : undefined,
    });
  }

  if (periodStatus === "exported") {
    items.push({
      id: "already-exported",
      severity: "warning",
      title: "Export deja trace",
      description:
        "Un nouvel envoi peut creer une confusion chez le gestionnaire de paie.",
      action: "Renvoyer seulement si le cabinet le demande.",
    });
  }

  if (report.summary.unassignedVacationCount > 0) {
    items.push({
      id: "unassigned-vacations",
      severity: "blocking",
      title: "Vacations sans agent",
      description: `${report.summary.unassignedVacationCount} vacation(s) ne sont rattachees a aucun agent.`,
      action: "Affecter les vacations avant export.",
    });
  }

  if (report.summary.draftVacationCount > 0) {
    items.push({
      id: "draft-vacations",
      severity: "blocking",
      title: "Vacations non publiees",
      description: `${report.summary.draftVacationCount} vacation(s) sont encore en brouillon ou modifiees depuis publication.`,
      action: "Publier ou valider les corrections planning.",
    });
  }

  const anomalousRows = report.rows.filter((row) => row.anomalies.length > 0);
  if (anomalousRows.length > 0) {
    items.push({
      id: "agent-anomalies",
      severity: "blocking",
      title: "Anomalies agent a traiter",
      description: `${anomalousRows.length} agent(s) comportent des anomalies : repos, chevauchement, absence ou publication.`,
      action: "Ouvrir les lignes agent et regulariser les points listes.",
    });
  }

  const missingPayrollRows = report.rows.filter(
    (row) => row.payrollId === row.agentId
  );
  if (missingPayrollRows.length > 0) {
    items.push({
      id: "missing-payroll-id",
      severity: "blocking",
      title: "Matricules paie manquants",
      description: `${missingPayrollRows.length} agent(s) utilisent encore l'ID technique au lieu du matricule paie.`,
      action: "Renseigner le matricule dans la fiche agent.",
    });
  }

  const emptyRubrics = emptyRubricLabels(report.settings);
  if (emptyRubrics.length > 0) {
    items.push({
      id: "empty-rubrics",
      severity: "blocking",
      title: "Codes rubriques vides",
      description: `Codes a completer : ${emptyRubrics.join(", ")}.`,
      action: "Renseigner les codes fournis par le cabinet.",
    });
  }

  const defaultRubrics = defaultRubricLabels(report.settings);
  if (defaultRubrics.length > 0) {
    items.push({
      id: "default-rubrics",
      severity: "warning",
      title: "Codes rubriques par defaut",
      description: `${defaultRubrics.length} code(s) sont encore sur le mapping SENTRYS par defaut.`,
      action: "Remplacer par les codes exacts du cabinet si import direct.",
    });
  }

  if (report.settings.hourlyBaseRate <= 0) {
    items.push({
      id: "zero-hourly-rate",
      severity: "warning",
      title: "Taux horaire a zero",
      description:
        "Les montants estimes seront a zero ou incomplets si le cabinet attend une valorisation.",
      action: "Renseigner le taux horaire ou confirmer que le cabinet calcule les montants.",
    });
  }

  if (report.summary.nightHours > 0 && report.settings.nightPremiumPercent <= 0) {
    items.push({
      id: "zero-night-rate",
      severity: "warning",
      title: "Majoration nuit non valorisee",
      description:
        "Des heures de nuit existent mais le taux de majoration nuit est a zero.",
      action: "Confirmer le taux avec le gestionnaire paie.",
    });
  }

  if (report.summary.sundayHours > 0 && report.settings.sundayPremiumPercent <= 0) {
    items.push({
      id: "zero-sunday-rate",
      severity: "warning",
      title: "Dimanches non valorises",
      description:
        "Des heures du dimanche existent mais le taux de majoration dimanche est a zero.",
      action: "Confirmer le taux avec le gestionnaire paie.",
    });
  }

  if (
    report.summary.publicHolidayHours > 0 &&
    report.settings.publicHolidayPremiumPercent <= 0
  ) {
    items.push({
      id: "zero-public-holiday-rate",
      severity: "warning",
      title: "Jours feries non valorises",
      description:
        "Des heures de jours feries existent mais le taux de majoration est a zero.",
      action: "Confirmer le traitement avec le gestionnaire paie.",
    });
  }

  if (items.length === 0) {
    items.push({
      id: "ready",
      severity: "ok",
      title: "Controle pre-vol valide",
      description:
        "Aucun blocage detecte sur la periode, les matricules et les rubriques.",
      action: "Transmettre CSV cabinet + PDF synthese.",
    });
  }

  const blockingCount = items.filter((item) => item.severity === "blocking").length;
  const warningCount = items.filter((item) => item.severity === "warning").length;
  const okCount = items.filter((item) => item.severity === "ok").length;

  return {
    verdict: blockingCount > 0 ? "blocking" : warningCount > 0 ? "warning" : "ready",
    blockingCount,
    warningCount,
    okCount,
    items,
  };
}

export default function PrepaiePage() {
  const feedback = useAppFeedback();
  const [from, setFrom] = React.useState(monthStartInput);
  const [to, setTo] = React.useState(nextMonthStartInput);
  const [report, setReport] = React.useState<PrepayReport | null>(null);
  const [period, setPeriod] = React.useState<PrepayPeriod | null>(null);
  const [settings, setSettings] = React.useState<PrepaySettings>(
    DEFAULT_PREPAY_SETTINGS
  );
  const [loading, setLoading] = React.useState(false);
  const [periodAction, setPeriodAction] =
    React.useState<PrepayPeriodAction | null>(null);
  const [savingSettings, setSavingSettings] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [csvHref, setCsvHref] = React.useState<string | null>(null);
  const [cabinetCsvHref, setCabinetCsvHref] = React.useState<string | null>(null);
  const [prepaieView, setPrepaieView] = React.useState<PrepaieView>("controle");

  const loadReport = React.useCallback(async (quiet = false) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        from: inputDateToIso(from),
        to: inputDateToIso(to),
      });
      const [prepayResponse, periodResponse] = await Promise.all([
        apiFetch<PrepayResponse>(`/api/prepay?${params.toString()}`),
        apiFetch<PrepayPeriodResponse>(
          `/api/prepay/periods?${params.toString()}`
        ),
      ]);
      setReport(prepayResponse.report);
      setSettings(prepayResponse.report.settings);
      setPeriod(periodResponse.period);
      if (!quiet && prepayResponse.report.summary.agentCount > 0) {
        feedback.success(
          "Pre-paie calculee",
          `${prepayResponse.report.summary.agentCount} agent(s) et ${prepayResponse.report.summary.vacationCount} vacation(s) analyses.`
        );
      } else if (!quiet) {
        feedback.info(
          "Pre-paie calculee",
          "Aucune vacation agent trouvee sur cette periode."
        );
      }
    } catch (err) {
      const message = getApiErrorMessage(
        err,
        "Impossible de calculer la pre-paie."
      );
      setError(message);
      feedback.error(err, {
        title: "Calcul pre-paie impossible",
        fallback: message,
      });
    } finally {
      setLoading(false);
    }
  }, [feedback, from, to]);

  function updateSetting<K extends keyof PrepaySettings>(
    key: K,
    value: PrepaySettings[K]
  ) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function updateRubricCode(key: keyof PrepayRubricCodes, value: string) {
    setSettings((current) => ({
      ...current,
      payrollRubricCodes: {
        ...current.payrollRubricCodes,
        [key]: value,
      },
    }));
  }

  async function saveSettings() {
    setSavingSettings(true);
    setError(null);
    try {
      const response = await apiFetch<{
        ok: boolean;
        settings: PrepaySettings;
      }>("/api/prepay/settings", {
        method: "PATCH",
        body: { settings },
      });
      setSettings(response.settings);
      await loadReport(true);
      feedback.success(
        "Parametres enregistres",
        "Les exports pre-paie utiliseront ces reglages."
      );
    } catch (err) {
      const message = getApiErrorMessage(
        err,
        "Impossible d'enregistrer les parametres pre-paie."
      );
      setError(message);
      feedback.error(err, {
        title: "Enregistrement impossible",
        fallback: message,
      });
    } finally {
      setSavingSettings(false);
    }
  }

  async function runPeriodAction(action: PrepayPeriodAction) {
    if (!report) return;

    setPeriodAction(action);
    setError(null);

    try {
      const issueCount = reportIssueCount(report);
      const response = await apiFetch<PrepayPeriodResponse>(
        "/api/prepay/periods",
        {
          method: "PATCH",
          body: {
            from: report.fromIso,
            to: report.toIso,
            action,
            summary: report.summary,
            note:
              issueCount > 0 && action !== "reopen"
                ? `${issueCount} point(s) a surveiller au moment de l'action.`
                : null,
          },
        }
      );
      setPeriod(response.period);
      feedback.success(
        PERIOD_ACTION_META[action].label,
        "Le cycle pre-paie est a jour et journalise."
      );
    } catch (err) {
      const message = getApiErrorMessage(
        err,
        "Impossible de mettre a jour le cycle pre-paie."
      );
      setError(message);
      feedback.error(err, {
        title: "Cycle pre-paie bloque",
        fallback: message,
      });
    } finally {
      setPeriodAction(null);
    }
  }

  React.useEffect(() => {
    void loadReport(true);
  }, [loadReport]);

  React.useEffect(() => {
    if (!report) {
      setCsvHref(null);
      setCabinetCsvHref(null);
      return;
    }

    const detailBlob = new Blob(["\uFEFF", buildPrepayCsv(report)], {
      type: "text/csv;charset=utf-8",
    });
    const cabinetBlob = new Blob(["\uFEFF", buildPrepayCabinetCsv(report)], {
      type: "text/csv;charset=utf-8",
    });
    const detailHref = URL.createObjectURL(detailBlob);
    const cabinetHref = URL.createObjectURL(cabinetBlob);
    setCsvHref(detailHref);
    setCabinetCsvHref(cabinetHref);

    return () => {
      URL.revokeObjectURL(detailHref);
      URL.revokeObjectURL(cabinetHref);
    };
  }, [report]);

  const criticalRows = React.useMemo(
    () => report?.rows.filter((row) => row.anomalies.length > 0) ?? [],
    [report]
  );
  const currentPeriodStatus = period?.status ?? "draft";
  const currentPeriodMeta = PERIOD_STATUS_META[currentPeriodStatus];
  const currentPeriodActions = periodActions(currentPeriodStatus);
  const issueCount = reportIssueCount(report);
  const preflight = React.useMemo(
    () => buildPrepayPreflight(report, period),
    [period, report]
  );
  const preflightMeta = PREFLIGHT_META[preflight.verdict];
  const priorityItem =
    preflight.items.find((item) => item.severity === "blocking") ??
    preflight.items.find((item) => item.severity === "warning") ??
    preflight.items[0];
  const priorityAction =
    loading
      ? "Calcul en cours..."
      : priorityItem?.action ??
        (currentPeriodStatus === "locked"
          ? "Telecharger CSV cabinet + PDF synthese."
          : currentPeriodActions[0]
            ? `${PERIOD_ACTION_META[currentPeriodActions[0]].label} la periode.`
            : "Aucune action urgente.");

  const statCards = [
    {
      label: "Heures payables",
      value: report ? hours(report.summary.payableHours) : "-",
      icon: Calculator,
      tone: "text-emerald-700 bg-emerald-500/10 border-emerald-500/20",
    },
    {
      label: "Heures de nuit",
      value: report ? hours(report.summary.nightHours) : "-",
      icon: Moon,
      tone: "text-indigo-700 bg-indigo-500/10 border-indigo-500/20",
    },
    {
      label: "Dimanches",
      value: report ? hours(report.summary.sundayHours) : "-",
      icon: Sun,
      tone: "text-amber-700 bg-amber-500/10 border-amber-500/20",
    },
    {
      label: "Estimation",
      value: report ? money(report.summary.estimatedGrossAmount) : "-",
      icon: FileSpreadsheet,
      tone: "text-sky-700 bg-sky-500/10 border-sky-500/20",
    },
    {
      label: "Anomalies",
      value: report
        ? String(report.summary.anomalyCount + report.summary.unassignedVacationCount)
        : "-",
      icon: AlertTriangle,
      tone:
        report && report.summary.anomalyCount + report.summary.unassignedVacationCount > 0
          ? "text-red-700 bg-red-500/10 border-red-500/20"
          : "text-emerald-700 bg-emerald-500/10 border-emerald-500/20",
    },
  ];

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-[1.5rem] border border-slate-200/70 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-4 text-white shadow-xl">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100">
              Module gestion sociale
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight lg:text-3xl">
              Pre-paie exploitation
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">
              Transforme les vacations validees en variables de paie :
              heures, nuit, dimanche, jours feries, absences et anomalies
              avant export.
            </p>
          </div>

          <div className="grid gap-2 rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur md:grid-cols-2 xl:grid-cols-[130px_130px_auto_auto_auto_auto]">
            <div>
              <Label className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">
                Du
              </Label>
              <Input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="mt-1 h-10 border-white/10 bg-white text-slate-950"
              />
            </div>
            <div>
              <Label className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">
                Au
              </Label>
              <Input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="mt-1 h-10 border-white/10 bg-white text-slate-950"
              />
            </div>
            <Button
              type="button"
              onClick={() => void loadReport()}
              disabled={loading}
              className="h-10 self-end rounded-xl bg-emerald-400 px-4 font-black text-slate-950 hover:bg-emerald-300"
            >
              <RefreshCw
                className={cn("mr-2 h-4 w-4", loading && "animate-spin")}
              />
              Calculer
            </Button>
            <Button
              asChild
              variant="outline"
              className={cn(
                "h-10 self-end rounded-xl border-white/20 bg-white/10 px-4 font-black text-white hover:bg-white/20",
                (!csvHref || loading) && "pointer-events-none opacity-50"
              )}
            >
              <a
                href={csvHref ?? "#"}
                download={report ? prepayCsvFilename(report) : undefined}
                aria-disabled={!csvHref || loading}
                onClick={(event) => {
                  if (!csvHref || loading) event.preventDefault();
                }}
              >
                <Download className="mr-2 h-4 w-4" />
                CSV detail
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              className={cn(
                "h-10 self-end rounded-xl border-white/20 bg-white/10 px-4 font-black text-white hover:bg-white/20",
                (!cabinetCsvHref || loading) && "pointer-events-none opacity-50"
              )}
            >
              <a
                href={cabinetCsvHref ?? "#"}
                download={report ? prepayCabinetCsvFilename(report) : undefined}
                aria-disabled={!cabinetCsvHref || loading}
                onClick={(event) => {
                  if (!cabinetCsvHref || loading) event.preventDefault();
                }}
              >
                <FileCheck2 className="mr-2 h-4 w-4" />
                CSV cabinet
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              className={cn(
                "h-10 self-end rounded-xl border-white/20 bg-white/10 px-4 font-black text-white hover:bg-white/20",
                (!report || loading) && "pointer-events-none opacity-50"
              )}
            >
              <a
                href={prepaySummaryPrintUrl(report)}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!report || loading}
                onClick={(event) => {
                  if (!report || loading) event.preventDefault();
                }}
              >
                <Printer className="mr-2 h-4 w-4" />
                PDF synthese
              </a>
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <EmptyState
          icon={AlertTriangle}
          tone="danger"
          compact
          title="Erreur pre-paie"
          description={error}
          className="text-left"
        />
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className={cn("rounded-2xl border p-4", currentPeriodMeta.tone)}>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
            Statut periode
          </p>
          <p className="mt-1 text-xl font-black">{currentPeriodMeta.label}</p>
          <p className="mt-1 line-clamp-2 text-xs font-semibold opacity-75">
            {currentPeriodMeta.description}
          </p>
        </div>
        <div
          className={cn(
            "rounded-2xl border p-4",
            preflight.blockingCount > 0
              ? "border-red-500/25 bg-red-500/10 text-red-800 dark:text-red-100"
              : "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100"
          )}
        >
          <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
            Blocages
          </p>
          <p className="mt-1 text-2xl font-black">{preflight.blockingCount}</p>
          <p className="mt-1 text-xs font-semibold opacity-75">
            {preflight.warningCount} avertissement(s)
          </p>
        </div>
        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 p-4 text-sky-800 dark:text-sky-100">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
            Volume traite
          </p>
          <p className="mt-1 text-2xl font-black">
            {report?.summary.agentCount ?? "-"} agent(s)
          </p>
          <p className="mt-1 text-xs font-semibold opacity-75">
            {report?.summary.vacationCount ?? "-"} vacation(s)
          </p>
        </div>
        <div
          className={cn(
            "rounded-2xl border p-4",
            preflight.verdict === "blocking"
              ? "border-red-500/25 bg-red-500/10 text-red-800 dark:text-red-100"
              : preflight.verdict === "warning"
                ? "border-amber-500/25 bg-amber-500/10 text-amber-900 dark:text-amber-100"
                : "border-primary/25 bg-primary/10 text-primary"
          )}
        >
          <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
            Action prioritaire
          </p>
          <p className="mt-1 line-clamp-2 text-sm font-black">
            {priorityItem?.title ?? preflightMeta.title}
          </p>
          <p className="mt-1 line-clamp-2 text-xs font-semibold opacity-75">
            {priorityAction}
          </p>
        </div>
      </div>

      <div className="rounded-[1.25rem] border border-border/60 bg-background/85 p-2 shadow-sm backdrop-blur">
        <div className="flex flex-wrap gap-1">
          {PREPAIE_VIEWS.map((item) => {
            const Icon = item.icon;
            const active = prepaieView === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setPrepaieView(item.id)}
                className={cn(
                  "flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-black transition",
                  active
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 shadow-sm dark:text-emerald-100"
                    : "border-transparent bg-muted/35 text-muted-foreground hover:border-border hover:bg-background"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className={cn("border", card.tone)}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] opacity-70">
                    {card.label}
                  </p>
                  <p className="mt-1 text-2xl font-black">{card.value}</p>
                </div>
                <div className="rounded-xl bg-white/60 p-2.5 dark:bg-black/20">
                  <Icon className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className={cn("rounded-[1.5rem] border shadow-sm", preflightMeta.tone, prepaieView !== "controle" && "hidden")}>
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl font-black">
                {preflight.verdict === "ready" ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : preflight.verdict === "warning" ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : (
                  <ShieldCheck className="h-5 w-5" />
                )}
                Controle avant export paie
              </CardTitle>
              <CardDescription className="mt-2 text-current/75">
                {preflightMeta.description}
              </CardDescription>
            </div>
            <Badge
              variant="outline"
              className="w-fit rounded-full border-current/20 bg-white/50 px-4 py-1.5 text-current font-black dark:bg-black/20"
            >
              {preflightMeta.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-3xl bg-white/65 p-4 dark:bg-black/20">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
                Blocages
              </p>
              <p className="mt-1 text-2xl font-black">{preflight.blockingCount}</p>
            </div>
            <div className="rounded-3xl bg-white/65 p-4 dark:bg-black/20">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
                Avertissements
              </p>
              <p className="mt-1 text-2xl font-black">{preflight.warningCount}</p>
            </div>
            <div className="rounded-3xl bg-white/65 p-4 dark:bg-black/20">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
                Points OK
              </p>
              <p className="mt-1 text-2xl font-black">{preflight.okCount}</p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {[...preflight.items]
              .sort((left, right) => {
                const rank = { blocking: 0, warning: 1, ok: 2 };
                return rank[left.severity] - rank[right.severity];
              })
              .map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-3xl border bg-white/75 p-4 text-sm dark:bg-black/20",
                    item.severity === "blocking" &&
                      "border-red-500/30 text-red-900 dark:text-red-100",
                    item.severity === "warning" &&
                      "border-amber-500/30 text-amber-950 dark:text-amber-100",
                    item.severity === "ok" &&
                      "border-emerald-500/30 text-emerald-900 dark:text-emerald-100"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {item.severity === "ok" ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <div>
                      <p className="font-black">{item.title}</p>
                      <p className="mt-1 text-xs leading-5 opacity-80">
                        {item.description}
                      </p>
                      {item.action && (
                        <p className="mt-2 rounded-2xl bg-white/65 px-3 py-2 text-xs font-bold dark:bg-black/20">
                          Action : {item.action}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5">
        <Card className={cn("overflow-hidden rounded-[1.5rem] border-border/60 shadow-sm", prepaieView !== "donnees" && "hidden")}>
          <CardHeader className="border-b bg-muted/20">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl font-black">
                  <FileSpreadsheet className="h-5 w-5 text-primary" />
                  Variables par agent
                </CardTitle>
                <CardDescription>
                  Base de controle avant transmission au cabinet paie ou export.
                </CardDescription>
              </div>
              {report && (
                <Badge variant="outline" className="w-fit rounded-full px-3 py-1 font-black">
                  {report.summary.agentCount} agent(s) · {report.summary.vacationCount} vacation(s)
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-900/60">
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-right">Payable</TableHead>
                  <TableHead className="text-right">Nuit</TableHead>
                  <TableHead className="text-right">Dim.</TableHead>
                  <TableHead className="text-right">Feries</TableHead>
                  <TableHead className="text-right">Abs.</TableHead>
                  <TableHead className="text-right">HS ind.</TableHead>
                  <TableHead className="text-right">Estime</TableHead>
                  <TableHead>Anomalies</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && !report ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                      Calcul de la pre-paie...
                    </TableCell>
                  </TableRow>
                ) : !report || report.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                      Aucun agent avec vacation sur cette periode.
                    </TableCell>
                  </TableRow>
                ) : (
                  report.rows.map((row) => (
                    <TableRow key={row.agentId}>
                      <TableCell>
                        <div>
                          <p className="font-black text-foreground">
                            {row.agentName}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {row.vacationCount} vacation(s) · {row.siteNames.join(", ") || "Site non renseigne"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-black">
                        {hours(row.payableHours)}
                      </TableCell>
                      <TableCell className="text-right">{hours(row.nightHours)}</TableCell>
                      <TableCell className="text-right">{hours(row.sundayHours)}</TableCell>
                      <TableCell className="text-right">{hours(row.publicHolidayHours)}</TableCell>
                      <TableCell className="text-right">{hours(row.absenceHours)}</TableCell>
                      <TableCell className="text-right">{hours(row.weeklyOvertimeHours)}</TableCell>
                      <TableCell className="text-right font-black">
                        {money(row.estimatedGrossAmount)}
                      </TableCell>
                      <TableCell>
                        {row.anomalies.length > 0 ? (
                          <Badge variant="destructive" className="rounded-full">
                            {row.anomalies.length}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="rounded-full border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                          >
                            OK
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card className={cn("rounded-[1.5rem] border-sky-500/20 bg-sky-500/5", prepaieView !== "cycle" && "hidden")}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-black">
                <FileCheck2 className="h-5 w-5 text-sky-700 dark:text-sky-300" />
                Cycle mensuel pre-paie
              </CardTitle>
              <CardDescription>
                Controle, validation, verrouillage et trace d'export.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-3xl border border-white/70 bg-white/70 p-4 shadow-sm dark:border-white/10 dark:bg-black/20">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                      Statut periode
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {currentPeriodMeta.description}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-full px-3 py-1 font-black",
                      currentPeriodMeta.tone
                    )}
                  >
                    {currentPeriodMeta.label}
                  </Badge>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950/50">
                    <p className="text-[10px] font-black uppercase text-muted-foreground">
                      Agents
                    </p>
                    <p className="mt-1 text-lg font-black">
                      {report?.summary.agentCount ?? "-"}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950/50">
                    <p className="text-[10px] font-black uppercase text-muted-foreground">
                      Vacations
                    </p>
                    <p className="mt-1 text-lg font-black">
                      {report?.summary.vacationCount ?? "-"}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950/50">
                    <p className="text-[10px] font-black uppercase text-muted-foreground">
                      Points
                    </p>
                    <p
                      className={cn(
                        "mt-1 text-lg font-black",
                        issueCount > 0
                          ? "text-amber-700 dark:text-amber-300"
                          : "text-emerald-700 dark:text-emerald-300"
                      )}
                    >
                      {issueCount}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                {currentPeriodActions.map((action) => {
                  const meta = PERIOD_ACTION_META[action];
                  const Icon = meta.icon;
                  return (
                    <Button
                      key={action}
                      type="button"
                      variant={action === "reopen" ? "outline" : "default"}
                      disabled={!report || loading || !!periodAction}
                      onClick={() => void runPeriodAction(action)}
                      className="rounded-2xl font-black"
                    >
                      <Icon
                        className={cn(
                          "mr-2 h-4 w-4",
                          periodAction === action && "animate-pulse"
                        )}
                      />
                      {meta.label}
                    </Button>
                  );
                })}
              </div>

              <div className="rounded-3xl border border-border/60 bg-background/70 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  <p className="text-sm font-black">Historique</p>
                </div>

                {period?.events.length ? (
                  <div className="space-y-2">
                    {period.events.slice(0, 5).map((event) => (
                      <div
                        key={`${event.action}-${event.atIso}`}
                        className="rounded-2xl bg-muted/40 p-3 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-black">
                            {actionLabel(event.action)}
                          </span>
                          <span className="text-muted-foreground">
                            {formatDateTime(event.atIso)}
                          </span>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {event.actorName || event.actorEmail || "Utilisateur"}
                        </p>
                        {event.note && (
                          <p className="mt-2 rounded-xl bg-amber-500/10 p-2 text-amber-800 dark:text-amber-100">
                            {event.note}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={History}
                    compact
                    title="Aucune action journalisee"
                    description="Le journal se remplira au controle, a la validation, au verrouillage ou a l'export."
                  />
                )}
              </div>
            </CardContent>
          </Card>

          <Card className={cn("rounded-[1.5rem] border-emerald-500/20 bg-emerald-500/5", prepaieView !== "reglages" && "hidden")}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-black">
                <Settings2 className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
                Parametres pre-paie
              </CardTitle>
              <CardDescription>
                Taux indicatifs par agence. A valider avec le gestionnaire paie.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                  Convention / reference
                </Label>
                <Input
                  value={settings.conventionLabel}
                  onChange={(event) =>
                    updateSetting("conventionLabel", event.target.value)
                  }
                  className="mt-2 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                    Taux horaire
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={settings.hourlyBaseRate}
                    onChange={(event) =>
                      updateSetting("hourlyBaseRate", Number(event.target.value))
                    }
                    className="mt-2 rounded-xl"
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                    Contrat def.
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    step="0.01"
                    value={settings.monthlyDefaultHours}
                    onChange={(event) =>
                      updateSetting("monthlyDefaultHours", Number(event.target.value))
                    }
                    className="mt-2 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <Label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                  Seuil HS hebdo indicatif
                </Label>
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  value={settings.weeklyOvertimeThreshold}
                  onChange={(event) =>
                    updateSetting(
                      "weeklyOvertimeThreshold",
                      Number(event.target.value)
                    )
                  }
                  className="mt-2 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                    Nuit debut
                  </Label>
                  <Input
                    type="time"
                    value={settings.nightStartTime}
                    onChange={(event) =>
                      updateSetting("nightStartTime", event.target.value)
                    }
                    className="mt-2 rounded-xl"
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                    Nuit fin
                  </Label>
                  <Input
                    type="time"
                    value={settings.nightEndTime}
                    onChange={(event) =>
                      updateSetting("nightEndTime", event.target.value)
                    }
                    className="mt-2 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  ["nightPremiumPercent", "Nuit %"],
                  ["sundayPremiumPercent", "Dim. %"],
                  ["publicHolidayPremiumPercent", "Ferie %"],
                  ["mayFirstPremiumPercent", "1er mai %"],
                ].map(([key, label]) => (
                  <div key={key}>
                    <Label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                      {label}
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={settings[key as keyof PrepaySettings] as number}
                      onChange={(event) =>
                        updateSetting(
                          key as keyof PrepaySettings,
                          Number(event.target.value) as never
                        )
                      }
                      className="mt-2 rounded-xl"
                    />
                  </div>
                ))}
              </div>

              <div>
                <Label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                  Mode indemnites
                </Label>
                <select
                  value={settings.allowanceMode}
                  onChange={(event) =>
                    updateSetting(
                      "allowanceMode",
                      event.target.value as PrepaySettings["allowanceMode"]
                    )
                  }
                  className="mt-2 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                >
                  <option value="none">Aucune indemnite automatique</option>
                  <option value="per_shift">Par vacation travaillee</option>
                  <option value="per_worked_day">Par jour travaille</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                    Panier
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={settings.mealAllowanceAmount}
                    onChange={(event) =>
                      updateSetting("mealAllowanceAmount", Number(event.target.value))
                    }
                    className="mt-2 rounded-xl"
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                    Transport
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={settings.transportAllowanceAmount}
                    onChange={(event) =>
                      updateSetting(
                        "transportAllowanceAmount",
                        Number(event.target.value)
                      )
                    }
                    className="mt-2 rounded-xl"
                  />
                </div>
              </div>

              <div className="rounded-3xl border border-sky-500/20 bg-sky-500/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black">Export cabinet paie</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Renseigner ici les codes rubriques fournis par le
                      gestionnaire de paie. Le CSV cabinet utilisera ces codes.
                    </p>
                  </div>
                  <Badge variant="outline" className="rounded-full font-black">
                    Mapping
                  </Badge>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                      Profil
                    </Label>
                    <select
                      value={settings.exportProfile}
                      onChange={(event) =>
                        updateSetting(
                          "exportProfile",
                          event.target.value as PrepaySettings["exportProfile"]
                        )
                      }
                      className="mt-2 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                    >
                      <option value="custom">Personnalise</option>
                      <option value="silae">Silae</option>
                      <option value="sage">Sage</option>
                      <option value="ebp">EBP</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                      Decimales
                    </Label>
                    <select
                      value={settings.exportDecimalSeparator}
                      onChange={(event) =>
                        updateSetting(
                          "exportDecimalSeparator",
                          event.target
                            .value as PrepaySettings["exportDecimalSeparator"]
                        )
                      }
                      className="mt-2 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                    >
                      <option value="comma">Virgule francaise</option>
                      <option value="dot">Point technique</option>
                    </select>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  {RUBRIC_FIELDS.map((field) => (
                    <div key={field.key}>
                      <Label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                        {field.label}
                      </Label>
                      <Input
                        value={settings.payrollRubricCodes[field.key]}
                        onChange={(event) =>
                          updateRubricCode(field.key, event.target.value)
                        }
                        className="mt-2 rounded-xl font-mono text-xs"
                      />
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {field.hint}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <Button
                type="button"
                onClick={() => void saveSettings()}
                disabled={savingSettings}
                className="w-full rounded-2xl font-black"
              >
                <Save
                  className={cn(
                    "mr-2 h-4 w-4",
                    savingSettings && "animate-pulse"
                  )}
                />
                Enregistrer et recalculer
              </Button>
            </CardContent>
          </Card>

          <Card className={cn("rounded-[1.5rem] border-amber-500/30 bg-amber-500/10", prepaieView !== "controle" && prepaieView !== "reglages" && "hidden")}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-black text-amber-900 dark:text-amber-100">
                <ShieldCheck className="h-5 w-5" />
                Prudence paie France
              </CardTitle>
              <CardDescription className="text-amber-900/80 dark:text-amber-100/80">
                Ce module prepare les variables. La paie finale depend de la
                convention, des accords, du contrat et des taux valides.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-amber-950 dark:text-amber-50">
              {report?.warnings.map((warning) => (
                <div key={warning} className="rounded-2xl bg-white/50 p-3 dark:bg-black/20">
                  {warning}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className={cn("rounded-[1.5rem] border-border/60", prepaieView !== "controle" && "hidden")}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-black">
                <CalendarRange className="h-5 w-5 text-primary" />
                Points a regulariser
              </CardTitle>
              <CardDescription>
                A traiter avant export paie definitif.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {report && report.summary.unassignedVacationCount > 0 && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-800 dark:text-red-200">
                  {report.summary.unassignedVacationCount} vacation(s) sans agent.
                </div>
              )}
              {criticalRows.length === 0 && report?.summary.unassignedVacationCount === 0 ? (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-200">
                  Aucun point bloquant detecte sur les lignes agent.
                </div>
              ) : (
                criticalRows.slice(0, 8).map((row) => (
                  <div
                    key={row.agentId}
                    className="rounded-2xl border border-border/60 bg-muted/20 p-3"
                  >
                    <p className="font-black">{row.agentName}</p>
                    <div className="mt-2 space-y-1">
                      {row.anomalies.map((anomaly) => (
                        <p key={anomaly} className="text-xs text-muted-foreground">
                          - {anomaly}
                        </p>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
