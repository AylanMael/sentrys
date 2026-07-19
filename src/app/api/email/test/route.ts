import { NextRequest, NextResponse } from "next/server";

import {
  canManageUsersRole,
  requireTenantUser,
} from "@/app/api/_utils/withTenant";
import { adminDb } from "@/lib/firebase/admin";
import { profileFromTenant } from "@/lib/agency/profile";
import { normalizeAgencyEmailSettings } from "@/lib/agency/email-settings";
import { agencyEmailIdentity } from "@/lib/planning/email-preview";
import {
  getAgencyEmailDeliveryReadiness,
  sendAgencyTransactionalEmail,
} from "@/lib/email/delivery";
import { logActivity } from "@/lib/activity/logger";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function normalizeText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function testEmailHtml(input: {
  agencyName: string;
  senderEmail: string;
  replyTo: string;
  statusDétail: string;
}) {
  return `
    <html>
      <body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px;">
          <tr>
            <td align="center">
              <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e5e7eb;">
                <tr>
                  <td style="padding:24px 28px;background:#111827;color:#ffffff;">
                    <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#9ca3af;">Sentrys</p>
                    <h1 style="margin:6px 0 0;font-size:24px;line-height:1.2;">Test de configuration email</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:26px 28px;">
                    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">
                      Bonjour,
                    </p>
                    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">
                      Ceci est un message de test emis par <strong>${escapeHtml(input.agencyName)}</strong>
                      depuis Sentrys. Il sert à vérifier l'identité expediteur avant la diffusion
                      réelle des plannings agents et clients.
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:18px 0;">
                      <tr>
                        <td style="padding:10px 0;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;">Expediteur</td>
                        <td style="padding:10px 0;border-top:1px solid #e5e7eb;text-align:right;font-size:13px;font-weight:700;">${escapeHtml(input.senderEmail)}</td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;">Reponse vers</td>
                        <td style="padding:10px 0;border-top:1px solid #e5e7eb;text-align:right;font-size:13px;font-weight:700;">${escapeHtml(input.replyTo)}</td>
                      </tr>
                    </table>
                    <p style="margin:18px 0 0;padding:14px 16px;border-radius:14px;background:#ecfeff;color:#155e75;font-size:13px;line-height:1.5;">
                      ${escapeHtml(input.statusDétail)}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 28px;background:#f9fafb;color:#6b7280;font-size:12px;">
                    Document technique Sentrys - aucune action n'est requise si vous avez bien reçu ce message.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

export async function POST(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!canManageUsersRole(auth.role)) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const tenantSnap = await adminDb.collection("tenants").doc(auth.tenantId).get();
  const tenant = tenantSnap.exists
    ? (tenantSnap.data() as Record<string, unknown>)
    : null;
  const profile = profileFromTenant(tenant);
  const emailSettings = normalizeAgencyEmailSettings(
    tenant?.agencyEmailSettings,
    profile
  );
  const identity = agencyEmailIdentity(profile, emailSettings);
  const readiness = getAgencyEmailDeliveryReadiness(emailSettings);
  const recipientEmail =
    normalizeText(body.toEmail) ??
    emailSettings.testRecipientEmail ??
    auth.email ??
    profile.email;
  const agencyName = profile.displayName || "Votre agence";
  const statusDétail = readiness.liveReady
    ? "Configuration prête : ce test tente un envoi réel via Brevo."
    : readiness.detail;

  const delivery = await sendAgencyTransactionalEmail({
    settings: emailSettings,
    fromName: identity.fromName,
    fromEmail: identity.fromEmail,
    replyToEmail: identity.replyTo,
    toName: auth.name ?? auth.email,
    toEmail: recipientEmail,
    subject: `Test Sentrys - ${agencyName}`,
    htmlContent: testEmailHtml({
      agencyName,
      senderEmail: identity.fromEmail,
      replyTo: identity.replyTo,
      statusDétail,
    }),
    textContent: [
      `Test Sentrys - ${agencyName}`,
      `Expediteur: ${identity.fromEmail}`,
      `Reply-To: ${identity.replyTo}`,
      statusDétail,
    ].join("\n"),
    tags: ["sentrys", "email-test", auth.tenantId],
  });

  await logActivity({
    tenantId: auth.tenantId,
    actorUid: auth.uid,
    actorEmail: auth.email ?? null,
    actorRole: auth.role ?? null,
    action: `email.test.${delivery.status}`,
    entityType: "system",
    entityId: auth.tenantId,
    message:
      delivery.status === "sent"
        ? "Email de test envoyé"
        : delivery.status === "simulated"
          ? "Email de test simulé"
          : "Email de test non envoyé",
    severity: delivery.ok ? "info" : "warning",
    meta: {
      readiness,
      delivery,
      recipientEmail: delivery.recipientEmail ?? recipientEmail,
      senderEmail: delivery.senderEmail ?? identity.fromEmail,
    },
  });

  return json(200, {
    ok: true,
    readiness,
    delivery,
    recipientEmail: delivery.recipientEmail ?? recipientEmail,
    senderEmail: delivery.senderEmail ?? identity.fromEmail,
    replyToEmail: identity.replyTo,
  });
}
