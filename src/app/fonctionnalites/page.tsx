import type { Metadata } from "next";
import {
  CalendarClock,
  Siren,
  Users,
  Building2,
  BarChart,
  ShieldCheck,
  CheckCircle,
} from "lucide-react";
import PublicLayout from "@/components/layouts/public-layout";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Fonctionnalités",
  description: "Découvrez comment Sentrys simplifie la gestion de vos opérations de sécurité.",
};

const featureCards = [
    {
      icon: CalendarClock,
      title: "Planning centralisé",
      desc: "Générez et assignez les vacations. Une vue claire et en temps réel pour vos équipes.",
      details: [
          "Création de vacations par site",
          "Définition des besoins en agents",
          "Assignation simple des agents disponibles",
          "Vue d'ensemble du planning"
      ]
    },
    {
      icon: Siren,
      title: "Gestion des incidents",
      desc: "Tracez chaque incident du début à la fin. Preuves, commentaires, actions, clôture.",
      details: [
          "Rapports d'incidents détaillés avec photos",
          "Fil de commentaires en temps réel par incident",
          "Statuts personnalisables (Ouvert, En cours, Clos)",
          "Historique complet pour chaque site"
      ]
    },
    {
      icon: Users,
      title: "Dossiers agents",
      desc: "Profils, documents, qualifications et historique : tout est centralisé et à jour.",
      details: [
        "Fiches agents complètes (contact, statut)",
        "Gestion des documents et certifications",
        "Historique des missions et incidents par agent",
        "Affectation facile aux sites"
      ]
    },
    {
      icon: Building2,
      title: "Suivi des sites",
      desc: "Consignes, contacts, risques et informations clés de chaque site au même endroit.",
      details: [
        "Fiches sites avec adresse, contacts et niveau de risque",
        "Consignes opérationnelles spécifiques par site",
        "Historique des événements liés au site",
        "Gestion des agents autorisés par site"
      ]
    },
    {
      icon: BarChart,
      title: "Reporting et Analyse",
      desc: "Des tableaux de bord lisibles pour piloter l’activité et décider plus vite.",
      details: [
        "Statistiques clés sur le tableau de bord principal",
        "Suivi du nombre d'incidents, missions, etc.",
        "Export des données pour analyse externe",
        "Rapports d'activité détaillés"
      ]
    },
    {
      icon: ShieldCheck,
      title: "Sécurité & Rôles",
      desc: "Permissions granulaires (Admin, Manager, Agent) pour un accès sécurisé et adapté.",
      details: [
        "Isolation des données par client (multi-tenant)",
        "Rôles prédéfinis pour une gestion simple des accès",
        "Authentification sécurisée",
        "Journal d'audit des actions importantes"
      ]
    },
  ];

export default function FonctionnalitesPage() {
  return (
    <PublicLayout>
      <section className="py-12 md:py-20">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Toutes les fonctionnalités dont vous avez besoin
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Sentrys est conçu pour être à la fois puissant et simple d'utilisation, en centralisant tous les aspects de vos opérations de sécurité.
            </p>
          </div>

          <div className="mx-auto mt-12 grid max-w-6xl gap-6 lg:grid-cols-2">
            {featureCards.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-2xl border bg-card p-6 shadow-sm"
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
                <div className="mt-4 space-y-2 border-t pt-4">
                    {feature.details.map((detail) => (
                        <div key={detail} className="flex items-center gap-2 text-sm">
                            <CheckCircle className="h-4 w-4 text-primary" />
                            <span>{detail}</span>
                        </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-12 text-center">
                <Button asChild size="lg" className="rounded-full">
                    <Link href="/signup">Commencer gratuitement</Link>
                </Button>
            </div>
        </div>
      </section>
    </PublicLayout>
  );
}
