import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import PublicLayout from "@/components/layouts/public-layout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Tarifs",
  description: "Des plans simples et transparents pour les entreprises de toutes tailles.",
};

const CATALOG_PLANS = [
    {
      id: "free",
      name: "Essentiel",
      priceMonthly: "0€",
      blurb: "Pour démarrer et tester la plateforme.",
      highlight: false,
      bullets: [
          "5 Agents",
          "2 Sites",
          "Gestion des incidents",
          "Support par email"
      ],
      cta: "Commencer gratuitement"
    },
    {
      id: "starter",
      name: "Pro",
      priceMonthly: "49€",
      blurb: "Pour les équipes en croissance.",
      highlight: true,
      bullets: [
        "25 Agents",
        "10 Sites",
        "Planning des vacations",
        "Reporting standard",
        "Support prioritaire"
      ],
      cta: "Choisir le plan Pro"
    },
    {
      id: "growth",
      name: "Entreprise",
      priceMonthly: "Sur devis",
      blurb: "Pour les besoins complexes et le multi-tenant.",
      highlight: false,
      bullets: [
        "Agents et sites illimités",
        "Multi-tenant",
        "Reporting avancé et exports",
        "Accompagnement et SLA dédié"
      ],
      cta: "Nous contacter"
    },
  ];

export default function TarifsPage() {
  return (
    <PublicLayout>
      <section className="py-12 md:py-20">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Des tarifs pour chaque étape de votre croissance
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Choisissez le plan qui correspond à vos besoins actuels. Pas de frais cachés, pas d'engagement à long terme.
            </p>
          </div>

          <div className="mx-auto mt-12 grid max-w-6xl gap-6 lg:grid-cols-3">
            {CATALOG_PLANS.map((plan) => (
              <div
                key={plan.id}
                className={cn(
                  "flex flex-col rounded-2xl border bg-card p-6 shadow-sm",
                  plan.highlight && "ring-2 ring-primary"
                )}
              >
                {plan.highlight && (
                    <Badge variant="secondary" className="w-fit self-start rounded-full">Le plus populaire</Badge>
                )}
                <div className="mt-4">
                  <h3 className="text-xl font-semibold">{plan.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{plan.blurb}</p>
                </div>
                <div className="my-6">
                  <span className="text-4xl font-bold">{plan.priceMonthly}</span>
                  <span className="text-sm text-muted-foreground">/ mois</span>
                </div>
                <ul className="flex-1 space-y-3">
                  {plan.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <Button asChild className="w-full rounded-full" variant={plan.highlight ? 'default' : 'outline'}>
                    <Link href={plan.id === 'growth' ? '/contact' : '/signup'}>
                        {plan.cta}
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
