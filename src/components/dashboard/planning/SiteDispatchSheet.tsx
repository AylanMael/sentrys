"use client";

import React from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  FileText,
  History,
  Loader2,
  Mail,
  Printer,
  Send,
  Users,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api/client-fetch";
import type { AgencyDocumentProfile } from "@/lib/agency/profile";
import type { AgencyEmailSettings } from "@/lib/agency/email-settings";
import {
  agencyEmailIdentity,
  previewPeriodLabel,
} from "@/lib/planning/email-preview";
import {
  dispatchChannelLabel,
  type DispatchChannel,
} from "@/lib/planning/dispatch";
import { cn } from "@/lib/utils";
import {
  EmailPreviewDialog,
  type EmailPreviewData,
} from "./EmailPreviewDialog";
import {
  getVacationPublicationStatus,
  usePlanning,
  type SiteApiItem,
  type VacationApiItem,
} from "./PlanningContext";

type SiteDispatchRow = {
  site: SiteApiItem;
  vacations: VacationApiItem[];
  readyVacations: VacationApiItem[];
  draftCount: number;
  modifiedCount: number;
  missingAgentCount: number;
  plannedAgentCount: number;
};

type ClientDispatchChannel = Extract<DispatchChannel, "email" | "internal">;

type SiteDispatchHistoryItem = {
  id: string;
  clientId: string | null;
  clientName: string;
  clientEmail: string | null;
  contactName: string | null;
  fromIso: string;
  toIso: string;
  siteIds: string[];
  siteCount: number;
  siteNames: string[];
  vacationCount: number;
  readyVacationCount: number;
  draftCount: number;
  modifiedCount: number;
  missingAgentCount: number;
  plannedAgentCount: number;
  channel: ClientDispatchChannel;
  deliveryStatus: "simulated" | "logged" | "blocked";
  deliveryTarget: string | null;
  deliveryNote: string | null;
  pdfUrl: string;
  sentAtIso: string | null;
};

type SiteDispatchListResponse = {
  ok: true;
  dispatches: SiteDispatchHistoryItem[];
};

type SiteDispatchPostResponse = {
  ok: true;
  created: number;
  blocked?: Array<{
    clientId: string | null;
    clientName: string;
    reason: string;
  }>;
  dispatches: SiteDispatchHistoryItem[];
};

type ClientContact = {
  id: string;
  name?: string | null;
  contactName?: string | null;
  email?: string | null;
  billingEmail?: string | null;
  phone?: string | null;
};

type ClientDetailResponse = {
  ok: true;
  item: ClientContact;
};

type AgencyProfileResponse = {
  ok: true;
  profile: AgencyDocumentProfile;
  emailSettings: AgencyEmailSettings;
};

function siteLabel(site: SiteApiItem) {
  return String(site.name ?? "").trim() || "Site";
}

function siteSubtitle(site: SiteApiItem) {
  return [site.clientName, site.city].filter(Boolean).join(" - ") || "Client a renseigner";
}

function activeOnly(vacation: VacationApiItem) {
  return vacation.status !== "cancelled" && vacation.status !== "closed";
}

function missingAgents(vacation: VacationApiItem) {
  const required = Math.max(1, Number(vacation.requiredAgents ?? 1));
  const assigned = Array.isArray(vacation.assignedAgentIds)
    ? vacation.assignedAgentIds.length
    : 0;

  return Math.max(0, required - assigned);
}

function formatRange(from?: string, to?: string) {
  if (!from || !to) return "Periode en cours";

  const formatter = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return `${formatter.format(new Date(from))} - ${formatter.format(new Date(to))}`;
}

function formatSentAt(value?: string | null) {
  if (!value) return "date en cours";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function clientChannelDescription(channel: ClientDispatchChannel) {
  if (channel === "email") {
    return "Simulation email : on prepare le PDF et on historise la cible, sans envoi reel.";
  }

  return "Historique interne : preuve de preparation, sans diffusion externe.";
}

function clientDeliveryLabel(entry: SiteDispatchHistoryItem) {
  if (entry.deliveryStatus === "logged") return "Journalise";
  if (entry.deliveryStatus === "blocked") return "Bloque";
  return "Email prepare";
}

function sitePlanningPrintHref(input: {
  from?: string;
  to?: string;
  siteId?: string | null;
  clientId?: string | null;
}) {
  if (!input.from || !input.to) return null;

  const params = new URLSearchParams({
    from: input.from,
    to: input.to,
  });

  if (input.siteId && input.siteId !== "all") {
    params.set("siteId", input.siteId);
  }

  if (input.clientId) {
    params.set("clientId", input.clientId);
  }

  return `/site-planning/print?${params.toString()}`;
}

function openSitePlanningPrint(input: {
  from?: string;
  to?: string;
  siteId?: string | null;
  clientId?: string | null;
}) {
  const href = sitePlanningPrintHref(input);
  if (!href) return;

  window.open(
    href,
    "_blank",
    "noopener,noreferrer"
  );
}

export const SiteDispatchSheet: React.FC = () => {
  const {
    siteDispatchOpen,
    setSiteDispatchOpen,
    filteredVacations,
    sites,
    siteId,
    range,
  } = usePlanning();
  const { toast } = useToast();
  const [selectedSiteIds, setSelectedSiteIds] = React.useState<Set<string>>(
    () => new Set()
  );
  const [channel, setChannel] = React.useState<ClientDispatchChannel>("email");
  const [history, setHistory] = React.useState<SiteDispatchHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [focusedClientContact, setFocusedClientContact] =
    React.useState<ClientContact | null>(null);
  const [emailPreview, setEmailPreview] =
    React.useState<EmailPreviewData | null>(null);
  const [agencyProfile, setAgencyProfile] =
    React.useState<AgencyDocumentProfile | null>(null);
  const [emailSettings, setEmailSettings] =
    React.useState<AgencyEmailSettings | null>(null);

  const sitesById = React.useMemo(
    () => new Map(sites.map((site) => [site.id, site])),
    [sites]
  );

  const siteRows = React.useMemo<SiteDispatchRow[]>(() => {
    const activeVacations = filteredVacations.filter(activeOnly);
    const ids = Array.from(
      new Set(
        activeVacations
          .map((vacation) => vacation.siteId)
          .filter((value): value is string => Boolean(value))
      )
    );

    return ids
      .map((id) => {
        const site =
          sitesById.get(id) ??
          ({
            id,
            name:
              activeVacations.find((vacation) => vacation.siteId === id)
                ?.siteName ?? "Site",
          } satisfies SiteApiItem);
        const vacations = activeVacations
          .filter((vacation) => vacation.siteId === id)
          .sort(
            (left, right) =>
              Date.parse(left.startAtIso ?? "") - Date.parse(right.startAtIso ?? "")
          );
        const readyVacations = vacations.filter((vacation) => {
          const status = getVacationPublicationStatus(vacation);
          return status === "published" && vacation.assignedAgentIds.length > 0;
        });
        const agentIds = new Set<string>();

        vacations.forEach((vacation) => {
          vacation.assignedAgentIds.forEach((agentId) => agentIds.add(agentId));
        });

        return {
          site,
          vacations,
          readyVacations,
          draftCount: vacations.filter(
            (vacation) => getVacationPublicationStatus(vacation) === "draft"
          ).length,
          modifiedCount: vacations.filter(
            (vacation) => getVacationPublicationStatus(vacation) === "modified"
          ).length,
          missingAgentCount: vacations.reduce(
            (total, vacation) => total + missingAgents(vacation),
            0
          ),
          plannedAgentCount: agentIds.size,
        };
      })
      .sort((left, right) => siteLabel(left.site).localeCompare(siteLabel(right.site), "fr"));
  }, [filteredVacations, sitesById]);

  const loadHistory = React.useCallback(async () => {
    if (!range?.from || !range?.to) return;

    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({
        from: range.from,
        to: range.to,
      });
      const response = await apiFetch<SiteDispatchListResponse>(
        `/api/site-planning-dispatches?${params.toString()}`
      );
      setHistory(response.dispatches ?? []);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Historique client indisponible",
        description:
          error instanceof Error
            ? error.message
            : "Impossible de charger les remises client.",
      });
    } finally {
      setHistoryLoading(false);
    }
  }, [range?.from, range?.to, toast]);

  const loadAgencyConfig = React.useCallback(async () => {
    try {
      const response = await apiFetch<AgencyProfileResponse>("/api/agency-profile");
      setAgencyProfile(response.profile ?? null);
      setEmailSettings(response.emailSettings ?? null);
    } catch {
      setAgencyProfile(null);
      setEmailSettings(null);
    }
  }, []);

  React.useEffect(() => {
    if (!siteDispatchOpen) return;

    setSelectedSiteIds(() => {
      if (siteId !== "all" && siteRows.some((row) => row.site.id === siteId)) {
        return new Set([siteId]);
      }

      return new Set(siteRows.map((row) => row.site.id));
    });
    void loadHistory();
    void loadAgencyConfig();
  }, [loadAgencyConfig, loadHistory, siteDispatchOpen, siteId, siteRows]);

  const selectedRows = React.useMemo(
    () => siteRows.filter((row) => selectedSiteIds.has(row.site.id)),
    [selectedSiteIds, siteRows]
  );

  const clientGroups = React.useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        clientId: string | null;
        label: string;
        rows: SiteDispatchRow[];
      }
    >();

    siteRows.forEach((row) => {
      const clientId = row.site.clientId ?? null;
      const label = row.site.clientName || "Client non renseigne";
      const key = clientId ? `id:${clientId}` : `name:${label}`;
      const current =
        groups.get(key) ??
        ({
          key,
          clientId,
          label,
          rows: [],
        } satisfies {
          key: string;
          clientId: string | null;
          label: string;
          rows: SiteDispatchRow[];
        });

      current.rows.push(row);
      groups.set(key, current);
    });

    return Array.from(groups.values()).sort((left, right) =>
      left.label.localeCompare(right.label, "fr")
    );
  }, [siteRows]);

  const selectedClientGroups = React.useMemo(
    () =>
      clientGroups
        .map((group) => ({
          ...group,
          rows: group.rows.filter((row) => selectedSiteIds.has(row.site.id)),
        }))
        .filter((group) => group.rows.length > 0),
    [clientGroups, selectedSiteIds]
  );

  const focusedClientGroup =
    selectedClientGroups.length === 1 ? selectedClientGroups[0] : null;

  React.useEffect(() => {
    let cancelled = false;

    async function loadClientContact() {
      if (!siteDispatchOpen || !focusedClientGroup?.clientId) {
        setFocusedClientContact(null);
        return;
      }

      try {
        const response = await apiFetch<ClientDetailResponse>(
          `/api/clients/${focusedClientGroup.clientId}`
        );

        if (!cancelled) {
          setFocusedClientContact(response.item ?? null);
        }
      } catch {
        if (!cancelled) setFocusedClientContact(null);
      }
    }

    void loadClientContact();

    return () => {
      cancelled = true;
    };
  }, [focusedClientGroup?.clientId, siteDispatchOpen]);

  const totals = React.useMemo(
    () =>
      selectedRows.reduce(
        (acc, row) => {
          acc.vacations += row.vacations.length;
          acc.ready += row.readyVacations.length;
          acc.draft += row.draftCount;
          acc.modified += row.modifiedCount;
          acc.missing += row.missingAgentCount;
          if (!row.site.clientName) acc.noClient += 1;
          return acc;
        },
        {
          vacations: 0,
          ready: 0,
          draft: 0,
          modified: 0,
          missing: 0,
          noClient: 0,
        }
      ),
    [selectedRows]
  );

  const toggleSite = React.useCallback((id: string) => {
    setSelectedSiteIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openClientEmailPreview = React.useCallback(() => {
    if (!range?.from || !range?.to || selectedRows.length === 0) return;

    const identity = agencyEmailIdentity(agencyProfile, emailSettings);
    const period = previewPeriodLabel(range.from, range.to);
    const clientName =
      focusedClientContact?.name ||
      focusedClientGroup?.label ||
      selectedRows[0]?.site.clientName ||
      "Client";
    const toEmail =
      focusedClientContact?.billingEmail ||
      focusedClientContact?.email ||
      history.find((entry) => entry.clientId === focusedClientGroup?.clientId)
        ?.clientEmail ||
      null;
    const pdfHref =
      sitePlanningPrintHref({
        from: range.from,
        to: range.to,
        clientId: focusedClientGroup?.clientId ?? null,
      }) ||
      sitePlanningPrintHref({
        from: range.from,
        to: range.to,
        siteId: selectedRows.length === 1 ? selectedRows[0].site.id : null,
      }) ||
      "/site-planning/print";

    setEmailPreview({
      kind: "client",
      status: toEmail ? "ready" : "blocked",
      statusLabel: toEmail ? "Pret pour envoi" : "Email client manquant",
      fromName: identity.fromName,
      fromEmail: identity.fromEmail,
      replyTo: identity.replyTo,
      toName: focusedClientContact?.contactName || clientName,
      toEmail,
      subject: `Planning des agents - ${clientName} - ${period}`,
      preheader: `${selectedRows.length} site(s), ${totals.vacations} vacation(s), ${totals.ready} service(s) pret(s).`,
      bodyLines: [
        `Bonjour ${focusedClientContact?.contactName || clientName},`,
        `Veuillez trouver le planning des agents prevus sur vos sites pour la periode du ${period}.`,
        `Ce planning couvre ${selectedRows.length} site(s) et ${totals.vacations} vacation(s).`,
        `Agents planifies : ${selectedRows.reduce((total, row) => total + row.plannedAgentCount, 0)} affectation(s) visibles sur la periode.`,
        "Le PDF joint recapitule les horaires, les sites et les agents planifies.",
        "Nous restons disponibles pour toute question ou ajustement operationnel.",
        "Cordialement,",
        identity.fromName,
      ],
      attachments: [
        {
          label: `Planning sites - ${clientName}.pdf`,
          href: pdfHref,
          note: "PDF client avec les sites selectionnes et agents planifies.",
        },
      ],
      warnings: [
        !toEmail ? "Aucun email client/facturation n'est renseigne." : "",
        totals.modified > 0
          ? `${totals.modified} vacation(s) ont ete modifiees apres publication.`
          : "",
        totals.draft > 0 ? `${totals.draft} vacation(s) sont encore en brouillon.` : "",
        totals.missing > 0 ? `${totals.missing} agent(s) manquant(s) restent a traiter.` : "",
        identity.replyTo.includes("configurer")
          ? "L'email d'exploitation de l'agence n'est pas encore configure."
          : "",
      ].filter(Boolean),
    });
  }, [
    agencyProfile,
    emailSettings,
    focusedClientContact,
    focusedClientGroup?.clientId,
    focusedClientGroup?.label,
    history,
    range?.from,
    range?.to,
    selectedRows,
    totals.draft,
    totals.missing,
    totals.modified,
    totals.ready,
    totals.vacations,
  ]);

  const handlePrepareDispatch = React.useCallback(async () => {
    if (!range?.from || !range?.to || selectedRows.length === 0) return;

    setSending(true);
    try {
      const response = await apiFetch<SiteDispatchPostResponse>(
        "/api/site-planning-dispatches",
        {
          method: "POST",
          body: {
            from: range.from,
            to: range.to,
            siteIds: selectedRows.map((row) => row.site.id),
            clientId: focusedClientGroup?.clientId ?? undefined,
            channel,
          },
        }
      );

      toast({
        title:
          channel === "email"
            ? "Envoi client prepare"
            : "Remise client journalisee",
        description:
          response.blocked && response.blocked.length > 0
            ? `${response.created} remise(s) preparee(s), ${response.blocked.length} bloquee(s) faute d'email client.`
            : `${response.created} remise(s) historisee(s) pour cette periode.`,
      });
      await loadHistory();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Preparation impossible",
        description:
          error instanceof Error
            ? error.message
            : "Impossible d'historiser cette remise client.",
      });
    } finally {
      setSending(false);
    }
  }, [
    channel,
    focusedClientGroup?.clientId,
    loadHistory,
    range?.from,
    range?.to,
    selectedRows,
    toast,
  ]);

  return (
    <>
      <Sheet open={siteDispatchOpen} onOpenChange={setSiteDispatchOpen}>
      <SheetContent className="overflow-y-auto border-l bg-white shadow-2xl dark:bg-slate-950 sm:max-w-4xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-xl font-black">
            <Building2 className="h-5 w-5 text-primary" />
            Preparation client par site
          </SheetTitle>
          <SheetDescription>
            Controle les plannings site avant remise client : PDF, agents
            planifies, anomalies et sites a completer.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          <div className="rounded-[1.75rem] border border-primary/20 bg-primary/5 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-muted-foreground">
                  Periode client
                </p>
                <h3 className="mt-1 text-2xl font-black">
                  {formatRange(range?.from, range?.to)}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {selectedRows.length} site(s) selectionne(s), {totals.vacations} vacation(s)
                  visibles.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
                <SummaryCard label="Sites" value={selectedRows.length} />
                <SummaryCard label="PDF" value={selectedRows.length} />
                <SummaryCard label="Pretes" value={totals.ready} tone="good" />
                <SummaryCard
                  label="Alertes"
                  value={totals.draft + totals.modified + totals.missing + totals.noClient}
                  tone={
                    totals.draft + totals.modified + totals.missing + totals.noClient > 0
                      ? "warning"
                      : "neutral"
                  }
                />
                <SummaryCard label="Historique" value={history.length} />
              </div>
            </div>
          </div>

          {(totals.draft > 0 ||
            totals.modified > 0 ||
            totals.missing > 0 ||
            totals.noClient > 0) && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Controle requis : {totals.draft} brouillon(s), {totals.modified} a
                  republier, {totals.missing} agent(s) manquant(s), {totals.noClient} site(s)
                  sans client renseigne.
                </p>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-black">Canal de remise client</p>
                <p className="text-xs text-muted-foreground">
                  {clientChannelDescription(channel)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/60 bg-muted/20 p-1">
                {(["email", "internal"] as ClientDispatchChannel[]).map((item) => (
                  <Button
                    key={item}
                    type="button"
                    variant={channel === item ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setChannel(item)}
                    className="h-9 rounded-lg px-3 text-[10px] font-black uppercase tracking-[0.12em]"
                  >
                    {item === "email" ? (
                      <Mail className="mr-2 h-3.5 w-3.5" />
                    ) : (
                      <History className="mr-2 h-3.5 w-3.5" />
                    )}
                    {dispatchChannelLabel(item)}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 text-sm text-sky-800 dark:text-sky-200">
            <div className="flex gap-3">
              <Send className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Etape actuelle : preparation, previsualisation et historique.
                Aucun email client reel ne part depuis ce panneau pour l&apos;instant.
              </p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black">Sites a remettre au client</p>
                  <p className="text-xs text-muted-foreground">
                    Selectionne les sites a previsualiser ou preparer.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setSelectedSiteIds(new Set(siteRows.map((row) => row.site.id)))
                    }
                    disabled={siteRows.length === 0}
                  >
                    Tous
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedSiteIds(new Set())}
                    disabled={siteRows.length === 0}
                  >
                    Aucun
                  </Button>
                </div>
              </div>

              {siteRows.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-8 text-center">
                  <Building2 className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="mt-3 font-black">Aucun planning site visible</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Verifie la periode du planning ou cree des vacations sur un site.
                  </p>
                </div>
              ) : (
                <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
                  {siteRows.map((row) => {
                    const selected = selectedSiteIds.has(row.site.id);
                    const hasAlert =
                      row.draftCount > 0 ||
                      row.modifiedCount > 0 ||
                      row.missingAgentCount > 0 ||
                      !row.site.clientName;

                    return (
                      <div
                        key={row.site.id}
                        className={cn(
                          "rounded-2xl border p-4 transition",
                          selected
                            ? "border-primary/30 bg-primary/5"
                            : "border-border/60 bg-background"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => toggleSite(row.site.id)}
                            className="flex min-w-0 flex-1 items-start gap-3 text-left"
                          >
                            <span
                              className={cn(
                                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                                selected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background"
                              )}
                            >
                              {selected && <CheckCircle2 className="h-3.5 w-3.5" />}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-black">
                                {siteLabel(row.site)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {siteSubtitle(row.site)}
                              </span>
                            </span>
                          </button>

                          <div className="flex shrink-0 items-center gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-full"
                              onClick={() =>
                                openSitePlanningPrint({
                                  from: range?.from,
                                  to: range?.to,
                                  siteId: row.site.id,
                                })
                              }
                              title="Previsualiser le PDF site"
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                            {hasAlert && (
                              <Badge
                                variant="outline"
                                className="rounded-full border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-700 dark:text-amber-300"
                              >
                                A verifier
                              </Badge>
                            )}
                            <Badge
                              variant="outline"
                              className="rounded-full bg-background px-3 py-1 font-black"
                            >
                              {row.vacations.length}
                            </Badge>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                          <MiniStat
                            icon={<FileText className="h-3.5 w-3.5" />}
                            label="Services prets"
                            value={`${row.readyVacations.length}/${row.vacations.length}`}
                          />
                          <MiniStat
                            icon={<Users className="h-3.5 w-3.5" />}
                            label="Agents planifies"
                            value={String(row.plannedAgentCount)}
                          />
                          <MiniStat
                            icon={<AlertTriangle className="h-3.5 w-3.5" />}
                            label="Manquants"
                            value={String(row.missingAgentCount)}
                            warning={row.missingAgentCount > 0}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-black">Sortie client</p>
                <p className="text-xs text-muted-foreground">
                  Le PDF site garde le format paysage mensuel.
                </p>
              </div>

              <div className="rounded-2xl border border-border/60 bg-background p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  Action conseillee
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Ouvre le PDF global ou site par site, controle la lisibilite, puis
                  imprime ou sauvegarde en PDF avant remise client.
                </p>
                <div className="mt-4 space-y-2">
                  <Button
                    type="button"
                    className="w-full font-black"
                    onClick={() =>
                      openSitePlanningPrint({
                        from: range?.from,
                        to: range?.to,
                        siteId:
                          selectedRows.length === 1
                            ? selectedRows[0].site.id
                            : siteId !== "all"
                              ? siteId
                              : null,
                      })
                    }
                    disabled={!range?.from || !range?.to || selectedRows.length === 0}
                  >
                    <Printer className="mr-2 h-4 w-4" />
                    Voir le PDF client
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full font-black"
                    onClick={() =>
                      openSitePlanningPrint({
                        from: range?.from,
                        to: range?.to,
                        clientId: focusedClientGroup?.clientId ?? null,
                      })
                    }
                    disabled={
                      !range?.from ||
                      !range?.to ||
                      !focusedClientGroup?.clientId
                    }
                  >
                    <Building2 className="mr-2 h-4 w-4" />
                    PDF tous les sites du client
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() =>
                      openSitePlanningPrint({
                        from: range?.from,
                        to: range?.to,
                        siteId: null,
                      })
                    }
                    disabled={!range?.from || !range?.to}
                  >
                    PDF de tous les sites
                  </Button>
                  {channel === "email" && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full font-black"
                      onClick={openClientEmailPreview}
                      disabled={
                        !range?.from ||
                        !range?.to ||
                        selectedRows.length === 0 ||
                        !focusedClientGroup
                      }
                    >
                      <Mail className="mr-2 h-4 w-4" />
                      Voir email client
                    </Button>
                  )}
                  <Button
                    type="button"
                    className="w-full bg-sky-600 font-black text-white hover:bg-sky-700"
                    onClick={handlePrepareDispatch}
                    disabled={
                      !range?.from ||
                      !range?.to ||
                      selectedRows.length === 0 ||
                      sending
                    }
                  >
                    {sending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    {channel === "email"
                      ? "Preparer l'email client"
                      : "Journaliser la remise"}
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 text-xs text-muted-foreground">
                <p className="font-black text-foreground">Client concerne</p>
                <p className="mt-1">
                  {focusedClientGroup
                    ? `${focusedClientGroup.label} - ${focusedClientGroup.rows.length} site(s) selectionne(s).`
                    : selectedClientGroups.length > 1
                      ? `${selectedClientGroups.length} clients selectionnes : le PDF client dedie est desactive.`
                      : "Selectionne au moins un site rattache a un client."}
                </p>
                {!focusedClientGroup?.clientId && focusedClientGroup && (
                  <p className="mt-2 font-semibold text-amber-700 dark:text-amber-300">
                    Client sans identifiant : rattache le site a une fiche client
                    pour imprimer tous ses sites automatiquement.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-foreground">
                      Historique de remise
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Envoye a qui, quand, et pour quels sites.
                    </p>
                  </div>
                  {historyLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <History className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>

                <div className="mt-3 space-y-2">
                  {history.length === 0 ? (
                    <div className="rounded-xl border border-dashed bg-background/70 p-3 text-xs text-muted-foreground">
                      Aucune remise client historisee sur cette periode.
                    </div>
                  ) : (
                    history.slice(0, 6).map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-xl border border-border/60 bg-background p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black">
                              {entry.clientName}
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {formatSentAt(entry.sentAtIso)} - {entry.siteCount} site(s)
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em]"
                          >
                            {clientDeliveryLabel(entry)}
                          </Badge>
                        </div>

                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {entry.channel === "email"
                            ? entry.deliveryTarget || "Email client manquant"
                            : "Journal interne"}
                          {" - "}
                          {entry.vacationCount} vacation(s),{" "}
                          {entry.plannedAgentCount} agent(s)
                        </p>

                        {(entry.draftCount > 0 ||
                          entry.modifiedCount > 0 ||
                          entry.missingAgentCount > 0) && (
                          <p className="mt-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                            Alertes : {entry.draftCount} brouillon(s),{" "}
                            {entry.modifiedCount} a republier,{" "}
                            {entry.missingAgentCount} agent(s) manquant(s).
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <SheetFooter className="flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => setSiteDispatchOpen(false)}
            disabled={sending}
          >
            Retour au planning
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handlePrepareDispatch}
            disabled={
              !range?.from ||
              !range?.to ||
              selectedRows.length === 0 ||
              sending
            }
          >
            {sending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Historiser la remise
          </Button>
          <Button
            type="button"
            onClick={() =>
              openSitePlanningPrint({
                from: range?.from,
                to: range?.to,
                siteId:
                  selectedRows.length === 1
                    ? selectedRows[0].site.id
                    : siteId !== "all"
                      ? siteId
                      : null,
              })
            }
            disabled={!range?.from || !range?.to || selectedRows.length === 0}
            className="bg-sky-600 text-white hover:bg-sky-700"
          >
            <Printer className="mr-2 h-4 w-4" />
            Previsualiser la remise client
          </Button>
        </SheetFooter>
      </SheetContent>
      </Sheet>
      <EmailPreviewDialog
        open={Boolean(emailPreview)}
        preview={emailPreview}
        onOpenChange={(open) => {
          if (!open) setEmailPreview(null);
        }}
      />
    </>
  );
};

const SummaryCard: React.FC<{
  label: string;
  value: number;
  tone?: "neutral" | "good" | "warning";
}> = ({ label, value, tone = "neutral" }) => (
  <div
    className={cn(
      "rounded-2xl border p-3",
      tone === "good"
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        : tone === "warning"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          : "border-border/60 bg-background"
    )}
  >
    <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
      {label}
    </p>
    <p className="mt-1 text-2xl font-black">{value}</p>
  </div>
);

const MiniStat: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  warning?: boolean;
}> = ({ icon, label, value, warning }) => (
  <div
    className={cn(
      "flex items-center gap-2 rounded-xl border px-3 py-2",
      warning
        ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
        : "border-border/50 bg-background/80"
    )}
  >
    {icon}
    <div>
      <p className="font-black">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  </div>
);
