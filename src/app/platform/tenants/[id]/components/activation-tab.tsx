import { AlertTriangle, CheckCircle2, Copy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { OwnerInviteResult, TenantDétailResponse } from "../types";

export function ActivationChecklistCard({
  onboarding,
}: {
  onboarding: TenantDétailResponse["onboarding"] | null;
}) {
  if (!onboarding) return null;

  return (
    <Card className="overflow-hidden rounded-[2rem] border-border/60 bg-background/85 shadow-sm">
      <CardHeader className="border-b bg-muted/20">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl font-black">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Checklist d'activation
            </CardTitle>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Contrôle les pré-requis avant de declarer l'agence opérationnelle.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-full px-3 py-1 font-black">
              {onboarding.status}
            </Badge>
            <Badge
              className={cn(
                "rounded-full border px-3 py-1 font-black",
                onboarding.readyToActivate
                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/10 dark:text-emerald-100"
                  : "border-amber-500/25 bg-amber-500/10 text-amber-800 hover:bg-amber-500/10 dark:text-amber-100"
              )}
            >
              {onboarding.completion}% prêt
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
        {onboarding.steps.map((step) => (
          <div
            key={step.id}
            className={cn(
              "rounded-2xl border p-4",
              step.done
                ? "border-emerald-500/20 bg-emerald-500/10"
                : "border-amber-500/20 bg-amber-500/10"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-black">{step.label}</p>
              {step.done ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              )}
            </div>
            <p className="mt-2 text-xs font-semibold leading-5 text-muted-foreground">
              {step.detail}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function ActivateTenantAction({
  tenant,
  onboarding,
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
  onboarding: TenantDétailResponse["onboarding"] | null;
  open: boolean;
  reason: string;
  confirmation: string;
  submitting: boolean;
  error: string | null;
  success: string | null;
  onOpenChange: (open: boolean) => void;
  onReasonChange: (reason: string) => void;
  onConfirmationChange: (confirmation: string) => void;
  onSubmit: () => Promise<void>;
}) {
  const expectedConfirmation = "ACTIVER AGENCE";
  const isAlreadyActive = String(tenant?.status ?? "").toLowerCase() === "active";
  const ready = Boolean(onboarding?.readyToActivate);
  const canSubmit =
    !isAlreadyActive &&
    ready &&
    reason.trim().length >= 12 &&
    confirmation.trim().toUpperCase() === expectedConfirmation &&
    !submitting;

  if (!open) {
    return (
      <div className="rounded-2xl border bg-muted/20 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-black">Activer l'agence</p>
            <p className="mt-1 text-sm font-semibold leading-5 text-muted-foreground">
              Passe l'agence en production lorsque la checklist est complete.
            </p>
            {success ? (
              <p className="mt-2 text-xs font-black text-emerald-700 dark:text-emerald-300">
                {success}
              </p>
            ) : null}
            {!ready && !isAlreadyActive ? (
              <p className="mt-2 text-xs font-black text-amber-700 dark:text-amber-300">
                Checklist incomplète : activation bloquée.
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant={ready && !isAlreadyActive ? "default" : "outline"}
            className="rounded-2xl font-black"
            disabled={isAlreadyActive}
            onClick={() => onOpenChange(true)}
          >
            {isAlreadyActive ? "Active" : "Activer"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-black">Activation agence SaaS</p>
          <p className="mt-1 text-sm font-semibold leading-5 text-muted-foreground">
            Cette action rend l'agence active et journalise la décision VSW Digital.
          </p>
        </div>
        <Badge variant="outline" className="w-fit rounded-full">
          Confirmation : {expectedConfirmation}
        </Badge>
      </div>

      {!ready ? (
        <p className="mt-4 rounded-2xl border border-amber-500/20 bg-background/80 p-3 text-sm font-bold text-amber-900 dark:text-amber-100">
          L'activation est bloquée tant que tous les pré-requis obligatoires ne sont pas validés.
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Motif obligatoire
          </label>
          <Textarea
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Exemple : checklist complète, propriétaire actif, premier client et premier site vérifiés."
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
            {submitting ? "Activation..." : "Activer l'agence"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function OwnerInvitationAction({
  tenant,
  open,
  name,
  email,
  reason,
  confirmation,
  submitting,
  error,
  result,
  onOpenChange,
  onNameChange,
  onEmailChange,
  onReasonChange,
  onConfirmationChange,
  onSubmit,
}: {
  tenant: TenantDétailResponse["tenant"] | null | undefined;
  open: boolean;
  name: string;
  email: string;
  reason: string;
  confirmation: string;
  submitting: boolean;
  error: string | null;
  result: OwnerInviteResult | null;
  onOpenChange: (open: boolean) => void;
  onNameChange: (name: string) => void;
  onEmailChange: (email: string) => void;
  onReasonChange: (reason: string) => void;
  onConfirmationChange: (confirmation: string) => void;
  onSubmit: () => Promise<void>;
}) {
  const expectedConfirmation = "INVITER OWNER";
  const canSubmit =
    (email || tenant?.ownerEmail || "").includes("@") &&
    reason.trim().length >= 12 &&
    confirmation.trim().toUpperCase() === expectedConfirmation &&
    !submitting;

  async function copyLink() {
    if (!result?.resetLink) return;
    await navigator.clipboard.writeText(result.resetLink);
  }

  if (!open) {
    return (
      <div className="rounded-2xl border bg-muted/20 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-black">Inviter le propriétaire</p>
            <p className="mt-1 text-sm font-semibold leading-5 text-muted-foreground">
              Cree ou rattaché le compte owner de l'agence, puis prépare un lien d'activation.
            </p>
            {tenant?.ownerEmail ? (
              <p className="mt-2 text-xs font-black text-primary">{tenant.ownerEmail}</p>
            ) : null}
          </div>
          <Button type="button" variant="outline" className="rounded-2xl font-black" onClick={() => onOpenChange(true)}>
            Inviter
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-black">Invitation propriétaire agence</p>
          <p className="mt-1 text-sm font-semibold leading-5 text-muted-foreground">
            Cette action créé un accès owner et généré un lien de definition du mot de passe.
          </p>
        </div>
        <Badge variant="outline" className="w-fit rounded-full">
          Confirmation : {expectedConfirmation}
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Nom propriétaire
          </span>
          <Input
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Nom du dirigeant ou responsable"
            className="h-11 rounded-2xl bg-background/80 font-semibold"
          />
        </label>
        <label className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Email propriétaire
          </span>
          <Input
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder={tenant?.ownerEmail ?? "direction@agence.fr"}
            className="h-11 rounded-2xl bg-background/80 font-semibold"
          />
        </label>
      </div>

      <div className="mt-4 space-y-3">
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
            Motif obligatoire
          </label>
          <Textarea
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Exemple : activation du compte propriétaire après création commerciale de l'agence."
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

        {result ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-background/80 p-3">
            <p className="font-black">{result.message}</p>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">
              {result.createdAuthUser ? "Compte Firebase créé." : "Compte Firebase existant reutilisé."}
            </p>
            {result.resetLink ? (
              <div className="mt-3 flex flex-col gap-2 md:flex-row">
                <Input readOnly value={result.resetLink} className="h-11 rounded-2xl bg-muted/40 font-semibold" />
                <Button type="button" variant="outline" className="rounded-2xl font-black" onClick={() => void copyLink()}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copier
                </Button>
              </div>
            ) : (
              <p className="mt-2 text-sm font-bold text-amber-800 dark:text-amber-100">
                {result.resetLinkError ?? "Lien non généré. Vous pourrez reinviter le propriétaire."}
              </p>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-2xl font-black" disabled={submitting} onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
          <Button type="button" className="rounded-2xl font-black" disabled={!canSubmit} onClick={() => void onSubmit()}>
            {submitting ? "Preparation..." : "Preparer l'invitation"}
          </Button>
        </div>
      </div>
    </div>
  );
}
