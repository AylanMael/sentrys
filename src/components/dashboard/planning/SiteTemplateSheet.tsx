"use client";

import React from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  ClipboardCheck,
  CopyPlus,
  Loader2,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { usePlanning } from "./PlanningContext";
import { apiFetch } from "@/lib/api/client-fetch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { MISSION_TYPE_OPTIONS } from "@/lib/planning/mission-types";
import {
  addWeeks,
  buildDateRangeForTemplateEntry,
  buildDateRangeFromWeekStart,
  buildHalfHourTimeOptions,
  buildTemplateFingerprint,
  getWeekStartMonday,
  matchesTemplateDay,
  normalizeSitePlanningTemplateEntry,
  SITE_TEMPLATE_DAY_OPTIONS,
  type SitePlanningTemplate,
  type SitePlanningTemplateEntry,
} from "@/lib/planning/site-templates";

type GénérationTarget = "visible_period" | "next_week" | "next_month";

type GénérationOperation = {
  type: "create";
  data: Record<string, unknown>;
  sourceEntryIndex: number;
  sourceEntrySignature: string;
};

interface GénérationConflict {
  operationIndex: number;
  agentId: string;
  agentName: string;
  startAt: string;
  endAt: string;
  reason: string;
}

interface GénérationResult {
  createdCount: number;
  assignedCount: number;
  openCount: number;
  skippedCount: number;
  conflictSkippedCount: number;
  targetLabel: string;
  siteName: string;
  safeOnly: boolean;
}

interface ConflictResolutionSuggestion {
  conflict: GénérationConflict;
  sourceEntryIndex: number;
  sourceEntrySignature: string;
  replacementAgentId: string | null;
  replacementAgentName: string | null;
  replacementReason: string;
}

const GENERATION_TARGETS: Array<{
  value: GénérationTarget;
  title: string;
  description: string;
}> = [
  {
    value: "visible_period",
    title: "Periode visible",
    description: "Projette le planning type sur toute la plage actuellement affichee.",
  },
  {
    value: "next_week",
    title: "Semaine prochaine",
    description: "Genere directement la semaine suivante a partir du modèle.",
  },
  {
    value: "next_month",
    title: "Mois prochain",
    description: "Reconstruit tout le mois prochain en reprenant le planning type du site.",
  },
];

const TIME_OPTIONS = buildHalfHourTimeOptions();

const ASSISTANT_STEPS = [
  {
    key: "site",
    title: "1. Site",
    description: "Choisir le périmètre a remplir.",
  },
  {
    key: "model",
    title: "2. Modèle",
    description: "Definir les jours et horaires reçurrents.",
  },
  {
    key: "agents",
    title: "3. Agents",
    description: "Preaffecter les agents habituels.",
  },
  {
    key: "control",
    title: "4. Contrôle",
    description: "Vérifier, puis générér sans conflit.",
  },
] as const;

function createEmptyEntry(dayOfWeek = 1): SitePlanningTemplateEntry {
  return {
    dayOfWeek: dayOfWeek as SitePlanningTemplateEntry["dayOfWeek"],
    startTime: "08:00",
    endTime: "18:00",
    missionType: "ADS",
    title: null,
    requiredQualification: null,
    assignedAgentId: null,
    notes: null,
  };
}

function createWeekdayPreset() {
  return [1, 2, 3, 4, 5].map((dayOfWeek) => createEmptyEntry(dayOfWeek));
}

function cloneEntryForDay(
  entry: SitePlanningTemplateEntry,
  dayOfWeek: number
): SitePlanningTemplateEntry {
  return {
    ...entry,
    dayOfWeek: dayOfWeek as SitePlanningTemplateEntry["dayOfWeek"],
  };
}

function buildEntrySignature(entry: SitePlanningTemplateEntry) {
  return [
    entry.dayOfWeek,
    entry.startTime,
    entry.endTime,
    entry.missionType ?? "",
    entry.title ?? "",
    entry.requiredQualification ?? "",
    entry.assignedAgentId ?? "",
  ].join("::");
}

function getOperationString(
  operation: GénérationOperation | undefined,
  key: string
) {
  const value = operation?.data[key];
  return typeof value === "string" ? value : "";
}

function getOperationAssignedAgentId(operation: GénérationOperation | undefined) {
  const assigned = operation?.data.assignedAgentIds;
  if (!Array.isArray(assigned) || assigned.length === 0) return null;
  const [agentId] = assigned;
  return typeof agentId === "string" && agentId ? agentId : null;
}

function intervalsOverlap(
  aStart: string | null | undefined,
  aEnd: string | null | undefined,
  bStart: string | null | undefined,
  bEnd: string | null | undefined
) {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  const startA = Date.parse(aStart);
  const endA = Date.parse(aEnd);
  const startB = Date.parse(bStart);
  const endB = Date.parse(bEnd);

  if (
    !Number.isFinite(startA) ||
    !Number.isFinite(endA) ||
    !Number.isFinite(startB) ||
    !Number.isFinite(endB)
  ) {
    return false;
  }

  return startA < endB && endA > startB;
}

function normalizeSearchText(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export const SiteTemplateSheet: React.FC = () => {
  const {
    siteTemplateOpen,
    setSiteTemplateOpen,
    sites,
    agents,
    siteId: planningSiteFilter,
    setSiteId,
    setAgentId,
    setMode,
    range,
    vacations,
    refresh,
  } = usePlanning();
  const { toast } = useToast();

  const [templates, setTemplates] = React.useState<SitePlanningTemplate[]>([]);
  const [selectedSiteId, setSelectedSiteId] = React.useState("");
  const [templateId, setTemplateId] = React.useState<string | null>(null);
  const [templateName, setTemplateName] = React.useState("");
  const [entries, setEntries] = React.useState<SitePlanningTemplateEntry[]>([
    createEmptyEntry(),
  ]);
  const [target, setTarget] = React.useState<GénérationTarget>("visible_period");
  const [bulkAgentId, setBulkAgentId] = React.useState("__none");
  const [skipDuplicates, setSkipDuplicates] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [lastGénérationResult, setLastGénérationResult] =
    React.useState<GénérationResult | null>(null);
  const initializedRef = React.useRef(false);

  const agentLabel = React.useCallback(
    (agentId: string | null | undefined) => {
      const agent = agents.find((entry) => entry.id === agentId);
      if (!agent) return null;

      const firstName = String(agent.firstName ?? "").trim();
      const lastName = String(agent.lastName ?? "").trim();
      const fullName = `${firstName} ${lastName}`.trim();

      return fullName || agent.email || agent.phone || agent.id;
    },
    [agents]
  );

  const hydrateForm = React.useCallback(
    (nextSiteId: string, availableTemplates: SitePlanningTemplate[]) => {
      const template = availableTemplates.find(
        (entry) => entry.siteId === nextSiteId
      );
      const site = sites.find((entry) => entry.id === nextSiteId);

      setSelectedSiteId(nextSiteId);
      setTemplateId(template?.id ?? null);
      setTemplateName(
        template?.name ?? (site ? `Planning type - ${site.name}` : "Planning type")
      );
      setEntries(
        template?.entries?.length
          ? template.entries
          : [createEmptyEntry()]
      );
    },
    [sites]
  );

  const loadTemplates = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch<{
        ok: boolean;
        templates?: SitePlanningTemplate[];
        error?: string;
      }>("/api/planning-templates");

      const nextTemplates = Array.isArray(response?.templates)
        ? response.templates
        : [];

      setTemplates(nextTemplates);

      const preferredSiteId =
        planningSiteFilter !== "all"
          ? planningSiteFilter
          : sites[0]?.id ?? "";

      if (preferredSiteId) {
        hydrateForm(preferredSiteId, nextTemplates);
      } else {
        setSelectedSiteId("");
        setTemplateId(null);
        setTemplateName("Planning type");
        setEntries([createEmptyEntry()]);
      }

      initializedRef.current = true;
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description:
          error instanceof Error
            ? error.message
            : "Impossible de charger les plannings types.",
      });
    } finally {
      setLoading(false);
    }
  }, [hydrateForm, planningSiteFilter, sites, toast]);

  React.useEffect(() => {
    if (!siteTemplateOpen) {
      initializedRef.current = false;
      setLastGénérationResult(null);
      return;
    }

    void loadTemplates();
  }, [loadTemplates, siteTemplateOpen]);

  const handleSiteChange = React.useCallback(
    (nextSiteId: string) => {
      setLastGénérationResult(null);
      hydrateForm(nextSiteId, templates);
    },
    [hydrateForm, templates]
  );

  const updateEntry = React.useCallback(
    (
      index: number,
      patch: Partial<SitePlanningTemplateEntry>
    ) => {
      setLastGénérationResult(null);
      setEntries((current) =>
        current.map((entry, entryIndex) =>
          entryIndex === index ? { ...entry, ...patch } : entry
        )
      );
    },
    []
  );

  const addEntry = React.useCallback(() => {
    setLastGénérationResult(null);
    setEntries((current) => [...current, createEmptyEntry()]);
  }, []);

  const duplicateEntry = React.useCallback((index: number) => {
    setLastGénérationResult(null);
    setEntries((current) => {
      const source = current[index];
      if (!source) return current;
      return [...current, { ...source }];
    });
  }, []);

  const duplicateEntryToWeekdays = React.useCallback(
    (index: number) => {
      setLastGénérationResult(null);
      setEntries((current) => {
        const source = current[index];
        if (!source) return current;

        const existingSignatures = new Set(current.map(buildEntrySignature));
        const additions = [1, 2, 3, 4, 5]
          .map((dayOfWeek) => cloneEntryForDay(source, dayOfWeek))
          .filter((entry) => {
            const signature = buildEntrySignature(entry);
            if (existingSignatures.has(signature)) return false;
            existingSignatures.add(signature);
            return true;
          });

        return additions.length > 0 ? [...current, ...additions] : current;
      });

      toast({
        title: "Ligne propagee",
        description:
          "La ligne a été copiee sur les jours ouvrés manquants, sans doublon identique.",
      });
    },
    [toast]
  );

  const removeEntry = React.useCallback((index: number) => {
    setLastGénérationResult(null);
    setEntries((current) =>
      current.length <= 1
        ? [createEmptyEntry()]
        : current.filter((_, entryIndex) => entryIndex !== index)
    );
  }, []);

  const applyAgentToAllEntries = React.useCallback(() => {
    const assignedAgentId = bulkAgentId === "__none" ? null : bulkAgentId;

    setLastGénérationResult(null);
    setEntries((current) =>
      current.map((entry) => ({
        ...entry,
        assignedAgentId,
      }))
    );

    toast({
      title: assignedAgentId ? "Agent applique" : "Affectations retirees",
      description: assignedAgentId
        ? "Le meme agent est maintenant preaffecte sur toutes les lignes du modèle."
        : "Toutes les lignes du modèle repassent en vacations a pourvoir.",
    });
  }, [bulkAgentId, toast]);

  const loadWeekdayPreset = React.useCallback(() => {
    const preset = createWeekdayPreset();
    setLastGénérationResult(null);
    setEntries(preset);
    toast({
      title: "Modèle charge",
      description:
        "Le standard Lun-Ven 08:00-18:00 est prêt. Tu peux affecter un agent, puis générér le planning.",
    });
  }, [toast]);

  const sanitizeEntries = React.useCallback(() => {
    const normalized = entries
      .map((entry) => normalizeSitePlanningTemplateEntry(entry))
      .filter((entry): entry is SitePlanningTemplateEntry => Boolean(entry));

    if (!selectedSiteId) {
      toast({
        variant: "destructive",
        title: "Site requis",
        description: "Choisis d&apos;abord le site pour lequel enregistrer le planning type.",
      });
      return null;
    }

    if (normalized.length === 0) {
      toast({
        variant: "destructive",
        title: "Planning type incomplet",
        description:
          "Ajoute au moins une ligne valide avec un jour et une plage horaire exploitable.",
      });
      return null;
    }

    return normalized;
  }, [entries, selectedSiteId, toast]);

  const saveTemplate = React.useCallback(
    async (quiet = false) => {
      const normalizedEntries = sanitizeEntries();
      if (!normalizedEntries) return null;

      const site = sites.find((entry) => entry.id === selectedSiteId);

      setSaving(true);
      try {
        const response = await apiFetch<{
          ok: boolean;
          template?: SitePlanningTemplate;
          error?: string;
        }>("/api/planning-templates", {
          method: "POST",
          body: {
            id: templateId ?? undefined,
            siteId: selectedSiteId,
            siteName: site?.name ?? null,
            name: templateName.trim() || (site ? `Planning type - ${site.name}` : "Planning type"),
            entries: normalizedEntries,
          },
        });

        if (!response?.ok || !response.template) {
          throw new Error(response?.error || "Impossible d'enregistrer le template.");
        }

        setTemplateId(response.template.id);
        setTemplateName(response.template.name);
        setTemplates((current) => {
          const remaining = current.filter(
            (entry) => entry.siteId !== response.template!.siteId
          );
          return [...remaining, response.template!];
        });

        if (!quiet) {
          toast({
            title: "Planning type enregistre",
            description: "Le modèle du site est prêt a être reutilisé.",
          });
        }

        return response.template;
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Erreur",
          description:
            error instanceof Error
              ? error.message
              : "Impossible d'enregistrer le planning type.",
        });
        return null;
      } finally {
        setSaving(false);
      }
    },
    [sanitizeEntries, selectedSiteId, sites, templateId, templateName, toast]
  );

  const buildOperationsFromEntries = React.useCallback(
    (
      normalizedEntries: SitePlanningTemplateEntry[],
      siteName: string | null
    ) => {
      const anchorDate = range?.from ? new Date(range.from) : new Date();
      const visibleWeekStart = getWeekStartMonday(anchorDate);

      const existingFingerprints = new Set(
        vacations.map((vacation) =>
          buildTemplateFingerprint(
            vacation.siteId,
            vacation.startAtIso,
            vacation.endAtIso,
            vacation.title
          )
        )
      );

      const operations: GénérationOperation[] = [];
      let skipped = 0;

      const pushOperation = (
        entry: SitePlanningTemplateEntry,
        start: Date,
        end: Date,
        sourceEntryIndex: number
      ) => {
        const fingerprint = buildTemplateFingerprint(
          selectedSiteId,
          start.toISOString(),
          end.toISOString(),
          entry.title
        );

        if (skipDuplicates && existingFingerprints.has(fingerprint)) {
          skipped += 1;
          return;
        }

        existingFingerprints.add(fingerprint);
        operations.push({
          type: "create",
          sourceEntryIndex,
          sourceEntrySignature: buildEntrySignature(entry),
          data: {
            siteId: selectedSiteId,
            siteName,
            title: entry.title,
            missionType: entry.missionType,
            requiredQualification: entry.requiredQualification,
            notes: entry.notes,
            startAt: start.toISOString(),
            endAt: end.toISOString(),
            assignedAgentIds: entry.assignedAgentId ? [entry.assignedAgentId] : [],
          },
        });
      };

      if (target === "visible_period") {
        const visibleStart = range?.from ? new Date(range.from) : visibleWeekStart;
        const visibleEnd = range?.to ? new Date(range.to) : addWeeks(visibleWeekStart, 1);

        for (
          let cursor = new Date(visibleStart);
          cursor < visibleEnd;
          cursor.setDate(cursor.getDate() + 1)
        ) {
          normalizedEntries.forEach((entry, entryIndex) => {
            if (!matchesTemplateDay(cursor, entry.dayOfWeek)) return;
            const { start, end } = buildDateRangeForTemplateEntry(
              new Date(cursor),
              entry
            );
            pushOperation(entry, start, end, entryIndex);
          });
        }
      } else if (target === "next_week") {
        const weekStart = addWeeks(visibleWeekStart, 1);

        normalizedEntries.forEach((entry, entryIndex) => {
          const { start, end } = buildDateRangeFromWeekStart(weekStart, entry);
          pushOperation(entry, start, end, entryIndex);
        });
      } else {
        const nextMonthAnchor = new Date(
          anchorDate.getFullYear(),
          anchorDate.getMonth() + 1,
          1
        );
        const monthStart = new Date(
          nextMonthAnchor.getFullYear(),
          nextMonthAnchor.getMonth(),
          1
        );
        const monthEnd = new Date(
          nextMonthAnchor.getFullYear(),
          nextMonthAnchor.getMonth() + 1,
          0
        );

        for (
          let cursor = new Date(monthStart);
          cursor <= monthEnd;
          cursor.setDate(cursor.getDate() + 1)
        ) {
          normalizedEntries.forEach((entry, entryIndex) => {
            if (!matchesTemplateDay(cursor, entry.dayOfWeek)) return;
            const { start, end } = buildDateRangeForTemplateEntry(
              new Date(cursor),
              entry
            );
            pushOperation(entry, start, end, entryIndex);
          });
        }
      }

      return { operations, skipped };
    },
    [range?.from, range?.to, selectedSiteId, skipDuplicates, target, vacations]
  );

  const analyzeOperationConflicts = React.useCallback(
    (operations: GénérationOperation[]) => {
      const conflicts: GénérationConflict[] = [];
      const generatedByAgent = new Map<
        string,
        Array<{ startAt: string; endAt: string; operationIndex: number }>
      >();

      operations.forEach((operation, operationIndex) => {
        const assigned = operation.data.assignedAgentIds;
        if (!Array.isArray(assigned) || assigned.length === 0) return;

        const agentId = String(assigned[0] ?? "");
        const startAt = String(operation.data.startAt ?? "");
        const endAt = String(operation.data.endAt ?? "");
        const startMs = Date.parse(startAt);
        const endMs = Date.parse(endAt);
        const agentName = agentLabel(agentId) ?? "Agent inconnu";

        if (!agentId || !Number.isFinite(startMs) || !Number.isFinite(endMs)) return;

        const existingConflict = vacations.find((vacation) => {
          if (!vacation.startAtIso || !vacation.endAtIso) return false;
          if (!vacation.assignedAgentIds?.includes(agentId)) return false;

          const existingStart = Date.parse(vacation.startAtIso);
          const existingEnd = Date.parse(vacation.endAtIso);
          return startMs < existingEnd && endMs > existingStart;
        });

        if (existingConflict) {
          conflicts.push({
            operationIndex,
            agentId,
            agentName,
            startAt,
            endAt,
            reason: `Chevauchement avec ${existingConflict.siteName || existingConflict.title || "une vacation existante"}`,
          });
        }

        const generatedItems = generatedByAgent.get(agentId) ?? [];
        const internalConflict = generatedItems.find((item) => {
          const generatedStart = Date.parse(item.startAt);
          const generatedEnd = Date.parse(item.endAt);
          return startMs < generatedEnd && endMs > generatedStart;
        });

        if (internalConflict) {
          conflicts.push({
            operationIndex,
            agentId,
            agentName,
            startAt,
            endAt,
            reason: "Chevauchement avec une autre ligne du modèle",
          });
          conflicts.push({
            operationIndex: internalConflict.operationIndex,
            agentId,
            agentName,
            startAt: internalConflict.startAt,
            endAt: internalConflict.endAt,
            reason: "Chevauchement avec une autre ligne du modèle",
          });
        }

        generatedItems.push({ startAt, endAt, operationIndex });
        generatedByAgent.set(agentId, generatedItems);
      });

      return conflicts;
    },
    [agentLabel, vacations]
  );

  const previewEntries = React.useMemo(
    () =>
      entries
        .map((entry) => normalizeSitePlanningTemplateEntry(entry))
        .filter((entry): entry is SitePlanningTemplateEntry => Boolean(entry)),
    [entries]
  );

  const générationPreview = React.useMemo(() => {
    if (!selectedSiteId || previewEntries.length === 0) {
      return {
        operations: [] as GénérationOperation[],
        skipped: 0,
        assignedCount: 0,
        openCount: 0,
        conflicts: [] as GénérationConflict[],
      };
    }

    const site = sites.find((entry) => entry.id === selectedSiteId);
    const { operations, skipped } = buildOperationsFromEntries(
      previewEntries,
      site?.name ?? null
    );

    const assignedCount = operations.filter((operation) => {
      const assigned = operation.data.assignedAgentIds;
      return Array.isArray(assigned) && assigned.length > 0;
    }).length;

    const conflicts = analyzeOperationConflicts(operations);

    return {
      operations,
      skipped,
      assignedCount,
      openCount: operations.length - assignedCount,
      conflicts,
    };
  }, [
    analyzeOperationConflicts,
    buildOperationsFromEntries,
    previewEntries,
    selectedSiteId,
    sites,
  ]);

  const previewTargetLabel = React.useMemo(() => {
    const option = GENERATION_TARGETS.find((entry) => entry.value === target);
    return option?.title ?? "Periode visible";
  }, [target]);

  const previewAgents = React.useMemo(() => {
    const unique = new Map<string, string>();

    entries.forEach((entry) => {
      if (!entry.assignedAgentId) return;
      unique.set(
        entry.assignedAgentId,
        agentLabel(entry.assignedAgentId) ?? "Agent inconnu"
      );
    });

    return Array.from(unique.values());
  }, [agentLabel, entries]);

  const selectedSite = React.useMemo(
    () => sites.find((entry) => entry.id === selectedSiteId) ?? null,
    [selectedSiteId, sites]
  );

  const assignedLineCount = React.useMemo(
    () => previewEntries.filter((entry) => Boolean(entry.assignedAgentId)).length,
    [previewEntries]
  );

  const conflictOperationCount = React.useMemo(
    () =>
      new Set(
        générationPreview.conflicts.map((conflict) => conflict.operationIndex)
      ).size,
    [générationPreview.conflicts]
  );

  const safeOperationCount = Math.max(
    générationPreview.operations.length - conflictOperationCount,
    0
  );
  const hasModelLines = previewEntries.length > 0;
  const hasAssignedAgents = assignedLineCount > 0;
  const allLinesAssigned =
    hasModelLines && assignedLineCount === previewEntries.length;

  const assistantStepState = {
    site: Boolean(selectedSiteId),
    model: hasModelLines,
    agents: allLinesAssigned,
    control:
      générationPreview.operations.length > 0 &&
      générationPreview.conflicts.length === 0,
  };

  const assistantNextAction = React.useMemo(() => {
    if (!selectedSiteId) {
      return {
        title: "Commence par choisir le site.",
        description:
          "Le planning type est toujours rattaché a un site opérationnel.",
      };
    }

    if (!hasModelLines || previewEntries.length < 5) {
      return {
        title: "Charge une semaine standard.",
        description:
          "Le modèle Lun-Ven 08:00-18:00 couvre la majorite des sites simples.",
      };
    }

    if (!hasAssignedAgents) {
      return {
        title: "Affecte les agents habituels si tu les connais.",
        description:
          "Sinon, tu peux générér des vacations a pourvoir et les distribuer ensuite.",
      };
    }

    if (générationPreview.conflicts.length > 0) {
      return {
        title: "Des conflits sont détectés.",
        description:
          "Utilise le mode sans conflits pour créer uniquement les vacations propres.",
      };
    }

    return {
      title: "Tout est prêt pour remplir le planning.",
      description:
        "Verifie la période cible, puis lance la génération en confiance.",
    };
  }, [
    générationPreview.conflicts.length,
    hasAssignedAgents,
    hasModelLines,
    previewEntries.length,
    selectedSiteId,
  ]);

  const conflictResolutionSuggestions = React.useMemo(() => {
    if (générationPreview.conflicts.length === 0) {
      return [] as ConflictResolutionSuggestion[];
    }

    const uniqueConflicts = new Map<number, GénérationConflict>();
    générationPreview.conflicts.forEach((conflict) => {
      if (!uniqueConflicts.has(conflict.operationIndex)) {
        uniqueConflicts.set(conflict.operationIndex, conflict);
      }
    });

    const activeAgents = agents.filter(
      (agent) => String(agent.status ?? "active").toLowerCase() === "active"
    );

    return Array.from(uniqueConflicts.values()).map((conflict) => {
      const operation = générationPreview.operations[conflict.operationIndex];
      const currentAgentId = getOperationAssignedAgentId(operation);
      const startAt = getOperationString(operation, "startAt");
      const endAt = getOperationString(operation, "endAt");
      const qualification = normalizeSearchText(
        getOperationString(operation, "requiredQualification")
      );

      const candidates = activeAgents
        .filter((agent) => {
          if (!operation || agent.id === currentAgentId) return false;

          if (qualification) {
            const qualifications = Array.isArray(agent.qualifications)
              ? agent.qualifications
              : [];
            const hasQualification = qualifications.some((item) => {
              const normalized = normalizeSearchText(item);
              return (
                normalized === qualification ||
                normalized.includes(qualification) ||
                qualification.includes(normalized)
              );
            });
            if (!hasQualification) return false;
          }

          const existingConflict = vacations.some((vacation) => {
            if (vacation.status === "cancelled" || vacation.status === "closed") {
              return false;
            }
            if (!vacation.assignedAgentIds?.includes(agent.id)) return false;
            return intervalsOverlap(
              startAt,
              endAt,
              vacation.startAtIso,
              vacation.endAtIso
            );
          });

          if (existingConflict) return false;

          return !générationPreview.operations.some((otherOperation, index) => {
            if (index === conflict.operationIndex) return false;
            if (getOperationAssignedAgentId(otherOperation) !== agent.id) {
              return false;
            }
            return intervalsOverlap(
              startAt,
              endAt,
              getOperationString(otherOperation, "startAt"),
              getOperationString(otherOperation, "endAt")
            );
          });
        })
        .sort((left, right) => {
          const leftHours = Number(left.monthlyContractHours ?? 151.67);
          const rightHours = Number(right.monthlyContractHours ?? 151.67);
          if (leftHours !== rightHours) return leftHours - rightHours;

          return (agentLabel(left.id) ?? left.id).localeCompare(
            agentLabel(right.id) ?? right.id
          );
        });

      const replacement = candidates[0] ?? null;

      return {
        conflict,
        sourceEntryIndex: operation?.sourceEntryIndex ?? 0,
        sourceEntrySignature: operation?.sourceEntrySignature ?? "",
        replacementAgentId: replacement?.id ?? null,
        replacementAgentName: replacement ? agentLabel(replacement.id) : null,
        replacementReason: replacement
          ? qualification
            ? "Disponible et qualification compatible sur ce creneau."
            : "Disponible sur ce creneau, sans chevauchement connu."
          : "Aucun agent compatible libre détecté automatiquement.",
      };
    });
  }, [
    agentLabel,
    agents,
    générationPreview.conflicts,
    générationPreview.operations,
    vacations,
  ]);

  const applyConflictSuggestion = React.useCallback(
    (suggestion: ConflictResolutionSuggestion) => {
      if (!suggestion.replacementAgentId) return;

      setLastGénérationResult(null);
      setEntries((current) => {
        const indexFromSignature = current.findIndex(
          (entry) => buildEntrySignature(entry) === suggestion.sourceEntrySignature
        );
        const indexToUpdate =
          indexFromSignature >= 0
            ? indexFromSignature
            : suggestion.sourceEntryIndex;

        if (!current[indexToUpdate]) return current;

        return current.map((entry, index) =>
          index === indexToUpdate
            ? { ...entry, assignedAgentId: suggestion.replacementAgentId }
            : entry
        );
      });

      toast({
        title: "Remplacant applique",
        description: `${suggestion.replacementAgentName} est maintenant prevu sur cette ligne du modèle.`,
      });
    },
    [toast]
  );

  const generateFromEntries = React.useCallback(
    async (
      normalizedEntries: SitePlanningTemplateEntry[],
      siteName: string | null,
      options: { safeOnly?: boolean } = {}
    ) => {
      const { operations, skipped } = buildOperationsFromEntries(
        normalizedEntries,
        siteName
      );
      const conflicts = analyzeOperationConflicts(operations);
      const conflictIndexes = new Set(
        conflicts.map((conflict) => conflict.operationIndex)
      );
      const finalOperations = options.safeOnly
        ? operations.filter((_, index) => !conflictIndexes.has(index))
        : operations;
      const conflictSkipped = operations.length - finalOperations.length;
      const assignedCreated = finalOperations.filter((operation) => {
        const assigned = operation.data.assignedAgentIds;
        return Array.isArray(assigned) && assigned.length > 0;
      }).length;
      const openCreated = finalOperations.length - assignedCreated;

      if (finalOperations.length === 0) {
        toast({
          title: options.safeOnly ? "Aucune vacation sure" : "Aucune création",
          description: options.safeOnly
            ? "Toutes les vacations preaffectees ont un conflit. Corrige les agents ou généré en mode manuel."
            : skipped > 0
              ? "Tout existe deja sur la période cible."
              : "Le planning type ne produit aucune vacation sur cette période.",
        });
        return false;
      }

      setGenerating(true);
      try {
        const response = await apiFetch<{ ok: boolean; error?: string }>(
          "/api/vacations/bulk",
          {
            method: "POST",
            body: { operations: finalOperations },
          }
        );

        if (!response?.ok) {
          throw new Error(response?.error || "Impossible de générér le planning.");
        }

        await refresh();
        setMode("site");
        setAgentId("all");
        setSiteId(selectedSiteId);
        setLastGénérationResult({
          createdCount: finalOperations.length,
          assignedCount: assignedCreated,
          openCount: openCreated,
          skippedCount: skipped,
          conflictSkippedCount: conflictSkipped,
          targetLabel: previewTargetLabel,
          siteName: siteName || "Site selectionne",
          safeOnly: Boolean(options.safeOnly),
        });
        toast({
          title: options.safeOnly ? "Vacations sures générées" : "Planning généré",
          description: [
            `${finalOperations.length} vacation(s) créées`,
            skipped > 0 ? `${skipped} doublon(s) ignore(s)` : null,
            conflictSkipped > 0
              ? `${conflictSkipped} conflit(s) laisse(s) à arbitrer`
              : null,
          ]
            .filter(Boolean)
            .join(", ") + ".",
        });
        return true;
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Erreur",
          description:
            error instanceof Error
              ? error.message
              : "Impossible de générér le planning type.",
        });
        return false;
      } finally {
        setGenerating(false);
      }
    },
    [
      buildOperationsFromEntries,
      analyzeOperationConflicts,
      refresh,
      selectedSiteId,
      setAgentId,
      setMode,
      setSiteId,
      previewTargetLabel,
      toast,
    ]
  );

  const generateFromTemplate = React.useCallback(async () => {
    const normalizedEntries = sanitizeEntries();
    if (!normalizedEntries) return;

    const savedTemplate = await saveTemplate(true);
    if (!savedTemplate) return;

    const site = sites.find((entry) => entry.id === selectedSiteId);

    await generateFromEntries(
      normalizedEntries,
      site?.name ?? savedTemplate.siteName ?? null
    );
  }, [
    generateFromEntries,
    sanitizeEntries,
    saveTemplate,
    selectedSiteId,
    sites,
  ]);

  const applyWeekdayPreset = React.useCallback(async () => {
    const preset = createWeekdayPreset();
    setLastGénérationResult(null);
    setEntries(preset);

    if (!selectedSiteId) {
      toast({
        title: "Modèle charge",
        description:
          "Le standard Lun-Ven 08:00-18:00 a été charge dans le panneau. Choisis un site puis généré le planning.",
      });
      return;
    }

    const site = sites.find((entry) => entry.id === selectedSiteId);
    const response = await apiFetch<{
      ok: boolean;
      template?: SitePlanningTemplate;
      error?: string;
    }>("/api/planning-templates", {
      method: "POST",
      body: {
        id: templateId ?? undefined,
        siteId: selectedSiteId,
        siteName: site?.name ?? null,
        name: templateName.trim() || (site ? `Planning type - ${site.name}` : "Planning type"),
        entries: preset,
      },
    }).catch((error: unknown) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description:
          error instanceof Error
            ? error.message
            : "Impossible d'enregistrer le planning type rapide.",
      });
      return null;
    });

    if (!response?.ok || !response.template) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description:
          response?.error || "Impossible d'enregistrer le planning type rapide.",
      });
      return;
    }

    setTemplateId(response.template.id);
    setTemplateName(response.template.name);
    setTemplates((current) => {
      const remaining = current.filter(
        (entry) => entry.siteId !== response.template!.siteId
      );
      return [...remaining, response.template!];
    });

    await generateFromEntries(preset, site?.name ?? response.template.siteName ?? null);
  }, [
    generateFromEntries,
    selectedSiteId,
    sites,
    templateId,
    templateName,
    toast,
  ]);

  const generateSafeOnly = React.useCallback(async () => {
    const normalizedEntries = sanitizeEntries();
    if (!normalizedEntries) return;

    const savedTemplate = await saveTemplate(true);
    if (!savedTemplate) return;

    const site = sites.find((entry) => entry.id === selectedSiteId);

    await generateFromEntries(
      normalizedEntries,
      site?.name ?? savedTemplate.siteName ?? null,
      { safeOnly: true }
    );
  }, [
    generateFromEntries,
    sanitizeEntries,
    saveTemplate,
    selectedSiteId,
    sites,
  ]);

  const showGeneratedPlanning = React.useCallback(() => {
    setMode("site");
    setAgentId("all");
    if (selectedSiteId) {
      setSiteId(selectedSiteId);
    }
    setSiteTemplateOpen(false);
  }, [selectedSiteId, setAgentId, setMode, setSiteId, setSiteTemplateOpen]);

  const reviewOpenVacations = React.useCallback(() => {
    setMode("agent");
    setAgentId("all");
    if (selectedSiteId) {
      setSiteId(selectedSiteId);
    }
    setSiteTemplateOpen(false);
  }, [selectedSiteId, setAgentId, setMode, setSiteId, setSiteTemplateOpen]);

  return (
    <Sheet open={siteTemplateOpen} onOpenChange={setSiteTemplateOpen}>
      <SheetContent className="overflow-y-auto border-l bg-white shadow-2xl dark:bg-slate-950 sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-xl font-bold">
            <CalendarRange className="h-5 w-5 text-primary" />
            Planning type par site
          </SheetTitle>
          <SheetDescription>
            Definis la semaine standard d&apos;un site puis projette-la sans ressaisie
            sur la semaine visible, la semaine prochaine ou le mois prochain.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          <div className="overflow-hidden rounded-[1.75rem] border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-emerald-500/10 p-4 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
                    <ClipboardCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-primary">
                      Assistant exploitation
                    </p>
                    <h3 className="text-lg font-black text-foreground">
                      Remplir un site sans ressaisie.
                    </h3>
                  </div>
                </div>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  On avance dans l&apos;ordre : site, modèle, agents, controle.
                  L&apos;objectif est simple : créer vite, proprement, et laisser
                  les exceptions visibles au lieu de les cacher.
                </p>
              </div>

              <div className="rounded-2xl border border-border/50 bg-background/80 p-3 text-sm shadow-sm lg:w-[280px]">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  Prochaine action
                </p>
                <p className="mt-1 font-black text-foreground">
                  {assistantNextAction.title}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {assistantNextAction.description}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              {ASSISTANT_STEPS.map((step) => {
                const done = assistantStepState[step.key];
                const isWarning =
                  step.key === "control" && générationPreview.conflicts.length > 0;

                return (
                  <div
                    key={step.key}
                    className={cn(
                      "rounded-2xl border p-3 transition-all",
                      done
                        ? "border-emerald-500/30 bg-emerald-500/10"
                        : isWarning
                          ? "border-amber-500/30 bg-amber-500/10"
                          : "border-border/50 bg-background/70"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-foreground">
                        {step.title}
                      </p>
                      {done ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : isWarning ? (
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                      ) : (
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-border/50 bg-background/80 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                  Site
                </p>
                <p className="mt-1 truncate text-sm font-black text-foreground">
                  {selectedSite?.name ?? "A choisir"}
                </p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-background/80 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                  Modèle
                </p>
                <p className="mt-1 text-sm font-black text-foreground">
                  {previewEntries.length} ligne(s)
                </p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-background/80 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                  Agents
                </p>
                <p className="mt-1 text-sm font-black text-foreground">
                  {assignedLineCount}/{previewEntries.length || 0} affectee(s)
                </p>
              </div>
              <div
                className={cn(
                  "rounded-2xl border p-3",
                  générationPreview.conflicts.length > 0
                    ? "border-amber-500/30 bg-amber-500/10"
                    : "border-emerald-500/30 bg-emerald-500/10"
                )}
              >
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                  Génération sure
                </p>
                <p className="mt-1 text-sm font-black text-foreground">
                  {safeOperationCount}/{générationPreview.operations.length} propre(s)
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={loadWeekdayPreset}
                disabled={loading || saving || generating}
                className="rounded-xl bg-background/80 font-bold"
              >
                <CopyPlus className="mr-2 h-4 w-4" />
                Standard Lun-Ven
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={applyAgentToAllEntries}
                disabled={
                  loading ||
                  saving ||
                  generating ||
                  !hasModelLines ||
                  bulkAgentId === "__none"
                }
                className="rounded-xl bg-background/80 font-bold"
              >
                <Users className="mr-2 h-4 w-4" />
                Appliquer l&apos;agent choisi
              </Button>
              <Button
                type="button"
                onClick={() => {
                  void generateSafeOnly();
                }}
                disabled={
                  loading ||
                  saving ||
                  generating ||
                  générationPreview.operations.length === 0
                }
                className="rounded-xl font-black"
              >
                {generating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="mr-2 h-4 w-4" />
                )}
                Remplir sans conflits
              </Button>
            </div>
          </div>

          <div className="grid gap-4 rounded-2xl border border-border/50 bg-muted/20 p-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Site</Label>
              <Select
                value={selectedSiteId}
                onValueChange={handleSiteChange}
                disabled={loading}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Choisir un site" />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Nom du planning type</Label>
              <Input
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder="Ex : Boutique Opera - semaine standard"
                className="bg-background"
                disabled={loading}
              />
            </div>

            <div className="md:col-span-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={loadWeekdayPreset}
                disabled={loading || saving || generating}
              >
                <CopyPlus className="mr-2 h-4 w-4" />
                Charger le modèle Lun-Ven 08:00-18:00
              </Button>
              <Button
                type="button"
                onClick={() => {
                  void applyWeekdayPreset();
                }}
                disabled={loading || saving || generating}
              >
                {generating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CalendarRange className="mr-2 h-4 w-4" />
                )}
                Remplir directement Lun-Ven 08:00-18:00
              </Button>
              <p className="text-xs text-muted-foreground">
                Astuce : si l&apos;heure de fin passe avant le debut, la mission est
                automatiquement prolongee au lendemain.
              </p>
              <p className="text-xs text-muted-foreground">
                Tu peux preaffecter un agent sur chaque ligne pour générér un planning deja distribue.
              </p>
            </div>

            <div className="md:col-span-2 rounded-2xl border border-border/50 bg-background p-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <Label>Agent rapide pour tout le modèle</Label>
                  <Select value={bulkAgentId} onValueChange={setBulkAgentId}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Choisir un agent" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">A pourvoir sur toutes les lignes</SelectItem>
                      {agents.map((agent) => {
                        const label = agentLabel(agent.id);
                        if (!label) return null;
                        return (
                          <SelectItem key={agent.id} value={agent.id}>
                            {label}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Utile pour les boutiques ou sites fixes ou le meme agent revient souvent.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={applyAgentToAllEntries}
                  disabled={loading || saving || generating}
                  className="md:w-auto"
                >
                  Appliquer a toutes les lignes
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Lignes du planning type
                </h3>
                <p className="text-sm text-muted-foreground">
                  Une ligne = un poste reçurrent sur un jour donne.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={addEntry}>
                <Plus className="mr-2 h-4 w-4" />
                Ajouter une ligne
              </Button>
            </div>

            <div className="space-y-3">
              {entries.map((entry, index) => (
                <div
                  key={`template-entry-${index}`}
                  className="rounded-2xl border border-border/50 bg-background p-4 shadow-sm"
                >
                  <div className="grid gap-4 md:grid-cols-[0.95fr_0.75fr_0.75fr_1fr]">
                    <div className="space-y-2">
                      <Label>Jour</Label>
                      <Select
                        value={String(entry.dayOfWeek)}
                        onValueChange={(value) =>
                          updateEntry(index, {
                            dayOfWeek: Number(value) as SitePlanningTemplateEntry["dayOfWeek"],
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Jour" />
                        </SelectTrigger>
                        <SelectContent>
                          {SITE_TEMPLATE_DAY_OPTIONS.map((day) => (
                            <SelectItem key={day.value} value={String(day.value)}>
                              {day.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Debut</Label>
                      <Select
                        value={entry.startTime}
                        onValueChange={(value) =>
                          updateEntry(index, { startTime: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Heure de debut" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {TIME_OPTIONS.map((time) => (
                            <SelectItem key={`start-${index}-${time}`} value={time}>
                              {time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Fin</Label>
                      <Select
                        value={entry.endTime}
                        onValueChange={(value) =>
                          updateEntry(index, { endTime: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Heure de fin" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {TIME_OPTIONS.map((time) => (
                            <SelectItem key={`end-${index}-${time}`} value={time}>
                              {time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Type de mission</Label>
                      <Select
                        value={entry.missionType ?? "__none"}
                        onValueChange={(value) =>
                          updateEntry(index, {
                            missionType: value === "__none" ? null : value,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Poste type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">Sans type</SelectItem>
                          {MISSION_TYPE_OPTIONS.map((missionType) => (
                            <SelectItem key={missionType} value={missionType}>
                              {missionType}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-[1fr_0.9fr_1fr_auto]">
                    <div className="space-y-2">
                      <Label>Titre visible</Label>
                      <Input
                        value={entry.title ?? ""}
                        onChange={(event) =>
                          updateEntry(index, { title: event.target.value || null })
                        }
                        placeholder="Ex : surveillance galerie, ouverture magasin"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Qualification requise</Label>
                      <Input
                        value={entry.requiredQualification ?? ""}
                        onChange={(event) =>
                          updateEntry(index, {
                            requiredQualification: event.target.value || null,
                          })
                        }
                        placeholder="Ex : SSIAP 1, H0B0, SST"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Agent preaffecte</Label>
                      <Select
                        value={entry.assignedAgentId ?? "__none"}
                        onValueChange={(value) =>
                          updateEntry(index, {
                            assignedAgentId: value === "__none" ? null : value,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Laisser a pourvoir" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">A pourvoir</SelectItem>
                          {agents.map((agent) => {
                            const label = agentLabel(agent.id);
                            if (!label) return null;
                            return (
                              <SelectItem key={agent.id} value={agent.id}>
                                {label}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">
                        Laisse vide pour créer une vacation a pourvoir.
                      </p>
                    </div>

                    <div className="flex flex-col justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => duplicateEntry(index)}
                      >
                        <CopyPlus className="mr-2 h-4 w-4" />
                        Dupliquer
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => duplicateEntryToWeekdays(index)}
                      >
                        <CalendarRange className="mr-2 h-4 w-4" />
                        Copier Lun-Ven
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => removeEntry(index)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Retirer
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <Label>Consignes standard</Label>
                    <Textarea
                      value={entry.notes ?? ""}
                      onChange={(event) =>
                        updateEntry(index, { notes: event.target.value || null })
                      }
                      placeholder="Consignes reçurrentes, accès, matériel, point de passage..."
                      className="min-h-[84px]"
                    />
                  </div>
                  {entry.assignedAgentId && (
                    <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
                      Agent prevu sur cette ligne : {agentLabel(entry.assignedAgentId) || "Agent inconnu"}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
            <div className="mb-3">
              <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Projection
              </h3>
              <p className="text-sm text-muted-foreground">
                Enregistre le modèle puis généré directement les vacations sur la période cible.
              </p>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-border/50 bg-background p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  <CalendarRange className="h-4 w-4" />
                  Création
                </div>
                <p className="mt-2 text-2xl font-black text-foreground">
                  {générationPreview.operations.length}
                </p>
                <p className="text-xs text-muted-foreground">
                  vacation(s) sur {previewTargetLabel.toLowerCase()}
                </p>
              </div>

              <div className="rounded-2xl border border-border/50 bg-background p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  <Users className="h-4 w-4" />
                  Affectees
                </div>
                <p className="mt-2 text-2xl font-black text-emerald-600">
                  {générationPreview.assignedCount}
                </p>
                <p className="text-xs text-muted-foreground">
                  {générationPreview.openCount} restera/restent a pourvoir
                </p>
              </div>

              <div className="rounded-2xl border border-border/50 bg-background p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4" />
                  Doublons
                </div>
                <p className="mt-2 text-2xl font-black text-slate-700 dark:text-slate-200">
                  {générationPreview.skipped}
                </p>
                <p className="text-xs text-muted-foreground">
                  ignore(s) si deja presents
                </p>
              </div>

              <div
                className={`rounded-2xl border p-4 ${
                  générationPreview.conflicts.length > 0
                    ? "border-amber-500/30 bg-amber-500/10"
                    : "border-border/50 bg-background"
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  <AlertTriangle className="h-4 w-4" />
                  Conflits
                </div>
                <p
                  className={`mt-2 text-2xl font-black ${
                    générationPreview.conflicts.length > 0
                      ? "text-amber-700 dark:text-amber-300"
                      : "text-emerald-600"
                  }`}
                >
                  {générationPreview.conflicts.length}
                </p>
                <p className="text-xs text-muted-foreground">
                  chevauchement(s) agent détecté(s)
                </p>
              </div>
            </div>

            {(previewAgents.length > 0 || générationPreview.conflicts.length > 0) && (
              <div className="mb-4 rounded-2xl border border-border/50 bg-background p-4">
                {previewAgents.length > 0 && (
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                      Agents preaffectes dans ce modèle
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {previewAgents.map((agentName) => (
                        <span
                          key={agentName}
                          className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300"
                        >
                          {agentName}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {générationPreview.conflicts.length > 0 && (
                  <div className={previewAgents.length > 0 ? "mt-4" : ""}>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
                      Points à vérifier avant génération
                    </p>
                    <div className="mt-2 space-y-2">
                      {générationPreview.conflicts.slice(0, 4).map((conflict, index) => (
                        <div
                          key={`${conflict.agentId}-${conflict.startAt}-${index}`}
                          className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
                        >
                          <span className="font-bold">{conflict.agentName}</span>
                          {" - "}
                          {new Date(conflict.startAt).toLocaleDateString("fr-FR", {
                            weekday: "short",
                            day: "2-digit",
                            month: "2-digit",
                          })}
                          {" "}
                          {new Date(conflict.startAt).toLocaleTimeString("fr-FR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {" -> "}
                          {new Date(conflict.endAt).toLocaleTimeString("fr-FR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {" : "}
                          {conflict.reason}
                        </div>
                      ))}
                      {générationPreview.conflicts.length > 4 && (
                        <p className="text-xs font-semibold text-muted-foreground">
                          +{générationPreview.conflicts.length - 4} autre(s) conflit(s) potentiel(s).
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {conflictResolutionSuggestions.length > 0 && (
              <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
                      Assistant resolution des conflits
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Sentrys propose un remplacant libre pour les lignes qui
                      bloquent. Un clic applique le remplaçant sur la ligne du modèle.
                    </p>
                  </div>
                  <div className="rounded-full border border-amber-500/30 bg-background px-3 py-1 text-xs font-black text-amber-700 dark:text-amber-300">
                    {conflictResolutionSuggestions.length} piste(s)
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {conflictResolutionSuggestions.slice(0, 5).map((suggestion) => (
                    <div
                      key={`${suggestion.conflict.operationIndex}-${suggestion.conflict.agentId}`}
                      className="rounded-2xl border border-amber-500/20 bg-background/85 p-3"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-foreground">
                            {suggestion.conflict.agentName} bloqué le{" "}
                            {new Date(suggestion.conflict.startAt).toLocaleDateString("fr-FR", {
                              weekday: "short",
                              day: "2-digit",
                              month: "2-digit",
                            })}{" "}
                            {new Date(suggestion.conflict.startAt).toLocaleTimeString("fr-FR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {suggestion.conflict.reason}
                          </p>
                          <p
                            className={cn(
                              "mt-2 text-xs font-semibold",
                              suggestion.replacementAgentId
                                ? "text-emerald-700 dark:text-emerald-300"
                                : "text-amber-700 dark:text-amber-300"
                            )}
                          >
                            {suggestion.replacementAgentId
                              ? `${suggestion.replacementAgentName} propose - ${suggestion.replacementReason}`
                              : suggestion.replacementReason}
                          </p>
                        </div>

                        <Button
                          type="button"
                          variant={suggestion.replacementAgentId ? "default" : "outline"}
                          onClick={() => applyConflictSuggestion(suggestion)}
                          disabled={!suggestion.replacementAgentId || saving || generating}
                          className="shrink-0 rounded-xl font-bold"
                        >
                          <ShieldCheck className="mr-2 h-4 w-4" />
                          Appliquer ce remplacant
                        </Button>
                      </div>
                    </div>
                  ))}

                  {conflictResolutionSuggestions.length > 5 && (
                    <p className="text-xs font-semibold text-muted-foreground">
                      +{conflictResolutionSuggestions.length - 5} autre(s) conflit(s)
                      visible(s) dans la liste de controle.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="mb-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-black text-foreground">
                    Mode facile : créer seulement ce qui est propre
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Si des agents sont deja occupes, Sentrys peut générér les vacations sans conflit et te laisser seulement les cas à arbitrer.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void generateSafeOnly();
                  }}
                  disabled={
                    loading ||
                    saving ||
                    generating ||
                    générationPreview.operations.length === 0
                  }
                  className="shrink-0 border-primary/30 bg-background font-bold text-primary hover:bg-primary/10"
                >
                  {generating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  Generer sans conflits
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {GENERATION_TARGETS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setLastGénérationResult(null);
                    setTarget(option.value);
                  }}
                  className={`rounded-2xl border p-4 text-left transition-all ${
                    target === option.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border/50 bg-background hover:border-primary/30"
                  }`}
                >
                  <p className="font-semibold text-foreground">{option.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {option.description}
                  </p>
                </button>
              ))}
            </div>

            <div className="mt-4 flex items-start gap-3">
              <Checkbox
                id="skip-site-template-duplicates"
                checked={skipDuplicates}
                onCheckedChange={(checked) => setSkipDuplicates(Boolean(checked))}
              />
              <div className="space-y-1">
                <Label
                  htmlFor="skip-site-template-duplicates"
                  className="font-semibold"
                >
                  Ignorer les doublons
                </Label>
                <p className="text-xs text-muted-foreground">
                  Ne recréé pas une vacation identique si elle existe deja sur la période cible.
                </p>
              </div>
            </div>
          </div>

          {lastGénérationResult && (
            <div className="rounded-[1.75rem] border border-emerald-500/30 bg-emerald-500/10 p-4 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/25 dark:text-emerald-300">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">
                        Remplissage termine
                      </p>
                      <h3 className="text-lg font-black text-foreground">
                        {lastGénérationResult.siteName} est prêt a contrôler.
                      </h3>
                    </div>
                  </div>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    Sentrys a généré le planning sur {lastGénérationResult.targetLabel.toLowerCase()}.
                    Le resultat reste visible ici pour que l&apos;exploitant sache
                    exactement ce qui vient d&apos;etre créé.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={showGeneratedPlanning}
                    className="rounded-xl font-black"
                  >
                    Voir le planning généré
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={reviewOpenVacations}
                    disabled={lastGénérationResult.openCount === 0}
                    className="rounded-xl bg-background/80 font-bold"
                  >
                    Traiter les vacations a pourvoir
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-5">
                <div className="rounded-2xl border border-border/50 bg-background/80 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                    Creees
                  </p>
                  <p className="mt-1 text-2xl font-black text-foreground">
                    {lastGénérationResult.createdCount}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/50 bg-background/80 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                    Affectees
                  </p>
                  <p className="mt-1 text-2xl font-black text-emerald-600">
                    {lastGénérationResult.assignedCount}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/50 bg-background/80 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                    A pourvoir
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-2xl font-black",
                      lastGénérationResult.openCount > 0
                        ? "text-amber-600"
                        : "text-emerald-600"
                    )}
                  >
                    {lastGénérationResult.openCount}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/50 bg-background/80 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                    Doublons évites
                  </p>
                  <p className="mt-1 text-2xl font-black text-slate-700 dark:text-slate-200">
                    {lastGénérationResult.skippedCount}
                  </p>
                </div>
                <div
                  className={cn(
                    "rounded-2xl border p-3",
                    lastGénérationResult.conflictSkippedCount > 0
                      ? "border-amber-500/30 bg-amber-500/10"
                      : "border-border/50 bg-background/80"
                  )}
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                    Conflits ignores
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-2xl font-black",
                      lastGénérationResult.conflictSkippedCount > 0
                        ? "text-amber-600"
                        : "text-emerald-600"
                    )}
                  >
                    {lastGénérationResult.conflictSkippedCount}
                  </p>
                </div>
              </div>

              {lastGénérationResult.safeOnly && (
                <p className="mt-3 rounded-2xl border border-primary/20 bg-background/70 px-3 py-2 text-xs font-semibold text-muted-foreground">
                  Mode prudent utilisé : seules les vacations sans conflit agent ont ete créées.
                </p>
              )}
            </div>
          )}
        </div>

        <SheetFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setSiteTemplateOpen(false)}
            disabled={saving || generating}
          >
            Fermer
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void saveTemplate(false);
            }}
            disabled={loading || saving || generating}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Enregistrer le modèle
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void generateSafeOnly();
            }}
            disabled={
              loading ||
              saving ||
              generating ||
              générationPreview.operations.length === 0
            }
          >
            {generating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Generer sans conflits
          </Button>
          <Button
            type="button"
            onClick={() => {
              void generateFromTemplate();
            }}
            disabled={loading || saving || generating}
          >
            {generating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CalendarRange className="mr-2 h-4 w-4" />
            )}
            Enregistrer et générér
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
