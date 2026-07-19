"use client";

import React from "react";
import { CheckCircle2, Copy, Mail, Paperclip, ShieldCheck } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type EmailPreviewAttachment = {
  label: string;
  href?: string;
  note?: string;
};

export type EmailPreviewData = {
  kind: "agent" | "client";
  status: "ready" | "blocked";
  statusLabel: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  toName: string;
  toEmail: string | null;
  subject: string;
  preheader: string;
  bodyLines: string[];
  attachments: EmailPreviewAttachment[];
  warnings?: string[];
};

function asDraftText(preview: EmailPreviewData) {
  return [
    `De: ${preview.fromName} <${preview.fromEmail}>`,
    `Repondre a: ${preview.replyTo}`,
    `A: ${preview.toName} <${preview.toEmail || "email manquant"}>`,
    `Objet: ${preview.subject}`,
    "",
    preview.preheader,
    "",
    ...preview.bodyLines,
    "",
    "Pieces jointes / liens prevus:",
    ...preview.attachments.map((attachment) =>
      `- ${attachment.label}${attachment.href ? ` (${attachment.href})` : ""}`
    ),
  ].join("\n");
}

export const EmailPreviewDialog: React.FC<{
  open: boolean;
  preview: EmailPreviewData | null;
  onOpenChange: (open: boolean) => void;
}> = ({ open, preview, onOpenChange }) => {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  if (!preview) return null;

  async function copyDraft() {
    if (!preview) return;

    try {
      await navigator.clipboard.writeText(asDraftText(preview));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto rounded-[2rem] border-slate-200 bg-white p-0 shadow-2xl dark:bg-slate-950">
        <DialogHeader className="border-b border-slate-200 bg-slate-50/80 px-6 py-5 dark:border-slate-800 dark:bg-slate-900/70">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2 text-xl font-black tracking-tight">
                <Mail className="h-5 w-5 text-sky-600" />
                Prévisualisation email {preview.kind === "agent" ? "agent" : "client"}
              </DialogTitle>
              <DialogDescription className="mt-1">
                Brouillon exact avant branchement Brevo. Aucun email réel ne part.
              </DialogDescription>
            </div>

            <Badge
              variant="outline"
              className={cn(
                "w-fit rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]",
                preview.status === "ready"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              )}
            >
              {preview.statusLabel}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <PreviewField label="Expediteur affiche" value={preview.fromName} />
            <PreviewField label="Expediteur technique" value={preview.fromEmail} />
            <PreviewField label="Reponse vers" value={preview.replyTo} />
            <PreviewField
              label="Destinataire"
              value={
                preview.toEmail
                  ? `${preview.toName} <${preview.toEmail}>`
                  : `${preview.toName} - email manquant`
              }
              warning={!preview.toEmail}
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Objet
            </p>
            <p className="mt-2 text-base font-black">{preview.subject}</p>
            <p className="mt-1 text-sm text-muted-foreground">{preview.preheader}</p>
          </div>

          <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Corps du mail
              </p>
            </div>
            <div className="space-y-3 p-4 text-sm leading-6 text-slate-700 dark:text-slate-200">
              {preview.bodyLines.map((line, index) => (
                <p key={`${line}-${index}`}>{line}</p>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-slate-500" />
              <p className="text-sm font-black">PDF prevu</p>
            </div>
            <div className="mt-3 space-y-2">
              {preview.attachments.map((attachment) => (
                <div
                  key={attachment.label}
                  className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-bold">{attachment.label}</p>
                    {attachment.note && (
                      <p className="text-xs text-muted-foreground">{attachment.note}</p>
                    )}
                  </div>
                  {attachment.href && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        window.open(attachment.href, "_blank", "noopener,noreferrer")
                      }
                    >
                      Ouvrir
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {preview.warnings && preview.warnings.length > 0 && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
              <p className="font-black">Points à vérifier</p>
              <ul className="mt-2 list-inside list-disc space-y-1">
                {preview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-900 dark:text-emerald-100">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Mode simulation: ce brouillon est prêt pour l'integration Brevo,
                mais aucun email réel n'est envoyé tant que le domaine et la cle API
                ne sont pas configures.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-slate-200 bg-slate-50/80 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/70">
          <Button type="button" variant="outline" onClick={copyDraft}>
            {copied ? (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            ) : (
              <Copy className="mr-2 h-4 w-4" />
            )}
            {copied ? "Brouillon copie" : "Copier le brouillon"}
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const PreviewField: React.FC<{
  label: string;
  value: string;
  warning?: boolean;
}> = ({ label, value, warning }) => (
  <div
    className={cn(
      "rounded-2xl border p-3",
      warning
        ? "border-amber-500/30 bg-amber-500/10"
        : "border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/40"
    )}
  >
    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
      {label}
    </p>
    <p className="mt-1 break-words text-sm font-bold">{value}</p>
  </div>
);
