import type { Metadata } from "next";
import Link from "next/link";

import PublicLayout from "@/components/layouts/public-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import {
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  CalendarClock,
  Siren,
  Users,
  Building2,
  BarChart,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Tarifs Sentrys — Abonnements sécurité privée (Free, Starter, Pro, Growth)",
  description:
    "Choisissez le plan Sentrys adapté à votre société de sécurité : Free, Starter, Pro (recommandé) ou Growth (multi-tenant). Comparez fonctionnalités, options et montée en gamme.",
  alternates: { canonical: "/tarifs" },
  openGraph: {
    type: "website",
    title: "Tarifs Sentrys — Plans et abonnements",
    description:
      "Free, Starter, Pro, Growth : comparez fonctionnalités et options (multi-tenant, add-ons).",
    url: "/tarifs",
    siteName: "Sentrys",
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tarifs Sentrys",
    description:
      "Plans Sentrys : Free, Starter, Pro, Growth. Comparez fonctionnalités et options pour sociétés de sécurité privée.",
  },
};

type PlanId = "free" | "starter" | "pro" | "growth";

type Plan = {
  id: PlanId;
  name: string;
  price: string;
  period: string;
  tagline: string;
  highlight?: boolean;
  bullets: string[];
  ctaLabel: string;
  ctaHref: string;
};

const plans: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "0€",
    period: "/ mois",
    tagline: "Pour démarrer et valider le flux.",
    bullets: ["Vacations & incidents", "Structure de base", "Historique conservé"],
    ctaLabel: "Commencer",
    ctaHref: "/signup?plan=free",
  },
  {
    id: "starter",
    name: "Starter",
    price: "19€",
    period: "/ mois",
    tagline: "Pour une petite équipe opérationnelle.",
    bullets: ["Plus d’agents & sites", "Reporting", "Support standard"],
    ctaLabel: "Choisir Starter",
    ctaHref: "/signup?plan=starter",
  },
  {
    id: "pro",
    name: "Pro",
    price: "49€",
    period: "/ mois",
    tagline: "Recommandé pour la majorité des sociétés.",
    highlight: true,
    bullets: ["Reporting avancé", "Plus de quotas", "Support prioritaire"],
    ctaLabel: "Choisir Pro",
    ctaHref: "/signup?plan=pro",
  },
  {
    id: "growth",
    name: "Growth",
    price: "99€",
    period: "/ mois",
    tagline: "Pour scaler avec multi-sociétés & volume.",
    bullets: ["Multi-tenant (multi-sociétés)", "Gros volumes", "Accompagnement"],
    ctaLabel: "Choisir Growth",
    ctaHref: "/signup?plan=growth",
  },
];

type FeatureRow = {
  label: string;
  icon: any;
  availability: Record<PlanId, boolean>;
};

const features: FeatureRow[] = [
  {
    label: "Vacations & planning",
    icon: CalendarClock,
    availability: { free: true, starter: true, pro: true, growth: true },
  },
  {
    label: "Gestion des incidents",
    icon: Siren,
    availability: { free: true, starter: true, pro: true, growth: true },
  },
  {
    label: "Dossiers agents",
    icon: Users,
    availability: { free: true, starter: true, pro: true, growth: true },
  },
  {
    label: "Sites & consignes",
    icon: Building2,
    availability: { free: true, starter: true, pro: true, growth: true },
  },
  {
    label: "Reporting",
    icon: BarChart,
    availability: { free: false, starter: true, pro: true, growth: true },
  },
  {
    label: "Reporting avancé",
    icon: BarChart,
    availability: { free: false, starter: false, pro: true, growth: true },
  },
  {
    label: "Multi-tenant (multi-sociétés)",
    icon: Building2,
    availability: { free: false, starter: false, pro: false, growth: true },
  },
  {
    label: "Support prioritaire",
    icon: ShieldCheck,
    availability: { free: false, starter: false, pro: true, growth: true },
  },
];

function Cell({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center justify-center">
      <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
      <span className="sr-only">Inclus</span>
    </span>
  ) : (
    <span className="text-sm text-muted-foreground" aria-hidden="true">
      —
      <span className="sr-only">Non inclus</span>
    </span>
  );
}

export default function TarifsPage() {
  return (
    <PublicLayout>
      {/* HERO (CTA limité) */}
      <section className="relative overflow-hidden py-12 md:py-20">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/10" />
          <div className="absolute -top-24 left-1/2 h-[520px] w-[920px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-28 right-[-120px] h-[420px] w-[520px] rounded-full bg-accent/10 blur-3xl" />
        </div>

        <div className="container">
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
                Plans clairs, évolutifs
              </Badge>
            </div>

            <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              Tarifs simples. Produit haut de gamme.
            </h1>

            <p className="mx-auto mt-4 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
              Free pour tester, Pro pour la majorité des sociétés, Growth pour le multi-tenant et les gros volumes.
              Les quotas (agents, sites, tenants) sont visibles en temps réel dans l’app.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
              <Button asChild size="lg" className="h-11 rounded-full gap-2">
                <Link href="/signup">
                  Créer un compte <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 rounded-full">
                <Link href="/contact">Demander une démo</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* PLANS */}
      <section className="border-t bg-muted/30 py-12 md:py-16">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              Choisissez votre plan
            </h2>
            <p className="mt-3 text-muted-foreground md:text-lg">
              Démarrez en Free, passez en Pro quand l’équipe grandit, activez Growth pour multi-sociétés & volume.
            </p>
          </div>

          <div className="mx-auto mt-10 grid max-w-6xl gap-4 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((p) => (
              <Card
                key={p.id}
                className={[
                  "relative rounded-3xl overflow-hidden",
                  p.highlight ? "border-primary/40 shadow-lg shadow-primary/10" : "",
                ].join(" ")}
              >
                {p.highlight ? (
                  <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-primary" />
                ) : null}

                <CardHeader className="space-y-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{p.name}</CardTitle>
                    {p.highlight ? (
                      <Badge className="rounded-full">Recommandé</Badge>
                    ) : null}
                  </div>

                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-semibold tracking-tight">{p.price}</span>
                    <span className="pb-1 text-sm text-muted-foreground">{p.period}</span>
                  </div>

                  <p className="text-sm text-muted-foreground">{p.tagline}</p>
                </CardHeader>

                <CardContent className="space-y-5">
                  <ul className="space-y-2">
                    {p.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    asChild
                    className="w-full rounded-full"
                    variant={p.highlight ? "default" : "outline"}
                  >
                    <Link href={p.ctaHref}>{p.ctaLabel}</Link>
                  </Button>

                  <p className="text-xs text-muted-foreground">
                    Facturation mensuelle. Annuel disponible sur demande.
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* sur-mesure */}
          <div className="mx-auto mt-10 max-w-6xl rounded-3xl border bg-card p-6 md:p-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-semibold">Besoin d’un plan sur-mesure ?</p>
                <p className="text-sm text-muted-foreground">
                  Multi-sociétés, gros volumes, intégrations paie / reporting avancé, SLA…
                </p>
              </div>
              <Button asChild variant="outline" className="rounded-full">
                <Link href="/contact">Nous contacter</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* COMPARATIF (stable + responsive) */}
      <section className="border-t py-12 md:py-16">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              Comparatif des fonctionnalités
            </h2>
            <p className="mt-3 text-muted-foreground md:text-lg">
              Une lecture claire : ce qui est inclus, et ce qui s’active en montée de gamme.
            </p>
          </div>

          <div className="mx-auto mt-10 max-w-6xl">
            <div className="overflow-x-auto rounded-3xl border bg-card">
              {/* min-w pour forcer l’affichage des 4 colonnes + scroll horizontal sur mobile */}
              <table className="w-full min-w-[980px] border-collapse">
                <thead className="bg-muted/30">
                  <tr className="border-b">
                    <th className="sticky left-0 z-10 bg-muted/30 px-6 py-4 text-left text-sm font-semibold text-foreground">
                      Fonctionnalités
                    </th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-foreground">Free</th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-foreground">Starter</th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-foreground">Pro</th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-foreground">Growth</th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {features.map((r) => (
                    <tr key={r.label} className="hover:bg-muted/20 transition">
                      <td className="sticky left-0 z-10 bg-card px-6 py-5">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border bg-muted/20">
                            <r.icon className="h-4 w-4 text-primary" />
                          </div>
                          <p className="text-sm font-medium text-foreground">{r.label}</p>
                        </div>
                      </td>

                      <td className="px-6 py-5 text-center align-middle">
                        <Cell ok={r.availability.free} />
                      </td>
                      <td className="px-6 py-5 text-center align-middle">
                        <Cell ok={r.availability.starter} />
                      </td>
                      <td className="px-6 py-5 text-center align-middle">
                        <Cell ok={r.availability.pro} />
                      </td>
                      <td className="px-6 py-5 text-center align-middle">
                        <Cell ok={r.availability.growth} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              * Les quotas exacts (agents, sites, tenants) sont affichés en temps réel dans votre écran Abonnement.
              Les plans évoluent sans casser votre usage : vous gardez l’historique.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ + CTA final (propre) */}
      <section className="border-t bg-muted/30 py-12 md:py-16">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              Questions fréquentes
            </h2>
            <p className="mt-3 text-muted-foreground md:text-lg">
              Tout ce qu’il faut pour décider vite.
            </p>
          </div>

          <div className="mx-auto mt-10 max-w-3xl rounded-3xl border bg-card p-2">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="q1">
                <AccordionTrigger className="px-4">
                  Puis-je commencer en Free et upgrader plus tard ?
                </AccordionTrigger>
                <AccordionContent className="px-4 text-muted-foreground">
                  Oui. Vous pouvez démarrer en Free, puis passer en Starter/Pro/Growth sans perdre vos données.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="q2">
                <AccordionTrigger className="px-4">
                  Comment fonctionne le multi-tenant (multi-sociétés) ?
                </AccordionTrigger>
                <AccordionContent className="px-4 text-muted-foreground">
                  Vous gérez plusieurs sociétés/tenants dans un seul compte (groupe, sous-traitance, multi-agences).
                  Inclus dans Growth.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="q3">
                <AccordionTrigger className="px-4">
                  Les quotas sont-ils visibles et compréhensibles ?
                </AccordionTrigger>
                <AccordionContent className="px-4 text-muted-foreground">
                  Oui. L’écran Abonnement affiche en temps réel le plan, les quotas, l’usage et le taux d’utilisation.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="q4">
                <AccordionTrigger className="px-4">
                  Puis-je demander un plan sur-mesure ?
                </AccordionTrigger>
                <AccordionContent className="px-4 text-muted-foreground">
                  Oui : gros volumes, multi-sociétés avancé, intégrations, SLA… Contactez-nous pour une offre adaptée.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          <div className="mx-auto mt-10 max-w-5xl rounded-3xl border bg-card p-8 md:p-12">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-semibold">Prêt à démarrer ?</p>
                <p className="text-sm text-muted-foreground">
                  Créez un compte en quelques minutes. Vous pourrez upgrader au bon moment.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-11 rounded-full gap-2">
                  <Link href="/signup">
                    Créer un compte <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-11 rounded-full">
                  <Link href="/contact">Demander une démo</Link>
                </Button>
              </div>
            </div>

            <Separator className="my-8" />

            <p className="text-xs text-muted-foreground">
              Conseil : lorsque Stripe est branché, les boutons “Choisir” déclencheront le checkout et mettront à jour l’abonnement automatiquement.
            </p>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
