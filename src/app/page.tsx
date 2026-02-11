import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PublicLayout from "@/components/layouts/public-layout";

import {
  ArrowRight,
  ShieldCheck,
  Sparkles,
  CalendarClock,
  Siren,
  Users,
  Building2,
  BarChart,
  CheckCircle2,
} from "lucide-react";

import { PlaceHolderImages } from "@/lib/placeholder-images";

const heroImage = PlaceHolderImages.find((p) => p.id === "hero-landing");

export const metadata: Metadata = {
  title: "Sentrys — Plateforme opérationnelle pour la sécurité privée",
  description:
    "Sentrys centralise agents, sites, planning, vacations et incidents pour les entreprises de sécurité privée. Une plateforme moderne, claire et sécurisée.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    title: "Sentrys — Plateforme opérationnelle pour la sécurité privée",
    description:
      "Centralisez agents, sites, planning, vacations et incidents. Gagnez en visibilité, traçabilité et efficacité.",
    url: "/",
    siteName: "Sentrys",
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sentrys",
    description:
      "Plateforme de gestion pour sociétés de sécurité privée : agents, sites, planning, incidents.",
  },
};

const featureCards = [
  {
    icon: CalendarClock,
    title: "Planning centralisé",
    desc: "Générez et assignez les vacations. Une vue claire et en temps réel pour vos équipes.",
  },
  {
    icon: Siren,
    title: "Gestion des incidents",
    desc: "Tracez chaque incident du début à la fin. Preuves, commentaires, actions, clôture.",
  },
  {
    icon: Users,
    title: "Dossiers agents",
    desc: "Profils, documents, qualifications et historique : tout est centralisé et à jour.",
  },
  {
    icon: Building2,
    title: "Suivi des sites",
    desc: "Consignes, contacts, risques et informations clés de chaque site au même endroit.",
  },
  {
    icon: BarChart,
    title: "Reporting",
    desc: "Des tableaux de bord lisibles pour piloter l’activité et décider plus vite.",
  },
  {
    icon: ShieldCheck,
    title: "Sécurité & rôles",
    desc: "Permissions granulaires (Admin, Manager, Agent) pour un accès sécurisé et adapté.",
  },
];

const bullets = [
  "Moins d’erreurs et d’oubli sur le planning",
  "Traçabilité des incidents et des actions correctives",
  "Informations sites & consignes centralisées",
  "Accès par rôles (admin / manager / agent)",
];

const steps = [
  {
    k: "01",
    t: "Structurez",
    d: "Créez clients, sites, consignes, contacts et risques.",
  },
  {
    k: "02",
    t: "Planifiez",
    d: "Définissez les besoins et générez vos vacations.",
  },
  {
    k: "03",
    t: "Affectez",
    d: "Assignez les agents et suivez les ajustements en temps réel.",
  },
  {
    k: "04",
    t: "Tracez",
    d: "Incidents, preuves, commentaires, clôture et historique complet.",
  },
];

export default function Home() {
  return (
    <PublicLayout>
      {/* HERO */}
      <section className="relative overflow-hidden py-24 sm:py-32 lg:py-40">
        {/* background */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/10" />
          <div className="absolute -top-24 left-1/2 h-[520px] w-[920px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-28 right-[-120px] h-[420px] w-[520px] rounded-full bg-accent/10 blur-3xl" />
        </div>

        <div className="container">
          <div className="mx-auto max-w-4xl text-center">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Badge
                variant="outline"
                className="gap-2 border-primary/20 bg-primary/10 text-primary"
              >
                <Sparkles className="h-4 w-4" />
                <span>Plateforme de sécurité nouvelle génération</span>
              </Badge>

              <Badge variant="secondary" className="gap-2">
                <ShieldCheck className="h-4 w-4" />
                <span>Traçabilité • Contrôle • Clarté</span>
              </Badge>
            </div>

            <h1 className="mt-8 text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Pilotez vos opérations de sécurité avec clarté
            </h1>

            <p className="mx-auto mt-6 max-w-3xl text-pretty text-lg text-muted-foreground sm:text-xl">
              Sentrys centralise la gestion de vos <strong>agents</strong>, <strong>sites</strong>,
              <strong> plannings</strong> et <strong>incidents</strong> pour gagner en efficacité,
              en traçabilité et en sérénité.
            </p>

            <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:gap-4">
              <Button asChild size="lg" className="h-12 rounded-full text-base gap-2 bg-accent text-accent-foreground hover:bg-accent/80">
                <Link href="/signup">
                  Démarrer gratuitement <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 rounded-full text-base">
                <Link href="/contact">Demander une démo</Link>
              </Button>
            </div>
          </div>

          {/* Preview */}
          <div className="relative mx-auto mt-20 max-w-6xl">
            <div className="absolute -inset-8 rounded-3xl bg-gradient-to-b from-primary/10 to-transparent blur-2xl" />

            <div className="relative overflow-hidden rounded-2xl border bg-card shadow-xl shadow-primary/10">
              <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/35" />
                  <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/35" />
                  <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/35" />
                </div>
                <span className="rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                  Aperçu du produit
                </span>
              </div>

              <div className="relative aspect-[16/9] w-full">
                {heroImage ? (
                  <Image
                    src={heroImage.imageUrl}
                    alt="Aperçu du tableau de bord Sentrys"
                    data-ai-hint={heroImage.imageHint}
                    fill
                    priority
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 1200px"
                  />
                ) : (
                  <div className="h-full w-full bg-muted" />
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WORKFLOW */}
      <section className="border-t py-24 sm:py-32">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Un workflow simple, propre, traçable
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              De vos besoins terrain aux affectations, tout est structuré et lisible pour réduire
              les frictions opérationnelles.
            </p>
          </div>

          <div className="mx-auto mt-16 grid max-w-6xl gap-6 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((s) => (
              <div
                key={s.k}
                className="group relative rounded-2xl border bg-card p-6 shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-primary">{s.k}</span>
                  <span className="h-10 w-10 rounded-xl border bg-muted/40" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">{s.t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="fonctionnalites" className="w-full border-t bg-muted/20 py-24 sm:py-32">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Un outil unique pour tout piloter
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Fini les tableurs et les échanges d’emails. Centralisez vos opérations sur une
              plateforme unique, simple et sécurisée.
            </p>
          </div>

          <div className="mx-auto mt-16 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featureCards.map((feature) => (
              <div
                key={feature.title}
                className="group relative flex flex-col rounded-3xl border bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="flex-grow">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border bg-muted/40 transition group-hover:bg-primary/10">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-foreground">{feature.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{feature.desc}</p>
                </div>
                <Link
                  href="/fonctionnalites"
                  className="mt-4 flex items-center text-sm font-medium text-primary"
                >
                  En savoir plus <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </div>
            ))}
          </div>

          <div className="mt-16 text-center">
            <Button asChild size="lg" variant="outline" className="h-12 rounded-full text-base">
              <Link href="/fonctionnalites">
                Voir toutes les fonctionnalités <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-24 sm:py-32">
        <div className="container">
          <div className="relative overflow-hidden rounded-3xl border bg-card p-8 md:p-12">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 to-transparent"
            />
            <div className="grid gap-8 md:grid-cols-2 md:items-center">
              <div className="space-y-4">
                <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                  Prêt à moderniser vos opérations ?
                </h2>
                <p className="text-lg text-muted-foreground">
                  Créez votre compte en quelques minutes ou planifiez une démo personnalisée.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row md:justify-end">
                <Button asChild size="lg" className="h-12 rounded-full text-base bg-accent text-accent-foreground hover:bg-accent/80">
                  <Link href="/signup">Essayer Sentrys gratuitement</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 rounded-full text-base">
                  <Link href="/contact">Demander une démo</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
