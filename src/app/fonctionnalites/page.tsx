import type { Metadata } from "next";
import Link from "next/link";

import PublicLayout from "@/components/layouts/public-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import {
  CalendarClock,
  Siren,
  Users,
  Building2,
  BarChart,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Sparkles,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Fonctionnalités Sentrys — Planning, incidents, sites, agents, reporting",
  description:
    "Découvrez comment Sentrys simplifie la gestion de vos opérations de sécurité : planning centralisé, gestion des incidents, dossiers agents, sites & consignes, reporting, rôles & sécurité.",
  alternates: { canonical: "/fonctionnalites" },
};

type Feature = {
  id: string;
  icon: any;
  title: string;
  desc: string;
  details: string[];
};

const featureCards: Feature[] = [
  {
    id: "planning",
    icon: CalendarClock,
    title: "Planning centralisé",
    desc: "Générez et assignez les vacations. Une vue claire et en temps réel pour vos équipes.",
    details: [
      "Création de vacations par site",
      "Définition des besoins en agents",
      "Assignation simple des agents disponibles",
      "Vue d’ensemble du planning",
    ],
  },
  {
    id: "incidents",
    icon: Siren,
    title: "Gestion des incidents",
    desc: "Tracez chaque incident du début à la fin. Preuves, commentaires, actions, clôture.",
    details: [
      "Rapports détaillés avec photos / pièces jointes",
      "Fil de commentaires par incident",
      "Statuts (Ouvert, En cours, Clos)",
      "Historique complet par site",
    ],
  },
  {
    id: "agents",
    icon: Users,
    title: "Dossiers agents",
    desc: "Profils, documents, qualifications et historique : tout est centralisé et à jour.",
    details: [
      "Fiches agents complètes (contact, statut)",
      "Documents & certifications",
      "Historique missions / incidents par agent",
      "Affectation rapide aux sites",
    ],
  },
  {
    id: "sites",
    icon: Building2,
    title: "Suivi des sites",
    desc: "Consignes, contacts, risques : toutes les informations clés au même endroit.",
    details: [
      "Fiches sites (adresse, contacts, niveau de risque)",
      "Consignes opérationnelles par site",
      "Historique événements liés au site",
      "Gestion des agents autorisés par site",
    ],
  },
  {
    id: "reporting",
    icon: BarChart,
    title: "Reporting & pilotage",
    desc: "Des tableaux de bord lisibles pour piloter l’activité et décider plus vite.",
    details: [
      "Indicateurs clés sur le dashboard",
      "Suivi incidents / vacations / activité",
      "Exports pour analyse externe",
      "Rapports d’activité consolidés",
    ],
  },
  {
    id: "securite",
    icon: ShieldCheck,
    title: "Sécurité & rôles",
    desc: "Permissions granulaires (Admin, Manager, Agent) pour un accès sécurisé et adapté.",
    details: [
      "Rôles prédéfinis & permissions",
      "Authentification sécurisée",
      "Journal d’audit des actions clés",
      "Prêt pour le multi-tenant (Growth)",
    ],
  },
];

const quickLinks = [
  { label: "Planning", href: "#planning" },
  { label: "Incidents", href: "#incidents" },
  { label: "Agents", href: "#agents" },
  { label: "Sites", href: "#sites" },
  { label: "Reporting", href: "#reporting" },
  { label: "Sécurité", href: "#securite" },
];

const valueProps = [
  {
    title: "Moins de friction, plus de contrôle",
    desc: "Une structure claire pour éviter les erreurs de planning et les pertes d’information.",
  },
  {
    title: "Traçabilité terrain",
    desc: "Chaque incident est suivi : preuves, actions, commentaires, clôture, historique.",
  },
  {
    title: "Lisible pour tout le monde",
    desc: "Une UX simple pour les managers, et efficace pour les équipes terrain.",
  },
];

export default function FonctionnalitesPage() {
  return (
    <PublicLayout>
      {/* HERO */}
      <section className="relative overflow-hidden py-12 md:py-20">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/10" />
          <div className="absolute -top-24 left-1/2 h-[520px] w-[920px] -translate-x-1/2 rounded-full bg-primary/12 blur-3xl" />
          <div className="absolute -bottom-28 right-[-120px] h-[420px] w-[520px] rounded-full bg-accent/10 blur-3xl" />
        </div>

        <div className="container">
          <div className="mx-auto max-w-4xl text-center">
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
                Simple, clair, traçable
              </Badge>
            </div>

            <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              Toutes les fonctionnalités dont vous avez besoin
            </h1>

            <p className="mx-auto mt-4 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
              Sentrys centralise planning, incidents, agents, sites et reporting — pour une exploitation fluide,
              une traçabilité solide et une visibilité temps réel.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
              <Button asChild size="lg" className="h-11 rounded-full gap-2">
                <Link href="/signup">
                  Commencer gratuitement <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 rounded-full">
                <Link href="/tarifs">Voir les tarifs</Link>
              </Button>
            </div>

            {/* Quick nav */}
            <div className="mx-auto mt-10 flex max-w-4xl flex-wrap items-center justify-center gap-2">
              {quickLinks.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="rounded-full border bg-card px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 transition"
                >
                  {l.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* VALUE PROPS */}
      <section className="border-t bg-muted/30 py-10 md:py-14">
        <div className="container">
          <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
            {valueProps.map((v) => (
              <div key={v.title} className="rounded-2xl border bg-card p-6">
                <p className="text-sm font-semibold">{v.title}</p>
                <p className="mt-2 text-sm text-muted-foreground">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="border-t py-12 md:py-20">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              Un outil unique pour tout piloter
            </h2>
            <p className="mt-3 text-muted-foreground md:text-lg">
              Chaque module est pensé pour accélérer votre exploitation, sans complexité inutile.
            </p>
          </div>

          <div className="mx-auto mt-10 grid max-w-6xl gap-6 lg:grid-cols-2">
            {featureCards.map((feature) => (
              <article
                id={feature.id}
                key={feature.id}
                className="scroll-mt-24 rounded-3xl border bg-card p-6 shadow-sm"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border bg-muted/40">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>

                  <div className="flex-1">
                    <h3 className="text-lg font-semibold">{feature.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{feature.desc}</p>
                  </div>
                </div>

                <div className="mt-5">
                  <Separator />
                  <ul className="mt-4 space-y-2">
                    {feature.details.map((detail) => (
                      <li key={detail} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-12 text-center">
            <Button asChild size="lg" className="h-11 rounded-full gap-2">
              <Link href="/signup">
                Commencer gratuitement <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="border-t bg-muted/30 py-12 md:py-16">
        <div className="container">
          <div className="mx-auto max-w-5xl rounded-3xl border bg-card p-8 md:p-12">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-semibold">Vous voulez voir le workflow complet en situation ?</p>
                <p className="text-sm text-muted-foreground">
                  Sites → besoins → vacations → incidents → reporting. Une démo suffit pour comprendre le gain.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-11 rounded-full">
                  <Link href="/signup">Créer un compte</Link>
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
