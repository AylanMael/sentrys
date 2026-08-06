import { Clock, LockKeyhole } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatDate, formatTime, sessionStatusClass, SUPPORT_DURATIONS, SUPPORT_SCOPES, supportScopeLabel } from "../format";
import type { SupportSessionRow, SupportScope, TenantDétailResponse } from "../types";

export function SupportSessionAction({
  open,
  scope,
  durationMinutes,
  reason,
  confirmation,
  submitting,
  error,
  success,
  onOpenChange,
  onScopeChange,
  onDurationChange,
  onReasonChange,
  onConfirmationChange,
  onSubmit,
}: {
  open: boolean;
  scope: SupportScope;
  durationMinutes: number;
  reason: string;
  confirmation: string;
  submitting: boolean;
  error: string | null;
  success: string | null;
  onOpenChange: (open: boolean) => void;
  onScopeChange: (scope: SupportScope) => void;
  onDurationChange: (duration: number) => void;
  onReasonChange: (reason: string) => void;
  onConfirmationChange: (confirmation: string) => void;
  onSubmit: () => Promise<void>;
}) {
  const expectedConfirmation = "OUVRIR SUPPORT";
  const canSubmit =
    reason.trim().length >= 12 &&
    confirmation.trim().toUpperCase() === expectedConfirmation &&
    !submitting;

  if (!open) {
    return (
      <div className="rounded-2xl border bg-muted/20 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-black">Session support agence</p>
            <p className="mt-1 text-sm font-semibold leading-5 text-muted-foreground">
              Ouvre une intervention VSW Digital limitee, en lecture seule, sans impersonation et avec audit.
            </p>
            {success ? (
              <p className="mt-2 text-xs font-black text-emerald-700 dark:text-emerald-300">
                {success}
              </p>
            ) : null}
          </div>
          <Button type="button" variant="outline" className="rounded-2xl font-black" onClick={() => onOpenChange(true)}>
            Ouvrir
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-sky-500/25 bg-sky-500/10 p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-black">Ouvrir une session support</p>
          <p className="mt-1 text-sm font-semibold leading-5 text-muted-foreground">
            Cette session trace l'intervention et prépare un futur accès support contrôlé.
          </p>
        </div>
        <Badge variant="outline" className="w-fit rounded-full">
          Confirmation : {expectedConfirmation}
        </Badge>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {SUPPORT_SCOPES.map((item) => {
          const selected = scope === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onScopeChange(item.id)}
              className={cn(
                "rounded-2xl border bg-background/80 p-3 text-left transition hover:border-primary/40",
                selected && "border-primary bg-primary/10 ring-2 ring-primary/10"
              )}
            >
              <p className="font-black">{item.name}</p>
              <p className="mt-1 text-xs font-semibold text-muted-foreground">{item.detail}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {SUPPORT_DURATIONS.map((duration) => (
          <Button
            key={duration}
            type="button"
            variant={durationMinutes === duration ? "default" : "outline"}
            className="rounded-2xl font-black"
            onClick={() => onDurationChange(duration)}
          >
            {duration} min
          </Button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Motif obligatoire
          </label>
          <Textarea
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Exemple : assistance client suite a un ticket, verification d'une anomalie de quota..."
            className="min-h-24 rounded-2xl bg-background/80 font-semibold"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Double confirmation
          </label>
          <Input
            value={confirmation}
            onChange={(event) => onConfirmationChange(event.target.value)}
            placeholder={"Tapez " + expectedConfirmation}
            className="h-11 rounded-2xl bg-background/80 font-black uppercase"
          />
        </div>

        {error ? (
          <p className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm font-bold text-red-800 dark:text-red-100">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-2xl font-black" disabled={submitting} onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" className="rounded-2xl font-black" disabled={!canSubmit} onClick={() => void onSubmit()}>
            {submitting ? "Ouverture..." : "Ouvrir support"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function StatusGovernanceAction({
  tenant,
  open,
  reason,
  confirmation,
  submitting,
  error,
  success,
  onOpenChange,
  onReasonChange,
  onConfirmationChange,
  onSubmit,
}: {
  tenant: TenantDétailResponse["tenant"] | null | undefined;
  open: boolean;
  reason: string;
  confirmation: string;
  submitting: boolean;
  error: string | null;
  success: string | null;
  onOpenChange: (open: boolean) => void;
  onReasonChange: (reason: string) => void;
  onConfirmationChange: (confirmation: string) => void;
  onSubmit: (
    targetStatus: "active" | "suspended",
    expectedConfirmation: string
  ) => Promise<void>;
}) {
  const currentStatus = String(tenant?.status ?? "active").toLowerCase();
  const isSuspended = currentStatus === "suspended";
  const targetStatus: "active" | "suspended" = isSuspended
    ? "active"
    : "suspended";
  const expectedConfirmation = isSuspended ? "REACTIVER" : "SUSPENDRE";
  const actionLabel = isSuspended ? "Reactiver l'agence" : "Suspendre l'agence";
  const actionTone = isSuspended
    ? "border-emerald-500/25 bg-emerald-500/10"
    : "border-red-500/25 bg-red-500/10";
  const canSubmit =
    reason.trim().length >= 12 &&
    confirmation.trim().toUpperCase() === expectedConfirmation &&
    !submitting;

  if (!open) {
    return (
      <div className="rounded-2xl border bg-muted/20 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-black">Suspendre / réactiver</p>
            <p className="mt-1 text-sm font-semibold leading-5 text-muted-foreground">
              Action sensible avec motif obligatoire, confirmation explicite et audit automatique.
            </p>
            {success ? (
              <p className="mt-2 text-xs font-black text-emerald-700 dark:text-emerald-300">
                {success}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant={isSuspended ? "default" : "outline"}
            className="rounded-2xl font-black"
            onClick={() => onOpenChange(true)}
          >
            {isSuspended ? "Reactiver" : "Suspendre"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-2xl border p-4", actionTone)}>
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-black">{actionLabel}</p>
          <p className="mt-1 text-sm font-semibold leading-5 text-muted-foreground">
            Cette action modifié le statut SaaS de l'agence et créé une tracé platformAuditLog.
          </p>
        </div>
        <Badge variant="outline" className="w-fit rounded-full">
          Confirmation : {expectedConfirmation}
        </Badge>
      </div>

      <div className="mt-4 space-y-3">
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Motif obligatoire
          </label>
          <Textarea
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Exemple : impaye confirme par la direction, suspension temporaire demandee..."
            className="min-h-24 rounded-2xl bg-background/80 font-semibold"
          />
          <p className="text-xs font-semibold text-muted-foreground">
            Minimum 12 caracteres. Ce motif sera visible dans l'audit plateforme.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Double confirmation
          </label>
          <Input
            value={confirmation}
            onChange={(event) => onConfirmationChange(event.target.value)}
            placeholder={"Tapez " + expectedConfirmation}
            className="h-11 rounded-2xl bg-background/80 font-black uppercase"
          />
        </div>

        {error ? (
          <p className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm font-bold text-red-800 dark:text-red-100">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-2xl font-black"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Annuler
          </Button>
          <Button
            type="button"
            className={cn(
              "rounded-2xl font-black",
              targetStatus === "suspended" && "bg-red-600 text-white hover:bg-red-700"
            )}
            disabled={!canSubmit}
            onClick={() => void onSubmit(targetStatus, expectedConfirmation)}
          >
            {submitting ? "Application..." : actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SupportSessionsPanel({
  sessions,
  closeSessionId,
  closeReason,
  closeConfirmation,
  closeSubmitting,
  closeError,
  closeSuccess,
  onOpenClose,
  onCancelClose,
  onReasonChange,
  onConfirmationChange,
  onSubmitClose,
}: {
  sessions: SupportSessionRow[];
  closeSessionId: string | null;
  closeReason: string;
  closeConfirmation: string;
  closeSubmitting: boolean;
  closeError: string | null;
  closeSuccess: string | null;
  onOpenClose: (sessionId: string) => void;
  onCancelClose: () => void;
  onReasonChange: (reason: string) => void;
  onConfirmationChange: (confirmation: string) => void;
  onSubmitClose: (sessionId: string) => Promise<void>;
}) {
  const expectedConfirmation = "CLOTURER SUPPORT";
  const activeCount = sessions.filter((session) => session.status === "active").length;

  return (
    <Card className="overflow-hidden rounded-[2rem] border-border/60">
      <CardHeader className="border-b bg-muted/25">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl font-black">
              <LockKeyhole className="h-5 w-5 text-primary" />
              Sessions support
            </CardTitle>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Suivi des interventions VSW Digital ouvertes pour cette agence.
            </p>
          </div>
          <Badge variant="outline" className="w-fit rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]">
            {activeCount} active(s)
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {closeSuccess ? (
          <p className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm font-black text-emerald-800 dark:text-emerald-100">
            {closeSuccess}
          </p>
        ) : null}

        {sessions.length > 0 ? (
          sessions.map((session) => {
            const isActive = session.status === "active";
            const isClosing = closeSessionId === session.id;
            const canClose =
              closeReason.trim().length >= 12 &&
              closeConfirmation.trim().toUpperCase() === expectedConfirmation &&
              !closeSubmitting;

            return (
              <div key={session.id} className="rounded-2xl border bg-background/80 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={cn("rounded-full border px-3 py-1 font-black", sessionStatusClass(session.status))}>
                        {session.status === "active" ? "Active" : "Cloturee"}
                      </Badge>
                      <Badge variant="outline" className="rounded-full">
                        {supportScopeLabel(session.scope)}
                      </Badge>
                      <Badge variant="outline" className="rounded-full">
                        {session.readOnly ? "Lecture seule" : "Ecriture"}
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm font-black">
                      {session.reason ?? "Motif non renseigné"}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-muted-foreground">
                      {session.actorEmail ?? "VSW Digital"} - ouverte {formatDate(session.startedAtIso)} a {formatTime(session.startedAtIso)}
                      {session.expiresAtIso ? " - expire a " + formatTime(session.expiresAtIso) : ""}
                      {session.closedAtIso ? " - clôturée a " + formatTime(session.closedAtIso) : ""}
                    </p>
                  </div>
                  {isActive ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-2xl font-black"
                      onClick={() => onOpenClose(session.id)}
                    >
                      Cloturer
                    </Button>
                  ) : null}
                </div>

                {isClosing ? (
                  <div className="mt-4 rounded-2xl border border-slate-500/20 bg-muted/20 p-4">
                    <div className="grid gap-3 md:grid-cols-[1fr_240px]">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                          Motif de clôture
                        </label>
                        <Textarea
                          value={closeReason}
                          onChange={(event) => onReasonChange(event.target.value)}
                          placeholder="Exemple : verification terminee, anomalie expliquee au client, aucune action restante..."
                          className="min-h-24 rounded-2xl bg-background/80 font-semibold"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                          Confirmation
                        </label>
                        <Input
                          value={closeConfirmation}
                          onChange={(event) => onConfirmationChange(event.target.value)}
                          placeholder={expectedConfirmation}
                          className="h-11 rounded-2xl bg-background/80 font-black uppercase"
                        />
                        <p className="text-xs font-semibold text-muted-foreground">
                          Tapez {expectedConfirmation}.
                        </p>
                      </div>
                    </div>

                    {closeError ? (
                      <p className="mt-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm font-bold text-red-800 dark:text-red-100">
                        {closeError}
                      </p>
                    ) : null}

                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <Button type="button" variant="outline" className="rounded-2xl font-black" disabled={closeSubmitting} onClick={onCancelClose}>
                        Annuler
                      </Button>
                      <Button type="button" className="rounded-2xl font-black" disabled={!canClose} onClick={() => void onSubmitClose(session.id)}>
                        {closeSubmitting ? "Cloture..." : "Cloturer la session"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        ) : (
          <div className="rounded-2xl border border-dashed bg-muted/20 p-5">
            <p className="font-black">Aucune session support</p>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Les interventions ouvertes depuis le panneau Actions support apparaîtront ici.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SupportAction({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-black">{title}</p>
          <p className="mt-1 text-sm font-semibold leading-5 text-muted-foreground">
            {detail}
          </p>
        </div>
        <Button disabled variant="outline" className="rounded-2xl font-black">
          <Clock className="mr-2 h-4 w-4" />
          Bientot
        </Button>
      </div>
    </div>
  );
}
