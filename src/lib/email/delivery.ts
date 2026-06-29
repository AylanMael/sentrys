import type { AgencyEmailSettings, EmailProvider } from "@/lib/agency/email-settings";

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const BREVO_API_KEY_ENV_NAMES = ["BREVO_API_KEY", "NEXT_PRIVATE_BREVO_API_KEY"] as const;

export type EmailDeliveryStatus = "simulated" | "sent" | "blocked" | "failed";

export type EmailDeliveryReadiness = {
  liveReady: boolean;
  provider: EmailProvider;
  sendingMode: AgencyEmailSettings["sendingMode"];
  domainStatus: AgencyEmailSettings["domainStatus"];
  apiKeyPresent: boolean;
  reason: string | null;
  detail: string;
};

export type SendAgencyEmailInput = {
  settings: AgencyEmailSettings;
  fromName: string;
  fromEmail: string;
  replyToEmail?: string | null;
  toName?: string | null;
  toEmail: string | null;
  subject: string;
  htmlContent?: string | null;
  textContent?: string | null;
  tags?: string[];
};

export type EmailDeliveryResult = {
  ok: boolean;
  provider: EmailProvider;
  status: EmailDeliveryStatus;
  requestedLive: boolean;
  messageId: string | null;
  reason: string | null;
  detail: string | null;
  recipientEmail: string | null;
  senderEmail: string | null;
  sentAtIso: string;
};

function normalizeText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function normalizeEmail(value: unknown): string | null {
  const text = normalizeText(value)?.toLowerCase() ?? null;
  if (!text || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return null;
  return text;
}

function brevoApiKey() {
  for (const envName of BREVO_API_KEY_ENV_NAMES) {
    const value = normalizeText(process.env[envName]);
    if (value) return value;
  }

  return null;
}

function payloadDetail(payload: unknown) {
  if (typeof payload === "string") return payload.slice(0, 500);

  try {
    return JSON.stringify(payload).slice(0, 500);
  } catch {
    return "Reponse fournisseur illisible.";
  }
}

export function getAgencyEmailDeliveryReadiness(
  settings: AgencyEmailSettings
): EmailDeliveryReadiness {
  const apiKeyPresent = Boolean(brevoApiKey());

  if (settings.provider !== "brevo") {
    return {
      liveReady: false,
      provider: settings.provider,
      sendingMode: settings.sendingMode,
      domainStatus: settings.domainStatus,
      apiKeyPresent,
      reason: "provider_simulation",
      detail: "Fournisseur en simulation : aucun email reel ne sera envoye.",
    };
  }

  if (settings.sendingMode !== "live") {
    return {
      liveReady: false,
      provider: settings.provider,
      sendingMode: settings.sendingMode,
      domainStatus: settings.domainStatus,
      apiKeyPresent,
      reason: "mode_simulation",
      detail: "Mode simulation actif : l'envoi reel est volontairement neutralise.",
    };
  }

  if (settings.domainStatus !== "verified") {
    return {
      liveReady: false,
      provider: settings.provider,
      sendingMode: settings.sendingMode,
      domainStatus: settings.domainStatus,
      apiKeyPresent,
      reason: "domain_not_verified",
      detail: "Domaine expediteur non verifie : l'envoi reel reste bloque.",
    };
  }

  if (!apiKeyPresent) {
    return {
      liveReady: false,
      provider: settings.provider,
      sendingMode: settings.sendingMode,
      domainStatus: settings.domainStatus,
      apiKeyPresent,
      reason: "missing_api_key",
      detail: "Cle API Brevo absente cote serveur : definir BREVO_API_KEY.",
    };
  }

  return {
    liveReady: true,
    provider: settings.provider,
    sendingMode: settings.sendingMode,
    domainStatus: settings.domainStatus,
    apiKeyPresent,
    reason: null,
    detail: "Configuration prete pour l'envoi reel via Brevo.",
  };
}

export async function sendAgencyTransactionalEmail(
  input: SendAgencyEmailInput
): Promise<EmailDeliveryResult> {
  const sentAtIso = new Date().toISOString();
  const toEmail = normalizeEmail(input.toEmail);
  const fromEmail = normalizeEmail(input.fromEmail);
  const requestedLive =
    input.settings.provider === "brevo" && input.settings.sendingMode === "live";

  if (!toEmail) {
    return {
      ok: false,
      provider: input.settings.provider,
      status: "blocked",
      requestedLive,
      messageId: null,
      reason: "missing_recipient",
      detail: "Destinataire email manquant ou invalide.",
      recipientEmail: null,
      senderEmail: fromEmail,
      sentAtIso,
    };
  }

  if (!fromEmail) {
    return {
      ok: false,
      provider: input.settings.provider,
      status: "blocked",
      requestedLive,
      messageId: null,
      reason: "missing_sender",
      detail: "Email expediteur manquant ou invalide.",
      recipientEmail: toEmail,
      senderEmail: null,
      sentAtIso,
    };
  }

  const readiness = getAgencyEmailDeliveryReadiness(input.settings);
  if (!readiness.liveReady) {
    const status: EmailDeliveryStatus = requestedLive ? "blocked" : "simulated";

    return {
      ok: status === "simulated",
      provider: input.settings.provider,
      status,
      requestedLive,
      messageId: null,
      reason: readiness.reason,
      detail: readiness.detail,
      recipientEmail: toEmail,
      senderEmail: fromEmail,
      sentAtIso,
    };
  }

  const apiKey = brevoApiKey();
  if (!apiKey) {
    return {
      ok: false,
      provider: "brevo",
      status: "blocked",
      requestedLive,
      messageId: null,
      reason: "missing_api_key",
      detail: "Cle API Brevo absente cote serveur : definir BREVO_API_KEY.",
      recipientEmail: toEmail,
      senderEmail: fromEmail,
      sentAtIso,
    };
  }

  const fromName = normalizeText(input.fromName) ?? "Sentrys";
  const toName = normalizeText(input.toName);
  const replyToEmail = normalizeEmail(input.replyToEmail);
  const subject = normalizeText(input.subject) ?? "Message Sentrys";
  const htmlContent = normalizeText(input.htmlContent);
  const textContent = normalizeText(input.textContent);

  const body = {
    sender: {
      email: fromEmail,
      name: fromName,
    },
    to: [
      {
        email: toEmail,
        ...(toName ? { name: toName } : {}),
      },
    ],
    ...(replyToEmail ? { replyTo: { email: replyToEmail } } : {}),
    subject,
    ...(htmlContent ? { htmlContent } : { textContent: textContent ?? subject }),
    ...(input.tags?.length ? { tags: input.tags.slice(0, 10) } : {}),
  };

  try {
    const response = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : await response.text().catch(() => "");

    if (!response.ok) {
      return {
        ok: false,
        provider: "brevo",
        status: "failed",
        requestedLive,
        messageId: null,
        reason: `brevo_http_${response.status}`,
        detail: payloadDetail(payload),
        recipientEmail: toEmail,
        senderEmail: fromEmail,
        sentAtIso,
      };
    }

    const data = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};

    return {
      ok: true,
      provider: "brevo",
      status: "sent",
      requestedLive,
      messageId: normalizeText(data.messageId),
      reason: null,
      detail: null,
      recipientEmail: toEmail,
      senderEmail: fromEmail,
      sentAtIso,
    };
  } catch (error) {
    return {
      ok: false,
      provider: "brevo",
      status: "failed",
      requestedLive,
      messageId: null,
      reason: "brevo_request_failed",
      detail: error instanceof Error ? error.message : String(error),
      recipientEmail: toEmail,
      senderEmail: fromEmail,
      sentAtIso,
    };
  }
}
