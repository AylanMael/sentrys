"use client";

import React from "react";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Database,
  FileBadge2,
  FileText,
  Globe,
  Info,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api/client-fetch";
import { canManageUsers, normalizeRole } from "@/lib/auth/role";
import { useAuth } from "@/lib/auth-provider";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { AgencyDocumentProfile } from "@/lib/agency/profile";
import {
  DEFAULT_AGENCY_EMAIL_SETTINGS,
  emailDomainStatusLabel,
  emailProviderLabel,
  emailSenderStrategyLabel,
  emailSendingModeLabel,
  type AgencyEmailSettings,
} from "@/lib/agency/email-settings";
import type {
  EmailDeliveryReadiness,
  EmailDeliveryResult,
  EmailDeliveryStatus,
} from "@/lib/email/delivery";

type AgencyProfileResponse = {
  ok: boolean;
  tenantId: string;
  profile: AgencyDocumentProfile;
  emailSettings: AgencyEmailSettings;
  canEdit: boolean;
};

type EmailTestResponse = {
  ok: boolean;
  readiness: EmailDeliveryReadiness;
  delivery: EmailDeliveryResult;
  recipientEmail: string | null;
  senderEmail: string | null;
  replyToEmail: string | null;
};

type SeedMvpResponse = {
  ok: boolean;
  createdOrUpdated: Record<string, number>;
  range: {
    fromIso: string;
    toIso: string;
  };
  links: {
    planning: string;
    conduite: string;
    prepaie: string;
    sitePdf: string;
  };
  note: string;
};

const emptyProfile: AgencyDocumentProfile = {
  displayName: "",
  legalName: "",
  logoUrl: "",
  addressLine1: "",
  addressLine2: "",
  phone: "",
  email: "",
  cnaps: "",
  siret: "",
  footerNote: "",
};

const emptyEmailSettings: AgencyEmailSettings = {
  ...DEFAULT_AGENCY_EMAIL_SETTINGS,
  fromName: "",
  fromEmail: DEFAULT_AGENCY_EMAIL_SETTINGS.fromEmail,
  replyToEmail: "",
  testRecipientEmail: "",
};

function printable(value: string | null) {
  return value ?? "";
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const role = normalizeRole(user?.role);
  const canEditRole = canManageUsers(role);

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [testingEmail, setTestingEmail] = React.useState(false);
  const [seedingMvp, setSeedingMvp] = React.useState(false);
  const [canEditApi, setCanEditApi] = React.useState(false);
  const [profile, setProfile] = React.useState<AgencyDocumentProfile>(emptyProfile);
  const [emailSettings, setEmailSettings] =
    React.useState<AgencyEmailSettings>(emptyEmailSettings);
  const [emailTestResult, setEmailTestResult] =
    React.useState<EmailTestResponse | null>(null);
  const [seedMvpResult, setSeedMvpResult] =
    React.useState<SeedMvpResponse | null>(null);

  const applyAgencyResponse = React.useCallback((response: AgencyProfileResponse) => {
    setProfile({
      displayName: printable(response.profile.displayName),
      legalName: printable(response.profile.legalName),
      logoUrl: printable(response.profile.logoUrl),
      addressLine1: printable(response.profile.addressLine1),
      addressLine2: printable(response.profile.addressLine2),
      phone: printable(response.profile.phone),
      email: printable(response.profile.email),
      cnaps: printable(response.profile.cnaps),
      siret: printable(response.profile.siret),
      footerNote: printable(response.profile.footerNote),
    });
    setEmailSettings({
      provider: response.emailSettings.provider,
      sendingMode: response.emailSettings.sendingMode,
      senderStrategy: response.emailSettings.senderStrategy,
      fromName: printable(response.emailSettings.fromName),
      fromEmail: printable(response.emailSettings.fromEmail),
      replyToEmail: printable(response.emailSettings.replyToEmail),
      testRecipientEmail: printable(response.emailSettings.testRecipientEmail),
      domainStatus: response.emailSettings.domainStatus,
    });
    setCanEditApi(response.canEdit);
  }, []);

  React.useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      try {
        const response = await apiFetch<AgencyProfileResponse>("/api/agency-profile");
        if (!mounted) return;
        applyAgencyResponse(response);
      } catch (error) {
        toast({
          title: "Configuration indisponible",
          description:
            error instanceof Error
              ? error.message
              : "Impossible de charger l'identité agence.",
          variant: "destructive",
        });
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [toast, applyAgencyResponse]);

  function updateField<K extends keyof AgencyDocumentProfile>(
    key: K,
    value: AgencyDocumentProfile[K]
  ) {
    setEmailTestResult(null);
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function updateEmailField<K extends keyof AgencyEmailSettings>(
    key: K,
    value: AgencyEmailSettings[K]
  ) {
    setEmailTestResult(null);
    setEmailSettings((current) => ({ ...current, [key]: value }));
  }

  async function save(options?: { quiet?: boolean }) {
    setSaving(true);
    try {
      const response = await apiFetch<AgencyProfileResponse>("/api/agency-profile", {
        method: "PATCH",
        body: { profile, emailSettings },
      });
      applyAgencyResponse(response);
      if (!options?.quiet) {
        toast({
          title: "Configuration agence enregistrée",
          description: "Les prochains documents et aperçus email utiliséront ces informations.",
        });
      }
      return response;
    } catch (error) {
      toast({
        title: "Enregistrement impossible",
        description:
          error instanceof Error
            ? error.message
            : "Impossible d'enregistrer l'identité agence.",
        variant: "destructive",
      });
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function sendEmailTest() {
    setTestingEmail(true);
    setEmailTestResult(null);
    try {
      const saved = await save({ quiet: true });
      if (!saved) return;

      const response = await apiFetch<EmailTestResponse>("/api/email/test", {
        method: "POST",
        body: {
          toEmail: saved.emailSettings.testRecipientEmail || saved.profile.email,
        },
      });
      setEmailTestResult(response);

      toast({
        title: emailTestToastTitle(response.delivery.status),
        description: response.delivery.detail ?? "Contrôle terminé.",
        variant:
          response.delivery.status === "blocked" ||
          response.delivery.status === "failed"
            ? "destructive"
            : "default",
      });
    } catch (error) {
      toast({
        title: "Test email impossible",
        description:
          error instanceof Error
            ? error.message
            : "Impossible d'exécuter le test email.",
        variant: "destructive",
      });
    } finally {
      setTestingEmail(false);
    }
  }

  async function installMvpDataset() {
    setSeedingMvp(true);
    setSeedMvpResult(null);
    try {
      const response = await apiFetch<SeedMvpResponse>("/api/admin/seed-mvp", {
        method: "POST",
        body: {},
      });
      setSeedMvpResult(response);
      toast({
        title: "Jeu MVP installé",
        description:
          "Clients, sites, agents, vacations, diffusions et registre de conduite sont prêts pour la recette.",
      });
    } catch (error) {
      toast({
        title: "Seed MVP impossible",
        description:
          error instanceof Error
            ? error.message
            : "Impossible d'installer le jeu de données MVP.",
        variant: "destructive",
      });
    } finally {
      setSeedingMvp(false);
    }
  }

  const canEdit = canEditRole && canEditApi;

  // Calcul du score de complétude pour la conformité administrative
  const hasDisplayName = !!profile.displayName && profile.displayName.trim().length > 0;
  const hasLegalName = !!profile.legalName && profile.legalName.trim().length > 0;
  const hasLogo = !!profile.logoUrl && profile.logoUrl.trim().length > 0;
  const hasAddress = !!profile.addressLine1 && profile.addressLine1.trim().length > 0 && !!profile.addressLine2 && profile.addressLine2.trim().length > 0;
  const hasPhone = !!profile.phone && profile.phone.trim().length > 0;
  const hasEmail = !!profile.email && profile.email.trim().length > 0;
  const hasSiret = !!profile.siret && profile.siret.trim().length > 0;
  const hasCnaps = !!profile.cnaps && profile.cnaps.trim().length > 0;
  const hasFooter = !!profile.footerNote && profile.footerNote.trim().length > 0;

  const scoreItems = [
    hasDisplayName,
    hasLegalName,
    hasLogo,
    hasAddress,
    hasPhone,
    hasEmail,
    hasSiret,
    hasCnaps,
    hasFooter,
  ];
  const scoreChecked = scoreItems.filter(Boolean).length;
  const totalScore = Math.round((scoreChecked / scoreItems.length) * 100);

  return (
    <div className="space-y-8 pb-10">
      {/* Header Premium - Alignement avec le style /dashboard/recette */}
      <section className="relative overflow-hidden rounded-[2.5rem] border bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.16),transparent_32%),linear-gradient(135deg,hsl(var(--card)),hsl(var(--background)))] p-6 shadow-sm">
        <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="max-w-4xl flex items-center gap-5">
            <div className="rounded-2xl bg-primary/10 border border-primary/20 p-4 shadow-inner text-primary shrink-0 hidden sm:block">
              <Building2 className="h-7 w-7 text-primary animate-pulse" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-full bg-primary px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-primary-foreground">
                  Configuration SaaS
                </Badge>
                <Badge
                  variant="outline"
                  className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] bg-background/50 backdrop-blur-sm"
                >
                  Identité agence
                </Badge>
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-foreground md:text-4xl animate-in fade-in slide-in-from-top-3 duration-500">
                Identité agence & diffusion
              </h1>
              <p className="mt-2.5 max-w-2xl text-sm font-semibold leading-6 text-muted-foreground">
                Gérez l'identité légale de l'agence pour la conformité CNAPS des plannings et configurez les serveurs de routage email.
              </p>
            </div>
          </div>

          <Button
            type="button"
            onClick={() => void save()}
            disabled={!canEdit || saving || loading}
            className="h-12 rounded-2xl px-6 font-black bg-primary text-primary-foreground shadow-lg shadow-primary/15 hover:bg-primary/90 transition-all duration-200 border border-primary/20 shrink-0"
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Enregistrer les modifications
          </Button>
        </div>
      </section>

      {loading ? (
        <Card className="rounded-[2.5rem] border-dashed border-2 border-border/60">
          <CardContent className="flex min-h-[350px] items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm font-semibold text-slate-500">Chargement de la configuration de l'agence...</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_380px]">
          {/* Colonne Gauche : Formulaire sous forme d'onglets (Tabs) */}
          <div className="space-y-6">
            <Tabs defaultValue="profile" className="w-full">
              <TabsList className="grid w-full grid-cols-3 rounded-2xl bg-muted/80 p-1.5 h-14 border border-border/40 shadow-inner">
                <TabsTrigger
                  value="profile"
                  className="rounded-xl py-3 font-extrabold text-xs tracking-wider uppercase transition-all duration-200 data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:text-primary"
                >
                  📂 Profil & Légal
                </TabsTrigger>
                <TabsTrigger
                  value="routing"
                  className="rounded-xl py-3 font-extrabold text-xs tracking-wider uppercase transition-all duration-200 data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:text-primary"
                >
                  ✉️ Routage & SMTP
                </TabsTrigger>
                <TabsTrigger
                  value="seeding"
                  className="rounded-xl py-3 font-extrabold text-xs tracking-wider uppercase transition-all duration-200 data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:text-primary"
                >
                  ⚙️ Recette & Outils
                </TabsTrigger>
              </TabsList>

              {/* CONTENU ONGLET 1: PROFIL & LEGAL */}
              <TabsContent value="profile" className="mt-4 focus-visible:outline-none">
                <Card className="rounded-[2rem] shadow-sm border border-border/60 overflow-hidden">
                  <CardContent className="space-y-6 p-6 md:p-8">
                    <div className="flex items-center gap-3 pb-4 border-b border-border/40">
                      <div className="rounded-xl bg-primary/5 dark:bg-primary/10 p-2.5 text-primary">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold tracking-tight">Informations de l'Agence</h2>
                        <p className="text-xs text-muted-foreground">Ces coordonnées figurent sur tous vos plannings officiels et documents de diffusion.</p>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Nom commercial (Affiché)">
                        <Input
                          value={profile.displayName}
                          onChange={(event) => updateField("displayName", event.target.value)}
                          disabled={!canEdit}
                          className="h-11 rounded-xl bg-slate-50/50 focus:bg-background focus:ring-2 focus:ring-primary/20 transition-all border-slate-200 focus:border-primary dark:bg-slate-900/10 dark:border-slate-800"
                          placeholder="Ex. Sécurité Horizon"
                        />
                      </Field>
                      <Field label="Raison sociale (Légale)">
                        <Input
                          value={printable(profile.legalName)}
                          onChange={(event) => updateField("legalName", event.target.value)}
                          disabled={!canEdit}
                          className="h-11 rounded-xl bg-slate-50/50 focus:bg-background focus:ring-2 focus:ring-primary/20 transition-all border-slate-200 focus:border-primary dark:bg-slate-900/10 dark:border-slate-800"
                          placeholder="Ex. SECURITE HORIZON SAS"
                        />
                      </Field>
                    </div>

                    <Field label="URL du logo de l'agence">
                      <div className="relative">
                        <Input
                          value={printable(profile.logoUrl)}
                          onChange={(event) => updateField("logoUrl", event.target.value)}
                          disabled={!canEdit}
                          className="h-11 rounded-xl bg-slate-50/50 focus:bg-background focus:ring-2 focus:ring-primary/20 transition-all border-slate-200 focus:border-primary dark:bg-slate-900/10 dark:border-slate-800 pr-10"
                          placeholder="/brand/company-logo.png ou URL sécurisée (https)"
                        />
                        {hasLogo && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 rounded bg-emerald-100 p-0.5 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                            <Check className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                    </Field>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Adresse d'exploitation - Ligne 1">
                        <Input
                          value={printable(profile.addressLine1)}
                          onChange={(event) => updateField("addressLine1", event.target.value)}
                          disabled={!canEdit}
                          className="h-11 rounded-xl bg-slate-50/50 focus:bg-background focus:ring-2 focus:ring-primary/20 transition-all border-slate-200 focus:border-primary dark:bg-slate-900/10 dark:border-slate-800"
                          placeholder="Numéro et rue"
                        />
                      </Field>
                      <Field label="Adresse d'exploitation - Ligne 2">
                        <Input
                          value={printable(profile.addressLine2)}
                          onChange={(event) => updateField("addressLine2", event.target.value)}
                          disabled={!canEdit}
                          className="h-11 rounded-xl bg-slate-50/50 focus:bg-background focus:ring-2 focus:ring-primary/20 transition-all border-slate-200 focus:border-primary dark:bg-slate-900/10 dark:border-slate-800"
                          placeholder="Code postal - Ville"
                        />
                      </Field>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Téléphone exploitation">
                        <Input
                          value={printable(profile.phone)}
                          onChange={(event) => updateField("phone", event.target.value)}
                          disabled={!canEdit}
                          className="h-11 rounded-xl bg-slate-50/50 focus:bg-background focus:ring-2 focus:ring-primary/20 transition-all border-slate-200 focus:border-primary dark:bg-slate-900/10 dark:border-slate-800"
                          placeholder="01 00 00 00 00"
                        />
                      </Field>
                      <Field label="Email exploitation (Générique)">
                        <Input
                          value={printable(profile.email)}
                          onChange={(event) => updateField("email", event.target.value)}
                          disabled={!canEdit}
                          className="h-11 rounded-xl bg-slate-50/50 focus:bg-background focus:ring-2 focus:ring-primary/20 transition-all border-slate-200 focus:border-primary dark:bg-slate-900/10 dark:border-slate-800"
                          placeholder="exploitation@agence.fr"
                        />
                      </Field>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Numéro SIRET (14 chiffres)">
                        <Input
                          value={printable(profile.siret)}
                          onChange={(event) => updateField("siret", event.target.value)}
                          disabled={!canEdit}
                          className="h-11 rounded-xl bg-slate-50/50 focus:bg-background focus:ring-2 focus:ring-primary/20 transition-all border-slate-200 focus:border-primary dark:bg-slate-900/10 dark:border-slate-800"
                          placeholder="Numéro SIRET"
                        />
                      </Field>
                      <Field label="Numéro Autorisation CNAPS (Livre VI)">
                        <Input
                          value={printable(profile.cnaps)}
                          onChange={(event) => updateField("cnaps", event.target.value)}
                          disabled={!canEdit}
                          className={`h-11 rounded-xl bg-slate-50/50 focus:bg-background focus:ring-2 transition-all border ${
                            hasCnaps
                              ? "border-slate-200 focus:border-primary focus:ring-primary/20 dark:border-slate-800"
                              : "border-amber-300 focus:border-amber-500 focus:ring-amber-500/20 dark:border-amber-900/60"
                          }`}
                          placeholder="AUT-000..."
                        />
                      </Field>
                    </div>

                    <Field label="Mention pied de page (Note de document)">
                      <Textarea
                        value={printable(profile.footerNote)}
                        onChange={(event) => updateField("footerNote", event.target.value)}
                        disabled={!canEdit}
                        rows={3}
                        className="rounded-xl bg-slate-50/50 focus:bg-background focus:ring-2 focus:ring-primary/20 transition-all border-slate-200 focus:border-primary dark:bg-slate-900/10 dark:border-slate-800"
                        placeholder="Ex. Document d'exploitation interne - Seule la dernière version émise fait foi."
                      />
                    </Field>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* CONTENU ONGLET 2: ROUTAGE & SMTP */}
              <TabsContent value="routing" className="mt-4 focus-visible:outline-none">
                <Card className="rounded-[2rem] shadow-sm border border-slate-200/60 dark:border-slate-800/80 overflow-hidden">
                  <CardContent className="space-y-6 p-6 md:p-8">
                    <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                      <div className="rounded-xl bg-sky-50 dark:bg-sky-950/40 p-2.5 text-sky-600 dark:text-sky-400">
                        <Mail className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold tracking-tight">Configuration Email & Routage</h2>
                        <p className="text-xs text-muted-foreground">Paramétrez le serveur d'envoi SMTP (Brevo) pour la diffusion automatique des plannings.</p>
                      </div>
                    </div>

                    {/* Section Statuts Remplie de micro-animations et de lueurs */}
                    <div className="grid gap-4 md:grid-cols-3">
                      <StatusTile
                        label="Mode d'Envoi"
                        value={emailSendingModeLabel(emailSettings.sendingMode)}
                        tone={emailSettings.sendingMode === "live" ? "good" : "neutral"}
                        pulse={emailSettings.sendingMode === "live"}
                      />
                      <StatusTile
                        label="Fournisseur SMTP"
                        value={emailProviderLabel(emailSettings.provider)}
                        tone={emailSettings.provider === "brevo" ? "good" : "neutral"}
                        pulse={emailSettings.provider === "brevo"}
                      />
                      <StatusTile
                        label="État Domaine Agence"
                        value={emailDomainStatusLabel(emailSettings.domainStatus)}
                        tone={emailSettings.domainStatus === "vérifiéd" ? "good" : emailSettings.domainStatus === "pending" ? "warning" : "neutral"}
                        pulse={emailSettings.domainStatus === "vérifiéd" || emailSettings.domainStatus === "pending"}
                      />
                    </div>

                    {/* Toggles Séparés Interactifs (Boutons segmentés premium) */}
                    <div className="grid gap-6 md:grid-cols-3 pt-2">
                      <Field label="Fournisseur SMTP">
                        <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-1">
                          <Button
                            type="button"
                            variant={emailSettings.provider === "simulation" ? "default" : "ghost"}
                            onClick={() => updateEmailField("provider", "simulation")}
                            disabled={!canEdit}
                            className="h-9 rounded-lg text-[10px] font-black uppercase tracking-[0.12em] transition-all"
                          >
                            Simulation
                          </Button>
                          <Button
                            type="button"
                            variant={emailSettings.provider === "brevo" ? "default" : "ghost"}
                            onClick={() => updateEmailField("provider", "brevo")}
                            disabled={!canEdit}
                            className="h-9 rounded-lg text-[10px] font-black uppercase tracking-[0.12em] transition-all"
                          >
                            Brevo
                          </Button>
                        </div>
                      </Field>

                      <Field label="Stratégie Expéditeur">
                        <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-1">
                          <Button
                            type="button"
                            variant={emailSettings.senderStrategy === "sentrys_shared" ? "default" : "ghost"}
                            onClick={() => updateEmailField("senderStrategy", "sentrys_shared")}
                            disabled={!canEdit}
                            className="h-9 rounded-lg text-[10px] font-black uppercase tracking-[0.12em] transition-all"
                          >
                            Partagé
                          </Button>
                          <Button
                            type="button"
                            variant={emailSettings.senderStrategy === "agency_domain" ? "default" : "ghost"}
                            onClick={() => updateEmailField("senderStrategy", "agency_domain")}
                            disabled={!canEdit}
                            className="h-9 rounded-lg text-[10px] font-black uppercase tracking-[0.12em] transition-all"
                          >
                            Domaine
                          </Button>
                        </div>
                      </Field>

                      <Field label="Mode d'envoi">
                        <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-1">
                          <Button
                            type="button"
                            variant={emailSettings.sendingMode === "simulation" ? "default" : "ghost"}
                            onClick={() => updateEmailField("sendingMode", "simulation")}
                            disabled={!canEdit}
                            className="h-9 rounded-lg text-[10px] font-black uppercase tracking-[0.12em] transition-all"
                          >
                            Simulation
                          </Button>
                          <Button
                            type="button"
                            variant={emailSettings.sendingMode === "live" ? "default" : "ghost"}
                            onClick={() => updateEmailField("sendingMode", "live")}
                            disabled={
                              !canEdit ||
                              emailSettings.provider !== "brevo" ||
                              emailSettings.domainStatus !== "vérifiéd"
                            }
                            className="h-9 rounded-lg text-[10px] font-black uppercase tracking-[0.12em] transition-all"
                          >
                            Réel
                          </Button>
                        </div>
                      </Field>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Nom d'expéditeur affiché">
                        <Input
                          value={printable(emailSettings.fromName)}
                          onChange={(event) => updateEmailField("fromName", event.target.value)}
                          disabled={!canEdit}
                          className="h-11 rounded-xl bg-slate-50/50 focus:bg-background focus:ring-2 focus:ring-primary/20 transition-all border-slate-200 focus:border-primary dark:bg-slate-900/10 dark:border-slate-800"
                          placeholder={`${profile.displayName || "Agence"} via Sentrys`}
                        />
                      </Field>
                      <Field label="Email expéditeur technique">
                        <Input
                          value={printable(emailSettings.fromEmail)}
                          onChange={(event) => updateEmailField("fromEmail", event.target.value)}
                          disabled={!canEdit}
                          className="h-11 rounded-xl bg-slate-50/50 focus:bg-background focus:ring-2 focus:ring-primary/20 transition-all border-slate-200 focus:border-primary dark:bg-slate-900/10 dark:border-slate-800"
                          placeholder="no-reply@sentrys.fr"
                        />
                      </Field>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Reply-To (Boite d'exploitation)">
                        <Input
                          value={printable(emailSettings.replyToEmail)}
                          onChange={(event) => updateEmailField("replyToEmail", event.target.value)}
                          disabled={!canEdit}
                          className="h-11 rounded-xl bg-slate-50/50 focus:bg-background focus:ring-2 focus:ring-primary/20 transition-all border-slate-200 focus:border-primary dark:bg-slate-900/10 dark:border-slate-800"
                          placeholder={profile.email || "exploitation@agence.fr"}
                        />
                      </Field>
                      <Field label="Email de test interne">
                        <Input
                          value={printable(emailSettings.testRecipientEmail)}
                          onChange={(event) => updateEmailField("testRecipientEmail", event.target.value)}
                          disabled={!canEdit}
                          className="h-11 rounded-xl bg-slate-50/50 focus:bg-background focus:ring-2 focus:ring-primary/20 transition-all border-slate-200 focus:border-primary dark:bg-slate-900/10 dark:border-slate-800"
                          placeholder="votre.email@exemple.fr"
                        />
                      </Field>
                    </div>

                    {/* Alerte informative */}
                    <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4 text-xs text-sky-850 dark:border-sky-950/20 dark:bg-sky-950/20 dark:text-sky-400">
                      <div className="flex gap-2.5">
                        <Info className="h-4.5 w-4.5 shrink-0 text-sky-600 dark:text-sky-400 mt-0.5" />
                        <p className="leading-relaxed">
                          Tant que le domaine de messagerie n'est pas validé, Sentrys reste en <strong>simulation sécurisée</strong>. Les emails de planification ne sont pas réellement envoyés.
                        </p>
                      </div>
                    </div>

                    {/* Zone de test d'envoi intégrée */}
                    <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/10 p-5 space-y-4">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                            Tester le routage email
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Déclenche un envoi immédiat sur l'adresse de test avec la configuration actuelle.
                          </p>
                        </div>
                        <Button
                          type="button"
                          onClick={() => void sendEmailTest()}
                          disabled={!canEdit || loading || saving || testingEmail}
                          className="h-10 rounded-xl px-5 font-semibold bg-primary/5 hover:bg-primary/10 text-primary dark:bg-primary/25 dark:hover:bg-primary/30 dark:text-primary border border-primary/15 dark:border-primary/25 transition-all shadow-sm"
                        >
                          {saving || testingEmail ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="mr-2 h-4 w-4" />
                          )}
                          Envoyer le test
                        </Button>
                      </div>

                      {emailTestResult && (
                        <div
                          className={`rounded-xl border p-4 text-xs transition-all duration-200 shadow-sm ${emailTestToneClass(
                            emailTestResult.delivery.status
                          )}`}
                        >
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b pb-2 mb-2 border-current/10">
                            <p className="font-extrabold uppercase tracking-wider text-[10px]">
                              {emailTestStatusLabel(emailTestResult.delivery.status)}
                            </p>
                            <p className="font-mono text-[10px] opacity-80">
                              {emailTestResult.senderEmail || "no-sender"} &rarr; {emailTestResult.recipientEmail || "no-recipient"}
                            </p>
                          </div>
                          <p className="leading-relaxed font-medium">
                            {emailTestResult.delivery.detail ?? emailTestResult.readiness.detail}
                          </p>
                          {emailTestResult.delivery.messageId && (
                            <p className="mt-2 font-mono text-[9px] opacity-75">
                              Brevo Message ID : {emailTestResult.delivery.messageId}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* CONTENU ONGLET 3: RECETTE & TOOLS */}
              <TabsContent value="seeding" className="mt-4 focus-visible:outline-none">
                <Card className="rounded-[2rem] shadow-sm border border-slate-200/60 dark:border-slate-800/80 overflow-hidden">
                  <CardContent className="space-y-6 p-6 md:p-8">
                    <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                      <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 p-2.5 text-emerald-600 dark:text-emerald-400">
                        <Database className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold tracking-tight">Outils d'Administration & Recette</h2>
                        <p className="text-xs text-muted-foreground">Outils de validation, de simulation de données et de diagnostics système.</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 p-5 space-y-4">
                      <div className="flex items-start gap-4">
                        <div className="rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 p-3 shadow-inner shrink-0">
                          <Database className="h-6 w-6" />
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                            Installation du Jeu de Données MVP
                          </h3>
                          <p className="text-sm text-slate-650 dark:text-slate-405 leading-relaxed">
                            Cette commande génère des profils réalistes (agents de sécurité avec cartes pro, clients, sites géolocalisés, vacations types avec heures de nuit) prêts pour la recette.
                          </p>
                          <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1.5 pt-1.5">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            Action non destructive : met à jour le jeu d'essai sans affecter vos autres fiches de données.
                          </p>
                        </div>
                      </div>

                      <div className="flex justify-end pt-2">
                        {/* Dialogue de Confirmation de Sécurité avant Installation */}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              type="button"
                              disabled={!canEdit || loading || seedingMvp}
                              className="h-11 rounded-xl px-6 font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md hover:shadow-lg transition-all"
                            >
                              {seedingMvp ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Database className="mr-2 h-4 w-4" />
                              )}
                              Installer le jeu de données MVP
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-[2rem] p-6 max-w-md border border-slate-200 dark:border-slate-800">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-lg font-extrabold flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                                <Database className="h-5 w-5" />
                                Initialiser le jeu MVP ?
                              </AlertDialogTitle>
                              <AlertDialogDescription className="text-sm text-slate-500 space-y-2.5 mt-2 leading-relaxed">
                                <p>
                                  Vous allez injecter des agents de sécurité, clients et sites fictifs dans votre base de données.
                                </p>
                                <p className="font-semibold text-slate-800 dark:text-slate-200">
                                  Cette action n'écrase pas vos données réelles, mais créera de nouvelles entités d'exploitation destinées au test.
                                </p>
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="mt-4 gap-2">
                              <AlertDialogCancel className="rounded-xl font-semibold border-slate-200">Annuler</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => void installMvpDataset()}
                                className="rounded-xl font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
                              >
                                Confirmer l'injection
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>

                      {seedMvpResult && (
                        <div className="rounded-2xl border border-emerald-250/60 bg-emerald-50/40 p-4 space-y-3 dark:border-emerald-950/20 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-400 transition-all duration-300 shadow-sm">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                            <p className="font-bold text-sm">Le jeu de données MVP a été initialisé</p>
                          </div>

                          <div className="flex flex-wrap gap-2 text-[10px] font-mono bg-white/70 dark:bg-black/20 px-3 py-2 rounded-xl">
                            {Object.entries(seedMvpResult.createdOrUpdated).map(([key, val]) => (
                              <span key={key} className="bg-emerald-100/50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-lg border border-emerald-200/50 dark:border-emerald-900/50 font-bold">
                                {key}: {val}
                              </span>
                            ))}
                          </div>

                          <div className="flex flex-wrap gap-2 pt-1.5">
                            <Button asChild size="sm" variant="outline" className="rounded-xl text-xs bg-white dark:bg-slate-900 font-bold border-emerald-200/60 hover:bg-emerald-50 hover:text-emerald-900">
                              <a href={seedMvpResult.links.planning}>Accéder au Planning</a>
                            </Button>
                            <Button asChild size="sm" variant="outline" className="rounded-xl text-xs bg-white dark:bg-slate-900 font-bold border-emerald-200/60 hover:bg-emerald-50 hover:text-emerald-900">
                              <a href={seedMvpResult.links.conduite}>Registre de Conduite</a>
                            </Button>
                            <Button asChild size="sm" variant="outline" className="rounded-xl text-xs bg-white dark:bg-slate-900 font-bold border-emerald-200/60 hover:bg-emerald-50 hover:text-emerald-900">
                              <a href={seedMvpResult.links.prepaie}>Pré-paie Silae</a>
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Colonne Droite : Sidebar collante d'aperçu dynamique & conformité */}
          <div className="space-y-6 self-start lg:sticky lg:top-6">

            {/* Widget 1 : Aperçu Papier à en-tête */}
            <Card className="rounded-[2rem] shadow-sm border border-border/60 overflow-hidden">
              <div className="bg-primary px-6 py-3.5 text-primary-foreground flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-[0.16em]">En-tête Document</p>
                <FileBadge2 className="h-4.5 w-4.5" />
              </div>
              <CardContent className="p-6 bg-slate-50 dark:bg-slate-900/40">
                <div className="bg-white dark:bg-slate-950 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm text-slate-800 dark:text-slate-200 text-xs space-y-4 relative min-h-[220px]">
                  {/* Filigrane discret d'impression */}
                  <div className="absolute right-4 bottom-4 text-[9px] font-mono text-slate-200 dark:text-slate-900 uppercase tracking-widest pointer-events-none select-none">
                    DOCUMENT SAAS
                  </div>

                  <div className="flex items-start gap-4">
                    {profile.logoUrl ? (
                      <div className="flex h-12 w-20 items-center justify-center rounded-lg border border-slate-200 bg-white p-1 shrink-0 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={profile.logoUrl}
                          alt="Logo"
                          className="max-h-full max-w-full object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      </div>
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 dark:bg-slate-800 text-base font-black text-white shrink-0">
                        {(profile.displayName || "S").slice(0, 1).toUpperCase()}
                      </div>
                    )}

                    <div className="space-y-1 min-w-0">
                      <p className="text-sm font-black uppercase tracking-wide truncate">
                        {profile.displayName || "NOM DE L'AGENCE"}
                      </p>
                      {profile.legalName && (
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">
                          {profile.legalName}
                        </p>
                      )}

                      <div className="space-y-0.5 pt-1.5 text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                        <PreviewLine value={profile.addressLine1} />
                        <PreviewLine value={profile.addressLine2} />
                        <PreviewLine value={profile.phone ? `Tél. ${profile.phone}` : null} />
                        <PreviewLine value={profile.email} />
                        <PreviewLine value={profile.siret ? `SIRET : ${profile.siret}` : null} />
                        <PreviewLine value={profile.cnaps ? `CNAPS : ${profile.cnaps}` : null} />
                      </div>
                    </div>
                  </div>

                  {/* Ligne pointillée symbolisant le début du planning réel */}
                  <div className="border-t border-dashed border-slate-200 dark:border-slate-800/80 pt-3 mt-4">
                    <p className="text-[9px] text-slate-400 italic text-center">
                      --- Début du planning imprimable ---
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Widget 2 : Jauge de Conformité Légale */}
            <div className="space-y-4 rounded-[2rem] border border-border/60 bg-slate-50/50 p-6 dark:border-slate-800/40 dark:bg-slate-900/50 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold tracking-tight">Conformité Administrative</h3>
                  <p className="text-[10px] text-muted-foreground">Exigences minimales CNAPS</p>
                </div>
                <span className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-black transition-all",
                  totalScore === 100
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
                    : totalScore > 50
                      ? "bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-foreground"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
                )}>
                  {totalScore}%
                </span>
              </div>

              {/* Barre de Progression */}
              <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700 ease-out",
                    totalScore === 100 ? "bg-emerald-500" : "bg-primary"
                  )}
                  style={{ width: `${totalScore}%` }}
                />
              </div>

              {/* Liste d'Items interactifs */}
              <ul className="space-y-1.5 pt-1 text-xs">
                <CheckItem isDone={hasDisplayName} label="Nom commercial" />
                <CheckItem isDone={hasLegalName} label="Raison sociale" />
                <CheckItem isDone={hasLogo} label="Logo de l'entreprise" />
                <CheckItem isDone={hasAddress} label="Adresse d'exploitation" />
                <CheckItem isDone={hasPhone} label="Numéro de téléphone" />
                <CheckItem isDone={hasEmail} label="Email exploitation" />
                <CheckItem isDone={hasSiret} label="SIRET réglementaire" />
                <CheckItem isDone={hasCnaps} label="Agrément CNAPS (Livre VI)" warning={!hasCnaps} />
                <CheckItem isDone={hasFooter} label="Mention légale en pied" />
              </ul>
            </div>

            {/* Avertissement CNAPS supplémentaire */}
            {!hasCnaps && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-850 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-400 space-y-1 shadow-sm">
                <div className="flex gap-2 font-bold items-center">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                  <p>Alerte Légale : CNAPS manquant</p>
                </div>
                <p className="leading-relaxed">
                  Le numéro d'agrément CNAPS est obligatoire sur vos plannings sous peine de sanctions administratives.
                </p>
              </div>
            )}

            {/* Sécurité d'écriture */}
            {!canEdit && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-400 shadow-sm">
                <div className="flex gap-2">
                  <ShieldCheck className="h-4.5 w-4.5 shrink-0 text-amber-600" />
                  <p>Accès restreint. Seuls les administrateurs et propriétaires peuvent modifier ces options.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function CheckItem({
  isDone,
  label,
  warning = false,
}: {
  isDone: boolean;
  label: string;
  warning?: boolean;
}) {
  return (
    <li className="flex items-center justify-between py-1 border-b border-slate-100/50 dark:border-slate-800/30 last:border-0">
      <span
        className={
          isDone
            ? "text-slate-650 dark:text-slate-400 font-medium"
            : warning
              ? "text-amber-600 dark:text-amber-400 font-bold"
              : "text-slate-400 dark:text-slate-600"
        }
      >
        {label}
      </span>
      {isDone ? (
        <div className="rounded-full bg-emerald-100 p-0.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 shrink-0">
          <Check className="h-3 w-3" />
        </div>
      ) : warning ? (
        <div className="rounded-full bg-amber-100 p-0.5 text-amber-750 dark:bg-amber-950 dark:text-amber-400 animate-pulse shrink-0">
          <AlertTriangle className="h-3 w-3" />
        </div>
      ) : (
        <div className="h-3 w-3 rounded-full border border-slate-200 dark:border-slate-800 shrink-0" />
      )}
    </li>
  );
}

function emailTestStatusLabel(status: EmailDeliveryStatus) {
  if (status === "sent") return "Email réel envoyé";
  if (status === "simulated") return "Test simulé avec succès";
  if (status === "blocked") return "Envoi bloqué par sécurité";
  return "Échec fournisseur email";
}

function emailTestToastTitle(status: EmailDeliveryStatus) {
  if (status === "sent") return "Email de test envoyé";
  if (status === "simulated") return "Email de test simulé";
  if (status === "blocked") return "Email bloqué";
  return "Email non envoyé";
}

function emailTestToneClass(status: EmailDeliveryStatus) {
  if (status === "sent") {
    return "border-emerald-250 bg-emerald-50/50 text-emerald-900 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400";
  }
  if (status === "simulated") {
    return "border-sky-200 bg-sky-50/50 text-sky-900 dark:border-sky-900/30 dark:bg-sky-950/20 dark:text-sky-450";
  }
  if (status === "blocked") {
    return "border-amber-200 bg-amber-50/50 text-amber-900 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-450";
  }
  return "border-red-200 bg-red-50/50 text-red-900 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400";
}

function PreviewLine({ value }: { value: string | null }) {
  if (!value) return null;

  return <p className="mt-0.5 truncate">{value}</p>;
}

function StatusTile({
  label,
  value,
  tone = "neutral",
  pulse = false,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warning";
  pulse?: boolean;
}) {
  return (
    <div
      className={
        tone === "good"
          ? "rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 text-emerald-800 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400 hover:shadow-sm transition-all"
          : tone === "warning"
            ? "rounded-2xl border border-amber-200 bg-amber-50/50 p-4 text-amber-800 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-400 hover:shadow-sm transition-all"
            : "rounded-2xl border bg-background p-4 hover:shadow-sm transition-all dark:border-slate-800"
      }
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
          {label}
        </p>
        {pulse && (
          <span className="relative flex h-2 w-2">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                tone === "good" ? "bg-emerald-450" : tone === "warning" ? "bg-amber-400" : "bg-sky-400"
              }`}
            ></span>
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                tone === "good" ? "bg-emerald-500" : tone === "warning" ? "bg-amber-500" : "bg-sky-500"
              }`}
            ></span>
          </span>
        )}
      </div>
      <p className="mt-1 text-sm font-black">{value}</p>
    </div>
  );
}
