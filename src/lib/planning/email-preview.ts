import type { AgencyDocumentProfile } from "@/lib/agency/profile";
import type { AgencyEmailSettings } from "@/lib/agency/email-settings";

export const DEFAULT_PREVIEW_FROM_EMAIL = "no-reply@sentrys.fr";

export function agencyEmailIdentity(
  profile?: Partial<AgencyDocumentProfile> | null,
  settings?: Partial<AgencyEmailSettings> | null
) {
  const displayName = String(profile?.displayName ?? "").trim();
  const configuredFromName = String(settings?.fromName ?? "").trim();
  const configuredFromEmail = String(settings?.fromEmail ?? "").trim();
  const configuredReplyTo = String(settings?.replyToEmail ?? "").trim();
  const replyTo = configuredReplyTo || String(profile?.email ?? "").trim();

  return {
    fromName:
      configuredFromName ||
      (displayName ? `${displayName} via Sentrys` : "Votre agence via Sentrys"),
    fromEmail: configuredFromEmail || DEFAULT_PREVIEW_FROM_EMAIL,
    replyTo: replyTo || "Email d'exploitation a configurer",
  };
}

export function previewPeriodLabel(fromIso?: string | null, toIso?: string | null) {
  if (!fromIso || !toIso) return "période a definir";

  const formatter = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return `${formatter.format(new Date(fromIso))} au ${formatter.format(new Date(toIso))}`;
}
