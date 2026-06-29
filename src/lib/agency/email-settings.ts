export const EMAIL_PROVIDERS = ["simulation", "brevo"] as const;
export const EMAIL_SENDING_MODES = ["simulation", "live"] as const;
export const EMAIL_SENDER_STRATEGIES = ["sentrys_shared", "agency_domain"] as const;
export const EMAIL_DOMAIN_STATUSES = ["not_configured", "pending", "verified"] as const;

export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];
export type EmailSendingMode = (typeof EMAIL_SENDING_MODES)[number];
export type EmailSenderStrategy = (typeof EMAIL_SENDER_STRATEGIES)[number];
export type EmailDomainStatus = (typeof EMAIL_DOMAIN_STATUSES)[number];

export type AgencyEmailSettings = {
  provider: EmailProvider;
  sendingMode: EmailSendingMode;
  senderStrategy: EmailSenderStrategy;
  fromName: string | null;
  fromEmail: string | null;
  replyToEmail: string | null;
  testRecipientEmail: string | null;
  domainStatus: EmailDomainStatus;
};

export const DEFAULT_AGENCY_EMAIL_SETTINGS: AgencyEmailSettings = {
  provider: "simulation",
  sendingMode: "simulation",
  senderStrategy: "sentrys_shared",
  fromName: null,
  fromEmail: "no-reply@sentrys.fr",
  replyToEmail: null,
  testRecipientEmail: null,
  domainStatus: "not_configured",
};

function normalizeText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function oneOf<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number]
): T[number] {
  const normalized = String(value ?? "").trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function normalizeAgencyEmailSettings(
  value: unknown,
  fallback?: {
    displayName?: string | null;
    email?: string | null;
  }
): AgencyEmailSettings {
  const data = readRecord(value);
  const provider = oneOf(data.provider, EMAIL_PROVIDERS, "simulation");
  const domainStatus = oneOf(
    data.domainStatus,
    EMAIL_DOMAIN_STATUSES,
    DEFAULT_AGENCY_EMAIL_SETTINGS.domainStatus
  );
  const senderStrategy = oneOf(
    data.senderStrategy,
    EMAIL_SENDER_STRATEGIES,
    DEFAULT_AGENCY_EMAIL_SETTINGS.senderStrategy
  );
  const requestedMode = oneOf(
    data.sendingMode,
    EMAIL_SENDING_MODES,
    DEFAULT_AGENCY_EMAIL_SETTINGS.sendingMode
  );
  const sendingMode =
    provider === "brevo" && domainStatus === "verified" ? requestedMode : "simulation";

  return {
    provider,
    sendingMode,
    senderStrategy,
    fromName:
      normalizeText(data.fromName) ??
      (fallback?.displayName ? `${fallback.displayName} via Sentrys` : null),
    fromEmail:
      normalizeText(data.fromEmail) ?? DEFAULT_AGENCY_EMAIL_SETTINGS.fromEmail,
    replyToEmail: normalizeText(data.replyToEmail) ?? normalizeText(fallback?.email),
    testRecipientEmail: normalizeText(data.testRecipientEmail),
    domainStatus,
  };
}

export function toStoredEmailSettings(settings: AgencyEmailSettings) {
  return {
    provider: settings.provider,
    sendingMode: settings.sendingMode,
    senderStrategy: settings.senderStrategy,
    fromName: settings.fromName,
    fromEmail: settings.fromEmail,
    replyToEmail: settings.replyToEmail,
    testRecipientEmail: settings.testRecipientEmail,
    domainStatus: settings.domainStatus,
  };
}

export function emailProviderLabel(provider: EmailProvider) {
  if (provider === "brevo") return "Brevo";
  return "Simulation";
}

export function emailSendingModeLabel(mode: EmailSendingMode) {
  if (mode === "live") return "Envoi reel";
  return "Simulation securisee";
}

export function emailSenderStrategyLabel(strategy: EmailSenderStrategy) {
  if (strategy === "agency_domain") return "Domaine agence";
  return "Domaine Sentrys partage";
}

export function emailDomainStatusLabel(status: EmailDomainStatus) {
  if (status === "verified") return "Domaine verifie";
  if (status === "pending") return "Validation en attente";
  return "Domaine non configure";
}
