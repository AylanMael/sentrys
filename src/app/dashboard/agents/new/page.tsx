"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client-fetch";
import { useAuth } from "@/lib/auth-provider";
import { canManageAgents, normalizeRole } from "@/lib/auth/role";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { AGENT_QUALIFICATION_OPTIONS } from "@/lib/agents/profile";
import { EmptyState } from "@/components/ui/empty-state";
import { useAppFeedback } from "@/hooks/use-app-feedback";

import {
  ArrowLeft,
  Loader2,
  Save,
  UserPlus,
  User,
  Mail,
  Phone,
  ShieldCheck,
  AlertTriangle,
  Camera,
  FileBadge2,
  HeartPulse,
  Home,
} from "lucide-react";

type CreateAgentResponse =
  | { ok: true; tenantId: string; agent: { id: string } }
  | { ok: false; error?: string };

type AuthUserLike = {
  role?: string | null;
} | null;

export default function NewAgentPage() {
  const router = useRouter();
  const { user } = useAuth();
  const feedback = useAppFeedback();

  const role = useMemo(
    () => normalizeRole((user as AuthUserLike)?.role) ?? "client",
    [user]
  );
  const canWrite = useMemo(() => canManageAgents(role), [role]);

  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [monthlyContractHours, setMonthlyContractHours] = useState("151.67");
  const [photoUrl, setPhotoUrl] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [professionalCardNumber, setProfessionalCardNumber] = useState("");
  const [professionalCardExpiresAt, setProfessionalCardExpiresAt] = useState("");
  const [qualifications, setQualifications] = useState<string[]>([]);
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [notes, setNotes] = useState("");

  function toggleQualification(value: string, checked: boolean) {
    setQualifications((current) =>
      checked
        ? Array.from(new Set([...current, value]))
        : current.filter((item) => item !== value)
    );
  }

  async function onSave() {
    if (!canWrite) return;

    setSaving(true);
    try {
      const res = await apiFetch<CreateAgentResponse>("/api/agents", {
        method: "POST",
        body: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          monthlyContractHours:
            monthlyContractHours.trim() === "" ? null : Number(monthlyContractHours),
          photoUrl: photoUrl.trim(),
          employeeNumber: employeeNumber.trim(),
          birthDate: birthDate.trim(),
          addressLine1: addressLine1.trim(),
          addressLine2: addressLine2.trim(),
          professionalCardNumber: professionalCardNumber.trim(),
          professionalCardExpiresAt: professionalCardExpiresAt.trim(),
          qualifications,
          emergencyContactName: emergencyContactName.trim(),
          emergencyContactPhone: emergencyContactPhone.trim(),
          notes: notes.trim(),
          status: "active",
        },
      });

      if (res.ok) {
        feedback.success(
          "Agent cree",
          "Le profil est pret. Vous pouvez maintenant completer son dossier."
        );
        router.push(`/dashboard/agents/${res.agent.id}`);
        return;
      }

      feedback.error(res.error ?? "Creation impossible.", {
        title: "Creation impossible",
      });
    } catch (error) {
      feedback.error(error, {
        title: "Creation impossible",
        fallback: "Impossible de creer l'agent pour le moment.",
      });
    } finally {
      setSaving(false);
    }
  }

  const isFormValid = firstName.trim() && lastName.trim();

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-24 w-full max-w-4xl mx-auto">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between bg-card p-6 md:p-8 rounded-[2rem] border shadow-sm ring-1 ring-black/5 bg-gradient-to-br from-card to-muted/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-start gap-4">
          <Button
            variant="outline"
            asChild
            className="h-9 rounded-xl px-4 font-bold border-muted-foreground/20 text-muted-foreground hover:text-foreground transition-all"
          >
            <Link href="/dashboard/agents">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour
            </Link>
          </Button>

          <div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-foreground flex items-center gap-3">
              <div className="bg-primary/10 p-2.5 rounded-xl border border-primary/20 text-primary hidden sm:flex">
                <UserPlus className="h-6 w-6" />
              </div>
              Nouveau Profil Agent
            </h1>
            <p className="text-sm font-medium text-muted-foreground mt-2 max-w-xl">
              Renseignez les informations du nouvel agent. Il sera ajouté à votre
              équipe avec le statut <strong className="text-green-600 font-bold">Actif</strong>{" "}
              par défaut.
            </p>
          </div>
        </div>

        {canWrite && (
          <div className="hidden md:flex relative z-10">
            <Button
              onClick={onSave}
              disabled={saving || !isFormValid}
              className="h-12 rounded-xl px-8 font-black shadow-lg shadow-primary/20 hover:translate-y-[-2px] active:scale-95 transition-all"
            >
              {saving ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
              ) : (
                <Save className="h-5 w-5 mr-2" />
              )}
              Créer l&apos;agent
            </Button>
          </div>
        )}
      </div>

      {!canWrite && (
        <EmptyState
          icon={AlertTriangle}
          tone="danger"
          compact
          title="Accès refusé"
          description="Vous ne disposez pas des droits nécessaires pour créer un agent."
          className="mb-8 text-left"
        />
      )}

      <div className="space-y-6">
        <Card className="rounded-[2rem] border-none shadow-xl shadow-black/[0.02] bg-background ring-1 ring-black/5 overflow-hidden">
          <div className="p-6 md:p-8 bg-muted/20 border-b flex items-center gap-3">
            <div className="bg-background p-2.5 rounded-xl shadow-sm">
              <User className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-xl font-black tracking-tight">Identité</h2>
          </div>

          <CardContent className="p-6 md:p-8 grid gap-6 md:grid-cols-2">
            <div className="space-y-3 md:col-span-2">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                Photo de l&apos;agent
              </Label>
              <div className="grid gap-4 md:grid-cols-[120px_1fr] md:items-center">
                <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border bg-muted/30">
                  {photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrl}
                      alt="Photo agent"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Camera className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <Input
                  placeholder="/agents/photo-agent.jpg ou URL securisee"
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  readOnly={!canWrite}
                  className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-medium focus-visible:ring-primary/30"
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                Prénom <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="Ex: Jean"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                readOnly={!canWrite}
                className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-bold focus-visible:ring-primary/30"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                Nom de famille <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="Ex: Dupont"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                readOnly={!canWrite}
                className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-bold focus-visible:ring-primary/30"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                Matricule interne
              </Label>
              <Input
                placeholder="Ex: AG-0042"
                value={employeeNumber}
                onChange={(e) => setEmployeeNumber(e.target.value)}
                readOnly={!canWrite}
                className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-bold focus-visible:ring-primary/30"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                Date de naissance
              </Label>
              <Input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                readOnly={!canWrite}
                className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-bold focus-visible:ring-primary/30"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-none shadow-xl shadow-black/[0.02] bg-background ring-1 ring-black/5 overflow-hidden">
          <div className="p-6 md:p-8 bg-muted/20 border-b flex items-center gap-3">
            <div className="bg-background p-2.5 rounded-xl shadow-sm">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-xl font-black tracking-tight">Coordonnées</h2>
          </div>

          <CardContent className="p-6 md:p-8 grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                Email (Optionnel)
              </Label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground opacity-70" />
                <Input
                  placeholder="agent@exemple.com"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  readOnly={!canWrite}
                  className="!pl-12 h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-medium focus-visible:ring-primary/30"
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                Téléphone (Optionnel)
              </Label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground opacity-70" />
                <Input
                  placeholder="+33 6 00 00 00 00"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  readOnly={!canWrite}
                  className="!pl-12 h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-medium focus-visible:ring-primary/30"
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                Contrat mensuel (heures)
              </Label>
              <Input
                placeholder="151.67"
                type="number"
                min="0"
                max="400"
                step="0.01"
                value={monthlyContractHours}
                onChange={(e) => setMonthlyContractHours(e.target.value)}
                readOnly={!canWrite}
                className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-medium focus-visible:ring-primary/30"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-none shadow-xl shadow-black/[0.02] bg-background ring-1 ring-black/5 overflow-hidden">
          <div className="p-6 md:p-8 bg-muted/20 border-b flex items-center gap-3">
            <div className="bg-background p-2.5 rounded-xl shadow-sm">
              <Home className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-xl font-black tracking-tight">Adresse et urgence</h2>
          </div>

          <CardContent className="p-6 md:p-8 grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                Adresse
              </Label>
              <Input
                placeholder="Numero et rue"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                readOnly={!canWrite}
                className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-medium focus-visible:ring-primary/30"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                Complement / ville
              </Label>
              <Input
                placeholder="Code postal - Ville"
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                readOnly={!canWrite}
                className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-medium focus-visible:ring-primary/30"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                Contact urgence
              </Label>
              <Input
                placeholder="Nom du contact"
                value={emergencyContactName}
                onChange={(e) => setEmergencyContactName(e.target.value)}
                readOnly={!canWrite}
                className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-medium focus-visible:ring-primary/30"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                Telephone urgence
              </Label>
              <div className="relative">
                <HeartPulse className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground opacity-70" />
                <Input
                  placeholder="+33 6 00 00 00 00"
                  value={emergencyContactPhone}
                  onChange={(e) => setEmergencyContactPhone(e.target.value)}
                  readOnly={!canWrite}
                  className="!pl-12 h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-medium focus-visible:ring-primary/30"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-none shadow-xl shadow-black/[0.02] bg-background ring-1 ring-black/5 overflow-hidden">
          <div className="p-6 md:p-8 bg-muted/20 border-b flex items-center gap-3">
            <div className="bg-background p-2.5 rounded-xl shadow-sm">
              <FileBadge2 className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-xl font-black tracking-tight">Habilitations</h2>
          </div>

          <CardContent className="p-6 md:p-8 space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3">
                <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                  Carte professionnelle
                </Label>
                <Input
                  placeholder="Numero de carte pro"
                  value={professionalCardNumber}
                  onChange={(e) => setProfessionalCardNumber(e.target.value)}
                  readOnly={!canWrite}
                  className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-medium focus-visible:ring-primary/30"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                  Expiration carte pro
                </Label>
                <Input
                  type="date"
                  value={professionalCardExpiresAt}
                  onChange={(e) => setProfessionalCardExpiresAt(e.target.value)}
                  readOnly={!canWrite}
                  className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-medium focus-visible:ring-primary/30"
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                Qualifications
              </Label>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                {AGENT_QUALIFICATION_OPTIONS.map((qualification) => (
                  <label
                    key={qualification}
                    className="flex items-center gap-2 rounded-xl border bg-muted/20 px-3 py-2 text-sm font-semibold"
                  >
                    <Checkbox
                      checked={qualifications.includes(qualification)}
                      onCheckedChange={(checked) =>
                        toggleQualification(qualification, checked === true)
                      }
                      disabled={!canWrite}
                    />
                    {qualification}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                Notes exploitation
              </Label>
              <Textarea
                placeholder="Contraintes, preferences, remarques internes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                readOnly={!canWrite}
                className="min-h-28 rounded-xl bg-muted/30 border-muted-foreground/20 font-medium focus-visible:ring-primary/30"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {canWrite && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-xl border-t z-50 flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => router.back()}
            disabled={saving}
            className="h-14 rounded-2xl font-bold flex-1"
          >
            Annuler
          </Button>
          <Button
            onClick={onSave}
            disabled={saving || !isFormValid}
            className="h-14 rounded-2xl font-black shadow-xl shadow-primary/20 flex-1"
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
            ) : (
              <Save className="h-5 w-5 mr-2" />
            )}
            Créer
          </Button>
        </div>
      )}
    </div>
  );
}
