export const AGENT_QUALIFICATION_OPTIONS = [
  "ADS",
  "SSIAP 1",
  "SSIAP 2",
  "SSIAP 3",
  "SST",
  "Cynophile",
  "Rondier",
  "Chef de poste",
] as const;

export const AGENT_DOCUMENT_KIND_OPTIONS = [
  { value: "professional_card", label: "Carte professionnelle" },
  { value: "identity", label: "Piece d'identite" },
  { value: "address_proof", label: "Justificatif domicile" },
  { value: "qualification", label: "Diplome / qualification" },
  { value: "medical", label: "Document medical" },
  { value: "contract", label: "Contrat / avenant" },
  { value: "other", label: "Autre document" },
] as const;
export const AGENT_EQUIPMENT_CATEGORY_OPTIONS = [
  { value: "uniform", label: "Tenue" },
  { value: "badge", label: "Badge / acces" },
  { value: "radio", label: "Radio" },
  { value: "keys", label: "Cles" },
  { value: "pti", label: "PTI / DATI" },
  { value: "flashlight", label: "Lampe" },
  { value: "vehicle", label: "Vehicule" },
  { value: "other", label: "Autre" },
] as const;

export const AGENT_EQUIPMENT_STATUS_OPTIONS = [
  { value: "assigned", label: "Remis" },
  { value: "returned", label: "Retourne" },
  { value: "damaged", label: "Abime" },
  { value: "lost", label: "Perdu" },
] as const;

export type AgentEquipmentItem = {
  id: string;
  label: string;
  category: string | null;
  reference?: string | null;
  assignedAt?: string | null;
  expectedReturnAt?: string | null;
  returnedAt?: string | null;
  status: "assigned" | "returned" | "damaged" | "lost";
  condition?: string | null;
  notes?: string | null;
};
export type AgentProfileFields = {
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

export type AgentDocumentItem = {
  id: string;
  label: string;
  url: string;
  kind: string | null;
  expiresAt: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  size?: number | null;
  uploadedAt?: string | null;
};

export function normalizeAgentProfileField(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

export function normalizeAgentQualifications(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
    )
  ).slice(0, 20);
}

export function normalizeAgentDocuments(value: unknown): AgentDocumentItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> => {
      return Boolean(item) && typeof item === "object";
    })
    .map((item, index) => ({
      id:
        normalizeAgentProfileField(item.id) ??
        `${Date.now().toString(36)}-${index}`,
      label: normalizeAgentProfileField(item.label) ?? "Document",
      url: normalizeAgentProfileField(item.url) ?? "",
      kind: normalizeAgentProfileField(item.kind),
      expiresAt: normalizeAgentProfileField(item.expiresAt),
      fileName: normalizeAgentProfileField(item.fileName),
      mimeType: normalizeAgentProfileField(item.mimeType),
      size:
        typeof item.size === "number" && Number.isFinite(item.size)
          ? Math.max(0, Math.round(item.size))
          : null,
      uploadedAt: normalizeAgentProfileField(item.uploadedAt),
    }))
    .filter((item) => item.url.length > 0)
    .slice(0, 30);
}
export function normalizeAgentEquipmentItems(value: unknown): AgentEquipmentItem[] {
  if (!Array.isArray(value)) return [];

  const allowedStatuses = new Set(["assigned", "returned", "damaged", "lost"]);

  return value
    .filter((item): item is Record<string, unknown> => {
      return Boolean(item) && typeof item === "object";
    })
    .map((item, index) => {
      const status = normalizeAgentProfileField(item.status) ?? "assigned";

      return {
        id:
          normalizeAgentProfileField(item.id) ??
          `${Date.now().toString(36)}-${index}`,
        label: normalizeAgentProfileField(item.label) ?? "Equipement",
        category: normalizeAgentProfileField(item.category) ?? "other",
        reference: normalizeAgentProfileField(item.reference),
        assignedAt: normalizeAgentProfileField(item.assignedAt),
        expectedReturnAt: normalizeAgentProfileField(item.expectedReturnAt),
        returnedAt: normalizeAgentProfileField(item.returnedAt),
        status: allowedStatuses.has(status) ? (status as AgentEquipmentItem["status"]) : "assigned",
        condition: normalizeAgentProfileField(item.condition),
        notes: normalizeAgentProfileField(item.notes),
      };
    })
    .filter((item) => item.label.length > 0)
    .slice(0, 50);
}
