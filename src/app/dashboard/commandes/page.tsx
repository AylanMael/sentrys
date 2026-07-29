"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  Loader2,
  Paperclip,
  UploadCloud,
  Mail,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wand2,
  XCircle,
} from "lucide-react";

import { apiFetch } from "@/lib/api/client-fetch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type OrderStatus =
  | "received"
  | "qualified"
  | "validated"
  | "partially_generated"
  | "planning_generated"
  | "cancelled";

type OrderChannel = "email" | "phone" | "portal" | "manual" | "other";
type LineOperation = "add" | "update" | "cancel";

type ClientApi = {
  id: string;
  name?: string | null;
  legalName?: string | null;
  email?: string | null;
};

type SiteApi = {
  id: string;
  name?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  city?: string | null;
  isActive?: boolean;
};

type OrderLine = {
  id: string;
  operation: LineOperation;
  siteId: string;
  siteName?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  agentCount: number;
  missionType?: string | null;
  requiredQualification?: string | null;
  notes?: string | null;
  generatedVacationIds?: string[];
};

type ClientOrder = {
  id: string;
  clientId?: string | null;
  clientName?: string | null;
  reference?: string | null;
  title?: string | null;
  channel?: OrderChannel;
  status?: OrderStatus;
  version?: number;
  requesterName?: string | null;
  requesterEmail?: string | null;
  requesterPhone?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  lineCount?: number;
  totalRequestedVacations?: number;
  generatedVacationIds?: string[];
  lines?: OrderLine[];
  updatedAtIso?: string | null;
  createdAtIso?: string | null;
};

type OrdersResponse = {
  ok: boolean;
  items: ClientOrder[];
};

type ClientsResponse = {
  ok: boolean;
  items?: ClientApi[];
};

type SitesResponse = {
  ok: boolean;
  sites?: SiteApi[];
  items?: SiteApi[];
};

type SiteResponse = {
  ok: boolean;
  site: SiteApi;
};

type OrderResponse = {
  ok: boolean;
  item: ClientOrder;
};

type PlanningPreviewLineStatus = "ready" | "warning" | "blocked" | "manual" | "already_generated";

type PlanningPreviewLine = {
  lineId: string;
  operation: LineOperation;
  status: PlanningPreviewLineStatus;
  siteId: string | null;
  siteName: string | null;
  date: string;
  startTime: string;
  endTime: string;
  agentCount: number;
  missionType: string | null;
  vacationsToCreate: number;
  duplicateVacationIds: string[];
  generatedVacationIds: string[];
  warnings: string[];
  blockers: string[];
};

type PlanningPreview = {
  summary: {
    lineCount: number;
    ready: number;
    blocked: number;
    manual: number;
    alreadyGenerated: number;
    duplicateLines: number;
    toCreate: number;
  };
  lines: PlanningPreviewLine[];
  globalWarnings: string[];
};

type PlanningPreviewResponse = OrderResponse & {
  preview: PlanningPreview;
};

type ExtractionLine = {
  operation?: LineOperation;
  siteId?: string | null;
  siteName?: string | null;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  agentCount?: number | null;
  missionType?: string | null;
  requiredQualification?: string | null;
  notes?: string | null;
  confidence?: number | null;
  warnings?: string[];
};

type ClientOrderExtraction = {
  reference?: string | null;
  title?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  channel?: OrderChannel;
  requesterName?: string | null;
  requesterEmail?: string | null;
  requesterPhone?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  lines?: ExtractionLine[];
  summary?: string | null;
  confidence?: number | null;
  missingFields?: string[];
  warnings?: string[];
};

type ExtractionResponse = {
  ok: boolean;
  degraded?: boolean;
  extraction: ClientOrderExtraction;
};

type LineForm = {
  id: string;
  operation: LineOperation;
  siteId: string;
  siteName: string;
  date: string;
  startTime: string;
  endTime: string;
  agentCount: number;
  missionType: string;
  requiredQualification: string;
  notes: string;
  warnings: string[];
};

type LineControlStatus = "ready" | "fix" | "duplicate" | "manual";

type OrderForm = {
  clientId: string;
  reference: string;
  title: string;
  channel: OrderChannel;
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string;
  periodStart: string;
  periodEnd: string;
  notes: string;
  changeReason: string;
  lines: LineForm[];
};

const STATUS_OPTIONS: Array<{ value: "all" | OrderStatus; label: string }> = [
  { value: "all", label: "Tous les BDC" },
  { value: "received", label: "A qualifier" },
  { value: "qualified", label: "Qualifies" },
  { value: "validated", label: "Valides" },
  { value: "partially_generated", label: "Partiels" },
  { value: "planning_generated", label: "Brouillons generes" },
  { value: "cancelled", label: "Annules" },
];

const CHANNELS: Array<{ value: OrderChannel; label: string; icon: ReactNode }> = [
  { value: "email", label: "Email", icon: <Mail className="h-3.5 w-3.5" /> },
  { value: "portal", label: "Portail", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  { value: "manual", label: "Saisie interne", icon: <FileText className="h-3.5 w-3.5" /> },
  { value: "phone", label: "Telephone", icon: <ClipboardList className="h-3.5 w-3.5" /> },
  { value: "other", label: "Autre", icon: <ClipboardList className="h-3.5 w-3.5" /> },
];

const MISSION_TYPES = [
  "ADS",
  "SSIAP 1",
  "SSIAP 2",
  "SSIAP 3",
  "Agent cynophile",
  "Ronde mobile",
  "Accueil / filtrage",
  "Controle d'acces",
  "Surete evenementielle",
  "Intervention",
];

const PAGE_SIZE_OPTIONS = [8, 12, 20, 50];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toDateInput(date: Date) {
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

function startOfCurrentMonth() {
  const now = new Date();
  return toDateInput(new Date(now.getFullYear(), now.getMonth(), 1));
}

function endOfCurrentMonth() {
  const now = new Date();
  return toDateInput(new Date(now.getFullYear(), now.getMonth() + 1, 0));
}

function newLine(date?: string): LineForm {
  return {
    id: "line_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7),
    operation: "add",
    siteId: "",
    siteName: "",
    date: date || toDateInput(new Date()),
    startTime: "08:00",
    endTime: "18:00",
    agentCount: 1,
    missionType: "ADS",
    requiredQualification: "",
    notes: "",
    warnings: [],
  };
}

function initialForm(clientId = ""): OrderForm {
  return {
    clientId,
    reference: "",
    title: "Bon de commande client",
    channel: "email",
    requesterName: "",
    requesterEmail: "",
    requesterPhone: "",
    periodStart: startOfCurrentMonth(),
    periodEnd: endOfCurrentMonth(),
    notes: "",
    changeReason: "",
    lines: [],
  };
}

function clientLabel(client?: ClientApi | null) {
  if (!client) return "Client non selectionne";
  return client.name || client.legalName || client.email || client.id;
}

function statusLabel(status?: string | null) {
  if (status === "received") return "A qualifier";
  if (status === "qualified") return "Qualifie";
  if (status === "validated") return "Valide";
  if (status === "partially_generated") return "Partiellement genere";
  if (status === "planning_generated") return "Brouillons generes";
  if (status === "cancelled") return "Annule";
  return "Inconnu";
}

function statusTone(status?: string | null) {
  if (status === "received") return "border-amber-300 bg-amber-50 text-amber-800";
  if (status === "qualified") return "border-blue-300 bg-blue-50 text-blue-800";
  if (status === "validated") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (status === "partially_generated") return "border-amber-300 bg-amber-50 text-amber-800";
  if (status === "planning_generated") return "border-violet-300 bg-violet-50 text-violet-800";
  if (status === "cancelled") return "border-slate-300 bg-slate-100 text-slate-600";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function previewStatusLabel(status: PlanningPreviewLineStatus) {
  if (status === "ready") return "Pret";
  if (status === "warning") return "A verifier";
  if (status === "blocked") return "Bloque";
  if (status === "manual") return "Manuel";
  return "Deja genere";
}

function previewStatusTone(status: PlanningPreviewLineStatus) {
  if (status === "ready") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (status === "warning") return "border-amber-300 bg-amber-50 text-amber-800";
  if (status === "blocked") return "border-red-300 bg-red-50 text-red-800";
  if (status === "manual") return "border-blue-300 bg-blue-50 text-blue-800";
  return "border-slate-300 bg-slate-100 text-slate-700";
}

function previewCardTone(status: PlanningPreviewLineStatus) {
  if (status === "ready") return "border-emerald-200 bg-gradient-to-br from-white via-white to-emerald-50/70";
  if (status === "warning") return "border-amber-200 bg-gradient-to-br from-white via-white to-amber-50/80";
  if (status === "blocked") return "border-red-200 bg-gradient-to-br from-white via-white to-red-50/80";
  if (status === "manual") return "border-blue-200 bg-gradient-to-br from-white via-white to-blue-50/70";
  return "border-slate-200 bg-gradient-to-br from-white via-white to-slate-50";
}

function previewLockReason(preview?: PlanningPreview | null) {
  if (!preview) return "Lancez l'apercu avant de creer des brouillons.";
  if (preview.summary.blocked > 0) return "Generation verrouillee: corrigez d'abord les lignes bloquees.";
  if (preview.summary.duplicateLines > 0) {
    return "Generation verrouillee: des vacations existent deja aux memes sites et horaires.";
  }
  if (preview.summary.toCreate <= 0) return "Aucune nouvelle vacation a creer.";
  return "";
}

function previewCanGenerate(preview?: PlanningPreview | null) {
  return Boolean(preview && !previewLockReason(preview));
}

function previewReadyVacationCount(preview?: PlanningPreview | null) {
  if (!preview) return 0;
  return preview.lines.reduce((sum, line) => {
    if (line.status !== "ready") return sum;
    return sum + Number(line.vacationsToCreate || 0);
  }, 0);
}

function previewCreatableCount(preview?: PlanningPreview | null) {
  if (!preview) return 0;
  if (previewCanGenerate(preview)) return preview.summary.toCreate;
  return previewReadyVacationCount(preview);
}

function previewCanGenerateReadyOnly(preview?: PlanningPreview | null) {
  return Boolean(preview && !previewCanGenerate(preview) && previewReadyVacationCount(preview) > 0);
}

function previewVisibleWarnings(line: PlanningPreviewLine) {
  return (line.warnings ?? []).filter((warning) => {
    if (!line.duplicateVacationIds.length) return true;
    return !normalizeComparable(warning).includes("doublon possible");
  });
}

function normalizeComparable(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanedSiteWarnings(warnings: string[]) {
  return warnings.filter((warning) => !normalizeComparable(warning).includes("site"));
}

function operationLabel(operation?: LineOperation | null) {
  if (operation === "update") return "Modifier";
  if (operation === "cancel") return "Annuler";
  return "Ajouter";
}

function lineControlKey(line: LineForm) {
  if (line.operation !== "add") return "";
  const siteKey = line.siteId || normalizeComparable(line.siteName);
  if (!siteKey || !line.date || !line.startTime || !line.endTime) return "";
  return [
    siteKey,
    line.date,
    line.startTime,
    line.endTime,
    normalizeComparable(line.missionType),
    normalizeComparable(line.requiredQualification),
  ].join("|");
}

function lineControlStatus(line: LineForm, duplicateCount: number): LineControlStatus {
  if (line.operation !== "add") return "manual";
  if (
    !line.siteId ||
    !line.date ||
    !line.startTime ||
    !line.endTime ||
    Number(line.agentCount || 0) < 1 ||
    (line.warnings?.length ?? 0) > 0
  ) {
    return "fix";
  }
  if (duplicateCount > 1) return "duplicate";
  return "ready";
}

function lineControlLabel(status: LineControlStatus) {
  if (status === "ready") return "Pret";
  if (status === "duplicate") return "Doublon";
  if (status === "manual") return "Manuel";
  return "A corriger";
}

function lineControlTone(status: LineControlStatus) {
  if (status === "ready") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "duplicate") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "manual") return "border-blue-200 bg-blue-50 text-blue-800";
  return "border-red-200 bg-red-50 text-red-800";
}

function lineControlCardTone(status: LineControlStatus) {
  if (status === "ready") return "border-emerald-200 bg-gradient-to-br from-white via-white to-emerald-50/70";
  if (status === "duplicate") return "border-amber-200 bg-gradient-to-br from-white via-white to-amber-50/80";
  if (status === "manual") return "border-blue-200 bg-gradient-to-br from-white via-white to-blue-50/70";
  return "border-red-200 bg-gradient-to-br from-white via-white to-red-50/70";
}

function lineControlGuidance(status: LineControlStatus) {
  if (status === "ready") return "Pret pour enregistrement.";
  if (status === "duplicate") return "Ligne similaire detectee dans ce BDC.";
  if (status === "manual") return "Action a traiter avec controle humain.";
  return "Completez les champs signales avant d'enregistrer.";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function orderUpdatedMs(order: ClientOrder) {
  const value = order.updatedAtIso ?? order.createdAtIso ?? "";
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function orderHistoryKey(order: ClientOrder) {
  return [
    normalizeComparable(order.reference || order.title || order.id),
    String(order.version ?? 1),
    order.periodStart ?? "",
    order.periodEnd ?? "",
    order.status ?? "",
  ].join("|");
}

function orderAddVacationCount(order: ClientOrder) {
  const lines = order.lines ?? [];
  if (!lines.length) return Number(order.totalRequestedVacations ?? 0);
  return lines.reduce((sum, line) => {
    if (line.operation !== "add") return sum;
    return sum + Number(line.agentCount || 1);
  }, 0);
}

function orderManualActionCount(order: ClientOrder) {
  return (order.lines ?? []).filter((line) => line.operation !== "add").length;
}

function formToPayload(form: OrderForm) {
  return {
    clientId: form.clientId || null,
    reference: form.reference || null,
    title: form.title || "Bon de commande client",
    channel: form.channel,
    requesterName: form.requesterName || null,
    requesterEmail: form.requesterEmail || null,
    requesterPhone: form.requesterPhone || null,
    periodStart: form.periodStart || null,
    periodEnd: form.periodEnd || null,
    notes: form.notes || null,
    changeReason: form.changeReason || null,
    lines: form.lines.map((line) => ({
      id: line.id,
      operation: line.operation,
      siteId: line.siteId,
      siteName: line.siteName || null,
      date: line.date,
      startTime: line.startTime,
      endTime: line.endTime,
      agentCount: Number(line.agentCount || 1),
      missionType: line.missionType || null,
      requiredQualification: line.requiredQualification || null,
      notes: line.notes || null,
    })),
  };
}

function cleanExtractionWarnings(line: ExtractionLine) {
  const warnings = line.warnings ?? [];
  const clean = warnings
    .filter((warning) => {
      const value = warning.toLowerCase();
      return !(
        value.includes("credits ia") ||
        value.includes("gemini") ||
        value.includes("extraction locale") ||
        value.includes("ia indisponible") ||
        value.includes("site detecte dans le bdc")
      );
    })
    .map((warning) => {
      const value = warning.toLowerCase();
      if (value.includes("site")) return line.siteName ? "Site a choisir" : "Site manquant";
      if (value.includes("horaire")) return "Horaire a confirmer";
      if (value.includes("date")) return "Date a confirmer";
      return warning;
    });

  if (!line.siteId) clean.unshift(line.siteName ? "Site a choisir" : "Site manquant");

  return Array.from(new Set(clean)).slice(0, 3);
}

function extractionLineToForm(line: ExtractionLine): LineForm {
  return {
    id: "ai_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7),
    operation: line.operation ?? "add",
    siteId: line.siteId ?? "",
    siteName: line.siteName ?? "",
    date: line.date || toDateInput(new Date()),
    startTime: line.startTime || "08:00",
    endTime: line.endTime || "18:00",
    agentCount: Number(line.agentCount || 1),
    missionType: line.missionType || "ADS",
    requiredQualification: line.requiredQualification || "",
    notes: line.notes || "",
    warnings: cleanExtractionWarnings(line),
  };
}

function orderToForm(order: ClientOrder): OrderForm {
  const fallback = initialForm(order.clientId ?? "");
  return {
    clientId: order.clientId ?? "",
    reference: order.reference ?? "",
    title: order.title ?? "Bon de commande client",
    channel: order.channel ?? "email",
    requesterName: order.requesterName ?? "",
    requesterEmail: order.requesterEmail ?? "",
    requesterPhone: order.requesterPhone ?? "",
    periodStart: order.periodStart ?? fallback.periodStart,
    periodEnd: order.periodEnd ?? fallback.periodEnd,
    notes: "",
    changeReason: "Mise a jour client",
    lines: (order.lines && order.lines.length ? order.lines : []).map((line) => ({
      id: line.id || newLine().id,
      operation: line.operation || "add",
      siteId: line.siteId || "",
      siteName: line.siteName || "",
      date: line.date || toDateInput(new Date()),
      startTime: line.startTime || "08:00",
      endTime: line.endTime || "18:00",
      agentCount: Number(line.agentCount || 1),
      missionType: line.missionType || "ADS",
      requiredQualification: line.requiredQualification || "",
      notes: line.notes || "",
      warnings: [],
    })),
  };
}

export default function ClientOrdersPage() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<ClientOrder[]>([]);
  const [clients, setClients] = useState<ClientApi[]>([]);
  const [sites, setSites] = useState<SiteApi[]>([]);
  const [form, setForm] = useState<OrderForm>(() => initialForm());
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [previewOrderId, setPreviewOrderId] = useState<string | null>(null);
  const [planningPreview, setPlanningPreview] = useState<PlanningPreview | null>(null);
  const [sourceText, setSourceText] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [creatingSiteLineId, setCreatingSiteLineId] = useState<string | null>(null);
  const [lastExtraction, setLastExtraction] = useState<ClientOrderExtraction | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === form.clientId) ?? null,
    [clients, form.clientId]
  );

  const availableSites = useMemo(() => {
    if (!form.clientId) return [];
    const linked = sites.filter((site) => site.clientId === form.clientId);
    return linked.length ? linked : sites;
  }, [form.clientId, sites]);

  const loadReferenceData = useCallback(async () => {
    const clientsRes = await apiFetch<ClientsResponse>("/api/clients?limit=200&status=all");
    setClients(clientsRes.items ?? []);

    try {
      const sitesRes = await apiFetch<SitesResponse>("/api/sites?max=300&isActive=true");
      setSites(sitesRes.sites ?? sitesRes.items ?? []);
    } catch {
      // Les clients doivent rester selectionnables meme si les sites sont temporairement indisponibles.
      setSites([]);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    if (!form.clientId) {
      setOrders([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("max", "250");
      params.set("clientId", form.clientId);

      const res = await apiFetch<OrdersResponse>("/api/client-orders?" + params.toString());
      setOrders(res.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [form.clientId]);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    loadReferenceData()
      .catch((error) => {
        if (!alive) return;
        toast({
          title: "Chargement clients impossible",
          description: error instanceof Error ? error.message : "Verifiez votre session puis reessayez.",
          variant: "destructive",
        });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [loadReferenceData, toast]);

  useEffect(() => {
    setPage(1);
    void loadOrders().catch((error) => {
      toast({
        title: "Commandes indisponibles",
        description: error instanceof Error ? error.message : "Impossible de charger les BDC du client.",
        variant: "destructive",
      });
    });
  }, [loadOrders, toast]);

  const visibleOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((order) => {
      if (statusFilter !== "all" && order.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        order.reference,
        order.title,
        order.clientName,
        order.periodStart,
        order.periodEnd,
        ...(order.lines ?? []).map((line) => line.siteName || line.notes || ""),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [orders, query, statusFilter]);

  const historyGroups = useMemo(() => {
    const groups = new Map<string, { order: ClientOrder; count: number }>();

    visibleOrders.forEach((order) => {
      const key = orderHistoryKey(order);
      const current = groups.get(key);
      if (!current) {
        groups.set(key, { order, count: 1 });
        return;
      }

      groups.set(key, {
        order: orderUpdatedMs(order) > orderUpdatedMs(current.order) ? order : current.order,
        count: current.count + 1,
      });
    });

    return Array.from(groups.values()).sort((a, b) => orderUpdatedMs(b.order) - orderUpdatedMs(a.order));
  }, [visibleOrders]);

  const displayOrders = historyGroups.map((group) => group.order);
  const orderDuplicateCounts = useMemo(
    () => new Map(historyGroups.map((group) => [group.order.id, group.count] as const)),
    [historyGroups]
  );
  const hiddenDuplicateCount = historyGroups.reduce((sum, group) => sum + Math.max(0, group.count - 1), 0);
  const totalPages = Math.max(1, Math.ceil(displayOrders.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedOrders = displayOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const kpis = useMemo(() => {
    return {
      total: orders.length,
      toQualify: orders.filter((order) => order.status === "received" || order.status === "qualified").length,
      generated: orders.filter((order) => order.status === "planning_generated" || order.status === "partially_generated").length,
      vacations: orders.reduce((sum, order) => sum + Number(order.totalRequestedVacations ?? 0), 0),
    };
  }, [orders]);

  const lineDuplicateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    form.lines.forEach((line) => {
      const key = lineControlKey(line);
      if (!key) return;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  }, [form.lines]);

  const lineControlCounts = useMemo(() => {
    return form.lines.reduce(
      (acc, line) => {
        const status = lineControlStatus(line, lineDuplicateCounts.get(lineControlKey(line)) ?? 0);
        acc[status] += 1;
        return acc;
      },
      { ready: 0, fix: 0, duplicate: 0, manual: 0 } as Record<LineControlStatus, number>
    );
  }, [form.lines, lineDuplicateCounts]);

  function selectClient(clientId: string) {
    const nextClientId = clientId === "__none" ? "" : clientId;
    setEditingOrderId(null);
    setLastExtraction(null);
    setSourceText("");
    setSourceFile(null);
    setOrders([]);
    setPreviewOrderId(null);
    setPlanningPreview(null);
    setForm(initialForm(nextClientId));
  }

  function updateLine(id: string, patch: Partial<LineForm>) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    }));
  }

  function removeLine(id: string) {
    setForm((current) => ({
      ...current,
      lines: current.lines.filter((line) => line.id !== id),
    }));
  }

  function resetDraft() {
    setEditingOrderId(null);
    setLastExtraction(null);
    setSourceText("");
    setSourceFile(null);
    setPreviewOrderId(null);
    setPlanningPreview(null);
    setForm(initialForm(form.clientId));
  }

  async function refreshAll() {
    setLoading(true);
    try {
      await loadReferenceData();
      await loadOrders();
    } catch (error) {
      toast({
        title: "Rafraichissement impossible",
        description: error instanceof Error ? error.message : "Une erreur est survenue.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  function applyExtractionToForm(extraction: ClientOrderExtraction) {
    const extractedLines = extraction.lines?.length
      ? extraction.lines.map((line) => extractionLineToForm(line))
      : [];

    setForm((current) => ({
      ...current,
      clientId: extraction.clientId ?? current.clientId,
      reference: extraction.reference ?? current.reference,
      title: extraction.title ?? current.title,
      channel: extraction.channel ?? current.channel,
      requesterName: extraction.requesterName ?? current.requesterName,
      requesterEmail: extraction.requesterEmail ?? current.requesterEmail,
      requesterPhone: extraction.requesterPhone ?? current.requesterPhone,
      periodStart: extraction.periodStart ?? current.periodStart,
      periodEnd: extraction.periodEnd ?? current.periodEnd,
      changeReason: editingOrderId ? "Mise a jour client extraite par IA" : current.changeReason,
      notes: extraction.summary ? "IA: " + extraction.summary : current.notes,
      lines: extractedLines.length ? extractedLines : current.lines,
    }));
  }

  async function extractOrder() {
    if (!form.clientId) {
      toast({
        title: "Client obligatoire",
        description: "Selectionnez d'abord le client concerne par le bon de commande.",
        variant: "destructive",
      });
      return;
    }

    if (!sourceText.trim() && !sourceFile) {
      toast({
        title: "Aucun document",
        description: "Ajoutez un PDF, une image, un email ou collez le texte du bon de commande.",
        variant: "destructive",
      });
      return;
    }

    setExtracting(true);
    try {
      const body = new FormData();
      body.append("channel", form.channel);
      body.append("clientId", form.clientId);
      if (sourceText.trim()) body.append("sourceText", sourceText.trim());
      if (sourceFile) body.append("file", sourceFile);

      const response = await apiFetch<ExtractionResponse>("/api/client-orders/extract", {
        method: "POST",
        body,
      });

      setLastExtraction(response.extraction);
      applyExtractionToForm(response.extraction);

      const lineCount = response.extraction.lines?.length ?? 0;
      toast({
        title: response.degraded ? "BDC analyse en mode degrade" : "BDC analyse par IA",
        description: String(lineCount) + " ligne(s) pre-remplie(s). Controlez avant enregistrement.",
      });
    } catch (error) {
      toast({
        title: "Extraction impossible",
        description: error instanceof Error ? error.message : "Verifiez le document ou la configuration IA.",
        variant: "destructive",
      });
    } finally {
      setExtracting(false);
    }
  }

  async function createDetectedSiteForLine(line: LineForm) {
    const detectedName = line.siteName.trim();

    if (!form.clientId || !selectedClient) {
      toast({
        title: "Client obligatoire",
        description: "Selectionnez le client avant de creer un site depuis le BDC.",
        variant: "destructive",
      });
      return;
    }

    if (!detectedName) {
      toast({
        title: "Site illisible",
        description: "Le BDC ne contient pas de nom de site exploitable pour cette ligne.",
        variant: "destructive",
      });
      return;
    }

    const sameName = normalizeComparable(detectedName);
    const existing = availableSites.find((site) => normalizeComparable(site.name) === sameName);

    if (existing) {
      const updatedCount = form.lines.filter((item) => {
        return !item.siteId && normalizeComparable(item.siteName) === sameName;
      }).length;

      setForm((current) => ({
        ...current,
        lines: current.lines.map((item) =>
          !item.siteId && normalizeComparable(item.siteName) === sameName
            ? {
                ...item,
                siteId: existing.id,
                siteName: existing.name ?? detectedName,
                warnings: cleanedSiteWarnings(item.warnings ?? []),
              }
            : item
        ),
      }));

      toast({
        title: "Site deja existant",
        description: String(updatedCount || 1) + " ligne(s) rattachee(s) a " + (existing.name ?? detectedName) + ".",
      });
      return;
    }

    setCreatingSiteLineId(line.id);
    try {
      const response = await apiFetch<SiteResponse>("/api/sites", {
        method: "POST",
        body: {
          name: detectedName,
          clientId: form.clientId,
          clientName: clientLabel(selectedClient),
          siteType: "autre",
          riskLevel: 3,
          isActive: true,
          instructions: "Site cree depuis un bon de commande client. Completer adresse, consignes et contacts avant exploitation terrain.",
        },
      });

      const created = response.site;
      setSites((current) => {
        if (current.some((site) => site.id === created.id)) return current;
        return [created, ...current];
      });

      const updatedCount = form.lines.filter((item) => {
        return !item.siteId && normalizeComparable(item.siteName) === sameName;
      }).length;

      setForm((current) => ({
        ...current,
        lines: current.lines.map((item) =>
          !item.siteId && normalizeComparable(item.siteName) === sameName
            ? {
                ...item,
                siteId: created.id,
                siteName: created.name ?? detectedName,
                warnings: cleanedSiteWarnings(item.warnings ?? []),
              }
            : item
        ),
      }));

      toast({
        title: "Site cree pour " + clientLabel(selectedClient),
        description: String(updatedCount || 1) + " ligne(s) BDC rattachee(s) a " + (created.name ?? detectedName) + ".",
      });
    } catch (error) {
      toast({
        title: "Creation du site impossible",
        description: error instanceof Error ? error.message : "Verifiez le quota sites ou les droits utilisateur.",
        variant: "destructive",
      });
    } finally {
      setCreatingSiteLineId(null);
    }
  }

  async function submitOrder() {
    if (!form.clientId) {
      toast({
        title: "Client obligatoire",
        description: "Selectionnez le client avant d'enregistrer un BDC.",
        variant: "destructive",
      });
      return;
    }

    if (form.lines.length === 0) {
      toast({
        title: "Aucune ligne a enregistrer",
        description: "Analysez un BDC ou ajoutez une ligne exceptionnelle avant d'enregistrer.",
        variant: "destructive",
      });
      return;
    }

    if (form.lines.some((line) => !line.siteId)) {
      toast({
        title: "Site manquant",
        description: "Chaque ligne conservee doit etre rattachee a un site.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      if (editingOrderId) {
        await apiFetch<OrderResponse>("/api/client-orders/" + editingOrderId, {
          method: "PATCH",
          body: {
            action: "update_version",
            ...formToPayload(form),
          },
        });
        toast({
          title: "Nouvelle version enregistree",
          description: "Le BDC modifie est trace et pret a generer les brouillons.",
        });
      } else {
        await apiFetch<OrderResponse>("/api/client-orders", {
          method: "POST",
          body: formToPayload(form),
        });
        toast({
          title: "Bon de commande enregistre",
          description: "Il apparait maintenant dans l'historique du client.",
        });
      }

      resetDraft();
      await loadOrders();
    } catch (error) {
      toast({
        title: "Enregistrement impossible",
        description: error instanceof Error ? error.message : "Verifiez les lignes puis reessayez.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function previewOrderPlanning(order: ClientOrder) {
    setActionId(order.id + ":preview_planning");
    setPreviewOrderId(order.id);
    setPlanningPreview(null);

    try {
      const res = await apiFetch<PlanningPreviewResponse>("/api/client-orders/" + order.id, {
        method: "PATCH",
        body: { action: "preview_planning" },
      });

      setOrders((current) => current.map((item) => (item.id === order.id ? res.item : item)));
      setPlanningPreview(res.preview);

      toast({
        title: "Apercu planning pret",
        description:
          String(previewCreatableCount(res.preview)) +
          " vacation(s) creable(s) maintenant, " +
          String(res.preview.summary.duplicateLines) +
          " alerte(s) doublon.",
      });
    } catch (error) {
      setPreviewOrderId(null);
      setPlanningPreview(null);
      toast({
        title: "Apercu impossible",
        description: error instanceof Error ? error.message : "Impossible de previsualiser la generation.",
        variant: "destructive",
      });
    } finally {
      setActionId(null);
    }
  }

  async function patchOrder(order: ClientOrder, action: string, extra?: Record<string, unknown>) {
    setActionId(order.id + ":" + action);
    try {
      const res = await apiFetch<OrderResponse>("/api/client-orders/" + order.id, {
        method: "PATCH",
        body: { action, ...(extra ?? {}) },
      });

      setOrders((current) => current.map((item) => (item.id === order.id ? res.item : item)));

      if (action === "validate") {
        toast({ title: "BDC valide", description: "La demande est prete pour generation planning." });
      } else if (action === "generate_planning" || action === "generate_ready_planning") {
        const count = res.item.generatedVacationIds?.length ?? 0;
        setPreviewOrderId(null);
        setPlanningPreview(null);
        toast({
          title: action === "generate_ready_planning" ? "Lignes pretes generees" : "Planning brouillon genere",
          description: String(count) + " vacation(s) creee(s), sans diffusion automatique.",
        });
      } else if (action === "cancel") {
        setPreviewOrderId(null);
        setPlanningPreview(null);
        toast({ title: "BDC annule", description: "La trace reste disponible dans le registre." });
      }
    } catch (error) {
      toast({
        title: "Action impossible",
        description: error instanceof Error ? error.message : "Reessayez dans quelques instants.",
        variant: "destructive",
      });
    } finally {
      setActionId(null);
    }
  }

  function startVersion(order: ClientOrder) {
    setEditingOrderId(order.id);
    setLastExtraction(null);
    setSourceText("");
    setSourceFile(null);
    setPreviewOrderId(null);
    setPlanningPreview(null);
    setForm(orderToForm(order));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const canSave = Boolean(form.clientId && form.lines.length > 0 && !saving);

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 p-4 md:p-6">
      <section className="overflow-hidden rounded-[2rem] border bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white shadow-xl">
        <div className="grid gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr] lg:p-8">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                <ClipboardList className="h-6 w-6 text-blue-200" />
              </span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-blue-200">
                  Commandes clients
                </p>
                <h1 className="text-2xl font-black tracking-tight md:text-4xl">
                  Un client, un BDC, un planning brouillon
                </h1>
              </div>
            </div>
            <p className="max-w-3xl text-sm leading-6 text-slate-200 md:text-base">
              Selectionnez le client, chargez le bon de commande initial ou modifie, controlez les lignes extraites,
              puis genereez des vacations brouillon sans jamais publier automatiquement.
            </p>
          </div>

          <Card className="border-white/10 bg-white/10 text-white shadow-none backdrop-blur">
            <CardContent className="grid grid-cols-2 gap-3 p-5">
              <HeroMetric label="BDC client" value={kpis.total} tone="blue" />
              <HeroMetric label="A traiter" value={kpis.toQualify} tone="amber" />
              <HeroMetric label="Generes" value={kpis.generated} tone="violet" />
              <HeroMetric label="Vacations" value={kpis.vacations} tone="emerald" />
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.45fr]">
        <div className="space-y-5">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">
                    1. Client concerne
                  </p>
                  <h2 className="text-xl font-black text-slate-950">Choisir le client avant toute analyse</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    La liste des BDC, les sites et les lignes extraites sont rattaches a ce client.
                  </p>
                </div>
              </div>

              <Select value={form.clientId || "__none"} onValueChange={selectClient}>
                <SelectTrigger className="h-12 rounded-2xl border-slate-200 bg-slate-50 text-base font-bold">
                  <SelectValue placeholder="Selectionner un client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none" disabled>
                    {clients.length ? "Selectionner un client" : "Aucun client charge"}
                  </SelectItem>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {clientLabel(client)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedClient ? (
                <div className="rounded-3xl border border-blue-100 bg-blue-50/70 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
                    Client actif
                  </p>
                  <p className="mt-1 text-lg font-black text-slate-950">{clientLabel(selectedClient)}</p>
                  <p className="text-sm text-slate-500">
                    {availableSites.length} site(s) disponible(s) pour ce client.
                  </p>
                </div>
              ) : (
                <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  {clients.length
                    ? "Selectionnez un client pour activer l'import BDC et afficher son historique."
                    : "Aucun client disponible pour l'instant. Creez ou activez un client, puis rafraichissez."}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-blue-100 bg-gradient-to-br from-blue-50 via-white to-emerald-50 shadow-sm">
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
                    <Sparkles className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">
                      2. Import IA
                    </p>
                    <h3 className="font-black text-slate-950">
                      {editingOrderId ? "Analyser une mise a jour BDC" : "Analyser un bon de commande initial"}
                    </h3>
                    <p className="mt-1 text-sm leading-5 text-slate-600">
                      Deposez le PDF ou collez le mail. L'IA extrait les prestations, Sentrys ne publie rien sans validation.
                    </p>
                  </div>
                </div>
                {editingOrderId ? (
                  <Button type="button" variant="outline" onClick={resetDraft}>
                    Quitter la version
                  </Button>
                ) : null}
              </div>

              <div className="grid gap-3 md:grid-cols-[0.8fr_1.2fr]">
                <Field label="Fichier BDC">
                  <label
                    htmlFor="client-order-file"
                    className={cn(
                      "group flex min-h-[96px] cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-blue-200 bg-white/85 p-4 text-center transition hover:border-blue-400 hover:bg-blue-50",
                      !form.clientId && "cursor-not-allowed opacity-60 hover:border-blue-200 hover:bg-white/85"
                    )}
                  >
                    <input
                      id="client-order-file"
                      type="file"
                      disabled={!form.clientId}
                      className="sr-only"
                      accept=".pdf,.txt,.eml,.msg,image/*,application/pdf,text/plain,message/rfc822"
                      onChange={(event) => setSourceFile(event.target.files?.[0] ?? null)}
                    />
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm transition group-hover:scale-105">
                      <UploadCloud className="h-5 w-5" />
                    </span>
                    <span className="mt-3 text-sm font-black text-slate-950">
                      {sourceFile ? sourceFile.name : "Choisir ou deposer le BDC"}
                    </span>
                    <span className="mt-1 text-xs font-semibold text-slate-500">
                      PDF, image, email ou texte. Client requis avant import.
                    </span>
                  </label>
                </Field>
                <Field label="Mail ou texte copie">
                  <Textarea
                    value={sourceText}
                    disabled={!form.clientId}
                    onChange={(event) => setSourceText(event.target.value)}
                    placeholder="Collez ici le mail client ou le texte du BDC..."
                    className="min-h-[96px]"
                  />
                </Field>
              </div>

              <div className="flex flex-col gap-3 rounded-3xl border bg-white/80 p-4 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={form.channel} onValueChange={(value) => setForm((current) => ({ ...current, channel: value as OrderChannel }))}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNELS.map((channel) => (
                        <SelectItem key={channel.value} value={channel.value}>
                          {channel.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {sourceFile ? (
                    <Badge variant="outline" className="bg-white">
                      <Paperclip className="mr-1.5 h-3.5 w-3.5" />
                      {sourceFile.name}
                    </Badge>
                  ) : null}
                </div>
                <Button type="button" onClick={extractOrder} disabled={!form.clientId || extracting}>
                  {extracting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                  Analyser le BDC
                </Button>
              </div>

              {lastExtraction ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3 text-sm text-emerald-950">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="border-emerald-300 bg-white text-emerald-800">
                      Confiance {Math.round(Number(lastExtraction.confidence ?? 0) * 100)}%
                    </Badge>
                    <span className="font-semibold">
                      {lastExtraction.lines?.length ?? 0} ligne(s) detectee(s)
                    </span>
                  </div>
                  {lastExtraction.summary ? <p className="mt-2">{lastExtraction.summary}</p> : null}
                  {lastExtraction.missingFields?.length ? (
                    <p className="mt-2 text-amber-700">
                      A completer : {lastExtraction.missingFields.join(", ")}
                    </p>
                  ) : null}
                  {lastExtraction.warnings?.length ? (
                    <p className="mt-2 text-amber-700">
                      Vigilance : {lastExtraction.warnings.join(" ; ")}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">
                    3. Controle exploitation
                  </p>
                  <h2 className="text-xl font-black text-slate-950">Lignes extraites a valider</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Ici on corrige seulement l'essentiel : site, date, horaires, agent(s), mission.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setForm((current) => ({ ...current, lines: [...current.lines, newLine()] }))}
                  disabled={!form.clientId}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Ligne exceptionnelle
                </Button>
              </div>

              {form.lines.length === 0 ? (
                <div className="rounded-3xl border border-dashed bg-slate-50 p-8 text-center">
                  <ClipboardList className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-3 font-black text-slate-950">Aucune ligne a controler</p>
                  <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                    Analysez un BDC pour remplir automatiquement cette zone. La saisie manuelle reste possible en secours.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <LineControlMetric label="Pret" value={lineControlCounts.ready} tone="emerald" />
                    <LineControlMetric label="A corriger" value={lineControlCounts.fix} tone="red" />
                    <LineControlMetric label="Doublon" value={lineControlCounts.duplicate} tone="amber" />
                    <LineControlMetric label="Manuel" value={lineControlCounts.manual} tone="blue" />
                  </div>

                  <div className="space-y-3">
                    {form.lines.map((line, index) => {
                      const duplicateCount = lineDuplicateCounts.get(lineControlKey(line)) ?? 0;
                      const controlStatus = lineControlStatus(line, duplicateCount);
                      return (
                        <div
                          key={line.id}
                          className={cn(
                            "overflow-hidden rounded-[1.75rem] border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
                            lineControlCardTone(controlStatus)
                          )}
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge className={cn("border", lineControlTone(controlStatus))}>
                                  {lineControlLabel(controlStatus)}
                                </Badge>
                                <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                                  Ligne {index + 1}
                                </span>
                                <span className="text-xs font-semibold text-slate-500">
                                  {lineControlGuidance(controlStatus)}
                                </span>
                              </div>
                              <h3 className="mt-2 truncate text-lg font-black text-slate-950">
                                {line.siteName || "Site a confirmer"}
                              </h3>
                              <p className="mt-1 text-sm font-semibold text-slate-500">
                                {line.date ? formatDate(line.date) : "Date a confirmer"} · {line.startTime || "--:--"} - {line.endTime || "--:--"} · {line.agentCount || 1} agent(s)
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <Select value={line.operation} onValueChange={(value) => updateLine(line.id, { operation: value as LineOperation })}>
                                <SelectTrigger className="h-10 w-[135px] rounded-2xl bg-white/85">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="add">Ajouter</SelectItem>
                                  <SelectItem value="update">Modifier</SelectItem>
                                  <SelectItem value="cancel">Annuler</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(line.id)} className="rounded-2xl bg-white/70">
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_0.9fr_1fr]">
                            <div className="space-y-3 rounded-3xl border bg-white/80 p-3">
                              <Field label="Site operationnel">
                                <Select
                                  value={line.siteId || "__site"}
                                  onValueChange={(value) => {
                                    const selectedSite = availableSites.find((site) => site.id === value);
                                    updateLine(line.id, {
                                      siteId: value === "__site" ? "" : value,
                                      siteName: selectedSite?.name ?? line.siteName,
                                      warnings: value === "__site" ? line.warnings : cleanedSiteWarnings(line.warnings ?? []),
                                    });
                                  }}
                                >
                                  <SelectTrigger className="h-11 rounded-2xl">
                                    <SelectValue placeholder="Site" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__site" disabled>
                                      Site a choisir
                                    </SelectItem>
                                    {availableSites.map((site) => (
                                      <SelectItem key={site.id} value={site.id}>
                                        {(site.name ?? site.id) + (site.city ? " - " + site.city : "")}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </Field>

                              {!line.siteId && line.siteName ? (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2">
                                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">
                                    Lu dans le BDC
                                  </p>
                                  <p className="mt-0.5 text-sm font-black text-amber-950">{line.siteName}</p>
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() => createDetectedSiteForLine(line)}
                                      disabled={!form.clientId || creatingSiteLineId === line.id}
                                      className="h-8 rounded-xl border-amber-300 bg-white px-3 text-[11px] font-black text-amber-900 hover:bg-amber-100"
                                    >
                                      {creatingSiteLineId === line.id ? (
                                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                                      )}
                                      Creer ce site
                                    </Button>
                                    <span className="text-xs font-semibold text-amber-800">
                                      ou selectionnez un site existant.
                                    </span>
                                  </div>
                                </div>
                              ) : null}
                            </div>

                            <div className="grid gap-3 rounded-3xl border bg-white/80 p-3 sm:grid-cols-2 lg:grid-cols-1">
                              <Field label="Date">
                                <Input type="date" value={line.date} onChange={(event) => updateLine(line.id, { date: event.target.value })} className="h-11 rounded-2xl" />
                              </Field>
                              <Field label="Agents">
                                <Input
                                  className="h-11 rounded-2xl"
                                  type="number"
                                  min={1}
                                  max={25}
                                  value={line.agentCount}
                                  onChange={(event) => updateLine(line.id, { agentCount: Number(event.target.value || 1) })}
                                />
                              </Field>
                            </div>

                            <div className="space-y-3 rounded-3xl border bg-white/80 p-3">
                              <Field label="Horaires">
                                <div className="grid grid-cols-2 gap-2">
                                  <Input type="time" step={1800} value={line.startTime} onChange={(event) => updateLine(line.id, { startTime: event.target.value })} className="h-11 rounded-2xl" />
                                  <Input type="time" step={1800} value={line.endTime} onChange={(event) => updateLine(line.id, { endTime: event.target.value })} className="h-11 rounded-2xl" />
                                </div>
                              </Field>
                              <Field label="Mission">
                                <Select value={line.missionType || "ADS"} onValueChange={(value) => updateLine(line.id, { missionType: value, requiredQualification: value })}>
                                  <SelectTrigger className="h-11 rounded-2xl">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {MISSION_TYPES.map((mission) => (
                                      <SelectItem key={mission} value={mission}>
                                        {mission}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </Field>
                            </div>
                          </div>

                          {(line.notes || (line.warnings?.length ?? 0) || duplicateCount > 1) ? (
                            <div className="mt-3 flex flex-col gap-2 rounded-3xl border bg-white/75 p-3">
                              {line.notes ? (
                                <p className="text-xs leading-5 text-slate-600">
                                  <span className="font-black text-slate-800">Consigne client : </span>
                                  {line.notes}
                                </p>
                              ) : null}
                              <div className="flex flex-wrap gap-1.5">
                                {duplicateCount > 1 ? (
                                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] font-black text-amber-800">
                                    Ligne similaire x{duplicateCount}
                                  </Badge>
                                ) : null}
                                {(line.warnings ?? []).map((warning) => (
                                  <Badge key={warning} variant="outline" className="border-red-200 bg-red-50 text-[10px] font-black text-red-800">
                                    {warning}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3 rounded-3xl border border-blue-100 bg-blue-50/80 p-4 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-blue-950">
                  <p className="font-black">
                    {editingOrderId ? "Enregistrer une nouvelle version du BDC" : "Enregistrer le BDC initial"}
                  </p>
                  <p>
                    Reference : {form.reference || "automatique / a confirmer"} - Periode : {form.periodStart || "-"} au {form.periodEnd || "-"}
                  </p>
                </div>
                <Button onClick={submitOrder} disabled={!canSave}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  {editingOrderId ? "Enregistrer version" : "Enregistrer BDC"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">
                  Historique client
                </p>
                <h2 className="text-xl font-black text-slate-950">
                  {selectedClient ? "Tous les BDC - " + clientLabel(selectedClient) : "Selectionnez un client"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Liste paginee des bons de commande, versions et actions de generation planning.
                </p>
              </div>
              <Button variant="outline" onClick={refreshAll} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Actualiser
              </Button>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_190px_130px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  className="pl-9"
                  placeholder="Rechercher reference, site, periode..."
                  disabled={!form.clientId}
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value as "all" | OrderStatus);
                  setPage(1);
                }}
                disabled={!form.clientId}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(pageSize)} onValueChange={(value) => { setPageSize(Number(value)); setPage(1); }} disabled={!form.clientId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size} / page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="overflow-hidden rounded-3xl border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead>Date / Reference</TableHead>
                    <TableHead>Periode</TableHead>
                    <TableHead>Prestations</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!form.clientId ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-40 text-center text-slate-500">
                        Selectionnez un client pour afficher ses bons de commande.
                      </TableCell>
                    </TableRow>
                  ) : loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-40 text-center text-slate-500">
                        <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
                        Chargement des BDC client...
                      </TableCell>
                    </TableRow>
                  ) : pagedOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-40 text-center">
                        <ClipboardList className="mx-auto h-8 w-8 text-slate-300" />
                        <p className="mt-3 font-black text-slate-950">Aucun BDC trouve</p>
                        <p className="text-sm text-slate-500">Chargez le premier BDC de ce client pour commencer.</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedOrders.map((order) => {
                      const generatedCount = order.generatedVacationIds?.length ?? 0;
                      const creationCount = orderAddVacationCount(order);
                      const manualCount = orderManualActionCount(order);
                      const duplicateGroupCount = orderDuplicateCounts.get(order.id) ?? 1;
                      const generateBusy = actionId === order.id + ":generate_planning";
                      const readyGenerateBusy = actionId === order.id + ":generate_ready_planning";
                      const previewBusy = actionId === order.id + ":preview_planning";
                      const validateBusy = actionId === order.id + ":validate";
                      const cancelBusy = actionId === order.id + ":cancel";
                      const isPreviewOpen = previewOrderId === order.id;
                      return (
                        <Fragment key={order.id}>
                        <TableRow className="align-top">
                          <TableCell>
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-black text-slate-950">
                                  {order.reference || order.title || "BDC sans reference"}
                                </span>
                                <Badge variant="outline">v{order.version ?? 1}</Badge>
                                {duplicateGroupCount > 1 ? (
                                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                                    {duplicateGroupCount} copies regroupees
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="text-xs text-slate-500">
                                Maj {formatDate(order.updatedAtIso ?? order.createdAtIso)}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm font-semibold text-slate-900">
                              {order.periodStart ?? "-"} au {order.periodEnd ?? "-"}
                            </p>
                            <p className="text-xs text-slate-500">{order.channel ?? "email"}</p>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm font-black text-slate-950">
                              {creationCount} creation(s)
                            </p>
                            <p className="text-xs text-slate-500">
                              {order.lineCount ?? 0} ligne(s), {manualCount} action(s) manuelle(s), {generatedCount} brouillon(s)
                            </p>
                          </TableCell>
                          <TableCell>
                            <Badge className={cn("border", statusTone(order.status))}>
                              {statusLabel(order.status)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => startVersion(order)}>
                                Nouvelle version
                              </Button>
                              {order.status !== "validated" && order.status !== "partially_generated" && order.status !== "planning_generated" && order.status !== "cancelled" ? (
                                <Button variant="outline" size="sm" onClick={() => patchOrder(order, "validate")} disabled={validateBusy}>
                                  {validateBusy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-2 h-3.5 w-3.5" />}
                                  Valider
                                </Button>
                              ) : null}
                              {order.status !== "cancelled" ? (
                                <Button variant="outline" size="sm" onClick={() => previewOrderPlanning(order)} disabled={previewBusy || generateBusy}>
                                  {previewBusy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <ClipboardList className="mr-2 h-3.5 w-3.5" />}
                                  Apercu
                                </Button>
                              ) : null}
                              {isPreviewOpen && order.status !== "cancelled" && planningPreview ? (
                                previewCanGenerate(planningPreview) ? (
                                  <Button size="sm" onClick={() => patchOrder(order, "generate_planning")} disabled={generateBusy}>
                                    {generateBusy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-2 h-3.5 w-3.5" />}
                                    Creer brouillons
                                  </Button>
                                ) : previewCanGenerateReadyOnly(planningPreview) ? (
                                  <Button size="sm" variant="outline" onClick={() => patchOrder(order, "generate_ready_planning")} disabled={readyGenerateBusy}>
                                    {readyGenerateBusy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-2 h-3.5 w-3.5" />}
                                    Lignes pretes
                                  </Button>
                                ) : (
                                  <Badge className="border border-red-200 bg-red-50 px-3 py-2 text-red-800">
                                    Verrouille
                                  </Badge>
                                )
                              ) : null}
                              {generatedCount > 0 ? (
                                <Button variant="ghost" size="sm" asChild>
                                  <Link href="/dashboard/planning">
                                    Planning
                                    <ArrowRight className="ml-2 h-3.5 w-3.5" />
                                  </Link>
                                </Button>
                              ) : null}
                              {order.status !== "cancelled" ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => patchOrder(order, "cancel", { reason: "Annulation depuis le registre commandes" })}
                                  disabled={cancelBusy}
                                >
                                  {cancelBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4 text-red-500" />}
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                        {isPreviewOpen ? (
                          <TableRow className="bg-slate-50/70">
                            <TableCell colSpan={5} className="p-0">
                              <PlanningPreviewPanel
                                preview={planningPreview}
                                loading={previewBusy}
                                generating={generateBusy || readyGenerateBusy}
                                onGenerate={() => patchOrder(order, "generate_planning")}
                                onGenerateReady={() => patchOrder(order, "generate_ready_planning")}
                              />
                            </TableCell>
                          </TableRow>
                        ) : null}
                        </Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-slate-500">
                {displayOrders.length} BDC affiche(s) - page {currentPage}/{totalPages}
                {hiddenDuplicateCount > 0 ? " - " + hiddenDuplicateCount + " doublon(s) regroupe(s)" : ""}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage <= 1}>
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Precedent
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={currentPage >= totalPages}>
                  Suivant
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <InfoCard icon={<CalendarClock className="h-5 w-5" />} title="Date" text="Chaque BDC garde sa periode et sa derniere mise a jour." />
              <InfoCard icon={<ShieldCheck className="h-5 w-5" />} title="Controle" text="Validation humaine avant generation et diffusion." />
              <InfoCard icon={<AlertTriangle className="h-5 w-5" />} title="Trace" text="Versions, annulations et generations restent auditables." />
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function LineControlMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "red" | "amber" | "blue";
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border bg-white p-4 shadow-sm",
        tone === "emerald" && "border-emerald-200",
        tone === "red" && "border-red-200",
        tone === "amber" && "border-amber-200",
        tone === "blue" && "border-blue-200"
      )}
    >
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function PlanningPreviewPanel({
  preview,
  loading,
  generating,
  onGenerate,
  onGenerateReady,
}: {
  preview: PlanningPreview | null;
  loading: boolean;
  generating: boolean;
  onGenerate: () => void;
  onGenerateReady: () => void;
}) {
  const canGenerate = previewCanGenerate(preview);
  const canGenerateReadyOnly = previewCanGenerateReadyOnly(preview);
  const lockReason = previewLockReason(preview);
  const creatableCount = previewCreatableCount(preview);

  return (
    <div className="space-y-4 border-t border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50/60 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">
            Previsualisation planning
          </p>
          <h3 className="text-lg font-black text-slate-950">
            Ce que Sentrys va creer avant toute action irreversible
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Les vacations restent en brouillon. Les doublons, lignes bloquees et actions manuelles sont signales avant generation.
          </p>
        </div>
        <Button
          onClick={canGenerate ? onGenerate : onGenerateReady}
          disabled={(!canGenerate && !canGenerateReadyOnly) || generating}
          variant={canGenerate ? "default" : "outline"}
        >
          {generating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : canGenerate || canGenerateReadyOnly ? (
            <Wand2 className="mr-2 h-4 w-4" />
          ) : (
            <XCircle className="mr-2 h-4 w-4" />
          )}
          {canGenerate ? "Creer les brouillons" : canGenerateReadyOnly ? "Creer lignes pretes" : "Generation verrouillee"}
        </Button>
      </div>

      {loading && !preview ? (
        <div className="rounded-3xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">
          <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
          Analyse des doublons et des lignes exploitables...
        </div>
      ) : null}

      {preview ? (
        <>
          <div className="grid gap-3 md:grid-cols-3 2xl:grid-cols-6">
            <PreviewMetric label="Demandees" value={preview.summary.toCreate} tone="slate" />
            <PreviewMetric label="Creables" value={creatableCount} tone={canGenerate ? "emerald" : "red"} />
            <PreviewMetric label="Doublons" value={preview.summary.duplicateLines} tone="amber" />
            <PreviewMetric label="Bloquees" value={preview.summary.blocked} tone="red" />
            <PreviewMetric label="Manuelles" value={preview.summary.manual} tone="blue" />
            <PreviewMetric label="Deja faites" value={preview.summary.alreadyGenerated} tone="slate" />
          </div>

          {lockReason ? (
            <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-900">
              {lockReason} {canGenerateReadyOnly ? "Vous pouvez toutefois creer uniquement les lignes pretes." : "Traitez les doublons dans le planning ou creez une nouvelle version corrigee du BDC."}
            </div>
          ) : preview.globalWarnings.length ? (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
              {preview.globalWarnings.join(" ")}
            </div>
          ) : (
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
              Aucun blocage detecte. Controlez les lignes puis creez les brouillons.
            </div>
          )}

          <div className="grid gap-3 xl:grid-cols-2">
            {preview.lines.map((line) => {
              const visibleWarnings = previewVisibleWarnings(line);
              return (
              <div
                key={line.lineId}
                className={cn("rounded-[1.75rem] border p-4 shadow-sm", previewCardTone(line.status))}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={cn("border", previewStatusTone(line.status))}>
                        {previewStatusLabel(line.status)}
                      </Badge>
                      <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                        {operationLabel(line.operation)}
                      </span>
                    </div>
                    <h4 className="mt-2 truncate text-base font-black text-slate-950">
                      {line.siteName || line.siteId || "Site inconnu"}
                    </h4>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      {formatDate(line.date)} · {line.startTime} - {line.endTime}
                    </p>
                  </div>
                  <div className="rounded-2xl border bg-white/80 px-3 py-2 text-right">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Agents</p>
                    <p className="text-xl font-black text-slate-950">
                      {line.operation === "add" ? line.vacationsToCreate : line.agentCount}
                    </p>
                  </div>
                </div>

                <div className="mt-3 rounded-2xl border bg-white/75 p-3">
                  {line.duplicateVacationIds.length ? (
                    <p className="text-xs font-black text-amber-800">
                      {line.duplicateVacationIds.length} vacation(s) deja existante(s) sur ce site et ce creneau.
                    </p>
                  ) : null}
                  {line.blockers.length ? (
                    <p className="text-xs font-semibold text-red-700">{line.blockers.join(" ; ")}</p>
                  ) : null}
                  {visibleWarnings.length ? (
                    <p className="text-xs font-semibold text-amber-700">{visibleWarnings.join(" ; ")}</p>
                  ) : null}
                  {!line.blockers.length && !visibleWarnings.length && !line.duplicateVacationIds.length ? (
                    <p className="text-xs font-semibold text-emerald-700">Creation brouillon possible.</p>
                  ) : null}
                </div>
              </div>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

function PreviewMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "amber" | "red" | "blue" | "slate";
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border bg-white p-4",
        tone === "emerald" && "border-emerald-200",
        tone === "amber" && "border-amber-200",
        tone === "red" && "border-red-200",
        tone === "blue" && "border-blue-200",
        tone === "slate" && "border-slate-200"
      )}
    >
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Label className="space-y-2">
      <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
        {label}
      </span>
      {children}
    </Label>
  );
}

function HeroMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "emerald" | "violet" | "blue";
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border bg-white/10 p-4",
        tone === "amber" && "border-amber-300/30",
        tone === "emerald" && "border-emerald-300/30",
        tone === "violet" && "border-violet-300/30",
        tone === "blue" && "border-blue-300/30"
      )}
    >
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">
        {label}
      </p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

function InfoCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-3xl border bg-slate-50 p-4">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm">
        {icon}
      </span>
      <p className="mt-3 font-black text-slate-950">{title}</p>
      <p className="mt-1 text-sm leading-5 text-slate-500">{text}</p>
    </div>
  );
}
