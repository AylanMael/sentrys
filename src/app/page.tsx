import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import {
  ArrowRight,
  ShieldCheck,
  Sparkles,
  CalendarClock,
  Siren,
  Users,
  Building2,
  BarChart,
} from "lucide-react";

import { PlaceHolderImages } from "@/lib/placeholder-images";
import PublicLayout from "@/components/layouts/public-layout";

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


export default function Home() {
  return (
    <PublicLayout>
        {/* HERO */}
        <section className="relative py-12 md:py-20 lg:py-28">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/10" />
          </div>

          <div className="container">
            <div className="mx-auto max-w-4xl text-center">
              <Badge variant="outline" className="gap-2 border-primary/20 bg-primary/10 text-primary">
                  <Sparkles className="h-4 w-4" />
                  <span>Plateforme de sécurité nouvelle génération</span>
              </Badge>

              <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Le poste de contrôle unique pour vos opérations de sécurité
              </h1>

              <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
                Sentrys centralise la gestion de vos <strong>agents</strong>, <strong>sites</strong>,
                <strong> plannings</strong> et <strong>incidents</strong> pour gagner en efficacité,
                en traçabilité et en sérénité.
              </p>

              <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:gap-4">
                <Button asChild size="lg" className="h-11 rounded-full gap-2">
                  <Link href="/signup">
                    Démarrer gratuitement <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-11 rounded-full">
                  <Link href="/contact">Demander une démo</Link>
                </Button>
              </div>
            </div>

            {/* Preview */}
            <div className="relative mx-auto mt-12 max-w-6xl lg:mt-16">
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-b from-primary/10 to-transparent blur-xl" />
              <div className="relative overflow-hidden rounded-2xl border bg-card shadow-2xl shadow-primary/10">
                <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/35" />
                  <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/35" />
                  <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/35" />
                  <span className="ml-2 text-xs text-muted-foreground">Sentrys — Dashboard</span>
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

        {/* FEATURES */}
        <section id="fonctionnalites" className="w-full border-t bg-muted/40 py-14 md:py-20">
          <div className="container">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
                Un outil unique pour tout piloter
              </h2>
              <p className="mt-4 text-muted-foreground md:text-lg">
                Fini les tableurs et les échanges d’emails. Centralisez vos opérations sur une
                plateforme unique, simple et sécurisée.
              </p>
            </div>

            <div className="mx-auto mt-10 grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featureCards.map((feature) => (
                <div
                  key={feature.title}
                  className="group rounded-2xl border bg-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border bg-muted/40 transition group-hover:bg-primary/10">
                      <feature.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold">{feature.title}</h3>
                      <p className="text-sm text-muted-foreground">{feature.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mx-auto mt-10 flex max-w-3xl flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <Button asChild className="rounded-full gap-2">
                <Link href="/tarifs">
                  Voir les tarifs <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full">
                <Link href="/contact">Demander une démo</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="py-14 md:py-20">
          <div className="container">
            <div className="mx-auto max-w-5xl rounded-3xl border bg-card p-8 md:p-12">
              <div className="grid gap-8 md:grid-cols-2 md:items-center">
                <div className="space-y-3">
                  <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
                    Prêt à moderniser vos opérations ?
                  </h2>
                  <p className="text-muted-foreground md:text-lg">
                    Créez votre compte en quelques minutes ou planifiez une démo personnalisée.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row md:justify-end">
                  <Button asChild size="lg" className="h-11 rounded-full">
                    <Link href="/signup">Essayer Sentrys gratuitement</Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="h-11 rounded-full">
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
