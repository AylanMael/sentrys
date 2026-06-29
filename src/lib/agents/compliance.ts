import { type AgentDocumentItem } from "@/lib/agents/profile";

export type AgentComplianceSeverity = "ok" | "info" | "warning" | "blocking";

export type AgentComplianceAlert = {
  code: string;
  title: string;
  detail: string;
  severity: Exclude<AgentComplianceSeverity, "ok">;
};

export type AgentComplianceInput = {
  status?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  photoUrl?: string | null;
  employeeNumber?: string | null;
  professionalCardNumber?: string | null;
  professionalCardExpiresAt?: string | null;
  qualifications?: string[] | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  documents?: AgentDocumentItem[] | null;
  profile?: Partial<AgentComplianceInput> | null;
};

export type AgentComplianceOptions = {
  requiredQualification?: string | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalized(value: unknown) {
  return clean(value).toLowerCase();
}

function field<T extends keyof AgentComplianceInput>(
  agent: AgentComplianceInput,
  key: T
) {
  const profile = agent.profile && typeof agent.profile === "object" ? agent.profile : {};
  return (agent[key] ?? profile[key]) as AgentComplianceInput[T];
}

function daysUntil(date: string | null | undefined) {
  const value = clean(date);
  if (!value) return null;

  const target = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(target.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function qualificationsOf(agent: AgentComplianceInput) {
  const value = field(agent, "qualifications");
  return Array.isArray(value) ? value.map(normalized).filter(Boolean) : [];
}

function documentsOf(agent: AgentComplianceInput) {
  const value = field(agent, "documents");
  return Array.isArray(value) ? value : [];
}

function hasDocumentKind(agent: AgentComplianceInput, kind: string) {
  return documentsOf(agent).some((document) => document.kind === kind);
}

function hasRequiredQualification(
  agent: AgentComplianceInput,
  requiredQualification: string | null | undefined
) {
  const required = normalized(requiredQualification);
  if (!required) return true;
  return qualificationsOf(agent).includes(required);
}

export function computeAgentCompleteness(agent: AgentComplianceInput) {
  const checks = [
    field(agent, "photoUrl"),
    field(agent, "firstName"),
    field(agent, "lastName"),
    field(agent, "phone") || field(agent, "email"),
    field(agent, "employeeNumber"),
    field(agent, "professionalCardNumber"),
    field(agent, "professionalCardExpiresAt"),
    qualificationsOf(agent).length > 0,
    field(agent, "emergencyContactName") && field(agent, "emergencyContactPhone"),
    documentsOf(agent).length > 0,
  ];

  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function computeAgentCompliance(
  agent: AgentComplianceInput,
  options: AgentComplianceOptions = {}
) {
  const alerts: AgentComplianceAlert[] = [];
  const status = normalized(field(agent, "status") ?? agent.status ?? "active");
  const cardNumber = clean(field(agent, "professionalCardNumber"));
  const cardExpiresAt = clean(field(agent, "professionalCardExpiresAt"));
  const cardDays = daysUntil(cardExpiresAt);
  const requiredQualification = clean(options.requiredQualification);

  if (status && status !== "active") {
    alerts.push({
      code: "agent_inactive",
      title: "Agent inactif",
      detail: "Cet agent ne doit pas etre affecte tant qu'il est inactif.",
      severity: "blocking",
    });
  }

  if (requiredQualification && !hasRequiredQualification(agent, requiredQualification)) {
    alerts.push({
      code: "required_qualification_missing",
      title: "Qualification requise absente",
      detail: `La mission demande ${requiredQualification}.`,
      severity: "blocking",
    });
  }

  if (!cardNumber) {
    alerts.push({
      code: "professional_card_missing",
      title: "Carte professionnelle non renseignee",
      detail: "Numero CNAPS a completer pour securiser l'exploitation.",
      severity: "warning",
    });
  }

  if (!cardExpiresAt) {
    alerts.push({
      code: "professional_card_expiry_missing",
      title: "Expiration carte pro absente",
      detail: "Impossible d'anticiper le renouvellement sans date d'expiration.",
      severity: "warning",
    });
  } else if (cardDays !== null && cardDays < 0) {
    alerts.push({
      code: "professional_card_expired",
      title: "Carte professionnelle expiree",
      detail: "Affectation bloquee jusqu'a regularisation.",
      severity: "blocking",
    });
  } else if (cardDays !== null && cardDays <= 60) {
    alerts.push({
      code: "professional_card_expiring_soon",
      title: "Carte pro bientot expiree",
      detail: `Expiration dans ${cardDays} jour${cardDays > 1 ? "s" : ""}.`,
      severity: "warning",
    });
  }

  if (qualificationsOf(agent).length === 0) {
    alerts.push({
      code: "qualifications_missing",
      title: "Qualifications non renseignees",
      detail: "Renseignez ADS, SSIAP, SST ou les habilitations utiles.",
      severity: "warning",
    });
  }

  if (!field(agent, "phone") && !field(agent, "email")) {
    alerts.push({
      code: "contact_missing",
      title: "Contact absent",
      detail: "Ajoutez un telephone ou un email avant diffusion planning.",
      severity: "warning",
    });
  }

  if (!hasDocumentKind(agent, "professional_card")) {
    alerts.push({
      code: "professional_card_document_missing",
      title: "Copie carte pro non archivee",
      detail: "Archivez le fichier pour un dossier agent complet.",
      severity: "info",
    });
  }

  const worst: AgentComplianceSeverity = alerts.some(
    (alert) => alert.severity === "blocking"
  )
    ? "blocking"
    : alerts.some((alert) => alert.severity === "warning")
      ? "warning"
      : alerts.some((alert) => alert.severity === "info")
        ? "info"
        : "ok";

  return {
    status: worst,
    completeness: computeAgentCompleteness(agent),
    alerts,
    blockingAlerts: alerts.filter((alert) => alert.severity === "blocking"),
    warningAlerts: alerts.filter((alert) => alert.severity === "warning"),
  };
}
