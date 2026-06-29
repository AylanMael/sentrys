// src/app/dashboard/agents/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { apiFetch } from "@/lib/api/client-fetch";
import { useAuth } from "@/lib/auth-provider";
import { canManageAgents, normalizeRole } from "@/lib/auth/role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppFeedback } from "@/hooks/use-app-feedback";
import { cn } from "@/lib/utils";
import {
  AGENT_DOCUMENT_KIND_OPTIONS,
  AGENT_EQUIPMENT_CATEGORY_OPTIONS,
  AGENT_EQUIPMENT_STATUS_OPTIONS,
  AGENT_QUALIFICATION_OPTIONS,
  type AgentDocumentItem,
  type AgentEquipmentItem,
} from "@/lib/agents/profile";
import {
  ArrowLeft,
  Loader2,
  Mail,
  Phone,
  UserCircle,
  Save,
  Power,
  ShieldCheck,
  CalendarDays,
  MapPin,
  Camera,
  ExternalLink,
  FileText,
  FileBadge2,
  Plus,
  Trash2,
  UploadCloud,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileUp,
  ShieldAlert,
  FileWarning,
} from "lucide-react";

type Agent = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: "active" | "inactive";
  monthlyContractHours?: number | null;
  photoUrl?: string | null;
  employeeNumber?: string | null;
  birthDate?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  professionalCardNumber?: string | null;
  professionalCardExpiresAt?: string | null;
  qualifications?: string[];
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  documents?: AgentDocumentItem[];
  equipmentItems?: AgentEquipmentItem[];
  notes?: string | null;
};

type AuthUserLike = {
  role?: string | null;
} | null;

type PhotoUploadResponse = {
  ok: boolean;
  photoUrl: string;
  path: string;
};

type DocumentUploadResponse = {
  ok: boolean;
  document: AgentDocumentItem;
  path: string;
  storageMode: string;
};

type ComplianceAlert = {
  id: string;
  title: string;
  detail: string;
  tone: "danger" | "warning" | "info";
};

type OperationalVerdict = {
  tone: "go" | "watch" | "blocked";
  label: string;
  title: string;
  detail: string;
  action: string;
};

type DocumentCheck = {
  id: string;
  label: string;
  detail: string;
  tone: "success" | "warning" | "danger" | "info";
};

type ResolutionStatus =
  | "to_regularize"
  | "regularized"
  | "accepted_exception";

type ComplianceOverrideItem = {
  id: string;
  agentId: string;
  agentName: string;
  periodLabel: string;
  vacationCount: number;
  siteNames: string[];
  channel: string;
  sentAtIso: string | null;
  complianceOverrideReason: string | null;
  complianceOverrideDetail: string | null;
  complianceResolutionStatus: ResolutionStatus;
  complianceResolutionNote: string | null;
  complianceResolutionAtIso: string | null;
};

type ComplianceOverrideResponse = {
  ok: boolean;
  stats: Record<ResolutionStatus | "total", number>;
  items: ComplianceOverrideItem[];
};

const DOCUMENT_KIND_LABELS = Object.fromEntries(
  AGENT_DOCUMENT_KIND_OPTIONS.map((item) => [item.value, item.label])
);
const EQUIPMENT_CATEGORY_LABELS = Object.fromEntries(
  AGENT_EQUIPMENT_CATEGORY_OPTIONS.map((item) => [item.value, item.label])
);

const EQUIPMENT_STATUS_LABELS = Object.fromEntries(
  AGENT_EQUIPMENT_STATUS_OPTIONS.map((item) => [item.value, item.label])
);

function getDocumentKindLabel(kind: string | null | undefined) {
  if (!kind) return "Document";
  return DOCUMENT_KIND_LABELS[kind] ?? kind;
}
function getEquipmentCategoryLabel(category: string | null | undefined) {
  if (!category) return "Materiel";
  return EQUIPMENT_CATEGORY_LABELS[category] ?? category;
}

function getEquipmentStatusLabel(status: AgentEquipmentItem["status"] | null | undefined) {
  if (!status) return "Remis";
  return EQUIPMENT_STATUS_LABELS[status] ?? status;
}

function daysUntil(date: string | null | undefined) {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function formatFileSize(size: number | null | undefined) {
  if (!size || size <= 0) return null;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} Ko`;
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDateTime(value: string | null) {
  if (!value) return "Non renseigne";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Non renseigne";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
function createEquipmentItem(): AgentEquipmentItem {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    label: "",
    category: "uniform",
    reference: null,
    assignedAt: new Date().toISOString().slice(0, 10),
    expectedReturnAt: null,
    returnedAt: null,
    status: "assigned",
    condition: "Bon etat",
    notes: null,
  };
}

function equipmentStatusClass(status: AgentEquipmentItem["status"]) {
  if (status === "returned") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "damaged") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (status === "lost") return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
  return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
}

function complianceOverrideStatusLabel(status: ResolutionStatus) {
  if (status === "regularized") return "Regularise";
  if (status === "accepted_exception") return "Exception acceptee";
  return "A regulariser";
}

function complianceOverrideStatusClass(status: ResolutionStatus) {
  if (status === "regularized") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }

  if (status === "accepted_exception") {
    return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  }

  return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

function getAgentCompleteness(agent: Agent) {
  const checks = [
    agent.photoUrl,
    agent.firstName,
    agent.lastName,
    agent.phone,
    agent.email,
    agent.employeeNumber,
    agent.professionalCardNumber,
    agent.professionalCardExpiresAt,
    (agent.qualifications ?? []).length > 0,
    agent.emergencyContactName && agent.emergencyContactPhone,
    (agent.documents ?? []).length > 0,
  ];
  const completed = checks.filter(Boolean).length;

  return Math.round((completed / checks.length) * 100);
}

function formatAgentName(agent: Agent) {
  const name = `${agent.firstName ?? ""} ${agent.lastName ?? ""}`.trim();
  return name || "Agent sans nom";
}

function getAgentComplianceAlerts(agent: Agent): ComplianceAlert[] {
  const alerts: ComplianceAlert[] = [];
  const cardDays = daysUntil(agent.professionalCardExpiresAt);
  const documents = agent.documents ?? [];
  const hasProfessionalCardDocument = documents.some(
    (document) => document.kind === "professional_card"
  );
  const hasIdentityDocument = documents.some(
    (document) => document.kind === "identity"
  );

  if (!agent.photoUrl) {
    alerts.push({
      id: "photo",
      title: "Photo manquante",
      detail: "Utile pour identifier vite l'agent sur les documents et le planning.",
      tone: "info",
    });
  }

  if (!agent.phone && !agent.email) {
    alerts.push({
      id: "contact",
      title: "Contact absent",
      detail: "Ajoutez au moins un telephone ou un email pour la diffusion planning.",
      tone: "warning",
    });
  }

  if (!agent.professionalCardNumber) {
    alerts.push({
      id: "card-number",
      title: "Carte professionnelle non renseignee",
      detail: "Point sensible exploitation : numero CNAPS a completer.",
      tone: "danger",
    });
  }

  if (!agent.professionalCardExpiresAt) {
    alerts.push({
      id: "card-expiry",
      title: "Expiration carte pro absente",
      detail: "Sans date d'expiration, le controle de conformite reste aveugle.",
      tone: "warning",
    });
  } else if (cardDays !== null && cardDays < 0) {
    alerts.push({
      id: "card-expired",
      title: "Carte professionnelle expiree",
      detail: "A traiter avant toute affectation sensible.",
      tone: "danger",
    });
  } else if (cardDays !== null && cardDays <= 60) {
    alerts.push({
      id: "card-soon",
      title: "Carte pro bientot expiree",
      detail: `Expiration dans ${cardDays} jour${cardDays > 1 ? "s" : ""}.`,
      tone: "warning",
    });
  }

  if ((agent.qualifications ?? []).length === 0) {
    alerts.push({
      id: "qualifications",
      title: "Qualification absente",
      detail: "Renseignez ADS, SSIAP, SST ou autre habilitation utile.",
      tone: "warning",
    });
  }

  if (!hasProfessionalCardDocument) {
    alerts.push({
      id: "doc-card",
      title: "Copie carte pro non archivee",
      detail: "Ajoutez le fichier pour garder un dossier agent complet.",
      tone: "warning",
    });
  }

  if (!hasIdentityDocument) {
    alerts.push({
      id: "doc-identity",
      title: "Piece d'identite non archivee",
      detail: "Pratique pour le controle administratif et les renouvellements.",
      tone: "info",
    });
  }

  return alerts;
}

function getOperationalVerdict(
  agent: Agent,
  alerts: ComplianceAlert[],
  openComplianceCount: number
): OperationalVerdict {
  const firstDanger = alerts.find((alert) => alert.tone === "danger");
  const firstWarning = alerts.find((alert) => alert.tone === "warning");

  if (agent.status !== "active") {
    return {
      tone: "blocked",
      label: "Bloque",
      title: "Agent suspendu",
      detail: "Cet agent ne doit pas etre affecte tant que son statut reste inactif.",
      action: "Verifier le motif de suspension avant toute planification.",
    };
  }

  if (firstDanger) {
    return {
      tone: "blocked",
      label: "Non affectable",
      title: firstDanger.title,
      detail: firstDanger.detail,
      action: "Regulariser ce point avant une affectation sensible.",
    };
  }

  if (openComplianceCount > 0) {
    return {
      tone: "watch",
      label: "A surveiller",
      title: "Affectable avec vigilance",
      detail: `${openComplianceCount} point(s) de conformite planning restent ouverts.`,
      action: "Consulter le registre avant diffusion du planning.",
    };
  }

  if (firstWarning) {
    return {
      tone: "watch",
      label: "A completer",
      title: firstWarning.title,
      detail: firstWarning.detail,
      action: "Completer le dossier pour eviter un blocage plus tard.",
    };
  }

  return {
    tone: "go",
    label: "Affectable",
    title: "Pret pour planification",
    detail: "Identite, contact et conformite essentielle sont exploitables.",
    action: "L'agent peut etre planifie et diffuse sans alerte majeure.",
  };
}

function operationalVerdictClass(tone: OperationalVerdict["tone"]) {
  if (tone === "blocked") {
    return "border-red-500/30 bg-red-500/10 text-red-900 dark:text-red-100";
  }

  if (tone === "watch") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-100";
  }

  return "border-emerald-500/25 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100";
}

function operationalVerdictBadgeClass(tone: OperationalVerdict["tone"]) {
  if (tone === "blocked") return "bg-red-600 text-white hover:bg-red-600";
  if (tone === "watch") return "bg-amber-500 text-amber-950 hover:bg-amber-500";
  return "bg-emerald-600 text-white hover:bg-emerald-600";
}

function getDocumentChecklist(agent: Agent): DocumentCheck[] {
  const documents = agent.documents ?? [];
  const hasProfessionalCardDocument = documents.some(
    (document) => document.kind === "professional_card"
  );
  const hasIdentityDocument = documents.some((document) => document.kind === "identity");
  const cardDays = daysUntil(agent.professionalCardExpiresAt);

  return [
    {
      id: "photo",
      label: "Photo",
      detail: agent.photoUrl ? "Identifiable" : "A ajouter",
      tone: agent.photoUrl ? "success" : "info",
    },
    {
      id: "contact",
      label: "Contact",
      detail: agent.phone || agent.email ? "Joignable" : "Absent",
      tone: agent.phone || agent.email ? "success" : "warning",
    },
    {
      id: "card",
      label: "Carte pro",
      detail:
        cardDays === null
          ? "A verifier"
          : cardDays < 0
            ? "Expiree"
            : cardDays <= 60
              ? "Bientot expiree"
              : "Valide",
      tone:
        cardDays === null
          ? "warning"
          : cardDays < 0
            ? "danger"
            : cardDays <= 60
              ? "warning"
              : "success",
    },
    {
      id: "card-doc",
      label: "Copie carte",
      detail: hasProfessionalCardDocument ? "Archivee" : "Manquante",
      tone: hasProfessionalCardDocument ? "success" : "warning",
    },
    {
      id: "identity",
      label: "Identite",
      detail: hasIdentityDocument ? "Archivee" : "A archiver",
      tone: hasIdentityDocument ? "success" : "info",
    },
  ];
}

function documentCheckClass(tone: DocumentCheck["tone"]) {
  if (tone === "danger") return "border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-200";
  if (tone === "warning") return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200";
  if (tone === "info") return "border-sky-500/25 bg-sky-500/10 text-sky-800 dark:text-sky-200";
  return "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200";
}

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const feedback = useAppFeedback();

  const role = useMemo(
    () => normalizeRole((user as AuthUserLike)?.role) ?? "client",
    [user]
  );

  const canWrite = useMemo(() => canManageAgents(role), [role]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [complianceOverrides, setComplianceOverrides] = useState<
    ComplianceOverrideItem[]
  >([]);
  const [complianceOverridesLoading, setComplianceOverridesLoading] =
    useState(false);
  const [complianceOverridesError, setComplianceOverridesError] =
    useState<string | null>(null);
  const [documentLabel, setDocumentLabel] = useState("");
  const [documentKind, setDocumentKind] = useState("professional_card");
  const [documentUrl, setDocumentUrl] = useState("");
  const [documentExpiresAt, setDocumentExpiresAt] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      setLoading(true);
      try {
        const data = await apiFetch<{ ok: boolean; agent?: Agent; error?: string }>(
          `/api/agents/${id}`
        );

        if (mounted) {
          setAgent(data.ok ? (data.agent ?? null) : null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      setComplianceOverridesLoading(true);
      setComplianceOverridesError(null);
      try {
        const params = new URLSearchParams({ agentId: id });
        const data = await apiFetch<ComplianceOverrideResponse>(
          `/api/compliance-overrides?${params.toString()}`
        );

        if (mounted) {
          setComplianceOverrides(data.items ?? []);
        }
      } catch (error) {
        if (mounted) {
          setComplianceOverrides([]);
          setComplianceOverridesError(
            error instanceof Error
              ? error.message
              : "Impossible de charger les exceptions conformite."
          );
        }
      } finally {
        if (mounted) setComplianceOverridesLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  async function savePatch(patch: Partial<Agent>) {
    if (!canWrite) return;

    setSaving(true);
    try {
      const res = await apiFetch<{ ok: boolean; error?: string }>(`/api/agents/${id}`, {
        method: "PATCH",
        body: patch,
      });

      if (!res.ok) {
        feedback.error(res.error ?? "Erreur lors de la sauvegarde", {
          title: "Sauvegarde impossible",
        });
      } else {
        setAgent((prev: Agent | null) => (prev ? { ...prev, ...patch } : null));
        feedback.success(
          "Dossier sauvegarde",
          "Les informations de l'agent sont a jour."
        );
      }
    } catch (error) {
      feedback.error(error, {
        title: "Sauvegarde impossible",
        fallback: "Impossible de sauvegarder le dossier agent pour le moment.",
      });
    } finally {
      setSaving(false);
    }
  }

  function toggleQualification(value: string, checked: boolean) {
    setAgent((current) => {
      if (!current) return current;

      const nextQualifications = checked
        ? Array.from(new Set([...(current.qualifications ?? []), value]))
        : (current.qualifications ?? []).filter((item) => item !== value);

      return { ...current, qualifications: nextQualifications };
    });
  }

  function addDocument() {
    if (!agent || !documentUrl.trim()) return;

    const nextDocument: AgentDocumentItem = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      label: documentLabel.trim() || "Document",
      url: documentUrl.trim(),
      kind: documentKind,
      expiresAt: documentExpiresAt.trim() || null,
      fileName: null,
      mimeType: null,
      size: null,
      uploadedAt: new Date().toISOString(),
    };

    setAgent({
      ...agent,
      documents: [...(agent.documents ?? []), nextDocument],
    });
    setDocumentLabel("");
    setDocumentUrl("");
    setDocumentExpiresAt("");
  }

  async function uploadDocument() {
    if (!agent || !documentFile || !canWrite) return;

    setUploadingDocument(true);
    try {
      const formData = new FormData();
      formData.append("file", documentFile);
      formData.append("label", documentLabel.trim() || documentFile.name);
      formData.append("kind", documentKind);
      formData.append("expiresAt", documentExpiresAt.trim());

      const response = await apiFetch<DocumentUploadResponse>(
        `/api/agents/${id}/documents`,
        {
          method: "POST",
          body: formData,
        }
      );

      setAgent((current) =>
        current
          ? {
              ...current,
              documents: [...(current.documents ?? []), response.document],
            }
          : current
      );
      setDocumentLabel("");
      setDocumentUrl("");
      setDocumentExpiresAt("");
      setDocumentFile(null);
      feedback.success(
        "Document ajoute",
        "Le fichier est archive dans le dossier de l'agent."
      );
    } catch (error) {
      feedback.error(error, {
        title: "Import document impossible",
        fallback: "Impossible d'importer le document.",
      });
    } finally {
      setUploadingDocument(false);
    }
  }

  function removeDocument(documentId: string) {
    if (!agent) return;

    setAgent({
      ...agent,
      documents: (agent.documents ?? []).filter((document) => document.id !== documentId),
    });
  }
  function addEquipmentItem() {
    setAgent((current) =>
      current
        ? {
            ...current,
            equipmentItems: [...(current.equipmentItems ?? []), createEquipmentItem()],
          }
        : current
    );
  }

  function updateEquipmentItem(
    equipmentId: string,
    patch: Partial<AgentEquipmentItem>
  ) {
    setAgent((current) =>
      current
        ? {
            ...current,
            equipmentItems: (current.equipmentItems ?? []).map((item) =>
              item.id === equipmentId ? { ...item, ...patch } : item
            ),
          }
        : current
    );
  }

  function removeEquipmentItem(equipmentId: string) {
    setAgent((current) =>
      current
        ? {
            ...current,
            equipmentItems: (current.equipmentItems ?? []).filter(
              (item) => item.id !== equipmentId
            ),
          }
        : current
    );
  }

  async function uploadPhoto(file: File | null) {
    if (!file || !agent || !canWrite) return;

    if (!file.type.startsWith("image/")) {
      feedback.warning(
        "Format non accepte",
        "Selectionnez une image au format JPG, PNG ou WebP."
      );
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      feedback.warning(
        "Photo trop lourde",
        "La photo ne doit pas depasser 5 Mo."
      );
      return;
    }

    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await apiFetch<PhotoUploadResponse>(
        `/api/agents/${id}/photo`,
        {
          method: "POST",
          body: formData,
        }
      );

      setAgent((current) =>
        current ? { ...current, photoUrl: response.photoUrl } : current
      );
      feedback.success(
        "Photo mise a jour",
        "L'identification visuelle de l'agent est disponible."
      );
    } catch (error) {
      feedback.error(error, {
        title: "Import photo impossible",
        fallback: "Impossible d'importer la photo.",
      });
    } finally {
      setUploadingPhoto(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-semibold tracking-widest uppercase">
            Chargement du profil...
          </p>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <EmptyState
        icon={UserCircle}
        tone="warning"
        title="Agent introuvable"
        description="Ce profil n'existe pas ou a ete supprime."
        className="mx-auto mt-10 min-h-[50vh] max-w-2xl"
        action={
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="h-12 rounded-xl px-6 font-medium"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Retour
          </Button>
        }
      />
    );
  }

  const agentName = formatAgentName(agent);
  const initiales = `${agent.firstName?.charAt(0) || ""}${agent.lastName?.charAt(0) || "?"}`.toUpperCase();
  const completeness = getAgentCompleteness(agent);
  const complianceAlerts = getAgentComplianceAlerts(agent);
  const openComplianceOverrides = complianceOverrides.filter(
    (item) => item.complianceResolutionStatus === "to_regularize"
  );
  const closedComplianceOverrides =
    complianceOverrides.length - openComplianceOverrides.length;
  const operationalVerdict = getOperationalVerdict(
    agent,
    complianceAlerts,
    openComplianceOverrides.length
  );
  const documentChecklist = getDocumentChecklist(agent);
  const qualificationsCount = (agent.qualifications ?? []).length;
  const equipmentItems = agent.equipmentItems ?? [];
  const assignedEquipmentCount = equipmentItems.filter((item) => item.status === "assigned").length;

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-12 w-full max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-card border border-border/50 rounded-2xl shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-48 h-48 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="shrink-0 rounded-full hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </Button>

          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge
                variant={agent.status === "active" ? "default" : "secondary"}
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5",
                  agent.status === "active"
                    ? "bg-green-500/10 text-green-700 border-transparent"
                    : "opacity-60"
                )}
              >
                {agent.status === "active" ? "En poste" : "Inactif"}
              </Badge>
              <Badge
                variant="outline"
                className="text-[10px] font-mono text-muted-foreground py-0.5 border-border/50"
              >
                ID: {id.slice(0, 8)}
              </Badge>
            </div>

            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Fiche agent
            </h1>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              {agentName} - passeport exploitation
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pl-14 md:pl-0 relative z-10">
          {canWrite && (
            <Button
              variant={agent.status === "active" ? "outline" : "default"}
              className={cn(
                "h-11 rounded-xl px-5 font-semibold transition-all",
                agent.status === "active"
                  ? "text-destructive border-destructive/20 hover:bg-destructive/10"
                  : "bg-green-600 hover:bg-green-700"
              )}
              onClick={() =>
                savePatch({ status: agent.status === "active" ? "inactive" : "active" })
              }
              disabled={saving}
            >
              <Power className="h-4 w-4 mr-2" />
              {agent.status === "active" ? "Suspendre l'agent" : "Réactiver l'agent"}
            </Button>
          )}
        </div>
      </div>

      <section className="grid gap-5">
        <Card className={cn("overflow-hidden rounded-[2rem] border shadow-sm", operationalVerdictClass(operationalVerdict.tone))}>
          <CardContent className="p-6 md:p-7">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div className="max-w-2xl">
                <Badge className={cn("mb-4 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]", operationalVerdictBadgeClass(operationalVerdict.tone))}>
                  {operationalVerdict.label}
                </Badge>
                <h2 className="text-3xl font-black tracking-tight">
                  {operationalVerdict.title}
                </h2>
                <p className="mt-2 text-sm font-semibold opacity-80">
                  {operationalVerdict.detail}
                </p>
                <p className="mt-3 rounded-2xl bg-background/60 px-4 py-3 text-sm font-bold shadow-sm ring-1 ring-black/5 dark:bg-background/20">
                  {operationalVerdict.action}
                </p>
              </div>

              <div className="grid min-w-[220px] grid-cols-3 gap-2 rounded-2xl bg-background/55 p-2 text-center shadow-sm ring-1 ring-black/5 dark:bg-background/20">
                <div className="rounded-xl p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] opacity-60">Dossier</p>
                  <p className="mt-1 text-2xl font-black">{completeness}%</p>
                </div>
                <div className="rounded-xl p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] opacity-60">Alertes</p>
                  <p className="mt-1 text-2xl font-black">{complianceAlerts.length}</p>
                </div>
                <div className="rounded-xl p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] opacity-60">Habil.</p>
                  <p className="mt-1 text-2xl font-black">{qualificationsCount}</p>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {documentChecklist.map((item) => (
                <div
                  key={item.id}
                  className={cn("rounded-2xl border px-3 py-3 shadow-sm", documentCheckClass(item.tone))}
                >
                  <div className="flex items-center gap-2">
                    {item.tone === "success" ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : item.tone === "danger" ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : item.tone === "warning" ? (
                      <Clock3 className="h-4 w-4" />
                    ) : (
                      <ShieldCheck className="h-4 w-4" />
                    )}
                    <p className="text-xs font-black uppercase tracking-[0.12em]">
                      {item.label}
                    </p>
                  </div>
                  <p className="mt-1 text-sm font-bold opacity-80">{item.detail}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="hidden rounded-[2rem] border-border/60 shadow-sm">
          <CardContent className="flex h-full flex-col justify-between gap-5 p-6 md:p-7">
            <div>
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
                <Phone className="h-4 w-4" />
                Contact rapide
              </div>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-foreground">
                {agentName}
              </h2>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                {agent.employeeNumber ? `Matricule ${agent.employeeNumber}` : "Matricule non renseigne"}
              </p>
            </div>

            <div className="space-y-3">
              {agent.phone ? (
                <Button asChild variant="outline" className="h-12 w-full justify-start rounded-2xl font-bold">
                  <a href={`tel:${agent.phone}`}>
                    <Phone className="h-4 w-4" />
                    {agent.phone}
                  </a>
                </Button>
              ) : (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-800 dark:text-amber-200">
                  Telephone a renseigner
                </div>
              )}

              {agent.email ? (
                <Button asChild variant="outline" className="h-12 w-full justify-start rounded-2xl font-bold">
                  <a href={`mailto:${agent.email}`}>
                    <Mail className="h-4 w-4" />
                    {agent.email}
                  </a>
                </Button>
              ) : (
                <div className="rounded-2xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-sm font-bold text-sky-800 dark:text-sky-200">
                  Email a renseigner
                </div>
              )}
            </div>

            <div className="rounded-2xl border bg-muted/25 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                Urgence
              </p>
              <p className="mt-1 font-black text-foreground">
                {agent.emergencyContactName || "Contact non renseigne"}
              </p>
              <p className="text-sm font-semibold text-muted-foreground">
                {agent.emergencyContactPhone || "Telephone urgence absent"}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="grid lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-border/50 rounded-2xl shadow-sm bg-card overflow-hidden">
            <div className="h-24 bg-gradient-to-br from-primary/10 to-primary/5 w-full border-b border-border/50" />
            <CardContent className="p-6 pt-0 flex flex-col items-center text-center relative">
              <div className="h-24 w-24 rounded-full border-4 border-card bg-primary/10 flex items-center justify-center -mt-12 mb-4 shadow-lg shadow-black/5 relative overflow-hidden">
                {agent.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={agent.photoUrl}
                    alt={`Photo ${agent.firstName ?? ""} ${agent.lastName ?? ""}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-3xl font-black tracking-widest text-primary/80">
                    {initiales}
                  </span>
                )}
              </div>

              <h2 className="text-xl font-bold tracking-tight text-foreground line-clamp-1">
                {agent.firstName || "Prénom"} {agent.lastName || "Nom"}
              </h2>
              <p className="text-sm font-medium text-muted-foreground mt-1">
                Agent de sécurité
              </p>

              <div className="w-full flex justify-center gap-4 mt-6">
                {agent.email ? (
                  <a
                    href={`mailto:${agent.email}`}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/50 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                    title={agent.email}
                  >
                    <Mail className="h-4 w-4" />
                  </a>
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/30 text-muted-foreground/35" title="Email absent">
                    <Mail className="h-4 w-4" />
                  </div>
                )}

                {agent.phone ? (
                  <a
                    href={`tel:${agent.phone}`}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/50 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                    title={agent.phone}
                  >
                    <Phone className="h-4 w-4" />
                  </a>
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/30 text-muted-foreground/35" title="Telephone absent">
                    <Phone className="h-4 w-4" />
                  </div>
                )}
              </div>

              {canWrite && (
                <div className="mt-5 w-full">
                  <input
                    id="agent-photo-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      void uploadPhoto(file);
                      event.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full rounded-xl font-semibold"
                    disabled={uploadingPhoto || saving}
                    asChild
                  >
                    <label htmlFor="agent-photo-upload">
                      {uploadingPhoto ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <UploadCloud className="mr-2 h-4 w-4" />
                      )}
                      Importer la photo
                    </label>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="hidden border-border/50 rounded-2xl shadow-sm bg-card overflow-hidden">
            <div className="p-5 border-b border-border/50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">
                  Controle exploitation
                </h2>
              </div>
              <Badge variant="outline" className="font-mono">
                {completeness}%
              </Badge>
            </div>
            <CardContent className="p-5 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  <span>Dossier complet</span>
                  <span>{completeness}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      completeness >= 85
                        ? "bg-emerald-500"
                        : completeness >= 60
                          ? "bg-amber-500"
                          : "bg-destructive"
                    )}
                    style={{ width: `${completeness}%` }}
                  />
                </div>
              </div>

              {complianceAlerts.length > 0 ? (
                <div className="space-y-2">
                  {complianceAlerts.slice(0, 5).map((alert) => (
                    <div
                      key={alert.id}
                      className={cn(
                        "rounded-xl border p-3 text-sm",
                        alert.tone === "danger" &&
                          "border-destructive/30 bg-destructive/10 text-destructive",
                        alert.tone === "warning" &&
                          "border-amber-300/60 bg-amber-50 text-amber-800",
                        alert.tone === "info" &&
                          "border-sky-300/60 bg-sky-50 text-sky-800"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {alert.tone === "danger" ? (
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        ) : alert.tone === "warning" ? (
                          <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
                        ) : (
                          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                        )}
                        <div>
                          <p className="font-bold">{alert.title}</p>
                          <p className="mt-0.5 text-xs opacity-80">{alert.detail}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {complianceAlerts.length > 5 && (
                    <p className="text-xs font-semibold text-muted-foreground">
                      +{complianceAlerts.length - 5} point(s) a completer.
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-300/60 bg-emerald-50 p-4 text-sm text-emerald-800">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    <p className="font-bold">Dossier propre et exploitable</p>
                  </div>
                  <p className="mt-1 text-xs opacity-80">
                    Les informations essentielles sont presentes pour planifier et diffuser.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="hidden border-border/50 rounded-2xl shadow-sm bg-card overflow-hidden">
            <div className="p-5 border-b border-border/50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileWarning className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">
                  Conformite planning
                </h2>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "font-mono",
                  openComplianceOverrides.length > 0 &&
                    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                )}
              >
                {openComplianceOverrides.length} ouvert
              </Badge>
            </div>
            <CardContent className="p-5 space-y-4">
              {complianceOverridesLoading ? (
                <div className="flex items-center gap-3 rounded-xl border bg-muted/20 p-4 text-sm font-semibold text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Chargement des exceptions...
                </div>
              ) : complianceOverridesError ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-700 dark:text-red-300">
                  {complianceOverridesError}
                </div>
              ) : complianceOverrides.length === 0 ? (
                <div className="rounded-xl border border-emerald-300/60 bg-emerald-50 p-4 text-sm text-emerald-800">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    <p className="font-bold">Aucune exception de planning</p>
                  </div>
                  <p className="mt-1 text-xs opacity-80">
                    Aucun forcage conformite n'est rattache a cet agent.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-200">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] opacity-70">
                        A regulariser
                      </p>
                      <p className="mt-1 text-2xl font-black">
                        {openComplianceOverrides.length}
                      </p>
                    </div>
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-emerald-800 dark:text-emerald-200">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] opacity-70">
                        Fermees
                      </p>
                      <p className="mt-1 text-2xl font-black">
                        {closedComplianceOverrides}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {complianceOverrides.slice(0, 3).map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border bg-muted/20 p-3 text-sm"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em]",
                              complianceOverrideStatusClass(
                                item.complianceResolutionStatus
                              )
                            )}
                          >
                            {complianceOverrideStatusLabel(
                              item.complianceResolutionStatus
                            )}
                          </Badge>
                          <span className="text-[11px] font-semibold text-muted-foreground">
                            {formatDateTime(item.sentAtIso)}
                          </span>
                        </div>
                        <p className="mt-2 font-bold text-foreground">
                          {item.complianceOverrideDetail ||
                            "Blocage conformite non detaille"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.periodLabel} - {item.vacationCount} vacation(s)
                        </p>
                        {item.complianceOverrideReason && (
                          <p className="mt-2 rounded-lg bg-background px-2 py-1 text-xs font-semibold text-muted-foreground">
                            Motif : {item.complianceOverrideReason}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button asChild variant="outline" size="sm" className="rounded-xl">
                      <a href={`/dashboard/conformite?agentId=${id}`}>
                        Voir registre
                      </a>
                    </Button>
                    {complianceOverrides[0] && (
                      <Button asChild variant="ghost" size="sm" className="rounded-xl">
                        <a href={`/agent-planning/print/${complianceOverrides[0].id}`}>
                          Dernier PDF
                          <ExternalLink className="ml-2 h-3.5 w-3.5" />
                        </a>
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="hidden border-border/50 rounded-2xl shadow-sm bg-card">
            <div className="p-5 border-b border-border/50 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">
                Habilitations
              </h2>
            </div>
            <CardContent className="p-5 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Carte pro</span>
                <Badge variant="outline" className="font-mono">
                  {agent.professionalCardNumber || "-"}
                </Badge>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Expiration</span>
                <Badge variant="outline" className="font-mono">
                  {agent.professionalCardExpiresAt || "-"}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-2">
                {(agent.qualifications ?? []).length > 0 ? (
                  (agent.qualifications ?? []).map((qualification) => (
                    <Badge key={qualification} variant="secondary">
                      {qualification}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm italic text-muted-foreground">
                    Aucune qualification renseignee
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-8">
          <Tabs defaultValue="profil" className="space-y-6">
            <div className="overflow-x-auto rounded-2xl border bg-card p-2 shadow-sm">
              <TabsList className="h-auto w-max min-w-full justify-start gap-2 bg-transparent p-0">
                <TabsTrigger value="profil" className="rounded-xl px-4 py-2 text-xs font-black uppercase tracking-[0.12em]">Profil & contact</TabsTrigger>
                <TabsTrigger value="conformite" className="rounded-xl px-4 py-2 text-xs font-black uppercase tracking-[0.12em]">Conformite</TabsTrigger>
                <TabsTrigger value="documents" className="rounded-xl px-4 py-2 text-xs font-black uppercase tracking-[0.12em]">Documents</TabsTrigger>
                <TabsTrigger value="rh" className="rounded-xl px-4 py-2 text-xs font-black uppercase tracking-[0.12em]">RH & materiel</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="profil" className="mt-0 space-y-6">
          <Card className="border-border/50 rounded-2xl shadow-sm bg-card">
            <div className="p-6 border-b border-border/50 flex items-center gap-2">
              <UserCircle className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">
                Informations Personnelles
              </h2>
            </div>

            <CardContent className="p-6 space-y-6">
              {!canWrite && (
                <div className="rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  Consultation seule : vous ne pouvez pas modifier ce profil.
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest pl-1">
                    Prénom
                  </Label>
                  <Input
                    placeholder="Saisir le prénom"
                    value={agent.firstName ?? ""}
                    onChange={(e) => setAgent({ ...agent, firstName: e.target.value })}
                    readOnly={!canWrite}
                    className="h-12 rounded-xl bg-background border-border/50 focus-visible:ring-primary/30 font-medium"
                  />
                </div>

                <div className="space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest pl-1">
                    Nom de famille
                  </Label>
                  <Input
                    placeholder="Saisir le nom"
                    value={agent.lastName ?? ""}
                    onChange={(e) => setAgent({ ...agent, lastName: e.target.value })}
                    readOnly={!canWrite}
                    className="h-12 rounded-xl bg-background border-border/50 focus-visible:ring-primary/30 font-medium"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                <div className="space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest pl-1">
                    Matricule
                  </Label>
                  <Input
                    placeholder="AG-0042"
                    value={agent.employeeNumber ?? ""}
                    onChange={(e) =>
                      setAgent({ ...agent, employeeNumber: e.target.value })
                    }
                    readOnly={!canWrite}
                    className="h-12 rounded-xl bg-background border-border/50 focus-visible:ring-primary/30 font-medium"
                  />
                </div>

                <div className="space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest pl-1">
                    Naissance
                  </Label>
                  <Input
                    type="date"
                    value={agent.birthDate ?? ""}
                    onChange={(e) => setAgent({ ...agent, birthDate: e.target.value })}
                    readOnly={!canWrite}
                    className="h-12 rounded-xl bg-background border-border/50 focus-visible:ring-primary/30 font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest pl-1">
                    Email de contact
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="contact@exemple.com"
                      type="email"
                      value={agent.email ?? ""}
                      onChange={(e) => setAgent({ ...agent, email: e.target.value })}
                      readOnly={!canWrite}
                      className="pl-11 h-12 rounded-xl bg-background border-border/50 focus-visible:ring-primary/30 font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest pl-1">
                    Téléphone
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="+33 6 00 00 00 00"
                      value={agent.phone ?? ""}
                      onChange={(e) => setAgent({ ...agent, phone: e.target.value })}
                      readOnly={!canWrite}
                      className="pl-11 h-12 rounded-xl bg-background border-border/50 focus-visible:ring-primary/30 font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest pl-1">
                    Contrat mensuel (heures)
                  </Label>
                  <Input
                    placeholder="151.67"
                    type="number"
                    min="0"
                    max="400"
                    step="0.01"
                    value={agent.monthlyContractHours ?? ""}
                    onChange={(e) =>
                      setAgent({
                        ...agent,
                        monthlyContractHours:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    readOnly={!canWrite}
                    className="h-12 rounded-xl bg-background border-border/50 focus-visible:ring-primary/30 font-medium"
                  />
                </div>
              </div>

              {canWrite && (
                <div className="pt-6 border-t border-border/50 flex items-center justify-end">
                  <Button
                    onClick={() =>
                      savePatch({
                        firstName: agent.firstName,
                        lastName: agent.lastName,
                        email: agent.email,
                        phone: agent.phone,
                        monthlyContractHours: agent.monthlyContractHours ?? null,
                        photoUrl: agent.photoUrl,
                        employeeNumber: agent.employeeNumber,
                        birthDate: agent.birthDate,
                        addressLine1: agent.addressLine1,
                        addressLine2: agent.addressLine2,
                        professionalCardNumber: agent.professionalCardNumber,
                        professionalCardExpiresAt: agent.professionalCardExpiresAt,
                        qualifications: agent.qualifications ?? [],
                        emergencyContactName: agent.emergencyContactName,
                        emergencyContactPhone: agent.emergencyContactPhone,
                        documents: agent.documents ?? [],
                        equipmentItems: agent.equipmentItems ?? [],
                        notes: agent.notes,
                      })
                    }
                    disabled={saving}
                    className="h-12 rounded-xl px-8 font-semibold shadow-lg shadow-primary/20 hover:translate-y-[-2px] active:scale-95 transition-all"
                  >
                    {saving ? (
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    ) : (
                      <Save className="h-5 w-5 mr-2" />
                    )}
                    {saving ? "Sauvegarde en cours..." : "Enregistrer les modifications"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50 rounded-2xl shadow-sm bg-card">
            <div className="p-6 border-b border-border/50 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">
                Adresse et contact urgence
              </h2>
            </div>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest pl-1">
                    Adresse
                  </Label>
                  <Input
                    value={agent.addressLine1 ?? ""}
                    onChange={(e) =>
                      setAgent({ ...agent, addressLine1: e.target.value })
                    }
                    readOnly={!canWrite}
                    placeholder="Numero et rue"
                    className="h-12 rounded-xl bg-background border-border/50 focus-visible:ring-primary/30 font-medium"
                  />
                </div>
                <div className="space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest pl-1">
                    Complement / ville
                  </Label>
                  <Input
                    value={agent.addressLine2 ?? ""}
                    onChange={(e) =>
                      setAgent({ ...agent, addressLine2: e.target.value })
                    }
                    readOnly={!canWrite}
                    placeholder="Code postal - Ville"
                    className="h-12 rounded-xl bg-background border-border/50 focus-visible:ring-primary/30 font-medium"
                  />
                </div>
                <div className="space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest pl-1">
                    Contact urgence
                  </Label>
                  <Input
                    value={agent.emergencyContactName ?? ""}
                    onChange={(e) =>
                      setAgent({ ...agent, emergencyContactName: e.target.value })
                    }
                    readOnly={!canWrite}
                    placeholder="Nom du contact"
                    className="h-12 rounded-xl bg-background border-border/50 focus-visible:ring-primary/30 font-medium"
                  />
                </div>
                <div className="space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest pl-1">
                    Telephone urgence
                  </Label>
                  <Input
                    value={agent.emergencyContactPhone ?? ""}
                    onChange={(e) =>
                      setAgent({ ...agent, emergencyContactPhone: e.target.value })
                    }
                    readOnly={!canWrite}
                    placeholder="+33 6 00 00 00 00"
                    className="h-12 rounded-xl bg-background border-border/50 focus-visible:ring-primary/30 font-medium"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

            </TabsContent>

            <TabsContent value="conformite" className="mt-0 space-y-6">
          <Card className="border-border/50 rounded-2xl shadow-sm bg-card">
            <div className="p-6 border-b border-border/50 flex items-center gap-2">
              <FileBadge2 className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">
                Carte professionnelle et qualifications
              </h2>
            </div>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest pl-1">
                    Numero carte professionnelle
                  </Label>
                  <Input
                    value={agent.professionalCardNumber ?? ""}
                    onChange={(e) =>
                      setAgent({ ...agent, professionalCardNumber: e.target.value })
                    }
                    readOnly={!canWrite}
                    placeholder="Numero CNAPS"
                    className="h-12 rounded-xl bg-background border-border/50 focus-visible:ring-primary/30 font-medium"
                  />
                </div>
                <div className="space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest pl-1">
                    Expiration
                  </Label>
                  <Input
                    type="date"
                    value={agent.professionalCardExpiresAt ?? ""}
                    onChange={(e) =>
                      setAgent({
                        ...agent,
                        professionalCardExpiresAt: e.target.value,
                      })
                    }
                    readOnly={!canWrite}
                    className="h-12 rounded-xl bg-background border-border/50 focus-visible:ring-primary/30 font-medium"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest pl-1">
                  Qualifications
                </Label>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                  {AGENT_QUALIFICATION_OPTIONS.map((qualification) => (
                    <label
                      key={qualification}
                      className="flex items-center gap-2 rounded-xl border bg-muted/20 px-3 py-2 text-sm font-semibold"
                    >
                      <Checkbox
                        checked={(agent.qualifications ?? []).includes(qualification)}
                        onCheckedChange={(checked) =>
                          toggleQualification(qualification, checked === true)
                        }
                        disabled={!canWrite}
                      />
                      {qualification}
                    </label>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

            </TabsContent>

            <TabsContent value="rh" className="mt-0 space-y-6">
          <Card className="border-border/50 rounded-2xl shadow-sm bg-card">
            <div className="p-6 border-b border-border/50 flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">
                Notes exploitation
              </h2>
            </div>
            <CardContent className="p-6">
              <Textarea
                value={agent.notes ?? ""}
                onChange={(e) => setAgent({ ...agent, notes: e.target.value })}
                readOnly={!canWrite}
                placeholder="Contraintes, preferences, remarques internes..."
                className="min-h-28 rounded-xl bg-background border-border/50 focus-visible:ring-primary/30 font-medium"
              />
            </CardContent>
          </Card>

          <Card className="border-border/50 rounded-2xl shadow-sm bg-card">
            <div className="p-6 border-b border-border/50 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <FileBadge2 className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    Equipements individuels
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Tenues, badges, cles, radio, PTI/DATI et materiel remis a l'agent.
                  </p>
                </div>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "w-fit rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em]",
                  assignedEquipmentCount > 0
                    ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                    : "border-muted bg-muted/40 text-muted-foreground"
                )}
              >
                {assignedEquipmentCount} en dotation
              </Badge>
            </div>

            <CardContent className="p-6 space-y-5">
              {equipmentItems.length === 0 ? (
                <div className="rounded-xl border border-dashed bg-muted/10 p-6 text-center text-sm text-muted-foreground">
                  Aucun equipement rattache a cet agent. Ajoutez ici les tenues, badges, radios, cles ou PTI remis.
                </div>
              ) : (
                <div className="space-y-4">
                  {equipmentItems.map((item) => (
                    <div key={item.id} className="rounded-2xl border bg-muted/10 p-4 space-y-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="rounded-full text-[10px] font-black uppercase tracking-[0.12em]">
                            {getEquipmentCategoryLabel(item.category)}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full text-[10px] font-black uppercase tracking-[0.12em]",
                              equipmentStatusClass(item.status)
                            )}
                          >
                            {getEquipmentStatusLabel(item.status)}
                          </Badge>
                        </div>
                        {canWrite && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeEquipmentItem(item.id)}
                            className="w-fit rounded-xl text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Retirer
                          </Button>
                        )}
                      </div>

                      <div className="grid gap-3 md:grid-cols-[180px_1fr_180px]">
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                            Categorie
                          </Label>
                          <select
                            value={item.category ?? "other"}
                            onChange={(event) => updateEquipmentItem(item.id, { category: event.target.value })}
                            disabled={!canWrite}
                            className="h-11 w-full rounded-xl border border-border/50 bg-background px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-70"
                          >
                            {AGENT_EQUIPMENT_CATEGORY_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                            Materiel remis
                          </Label>
                          <Input
                            value={item.label ?? ""}
                            onChange={(event) => updateEquipmentItem(item.id, { label: event.target.value })}
                            readOnly={!canWrite}
                            placeholder="Ex: Veste softshell noire, badge parking, radio Motorola"
                            className="h-11 rounded-xl"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                            Reference / taille
                          </Label>
                          <Input
                            value={item.reference ?? ""}
                            onChange={(event) => updateEquipmentItem(item.id, { reference: event.target.value })}
                            readOnly={!canWrite}
                            placeholder="Ex: XL, R-042, badge A12"
                            className="h-11 rounded-xl"
                          />
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                            Statut
                          </Label>
                          <select
                            value={item.status}
                            onChange={(event) => updateEquipmentItem(item.id, { status: event.target.value as AgentEquipmentItem["status"] })}
                            disabled={!canWrite}
                            className="h-11 w-full rounded-xl border border-border/50 bg-background px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-70"
                          >
                            {AGENT_EQUIPMENT_STATUS_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                            Remis le
                          </Label>
                          <Input
                            type="date"
                            value={item.assignedAt ?? ""}
                            onChange={(event) => updateEquipmentItem(item.id, { assignedAt: event.target.value || null })}
                            readOnly={!canWrite}
                            className="h-11 rounded-xl"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                            Retour prevu
                          </Label>
                          <Input
                            type="date"
                            value={item.expectedReturnAt ?? ""}
                            onChange={(event) => updateEquipmentItem(item.id, { expectedReturnAt: event.target.value || null })}
                            readOnly={!canWrite}
                            className="h-11 rounded-xl"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                            Retour effectif
                          </Label>
                          <Input
                            type="date"
                            value={item.returnedAt ?? ""}
                            onChange={(event) => updateEquipmentItem(item.id, { returnedAt: event.target.value || null })}
                            readOnly={!canWrite}
                            className="h-11 rounded-xl"
                          />
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                            Etat
                          </Label>
                          <Input
                            value={item.condition ?? ""}
                            onChange={(event) => updateEquipmentItem(item.id, { condition: event.target.value })}
                            readOnly={!canWrite}
                            placeholder="Ex: Bon etat, neuf, rayure, pile a changer"
                            className="h-11 rounded-xl"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                            Note exploitation
                          </Label>
                          <Input
                            value={item.notes ?? ""}
                            onChange={(event) => updateEquipmentItem(item.id, { notes: event.target.value })}
                            readOnly={!canWrite}
                            placeholder="Ex: remis pour site Tour Eiffel"
                            className="h-11 rounded-xl"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {canWrite && (
                <div className="flex flex-col gap-3 border-t border-border/50 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addEquipmentItem}
                    disabled={equipmentItems.length >= 50}
                    className="rounded-xl font-semibold"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Ajouter un equipement
                  </Button>
                  <Button
                    type="button"
                    onClick={() => savePatch({ equipmentItems })}
                    disabled={saving}
                    className="rounded-xl font-semibold"
                  >
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Enregistrer le materiel
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
            </TabsContent>

            <TabsContent value="documents" className="mt-0 space-y-6">
          <Card className="border-border/50 rounded-2xl shadow-sm bg-card">
            <div className="p-6 border-b border-border/50 flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">
                Dossier documentaire
              </h2>
            </div>
            <CardContent className="p-6 space-y-5">
              <div className="space-y-3">
                {(agent.documents ?? []).length > 0 ? (
                  (agent.documents ?? []).map((document) => {
                    const expiryDays = daysUntil(document.expiresAt);
                    const fileSize = formatFileSize(document.size);
                    const isExpired = expiryDays !== null && expiryDays < 0;
                    const isExpiringSoon =
                      expiryDays !== null && expiryDays >= 0 && expiryDays <= 45;

                    return (
                      <div
                        key={document.id}
                        className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-foreground">
                              {document.label}
                            </p>
                            <Badge variant="secondary" className="text-[10px]">
                              {getDocumentKindLabel(document.kind)}
                            </Badge>
                            {fileSize && (
                              <Badge variant="outline" className="text-[10px]">
                                {fileSize}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1 break-all text-xs text-muted-foreground">
                            {document.fileName || document.url}
                          </p>
                          {document.expiresAt && (
                            <p
                              className={cn(
                                "mt-1 text-xs font-semibold",
                                isExpired && "text-destructive",
                                isExpiringSoon && "text-amber-700",
                                !isExpired && !isExpiringSoon && "text-emerald-700"
                              )}
                            >
                              {isExpired
                                ? `Expire depuis le ${document.expiresAt}`
                                : `Expire le ${document.expiresAt}`}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button asChild variant="outline" size="sm">
                            <a href={document.url} target="_blank" rel="noreferrer">
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Ouvrir
                            </a>
                          </Button>
                          {canWrite && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => removeDocument(document.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed bg-muted/10 p-6 text-center text-sm text-muted-foreground">
                    Aucun document rattache a cet agent.
                  </div>
                )}
              </div>

              {canWrite && (
                <div className="rounded-2xl border bg-muted/10 p-4 space-y-4">
                  <div className="grid gap-3 md:grid-cols-[220px_1fr_180px]">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Type
                      </Label>
                      <select
                        value={documentKind}
                        onChange={(event) => setDocumentKind(event.target.value)}
                        className="h-11 w-full rounded-xl border border-border/50 bg-background px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        {AGENT_DOCUMENT_KIND_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Libelle
                      </Label>
                      <Input
                        value={documentLabel}
                        onChange={(event) => setDocumentLabel(event.target.value)}
                        placeholder="Ex: Carte professionnelle 2026"
                        className="h-11 rounded-xl"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Expiration
                      </Label>
                      <Input
                        type="date"
                        value={documentExpiresAt}
                        onChange={(event) => setDocumentExpiresAt(event.target.value)}
                        className="h-11 rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                    <div className="rounded-xl border border-dashed bg-background p-4">
                      <input
                        id="agent-document-upload"
                        type="file"
                        accept="application/pdf,image/*,.doc,.docx"
                        className="hidden"
                        onChange={(event) =>
                          setDocumentFile(event.target.files?.[0] ?? null)
                        }
                      />
                      <label
                        htmlFor="agent-document-upload"
                        className="flex cursor-pointer items-center gap-3 text-sm"
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <FileUp className="h-5 w-5" />
                        </span>
                        <span>
                          <span className="block font-bold text-foreground">
                            {documentFile
                              ? documentFile.name
                              : "Choisir un fichier a importer"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            PDF, image ou Word. Maximum 12 Mo.
                          </span>
                        </span>
                      </label>
                    </div>

                    <Button
                      type="button"
                      onClick={uploadDocument}
                      disabled={!documentFile || uploadingDocument}
                      className="h-full min-h-16 rounded-xl font-semibold"
                    >
                      {uploadingDocument ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <UploadCloud className="mr-2 h-4 w-4" />
                      )}
                      Importer
                    </Button>
                  </div>

                  <div className="grid gap-3 border-t border-border/50 pt-4 md:grid-cols-[1fr_auto]">
                    <Input
                      value={documentUrl}
                      onChange={(event) => setDocumentUrl(event.target.value)}
                      placeholder="Ou coller une URL de document deja stocke"
                      className="h-11 rounded-xl"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addDocument}
                      disabled={!documentUrl.trim()}
                      className="rounded-xl font-semibold"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Ajouter URL
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

            </TabsContent>
          </Tabs>

          <div className="hidden grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-border/50 rounded-2xl shadow-sm bg-card opacity-60 grayscale">
              <div className="p-5 border-b border-border/50 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Adresse (À venir)</h2>
              </div>
              <CardContent className="p-5 flex items-center justify-center min-h-[100px] text-sm text-muted-foreground italic">
                En cours de développement
              </CardContent>
            </Card>

            <Card className="border-border/50 rounded-2xl shadow-sm bg-card opacity-60 grayscale">
              <div className="p-5 border-b border-border/50 flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">
                  Disponibilités (À venir)
                </h2>
              </div>
              <CardContent className="p-5 flex items-center justify-center min-h-[100px] text-sm text-muted-foreground italic">
                En cours de développement
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
