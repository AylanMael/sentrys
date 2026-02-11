import type { Metadata } from "next";
import Link from "next/link";

import PublicLayout from "@/components/layouts/public-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import {
  ShieldCheck,
  Sparkles,
  Clock,
  Mail,
  Building2,
  CheckCircle2,
  ChevronRight,
  ArrowRight,
} from "lucide-react";


export const metadata: Metadata = {
  title: "Contact Sentrys — Démo, tarifs, questions",
  description:
    "Contactez Sentrys pour demander une démo, poser une question sur les tarifs ou discuter d’un partenariat. Réponse rapide et accompagnement.",
  alternates: { canonical: "/contact" },
};

const reasons = [
  { value: "demo", label: "Demander une démo" },
  { value: "tarifs", label: "Question sur les tarifs" },
  { value: "support", label: "Support / assistance" },
  { value: "partenariat", label: "Partenariat" },
];

const trust = [
  "Réponse sous 24–48h ouvrées",
  "Accompagnement à l’onboarding",
  "Produit pensé pour la sécurité privée",
  "Données protégées & accès par rôles",
];

export default function ContactPage() {
  return (
    <PublicLayout>
      <section className="relative overflow-hidden py-12 md:py-20">
        {/* background */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/10" />
          <div className="absolute -top-24 left-1/2 h-[520px] w-[920px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-28 right-[-120px] h-[420px] w-[520px] rounded-full bg-accent/10 blur-3xl" />
        </div>

        <div className="container">
          {/* heading */}
          <div className="mx-auto max-w-3xl text-center">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Badge variant="secondary" className="gap-2">
                <ShieldCheck className="h-4 w-4" />
                Sécurité privée • Opérationnel
              </Badge>
              <Badge
                variant="outline"
                className="gap-2 border-primary/20 bg-primary/10 text-primary"
              >
                <Sparkles className="h-4 w-4" />
                Démo & questions
              </Badge>
            </div>

            <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              Contactez Sentrys
            </h1>

            <p className="mx-auto mt-4 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
              Démo, tarifs, support ou partenariat : dites-nous ce dont vous avez besoin.
              On vous répond rapidement, avec une solution claire.
            </p>
          </div>

          {/* content */}
          <div className="mx-auto mt-12 grid max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            {/* FORM */}
            <div className="rounded-3xl border bg-card p-6 shadow-sm md:p-8">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">Envoyez un message</p>
                  <p className="text-sm text-muted-foreground">
                    Plus vous donnez de contexte (sites, agents, volumes), plus la réponse sera actionnable.
                  </p>
                </div>

                <div className="hidden sm:flex items-center gap-2 rounded-full border bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  24–48h ouvrées
                </div>
              </div>

              <Separator className="my-6" />

              <form className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nom complet</Label>
                    <Input id="name" placeholder="Jean Dupont" autoComplete="name" required />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Adresse email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="jean.dupont@entreprise.fr"
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="company">Entreprise (optionnel)</Label>
                    <Input
                      id="company"
                      placeholder="Nom de la société"
                      autoComplete="organization"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reason">Motif</Label>
                    <div className="relative">
                      <select
                        id="reason"
                        name="reason"
                        defaultValue="demo"
                        className="h-10 w-full appearance-none rounded-md border border-input bg-background px-3 pr-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {reasons.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <ChevronRight className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-muted-foreground" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Pour une démo : indiquez le nombre de sites et d’agents (même approximatif).
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Message</Label>
                  <Textarea
                    id="message"
                    placeholder="Expliquez votre besoin (planning, incidents, multi-sociétés…), vos volumes, et vos contraintes."
                    required
                    className="min-h-[160px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    Exemple : “12 sites, 45 agents, besoin de traçabilité incidents + reporting mensuel.”
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    En envoyant ce message, vous acceptez d’être recontacté au sujet de votre demande.
                  </p>
                  <Button type="submit" className="h-11 rounded-full sm:min-w-[220px]">
                    Envoyer le message
                  </Button>
                </div>
              </form>
            </div>

            {/* SIDE */}
            <aside className="space-y-6">
              {/* Info */}
              <div className="rounded-3xl border bg-card p-6 shadow-sm">
                <p className="text-sm font-semibold">Informations</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Notre objectif : vous répondre vite, avec une recommandation concrète.
                </p>

                <div className="mt-5 space-y-3 text-sm">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border bg-muted/20">
                      <Clock className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Délai</p>
                      <p className="text-muted-foreground">Réponse sous 24–48h ouvrées</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border bg-muted/20">
                      <Mail className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Email</p>
                      <p className="text-muted-foreground">support@sentrys.app (à remplacer)</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border bg-muted/20">
                      <Building2 className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Pour une démo</p>
                      <p className="text-muted-foreground">
                        Sites, agents, contraintes & multi-sociétés si besoin
                      </p>
                    </div>
                  </div>
                </div>

                <Separator className="my-6" />

                <ul className="space-y-2">
                  {trust.map((t) => (
                    <li key={t} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Minimal secondary links */}
              <div className="rounded-3xl border bg-card p-6 shadow-sm">
                <p className="text-sm font-semibold">Liens utiles</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Préparez votre décision en quelques minutes.
                </p>

                <div className="mt-5 grid gap-3">
                  <Button asChild variant="outline" className="h-11 rounded-full justify-between">
                    <Link href="/tarifs">
                      Voir les tarifs
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>

                  <Button asChild variant="outline" className="h-11 rounded-full justify-between">
                    <Link href="/fonctionnalites">
                      Découvrir les fonctionnalités
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
