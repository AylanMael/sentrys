"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-provider";
import { apiFetch } from "@/lib/api/client-fetch";
import { useFeedbackToast } from "@/hooks/use-app-feedback";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { buildConflictIndex, ConflictIndex } from "@/lib/planning/conflicts";
import { computePlanningStats, PlanningStats, VacationEvent } from "@/lib/planning/stats";
import { type AgentDocumentItem } from "@/lib/agents/profile";
import { cn } from "@/lib/utils";

// --- Types ---
export type PlanningMode = "site" | "agent";
export type PublicationFilter = "all" | "draft" | "published" | "modifiéd";
export type VacationPublicationStatus = Exclude<PublicationFilter, "all">;

export interface VacationApiItem {
  id: string;
  tenantId: string;
  siteId: string | null;
  siteName: string | null;
  title: string | null;
  missionType?: string | null;
  status: "planned" | "partially_filled" | "filled" | "closed" | "cancelled";
  requiredAgents: number;
  assignedAgentIds: string[];
  startAtIso: string | null;
  endAtIso: string | null;
  startAt?: string; // For API payloads
  endAt?: string;   // For API payloads
  updatedAtIso?: string | null;
  publishedAtIso?: string | null;
  notes: string | null;
  requiredQualification: string | null;
  isPublished: boolean;
}

export function getVacationPublicationStatus(
  vacation: Pick<
    VacationApiItem,
    "isPublished" | "publishedAtIso" | "updatedAtIso"
  >
): VacationPublicationStatus {
  if (!vacation.isPublished) return "draft";
  if (!vacation.publishedAtIso || !vacation.updatedAtIso) return "published";

  const publishedAt = new Date(vacation.publishedAtIso).getTime();
  const updatedAt = new Date(vacation.updatedAtIso).getTime();

  if (
    Number.isFinite(publishedAt) &&
    Number.isFinite(updatedAt) &&
    updatedAt > publishedAt + 1000
  ) {
    return "modifiéd";
  }

  return "published";
}

export interface SiteApiItem {
  id: string;
  name: string;
  clientId?: string | null;
  clientName?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
}

export interface AgentApiItem {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string;
  photoUrl?: string | null;
  employeeNumber?: string | null;
  professionalCardNumber?: string | null;
  professionalCardExpiresAt?: string | null;
  qualifications: string[];
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  documents?: AgentDocumentItem[];
  monthlyContractHours?: number | null;
}

export interface CreateVacationResponse {
  ok: boolean;
  id?: string;
  error?: string;
}

export interface PlanningDateRange {
  from: string;
  to: string;
}

export interface ClipItem {
  id: string;
  siteId: string;
  title: string | null;
  siteName: string | null;
  missionType?: string | null;
  requiredAgents: number;
  startAtIso: string;
  endAtIso: string;
  notes: string | null;
  assignedAgentIds: string[];
}

export interface ClipboardData {
  items: ClipItem[];
  baseStartIso: string | null;
}

export interface OpsSummary {
  total: number;
  empty: number;         // 0 assigned, req > 0
  partial: number;       // intermediate
  full: number;          // covered
  missingAgents: number; // sum(req - ass)
  absences: number;      // specific types
  uncovered: number;     // same as empty, but explicitly named for UI
  cancelled: number;
  closed: number;
}

export interface PropagateVacationOptions {
  occurrences: number;
  frequency: "week" | "month" | "weekdays";
  includeAssignments: boolean;
  includeNotes: boolean;
  skipDuplicates: boolean;
}

export interface PropagateWeekOptions {
  target: "next_week" | "current_month" | "next_month";
  includeAssignments: boolean;
  includeNotes: boolean;
  skipDuplicates: boolean;
}

export interface PlanningContextType {
  vacations: VacationApiItem[];
  filteredVacations: VacationApiItem[];
  sites: SiteApiItem[];
  agents: AgentApiItem[];
  loading: boolean;
  sitesLoading: boolean;
  agentsLoading: boolean;
  mode: PlanningMode;
  setMode: (m: PlanningMode) => void;
  viewDensity: "compact" | "comfortable";
  setViewDensity: (v: "compact" | "comfortable") => void;
  showAbsences: boolean;
  setShowAbsences: (v: boolean) => void;
  publicationFilter: PublicationFilter;
  setPublicationFilter: (v: PublicationFilter) => void;
  siteId: string;
  setSiteId: (id: string) => void;
  agentId: string;
  setAgentId: (id: string) => void;
  range: PlanningDateRange | null;
  setRange: (r: PlanningDateRange) => void;
  stats: PlanningStats;
  conflictIndex: ConflictIndex;
  tensionMode: boolean;
  setTensionMode: (v: boolean) => void;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  clearSelection: () => void;
  createOpen: boolean;
  setCreateOpen: (v: boolean) => void;
  detailsOpen: boolean;
  setDétailsOpen: (v: boolean) => void;
  assignOpen: boolean;
  setAssignOpen: (v: boolean) => void;
  replaceOpen: boolean;
  setReplaceOpen: (v: boolean) => void;
  insightsOpen: boolean;
  setInsightsOpen: (v: boolean) => void;
  propagationOpen: boolean;
  setPropagationOpen: (v: boolean) => void;
  weekPropagationOpen: boolean;
  setWeekPropagationOpen: (v: boolean) => void;
  siteTemplateOpen: boolean;
  setSiteTemplateOpen: (v: boolean) => void;
  validationOpen: boolean;
  setValidationOpen: (v: boolean) => void;
  dispatchOpen: boolean;
  setDispatchOpen: (v: boolean) => void;
  siteDispatchOpen: boolean;
  setSiteDispatchOpen: (v: boolean) => void;
  coverageOpen: boolean;
  setCoverageOpen: (v: boolean) => void;
  distributionOpen: boolean;
  setDistributionOpen: (v: boolean) => void;
  activeVacationId: string | null;
  setActiveVacationId: (id: string | null) => void;
  activeVacation: VacationApiItem | null;
  refresh: () => Promise<void>;
  createVacation: (data: Partial<VacationApiItem>) => Promise<string | null>;
  updateVacation: (id: string, data: Partial<VacationApiItem>) => Promise<boolean>;
  deleteVacation: (id: string | string[]) => Promise<boolean>;
  closeVacation: (v: VacationApiItem) => Promise<boolean>;
  ops: OpsSummary;
  pasteMode: boolean;
  setPasteMode: (v: boolean) => void;
  pasteBusy: boolean;
  handleCopy: () => void;
  handleStartPaste: () => void;
  handleCancelPaste: () => void;
  performPasteAt: (anchor: Date) => Promise<void>;
  duplicateVacation: (id: string) => Promise<void>;
  propagateActiveVacation: (options: PropagateVacationOptions) => Promise<void>;
  propagateWeekPlan: (weekStart: Date, options: PropagateWeekOptions) => Promise<void>;
  magicFill: () => Promise<void>;
  bulkAssign: (agentId: string) => Promise<void>;
  bulkDelete: () => Promise<void>;
  duplicateWeek: (weekStart: Date) => Promise<void>;
  publishRange: (from: string, to: string) => Promise<void>;
  initialCreateData: { startAt: string; endAt: string; siteId?: string } | null;
  setInitialCreateData: (v: { startAt: string; endAt: string; siteId?: string } | null) => void;
  deleteConfirmOpen: boolean;
  setDeleteConfirmOpen: (v: boolean) => void;
  idsToDelete: string[];
  setIdsToDelete: (v: string[]) => void;
  sortByUrgency: boolean;
  setSortByUrgency: (v: boolean) => void;
}

type DisplayDensity = "comfortable" | "compact";

const DISPLAY_DENSITY_STORAGE_KEY = "sentrys:display-density";
const DISPLAY_DENSITY_SOURCE_STORAGE_KEY = "sentrys:display-density-source";
const DISPLAY_DENSITY_EVENT = "sentrys:density-change";

const PlanningContext = createContext<PlanningContextType | null>(null);

export const usePlanning = () => {
  const ctx = useContext(PlanningContext);
  if (!ctx) throw new Error("usePlanning must be used within PlanningProvider");
  return ctx;
};

export const PlanningProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  const toast = useFeedbackToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // --- State ---
  const [sites, setSites] = useState<SiteApiItem[]>([]);
  const [sitesLoading, setSitesLoading] = useState(true);
  const [agents, setAgents] = useState<AgentApiItem[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);

  const [mode, setMode] = useState<PlanningMode>("site");
  const [viewDensity, setViewDensityState] =
    useState<"compact" | "comfortable">("comfortable");
  const [showAbsences, setShowAbsences] = useState(true);
  const [publicationFilter, setPublicationFilter] = useState<PublicationFilter>("all");
  const [siteId, setSiteId] = useState("all");
  const [agentId, setAgentId] = useState("all");
  const [range, setRange] = useState<PlanningDateRange | null>(null);
  const [tensionMode, setTensionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [createOpen, setCreateOpen] = useState(false);
  const [detailsOpen, setDétailsOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [propagationOpen, setPropagationOpen] = useState(false);
  const [weekPropagationOpen, setWeekPropagationOpen] = useState(false);
  const [siteTemplateOpen, setSiteTemplateOpen] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [siteDispatchOpen, setSiteDispatchOpen] = useState(false);
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [distributionOpen, setDistributionOpen] = useState(false);
  const [activeVacationId, setActiveVacationId] = useState<string | null>(null);

  const [pasteMode, setPasteMode] = useState(false);
  const [pasteBusy, setPasteBusy] = useState(false);
  const [initialCreateData, setInitialCreateData] = useState<{ startAt: string; endAt: string; siteId?: string } | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [idsToDelete, setIdsToDelete] = useState<string[]>([]);
  const [sortByUrgency, setSortByUrgency] = useState(true);
  const clipboardRef = useRef<ClipboardData>({ items: [], baseStartIso: null });
  const [pasteOptions] = useState({ includeAssignments: true, includeNotes: true });

  const [vacations, setVacations] = useState<VacationApiItem[]>([]);
  const [vacsLoading, setVacsLoading] = useState(true);

  const setViewDensity = useCallback((density: "compact" | "comfortable") => {
    setViewDensityState(density);

    if (typeof window === "undefined") return;

    document.documentElement.dataset.density = density;
    window.localStorage.setItem(DISPLAY_DENSITY_STORAGE_KEY, density);
    window.localStorage.setItem(DISPLAY_DENSITY_SOURCE_STORAGE_KEY, "manual");
    window.dispatchEvent(
      new CustomEvent(DISPLAY_DENSITY_EVENT, { detail: { density } })
    );
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem(DISPLAY_DENSITY_STORAGE_KEY);
    if (stored === "compact" || stored === "comfortable") {
      setViewDensityState(stored);
    }

    function onDensityChange(event: Event) {
      const density = (event as CustomEvent<{ density?: DisplayDensity }>).detail
        ?.density;

      if (density === "compact" || density === "comfortable") {
        setViewDensityState(density);
      }
    }

    window.addEventListener(DISPLAY_DENSITY_EVENT, onDensityChange);
    return () => window.removeEventListener(DISPLAY_DENSITY_EVENT, onDensityChange);
  }, []);

  useEffect(() => {
    if (!tenantId) {
      setVacations([]);
      setVacsLoading(false);
      return;
    }

    setVacsLoading(true);

    // 🔥 Temps Réel: Écoute globale du Tenant (pas besoin d'index composite pour le tri ou la plage)
    const q = query(collection(db, "vacations"), where("tenantId", "==", tenantId));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: VacationApiItem[] = [];
      snapshot.forEach(doc => {
         const data = doc.data();
         items.push({
           id: doc.id,
           tenantId: data.tenantId,
           siteId: data.siteId || null,
           siteName: data.siteName || null,
           title: data.title || null,
           missionType: data.missionType || null,
           status: data.status || "planned",
           requiredAgents: data.requiredAgents || 1,
           assignedAgentIds: data.assignedAgentIds || [],
           startAtIso: data.startAt ? new Date(data.startAt.toMillis()).toISOString() : null,
           endAtIso: data.endAt ? new Date(data.endAt.toMillis()).toISOString() : null,
           updatedAtIso: data.updatedAt ? new Date(data.updatedAt.toMillis()).toISOString() : null,
           publishedAtIso: data.publishedAt ? new Date(data.publishedAt.toMillis()).toISOString() : null,
           notes: data.notes || null,
           requiredQualification: data.requiredQualification || null,
           isPublished: !!data.isPublished,
         });
      });
      // Tri manuel pour compenser l'absence de orderBy("startAt", "desc")
      items.sort((a, b) => {
         if (!a.startAtIso || !b.startAtIso) return 0;
         return new Date(b.startAtIso).getTime() - new Date(a.startAtIso).getTime();
      });

      setVacations(items);
      setVacsLoading(false);
    }, (err) => {
      console.error("[PlanningContext] Sync Error:", err);
      toast({ variant: "destructive", title: "Erreur temps-réel", description: err.message });
      setVacsLoading(false);
    });

    return () => unsubscribe();
  }, [tenantId, toast]);

  // --- Effects ---
  useEffect(() => {
    // Clear selection when range changes for safety
    setSelectedIds(new Set());
  }, [range]);

  const mutate = async (data?: VacationApiItem[], shouldRevalidate?: boolean) => {
    // Stub SWR mutate to prevent existing methods from breaking.
    // Local mutations are useless anyway because Firebase onSnapshot handles optimistic UI instantly.
    return data;
  };

  const loading = vacsLoading || isMutating;

  const activeVacation = useMemo(() => {
    if (!activeVacationId) return null;
    return vacations.find((v) => v.id === activeVacationId) || null;
  }, [vacations, activeVacationId]);

  useEffect(() => {
    const targetVacationId = searchParams.get("vacationId");
    const panel = searchParams.get("panel");

    if (!targetVacationId) return;
    if (!vacations.some((vacation) => vacation.id === targetVacationId)) return;

    setActiveVacationId(targetVacationId);

    if (panel === "assign") {
      setAssignOpen(true);
      setDétailsOpen(false);
    } else {
      setDétailsOpen(true);
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("vacationId");
    nextParams.delete("panel");

    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
      scroll: false,
    });
  }, [pathname, router, searchParams, vacations]);

  const filteredVacations = useMemo(() => {
    const result = vacations.filter((v) => {
      // Filtrage Date (Range) côté client depuis que le snapshot global est chargé
      if (range && v.startAtIso && v.endAtIso) {
         const s = new Date(v.startAtIso).getTime();
         const en = new Date(v.endAtIso).getTime();
         const rFrom = new Date(range.from).getTime();
         const rTo = new Date(range.to).getTime();
         // Condition d'overlap strict
         if (s >= rTo || en <= rFrom) return false;
      }

      if (siteId !== "all") {
         const vSiteId = String(v.siteId || "").trim();
         const targetId = String(siteId).trim();
         if (vSiteId !== targetId) return false;
      }
      // Cross-filter: Always apply agentId if not 'all', regardless of mode
      if (agentId !== "all") {
         const assignedIds = Array.isArray(v.assignedAgentIds) ? v.assignedAgentIds.map(o => String(o)) : [];
         if (!assignedIds.includes(String(agentId))) return false;
      }

      if (!showAbsences) {
        const title = (v.title || "").toLowerCase();
        const notes = (v.notes || "").toLowerCase();
        const isAbsence = ["absence", "conge", "congé", "repos", "maladie", "rtt"].some(kw =>
          title.includes(kw) || notes.includes(kw)
        );
        if (isAbsence) return false;
      }

      if (
        publicationFilter !== "all" &&
        getVacationPublicationStatus(v) !== publicationFilter
      ) {
        return false;
      }

      return true;
    });

    console.log(`[Planning] Filtered: ${result.length}/${vacations.length} (siteId: ${siteId}, agentId: ${agentId}, showAbsences: ${showAbsences}, publication: ${publicationFilter})`);
    return result;
  }, [vacations, siteId, mode, agentId, showAbsences, publicationFilter, range]);

  const statsInput: VacationEvent[] = useMemo(() => {
    return filteredVacations
      .filter((v) => !!v.startAtIso && !!v.endAtIso)
      .map((v) => ({
        id: v.id,
        start: v.startAtIso as string,
        end: v.endAtIso as string,
        status: v.status,
        assignedAgentIds: Array.isArray(v.assignedAgentIds) ? v.assignedAgentIds : [],
        siteId: v.siteId,
        siteName: v.siteName,
        requiredAgents: v.requiredAgents,
        requiredQualification: v.requiredQualification,
      }));
  }, [filteredVacations]);

  const globalStatsInput: VacationEvent[] = useMemo(() => {
    return vacations
      .filter((v) => !!v.startAtIso && !!v.endAtIso)
      .map((v) => ({
        id: v.id,
        start: v.startAtIso as string,
        end: v.endAtIso as string,
        status: v.status,
        assignedAgentIds: Array.isArray(v.assignedAgentIds) ? v.assignedAgentIds : [],
        siteId: v.siteId,
        siteName: v.siteName,
        requiredAgents: v.requiredAgents,
        requiredQualification: v.requiredQualification,
      }));
  }, [vacations]);

  const agentContractualTargets = useMemo(
    () =>
      agents.reduce<Record<string, number>>((acc, agent) => {
        const value = Number(agent.monthlyContractHours);
        if (Number.isFinite(value) && value > 0) {
          acc[agent.id] = value;
        }
        return acc;
      }, {}),
    [agents]
  );

  const agentQualifications = useMemo(
    () =>
      agents.reduce<Record<string, string[]>>((acc, agent) => {
        acc[agent.id] = Array.isArray(agent.qualifications)
          ? agent.qualifications
          : [];
        return acc;
      }, {}),
    [agents]
  );

  const stats = useMemo(
    () =>
      computePlanningStats(
        statsInput,
        range || undefined,
        globalStatsInput,
        agentContractualTargets,
        agentQualifications
      ),
    [agentContractualTargets, agentQualifications, globalStatsInput, range, statsInput]
  );
  const conflictIndex = useMemo(() => buildConflictIndex(globalStatsInput), [globalStatsInput]);

  const ops = useMemo(() => {
    let total = 0, empty = 0, partial = 0, full = 0, missingAgents = 0, cancelled = 0, closed = 0, absences = 0;

    // Absence keywords
    const absKeywords = ["absence", "congé", "vacances", "maladie", "repos", "conge"];

    for (const v of filteredVacations) {
      if (v.status === "cancelled") { cancelled++; continue; }
      if (v.status === "closed") { closed++; continue; }

      // Detect absence
      const isAbsence = absKeywords.some(kw =>
        (v.title || "").toLowerCase().includes(kw) ||
        (v.notes || "").toLowerCase().includes(kw)
      );
      if (isAbsence) { absences++; continue; }

      total++;
      const req = Math.max(0, Number(v.requiredAgents ?? 0));
      const ass = Array.isArray(v.assignedAgentIds) ? v.assignedAgentIds.length : 0;

      if (req <= 0) { full++; continue; }
      if (ass <= 0) { empty++; missingAgents += req; }
      else if (ass < req) { partial++; missingAgents += (req - ass); }
      else full++;
    }
    return {
      total,
      empty,
      partial,
      full,
      missingAgents,
      absences,
      uncovered: empty,
      cancelled,
      closed
    };
  }, [filteredVacations]);




  const loadInitialData = useCallback(async () => {
    if (!tenantId) return;
    setSitesLoading(true);
    setAgentsLoading(true);
    try {
      const [sResp, aResp] = await Promise.all([
        apiFetch<{ ok: boolean, sites: SiteApiItem[] }>("/api/sites"),
        apiFetch<{ ok: boolean, agents: AgentApiItem[] }>("/api/agents"),
      ]);
      if (sResp?.ok && Array.isArray(sResp.sites)) setSites(sResp.sites);
      if (aResp?.ok && Array.isArray(aResp.agents)) setAgents(aResp.agents);
    } catch (e) {
      console.error("Context data load error", e);
    } finally {
      setSitesLoading(false);
      setAgentsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { loadInitialData(); }, [loadInitialData]);
  const refresh = useCallback(async () => { await mutate(); }, [mutate]);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);


  const createVacation = async (data: Partial<VacationApiItem>) => {
    const res = await apiFetch<CreateVacationResponse>("/api/vacations", { method: "POST", body: data });
    if (res?.ok) { await mutate(); return res.id ?? null; }
    return null;
  };


  const updateVacation = async (id: string, data: Partial<VacationApiItem>) => {
    const oldVacs = [...vacations];

    // Optimistic: Map startAt/endAt to startAtIso/endAtIso for UI rendering
    const patch = { ...data };
    if (patch.startAt) patch.startAtIso = patch.startAt;
    if (patch.endAt) patch.endAtIso = patch.endAt;

    const newVacs = oldVacs.map(v => v.id === id ? { ...v, ...patch } : v);
    mutate(newVacs, false);

    try {
      const res = await apiFetch<any>(`/api/vacations/${id}`, { method: "PATCH", body: data });
      if (res?.ok !== false) {
        await mutate();
        return true;
      }
      throw new Error("Update failed");
    } catch (e) {
      mutate(oldVacs, false); // Revert
      return false;
    }
  };


  const deleteVacation = async (id: string | string[]) => {
    const ids = Array.isArray(id) ? id : [id];
    if (ids.length === 0) return false;

    const oldVacs = [...vacations];
    setIsMutating(true);

    try {
      // Optimistic delete
      mutate(vacations.filter(v => !ids.includes(v.id)), false);

      const res = await apiFetch<any>("/api/vacations/bulk", {
        method: "POST",
        body: { operations: ids.map(id => ({ type: "delete", id })) }
      });

      if (res?.ok !== false) {
        toast({ title: ids.length > 1 ? "Vacations supprimées" : "Vacation supprimée" });
        await mutate();
        return true;
      } else {
        throw new Error(res?.error || "Erreur lors de la suppression");
      }
    } catch (e: any) {
      mutate(oldVacs, false); // Revert
      toast({
        variant: "destructive",
        title: "Erreur de suppression",
        description: e.message || "Impossible de supprimer la mission."
      });
      return false;
    } finally {
      setIsMutating(false);
    }
  };

  const closeVacation = async (v: VacationApiItem) => updateVacation(v.id, { status: "closed" });

  const buildVacationFingerprint = useCallback(
    (site: string | null | undefined, startIso: string | null | undefined, endIso: string | null | undefined, title: string | null | undefined) =>
      [site ?? "", startIso ?? "", endIso ?? "", (title ?? "").trim().toLowerCase()].join("::"),
    []
  );

  const isAbsenceVacation = useCallback((vacation: VacationApiItem) => {
    const haystack = `${vacation.title ?? ""} ${vacation.notes ?? ""}`.toLowerCase();
    return ["absence", "conge", "congé", "repos", "maladie", "rtt", "vacances"].some((keyword) =>
      haystack.includes(keyword)
    );
  }, []);

  const handleCopy = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const selectedVac = vacations.filter((v) => ids.includes(v.id))
      .filter((v) => !!v.siteId && !!v.startAtIso && !!v.endAtIso);
    if (selectedVac.length === 0) return;
    selectedVac.sort((a, b) => new Date(a.startAtIso!).getTime() - new Date(b.startAtIso!).getTime());
    const baseStartIso = selectedVac[0].startAtIso;
      const items: ClipItem[] = selectedVac.map((v) => ({
        id: v.id, siteId: v.siteId!, title: v.title ?? null, siteName: v.siteName ?? null, missionType: v.missionType ?? null,
        requiredAgents: v.requiredAgents ?? 1, startAtIso: v.startAtIso!, endAtIso: v.endAtIso!,
        notes: v.notes ?? null, assignedAgentIds: v.assignedAgentIds || [],
      }));
    clipboardRef.current = { items, baseStartIso };
    toast({ title: "Copi\u00e9", description: `${items.length} vacation(s) copi\u00e9e(s).` });
  }, [selectedIds, vacations, toast]);

  const handleStartPaste = useCallback(() => {
    if (!clipboardRef.current.items.length) return;
    setPasteMode(true);
    toast({ title: "Mode collage", description: "Clique sur un cr\u00e9neau pour coller." });
  }, [toast]);

  const handleCancelPaste = useCallback(() => setPasteMode(false), []);

  const performPasteAt = useCallback(async (anchor: Date) => {
    const clip = clipboardRef.current;
    if (!clip.items.length || !clip.baseStartIso || !tenantId) return;
    setIsMutating(true);
    try {
      const baseStart = new Date(clip.baseStartIso);
      const anchorMs = anchor.getTime();
      const operations: any[] = [];

      for (const it of clip.items) {
        const deltaMs = new Date(it.startAtIso).getTime() - baseStart.getTime();
        const durMs = new Date(it.endAtIso).getTime() - new Date(it.startAtIso).getTime();
        const nextStart = new Date(anchorMs + deltaMs);
        const nextEnd = new Date(nextStart.getTime() + durMs);

        operations.push({
          type: "create",
          data: {
             siteId: it.siteId,
             startAt: nextStart.toISOString(),
             endAt: nextEnd.toISOString(),
             requiredAgents: it.requiredAgents,
             title: it.title,
             missionType: it.missionType ?? null,
             siteName: it.siteName,
             notes: pasteOptions.includeNotes ? it.notes : null,
             assignedAgentIds: pasteOptions.includeAssignments ? it.assignedAgentIds : [],
          }
        });
      }

      await apiFetch<any>("/api/vacations/bulk", {
         method: "POST",
         body: { operations }
      });

      await mutate();
      setPasteMode(false);
      toast({ title: "Collage effectué" });
    } catch (e) {
      toast({ variant: "destructive", title: "Erreur lors du collage" });
    } finally {
      setIsMutating(false);
    }
  }, [tenantId, mutate, toast, pasteOptions]);


  const magicFill = useCallback(async () => {
    const emptyShifts = filteredVacations.filter(v => v.status === "planned" || v.status === "partially_filled");
    if (emptyShifts.length === 0) {
      toast({ title: "Magic Fill", description: "Aucune mission à remplir dans la vue actuelle." });
      return;
    }

    setIsMutating(true);
    try {
      toast({ title: "Magic Fill en cours", description: "L'IA analyse le planning..." });

      const res = await apiFetch<any>("/api/ai/magic-fill", {
        method: "POST",
        body: {
          unfilledShifts: emptyShifts,
          existingShifts: vacations.filter(v => v.status === "filled"),
          agents,
        }
      });

      if (!res?.ok || !res.data) throw new Error(res?.error || "Erreur lors de l'analyse IA");

      const operations: any[] = [];
      let newVacs = [...vacations];

      if (Array.isArray(res.data.assignments)) {
        for (const assignment of res.data.assignments) {
          const { shiftId, assignedAgentIds } = assignment;
          const shift = vacations.find(v => v.id === shiftId);
          if (shift && Array.isArray(assignedAgentIds) && assignedAgentIds.length > 0) {
            // We just set or merge the assignments. Let's merge in case of partially filled
            const newIds = Array.from(new Set([...(shift.assignedAgentIds || []), ...assignedAgentIds]));
            const newStatus = newIds.length >= (shift.requiredAgents || 1) ? "filled" : "partially_filled";

            newVacs = newVacs.map(v => v.id === shiftId ? { ...v, assignedAgentIds: newIds, status: newStatus } : v);

            operations.push({
               type: "update",
               id: shiftId,
               data: { assignedAgentIds: newIds, status: newStatus }
            });
          }
        }
      }

      if (operations.length > 0) {
         mutate(newVacs, false);
         await apiFetch<any>("/api/vacations/bulk", {
            method: "POST",
            body: { operations }
         });
         await mutate();
      }

      toast({
        title: "Magic Fill Terminé",
        description: res.data.summary || `${operations.length} mission(s) ont été optimisées.`
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erreur Magic Fill", description: e.message || "Impossible d'appeler l'IA." });
    } finally {
      setIsMutating(false);
    }
  }, [filteredVacations, agents, vacations, toast, mutate]);



  const bulkAssign = useCallback(async (targetAgentId: string) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const targetAgent = agents.find(a => a.id === targetAgentId);
    let qualWarnings = 0;
    const targets = vacations.filter(v => ids.includes(v.id));

    targets.forEach(v => {
      if (v.requiredQualification && targetAgent && !targetAgent.qualifications?.includes(v.requiredQualification)) {
        qualWarnings++;
      }
    });

    setIsMutating(true);
    try {
      let newVacs = [...vacations];
      const operations: any[] = [];
      let updatedCount = 0;

      for (const id of ids) {
        const v = vacations.find(x => x.id === id);
        if (!v) continue;

        if (!v.assignedAgentIds.includes(targetAgentId)) {
          const newIds = [...v.assignedAgentIds, targetAgentId];
          const newStatus = newIds.length >= (v.requiredAgents || 1) ? "filled" : "partially_filled";

          newVacs = newVacs.map(x => x.id === id ? { ...x, assignedAgentIds: newIds, status: newStatus } : x);
          updatedCount++;

          operations.push({
             type: "update",
             id,
             data: { assignedAgentIds: newIds, status: newStatus }
          });
        }
      }

      mutate(newVacs, false);

      if (operations.length > 0) {
         await apiFetch<any>("/api/vacations/bulk", {
            method: "POST",
            body: { operations }
         });
      }

      const qualMsg = qualWarnings > 0 ? `Attention: ${qualWarnings} mission(s) sans qualification requise.` : "";
      toast({
        title: "Affectation Groupée Terminée",
        description: `Agent affecté à ${updatedCount} mission(s). ${qualMsg}`
      });
      clearSelection();
      await mutate();
    } catch (e) {
      toast({ variant: "destructive", title: "Erreur Bulk Assign" });
    } finally {
      setIsMutating(false);
    }
  }, [selectedIds, vacations, agents, mutate, toast, clearSelection]);



  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;

      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        e.preventDefault();
        handleCopy();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
         e.preventDefault();
         handleStartPaste();
      }
      if (e.key === "Delete" || e.key === "Backspace") {
         const ids = Array.from(selectedIds);
         if (ids.length > 0) {
            e.preventDefault();
            setIdsToDelete(ids);
            setDeleteConfirmOpen(true);
         }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleCopy, handleStartPaste, selectedIds, clearSelection, mutate, vacations]);


  const duplicateVacation = useCallback(async (id: string) => {
    const v = vacations.find(x => x.id === id);
    if (!v) return;
    try {
      setIsMutating(true);
      const res = await apiFetch<any>("/api/vacations", {
        method: "POST",
        body: {
          siteId: v.siteId,
          startAt: v.startAtIso,
          endAt: v.endAtIso,
          title: v.title ? `${v.title} (Copie)` : "Vacation (Copie)",
          missionType: v.missionType ?? null,
          requiredAgents: v.requiredAgents || 1,
          requiredQualification: v.requiredQualification ?? null,
          notes: v.notes,
          assignedAgentIds: [] // We don't copy assignments for duplicates by default
        }
      });
      if (res?.ok) {
        toast({ title: "Mission dupliquée", description: "Une copie identique a été créée." });
        await refresh();
      } else {
        throw new Error(res?.error || "Erreur API");
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erreur", description: e.message });
    } finally {
      setIsMutating(false);
    }
  }, [vacations, refresh, toast]);

  const propagateActiveVacation = useCallback(async (options: PropagateVacationOptions) => {
    const source = vacations.find((vacation) => vacation.id === activeVacationId);
    if (!source?.startAtIso || !source.endAtIso || !tenantId) return;

    const sourceStart = new Date(source.startAtIso);
    const sourceEnd = new Date(source.endAtIso);
    const sourceDurationMs = sourceEnd.getTime() - sourceStart.getTime();
    const existingFingerprints = new Set(
      vacations.map((vacation) =>
        buildVacationFingerprint(vacation.siteId, vacation.startAtIso, vacation.endAtIso, vacation.title)
      )
    );

    const operations: Array<{ type: "create"; data: Record<string, unknown> }> = [];
    let skipped = 0;

    const targets: Array<{ start: Date; end: Date }> = [];

    if (options.frequency === "weekdays") {
      const weekMonday = new Date(sourceStart);
      const weekday = sourceStart.getDay();
      const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
      weekMonday.setDate(weekMonday.getDate() + mondayOffset);
      weekMonday.setHours(0, 0, 0, 0);

      for (let index = 0; index < 5; index += 1) {
        const nextStart = new Date(weekMonday);
        nextStart.setDate(weekMonday.getDate() + index);
        nextStart.setHours(
          sourceStart.getHours(),
          sourceStart.getMinutes(),
          sourceStart.getSeconds(),
          sourceStart.getMilliseconds()
        );

        if (nextStart.toDateString() === sourceStart.toDateString()) {
          continue;
        }

        const nextEnd = new Date(nextStart.getTime() + sourceDurationMs);
        targets.push({ start: nextStart, end: nextEnd });
      }
    } else {
      for (let index = 1; index <= options.occurrences; index += 1) {
        const nextStart = new Date(sourceStart);
        const nextEnd = new Date(sourceEnd);

        if (options.frequency === "month") {
          nextStart.setMonth(nextStart.getMonth() + index);
          nextEnd.setMonth(nextEnd.getMonth() + index);
        } else {
          nextStart.setDate(nextStart.getDate() + index * 7);
          nextEnd.setDate(nextEnd.getDate() + index * 7);
        }

        targets.push({ start: nextStart, end: nextEnd });
      }
    }

    for (const target of targets) {
      const nextStart = target.start;
      const nextEnd = target.end;

      const fingerprint = buildVacationFingerprint(
        source.siteId,
        nextStart.toISOString(),
        nextEnd.toISOString(),
        source.title
      );

      if (options.skipDuplicates && existingFingerprints.has(fingerprint)) {
        skipped += 1;
        continue;
      }

      existingFingerprints.add(fingerprint);
      operations.push({
        type: "create",
        data: {
          siteId: source.siteId,
          siteName: source.siteName,
          startAt: nextStart.toISOString(),
          endAt: nextEnd.toISOString(),
          title: source.title,
          missionType: source.missionType ?? null,
          requiredAgents: source.requiredAgents || 1,
          requiredQualification: source.requiredQualification,
          notes: options.includeNotes ? source.notes : null,
          assignedAgentIds: options.includeAssignments ? source.assignedAgentIds || [] : [],
        },
      });
    }

    if (operations.length === 0) {
      toast({
        title: "Propagation terminée",
        description:
          skipped > 0
            ? "Aucune nouvelle vacation créée : les occurrences existent déjà."
            : "Aucune occurrence à créer.",
      });
      setPropagationOpen(false);
      return;
    }

    try {
      setIsMutating(true);
      await apiFetch<any>("/api/vacations/bulk", {
        method: "POST",
        body: { operations },
      });
      toast({
        title: "Vacation propagée",
        description:
          skipped > 0
            ? `${operations.length} occurrence(s) créées, ${skipped} ignorée(s) car déjà présentes.`
            : `${operations.length} occurrence(s) créées.`,
      });
      setPropagationOpen(false);
      await mutate();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur de propagation",
        description: error instanceof Error ? error.message : "Impossible de propager la vacation.",
      });
    } finally {
      setIsMutating(false);
    }
  }, [activeVacationId, buildVacationFingerprint, mutate, tenantId, toast, vacations]);

  const propagateWeekPlan = useCallback(async (weekStart: Date, options: PropagateWeekOptions) => {
    if (!tenantId) return;

    const sourceStart = new Date(weekStart);
    const sourceEnd = new Date(sourceStart);
    sourceEnd.setDate(sourceEnd.getDate() + 7);

    const sourceVacations = vacations.filter((vacation) => {
      if (!vacation.startAtIso || !vacation.endAtIso) return false;
      if (vacation.status === "cancelled" || vacation.status === "closed") return false;
      if (isAbsenceVacation(vacation)) return false;
      const start = new Date(vacation.startAtIso);
      return start >= sourceStart && start < sourceEnd;
    });

    if (sourceVacations.length === 0) {
      toast({
        title: "Aucune semaine type",
        description: "Aucune vacation exploitable trouvée sur la semaine source.",
      });
      setWeekPropagationOpen(false);
      return;
    }

    const targetWeekOffsets: number[] = [];
    const sourceMonth = sourceStart.getMonth();
    const sourceYear = sourceStart.getFullYear();
    const nextMonthDate = new Date(sourceYear, sourceMonth + 1, 1);
    const nextMonth = nextMonthDate.getMonth();
    const nextMonthYear = nextMonthDate.getFullYear();

    if (options.target === "next_week") {
      targetWeekOffsets.push(1);
    } else {
      for (let offset = 1; offset <= 8; offset += 1) {
        const candidate = new Date(sourceStart);
        candidate.setDate(candidate.getDate() + offset * 7);

        if (options.target === "current_month") {
          if (candidate.getMonth() === sourceMonth && candidate.getFullYear() === sourceYear) {
            targetWeekOffsets.push(offset);
            continue;
          }
          if (
            candidate.getFullYear() > sourceYear ||
            (candidate.getFullYear() === sourceYear && candidate.getMonth() > sourceMonth)
          ) {
            break;
          }
        }

        if (options.target === "next_month") {
          if (
            candidate.getMonth() === nextMonth &&
            candidate.getFullYear() === nextMonthYear
          ) {
            targetWeekOffsets.push(offset);
            continue;
          }
          if (
            candidate.getFullYear() > nextMonthYear ||
            (candidate.getFullYear() === nextMonthYear && candidate.getMonth() > nextMonth)
          ) {
            break;
          }
        }
      }
    }

    if (targetWeekOffsets.length === 0) {
      toast({
        title: "Aucune période cible",
        description: "Aucune semaine cible n'a été trouvée pour cette propagation.",
      });
      setWeekPropagationOpen(false);
      return;
    }

    const existingFingerprints = new Set(
      vacations.map((vacation) =>
        buildVacationFingerprint(vacation.siteId, vacation.startAtIso, vacation.endAtIso, vacation.title)
      )
    );

    const operations: Array<{ type: "create"; data: Record<string, unknown> }> = [];
    let skipped = 0;

    for (const vacation of sourceVacations) {
      const baseStart = new Date(vacation.startAtIso!);
      const baseEnd = new Date(vacation.endAtIso!);

      for (const weekOffset of targetWeekOffsets) {
        const nextStart = new Date(baseStart);
        const nextEnd = new Date(baseEnd);
        nextStart.setDate(nextStart.getDate() + weekOffset * 7);
        nextEnd.setDate(nextEnd.getDate() + weekOffset * 7);

        const fingerprint = buildVacationFingerprint(
          vacation.siteId,
          nextStart.toISOString(),
          nextEnd.toISOString(),
          vacation.title
        );

        if (options.skipDuplicates && existingFingerprints.has(fingerprint)) {
          skipped += 1;
          continue;
        }

        existingFingerprints.add(fingerprint);
        operations.push({
          type: "create",
          data: {
            siteId: vacation.siteId,
            siteName: vacation.siteName,
            startAt: nextStart.toISOString(),
              endAt: nextEnd.toISOString(),
              title: vacation.title,
              missionType: vacation.missionType ?? null,
              requiredAgents: vacation.requiredAgents || 1,
              requiredQualification: vacation.requiredQualification ?? null,
              notes: options.includeNotes ? vacation.notes : null,
            assignedAgentIds: options.includeAssignments ? vacation.assignedAgentIds || [] : [],
            isPublished: false,
          },
        });
      }
    }

    if (operations.length === 0) {
      toast({
        title: "Propagation ignorée",
        description:
          skipped > 0
            ? "Toutes les vacations ciblées existent déjà."
            : "Aucune vacation à créer sur la période cible.",
      });
      setWeekPropagationOpen(false);
      return;
    }

    try {
      setIsMutating(true);
      await apiFetch<any>("/api/vacations/bulk", {
        method: "POST",
        body: { operations },
      });
      toast({
        title: "Planning reproduit",
        description:
          skipped > 0
            ? `${operations.length} vacation(s) créées, ${skipped} ignorée(s) car déjà présentes.`
            : `${operations.length} vacation(s) créées sur la période cible.`,
      });
      setWeekPropagationOpen(false);
      await mutate();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur de propagation",
        description:
          error instanceof Error ? error.message : "Impossible de reproduire le planning.",
      });
    } finally {
      setIsMutating(false);
    }
  }, [tenantId, vacations, isAbsenceVacation, buildVacationFingerprint, toast, mutate]);

  const duplicateWeek = useCallback(async (weekStart: Date) => {
    if (!tenantId) return;
    setIsMutating(true);
    try {
      const start = new Date(weekStart);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const existingFingerprints = new Set(
        vacations.map((vacation) =>
          buildVacationFingerprint(vacation.siteId, vacation.startAtIso, vacation.endAtIso, vacation.title)
        )
      );

      const toCopy = vacations.filter((vacation) => {
        if (!vacation.startAtIso) return false;
        if (vacation.status === "cancelled" || vacation.status === "closed") return false;
        if (isAbsenceVacation(vacation)) return false;
        const vacationDate = new Date(vacation.startAtIso);
        return vacationDate >= start && vacationDate < end;
      });

      if (toCopy.length === 0) {
        toast({
          title: "Copie abandonnée",
          description: "Aucune mission exploitable trouvée sur cette semaine.",
        });
        return;
      }

      let skipped = 0;
      const operations = toCopy.flatMap((vacation) => {
        const nextStart = new Date(vacation.startAtIso!);
        const nextEnd = new Date(vacation.endAtIso!);
        nextStart.setDate(nextStart.getDate() + 7);
        nextEnd.setDate(nextEnd.getDate() + 7);

        const fingerprint = buildVacationFingerprint(
          vacation.siteId,
          nextStart.toISOString(),
          nextEnd.toISOString(),
          vacation.title
        );

        if (existingFingerprints.has(fingerprint)) {
          skipped += 1;
          return [];
        }

        existingFingerprints.add(fingerprint);
        return [{
          type: "create",
          data: {
            siteId: vacation.siteId,
            siteName: vacation.siteName,
            startAt: nextStart.toISOString(),
              endAt: nextEnd.toISOString(),
              title: vacation.title,
              missionType: vacation.missionType ?? null,
              requiredAgents: vacation.requiredAgents || 1,
              requiredQualification: vacation.requiredQualification ?? null,
              notes: vacation.notes,
            assignedAgentIds: vacation.assignedAgentIds || [],
            isPublished: false,
          },
        }];
      });

      if (operations.length === 0) {
        toast({
          title: "Reconduction ignorée",
          description:
            skipped > 0
              ? "La semaine cible contient déjà ces vacations."
              : "Aucune mission éligible à reconduire.",
        });
        return;
      }

      await apiFetch<any>("/api/vacations/bulk", {
        method: "POST",
        body: { operations },
      });

      toast({
        title: "Semaine reconduite",
        description:
          skipped > 0
            ? `${operations.length} mission(s) copiées sur la semaine suivante, ${skipped} ignorée(s) car déjà présentes.`
            : `${operations.length} mission(s) copiées sur la semaine suivante.`,
      });
      await mutate();
    } catch (e) {
      toast({ variant: "destructive", title: "Erreur lors de la duplication" });
    } finally {
      setIsMutating(false);
    }
  }, [tenantId, vacations, buildVacationFingerprint, isAbsenceVacation, mutate, toast]);

  const publishRange = useCallback(async (from: string, to: string) => {
    if (!tenantId) return;
    setIsMutating(true);
    try {
      const dFrom = new Date(from);
      const dTo = new Date(to);
      const toPublish = vacations.filter(v => {
        if (!v.startAtIso || getVacationPublicationStatus(v) === "published") return false;
        const d = new Date(v.startAtIso);
        return d >= dFrom && d < dTo;
      });

      if (toPublish.length === 0) {
        toast({ title: "Publication", description: "Aucune nouvelle mission à publiér sur cette plage." });
        return;
      }

      const operations = toPublish.map(v => ({
        type: "update",
        id: v.id,
        data: { isPublished: true }
      }));

      await apiFetch<any>("/api/vacations/bulk", {
        method: "POST",
        body: { operations }
      });

      toast({ title: "Planning publié", description: `${operations.length} missions sont maintenant visibles par les agents.` });
      await mutate();
    } catch (e) {
      toast({ variant: "destructive", title: "Erreur lors de la publication" });
    } finally {
      setIsMutating(false);
    }
  }, [tenantId, vacations, mutate, toast]);

  const bulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setIsMutating(true);
    try {
      const newVacs = vacations.filter(v => !selectedIds.has(v.id));
      const operations = ids.map(id => ({ type: "delete", id }));

      mutate(newVacs, false);

      await apiFetch<any>("/api/vacations/bulk", {
         method: "POST",
         body: { operations }
      });

      toast({ title: "Missions Supprimées", description: `${ids.length} missions retirées du planning.` });
      clearSelection();
      await mutate();
    } catch (e) {
      toast({ variant: "destructive", title: "Erreur Suppression" });
    } finally {
      setIsMutating(false);
    }
  }, [selectedIds, vacations, mutate, toast, clearSelection]);

  const value: PlanningContextType = {
    vacations, filteredVacations, sites, agents, loading, sitesLoading, agentsLoading,
    mode, setMode, viewDensity, setViewDensity, siteId, setSiteId, agentId, setAgentId, range, setRange, stats, conflictIndex,
    tensionMode, setTensionMode, selectedIds, setSelectedIds, clearSelection,
    showAbsences, setShowAbsences,
    publicationFilter, setPublicationFilter,
    createOpen, setCreateOpen, detailsOpen, setDétailsOpen, assignOpen, setAssignOpen,
    replaceOpen, setReplaceOpen, insightsOpen, setInsightsOpen, propagationOpen, setPropagationOpen,
    weekPropagationOpen, setWeekPropagationOpen, siteTemplateOpen, setSiteTemplateOpen,
    validationOpen, setValidationOpen, dispatchOpen, setDispatchOpen,
    siteDispatchOpen, setSiteDispatchOpen, coverageOpen, setCoverageOpen,
    distributionOpen, setDistributionOpen,
    activeVacationId, setActiveVacationId, activeVacation,
    refresh, createVacation, updateVacation, deleteVacation, closeVacation, ops,
    pasteMode, setPasteMode, pasteBusy, handleCopy, handleStartPaste, handleCancelPaste, performPasteAt,
    duplicateVacation, propagateActiveVacation, propagateWeekPlan, magicFill, bulkAssign, bulkDelete, duplicateWeek, publishRange,
    initialCreateData, setInitialCreateData,
    deleteConfirmOpen, setDeleteConfirmOpen, idsToDelete, setIdsToDelete,
    sortByUrgency, setSortByUrgency,
  };

  return (
    <PlanningContext.Provider value={value}>
      {children}
      <DeleteConfirmDialog />
    </PlanningContext.Provider>
  );
};
