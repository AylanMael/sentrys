"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  Loader2,
  Mail,
  Phone,
  Save,
  UserPlus,
} from "lucide-react";

import { useAuth } from "@/lib/auth-provider";
import { canManageAgents, normalizeRole } from "@/lib/auth/role";
import { apiFetch } from "@/lib/api/client-fetch";
import { useAppFeedback } from "@/hooks/use-app-feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";


type CreateAgentResponse =
  | { ok: true; tenantId: string; agent: { id: string } }
  | { ok: false; error?: string };

type AuthUserLike = {
  role?: string | null;
} | null;

const NEXT_STEPS = [
  "Ajouter la carte professionnelle et sa date d’expiration",
  "Importer les justificatifs et documents RH",
  "Compléter les qualifications et le contact d’urgence",
] as const;

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
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [monthlyContractHours, setMonthlyContractHours] = useState("151.67");

  const isFormValid = Boolean(firstName.trim() && lastName.trim());

  async function onSave(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!canWrite || !isFormValid || saving) return;

    const parsedHours = monthlyContractHours.trim()
      ? Number(monthlyContractHours)
      : null;
    if (parsedHours !== null && (!Number.isFinite(parsedHours) || parsedHours < 0 || parsedHours > 400)) {
      feedback.error("Le volume contractuel doit être compris entre 0 et 400 heures.", {
        title: "Volume horaire invalide",
      });
      return;
    }

    setSaving(true);
    try {
      const response = await apiFetch<CreateAgentResponse>("/api/agents", {
        method: "POST",
        body: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          employeeNumber: employeeNumber.trim(),
          monthlyContractHours: parsedHours,
          status: "active",
        },
      });

      if (!response.ok) {
        feedback.error(response.error ?? "Création impossible.", {
          title: "Création impossible",
        });
        return;
      }

      feedback.success(
        "Agent créé",
        "Le profil est disponible. Complétez maintenant les éléments nécessaires à son affectation."
      );
      router.push(`/dashboard/agents/${response.agent.id}`);
    } catch (error) {
      feedback.error(error, {
        title: "Création impossible",
        fallback: "Impossible de créer l’agent pour le moment.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-24 animate-in fade-in duration-500">
      <header className="rounded-[1.75rem] border bg-card p-5 shadow-sm md:p-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <Button asChild variant="outline" size="icon" className="shrink-0 rounded-xl">
              <Link href="/dashboard/agents" aria-label="Retour à la liste des agents">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-primary">
                <UserPlus className="h-4 w-4" />
                Création express
              </div>
              <h1 className="text-2xl font-black tracking-tight md:text-3xl">
                Ajouter un agent
              </h1>
              <p className="mt-2 max-w-2xl text-sm font-medium text-muted-foreground">
                Enregistrez l’essentiel maintenant. Les documents et informations RH pourront être complétés ensuite, sans bloquer la création.
              </p>
            </div>
          </div>

          {canWrite && (
            <Button
              type="submit"
              form="quick-agent-form"
              disabled={saving || !isFormValid}
              className="h-11 rounded-xl px-6 font-black"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Créer l’agent
            </Button>
          )}
        </div>
      </header>

      {!canWrite ? (
        <EmptyState
          icon={BriefcaseBusiness}
          tone="danger"
          title="Accès refusé"
          description="Vous ne disposez pas des droits nécessaires pour créer un agent."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <form id="quick-agent-form" onSubmit={onSave} className="space-y-6">
            <Card className="rounded-[1.75rem] shadow-sm">
              <CardContent className="space-y-6 p-6 md:p-7">
                <div>
                  <h2 className="text-lg font-black">Identité</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Seuls le prénom et le nom sont indispensables.
                  </p>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="agent-first-name">Prénom *</Label>
                    <Input
                      id="agent-first-name"
                      autoFocus
                      autoComplete="given-name"
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      placeholder="Jean"
                      className="h-12 rounded-xl"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="agent-last-name">Nom *</Label>
                    <Input
                      id="agent-last-name"
                      autoComplete="family-name"
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      placeholder="Dupont"
                      className="h-12 rounded-xl"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="agent-employee-number">Matricule</Label>
                    <Input
                      id="agent-employee-number"
                      value={employeeNumber}
                      onChange={(event) => setEmployeeNumber(event.target.value)}
                      placeholder="AG-0042"
                      className="h-12 rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="agent-monthly-hours">Heures contractuelles mensuelles</Label>
                    <div className="relative">
                      <Clock3 className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="agent-monthly-hours"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max="400"
                        step="0.01"
                        value={monthlyContractHours}
                        onChange={(event) => setMonthlyContractHours(event.target.value)}
                        className="h-12 rounded-xl pl-11"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[1.75rem] shadow-sm">
              <CardContent className="space-y-6 p-6 md:p-7">
                <div>
                  <h2 className="text-lg font-black">Contact</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Facultatif, mais utile pour joindre rapidement l’agent.
                  </p>
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="agent-phone">Téléphone</Label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="agent-phone"
                        type="tel"
                        autoComplete="tel"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        placeholder="06 00 00 00 00"
                        className="h-12 rounded-xl pl-11"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="agent-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="agent-email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="agent@exemple.fr"
                        className="h-12 rounded-xl pl-11"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </form>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <Card className="rounded-[1.75rem] border-primary/20 bg-primary/5 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 text-primary">
                  <BadgeCheck className="h-5 w-5" />
                  <h2 className="font-black">Après la création</h2>
                </div>
                <p className="mt-2 text-sm font-medium text-muted-foreground">
                  La fiche agent indiquera clairement ce qu’il reste à faire avant une affectation sans alerte.
                </p>
                <div className="mt-5 space-y-3">
                  {NEXT_STEPS.map((step) => (
                    <div key={step} className="flex gap-3 rounded-xl border bg-background/80 p-3 text-sm font-semibold">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <p className="px-2 text-xs font-medium leading-relaxed text-muted-foreground">
              L’agent est créé avec le statut actif. Son aptitude opérationnelle reste contrôlée séparément par les règles de conformité.
            </p>
          </aside>
        </div>
      )}

      {canWrite && (
        <div className="fixed inset-x-0 bottom-0 z-50 flex gap-3 border-t bg-background/90 p-4 backdrop-blur md:hidden">
          <Button asChild variant="outline" className="h-12 flex-1 rounded-xl font-bold">
            <Link href="/dashboard/agents">Annuler</Link>
          </Button>
          <Button
            type="submit"
            form="quick-agent-form"
            disabled={saving || !isFormValid}
            className="h-12 flex-1 rounded-xl font-black"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Créer
          </Button>
        </div>
      )}
    </div>
  );
}