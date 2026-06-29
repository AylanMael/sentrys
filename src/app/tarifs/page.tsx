// src/app/tarifs/page.tsx
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
  Zap,
  ShieldAlert,
  Infinity
} from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Tarifs Sentrys — Plans pour la sécurité privée",
  description: "Choisissez le plan adapté à votre agence : Free, Starter, Pro ou Growth. Comparez nos fonctionnalités et nos quotas en toute transparence.",
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
    tagline: "Pour valider votre flux opérationnel.",
    bullets: ["Jusqu'à 5 agents", "Planning de base", "Incidents & Rapports"],
    ctaLabel: "Commencer",
    ctaHref: "/signup?plan=free",
  },
  {
    id: "starter",
    name: "Starter",
    price: "19€",
    period: "/ mois",
    tagline: "Pour les petites agences locales.",
    bullets: ["Agents illimités", "Exports PDF basiques", "Support standard"],
    ctaLabel: "Choisir Starter",
    ctaHref: "/signup?plan=starter",
  },
  {
    id: "pro",
    name: "Pro",
    price: "49€",
    period: "/ mois",
    tagline: "Le standard pour les agences en croissance.",
    highlight: true,
    bullets: ["Reporting avancé", "Export Excel/CSV", "Support prioritaire"],
    ctaLabel: "Choisir Pro",
    ctaHref: "/signup?plan=pro",
  },
  {
    id: "growth",
    name: "Growth",
    price: "99€",
    period: "/ mois",
    tagline: "Multi-sociétés et volumes importants.",
    bullets: ["Multi-tenant (Holdings)", "API Access", "Accompagnement dédié"],
    ctaLabel: "Choisir Growth",
    ctaHref: "/signup?plan=growth",
  },
];

const features = [
  { label: "Planning & Vacations", icon: CalendarClock, availability: { free: true, starter: true, pro: true, growth: true } },
  { label: "Main Courante (Incidents)", icon: Siren, availability: { free: true, starter: true, pro: true, growth: true } },
  { label: "Dossiers RH Agents", icon: Users, availability: { free: true, starter: true, pro: true, growth: true } },
  { label: "Gestion de Sites", icon: Building2, availability: { free: true, starter: true, pro: true, growth: true } },
  { label: "Statistiques d'activité", icon: BarChart, availability: { free: false, starter: true, pro: true, growth: true } },
  { label: "Exports Excel & Analytics", icon: Zap, availability: { free: false, starter: false, pro: true, growth: true } },
  { label: "Multi-Sociétés (Tenants)", icon: Building2, availability: { free: false, starter: false, pro: false, growth: true } },
  { label: "Assistance VIP", icon: ShieldCheck, availability: { free: false, starter: false, pro: true, growth: true } },
];

function Cell({ ok }: { ok: boolean }) {
  return ok ? (
    <div className="flex justify-center">
      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 animate-in zoom-in duration-500">
        <CheckCircle2 className="h-4 w-4 text-primary" />
      </div>
    </div>
  ) : (
    <span className="text-muted-foreground/30 font-light">—</span>
  );
}

export default function TarifsPage() {
  return (
    <PublicLayout>
      {/* ===================== HERO ===================== */}
      <section className="relative pt-20 pb-16 md:pt-32 md:pb-24 overflow-hidden border-b border-border/50">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(var(--primary-rgb),0.1)_0%,transparent_70%)]" />

        <div className="container px-4 mx-auto text-center">
          <Badge variant="outline" className="mb-6 border-primary/30 text-primary font-black uppercase text-[10px] tracking-[0.2em] px-4 py-1.5 bg-primary/5 rounded-full">
            Tarification Transparente
          </Badge>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-8 leading-[1.1]">
            Une offre adaptée à <br /> <span className="text-primary">chaque étape de votre croissance.</span>
          </h1>
          <p className="max-w-2xl mx-auto text-lg text-muted-foreground font-medium mb-12">
            Commencez gratuitement, testez le workflow et passez au niveau supérieur <br className="hidden md:block" /> dès que votre agence passe à l'échelle.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button asChild size="lg" className="h-14 rounded-2xl px-10 font-black shadow-xl shadow-primary/20 transition-all active:scale-95">
              <Link href="/signup">Démarrer maintenant</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-14 rounded-2xl px-10 font-bold border-border/50 bg-background/50 backdrop-blur-sm">
              <Link href="/contact">Planifier une démo</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ===================== PRICING CARDS ===================== */}
      <section className="py-24 bg-muted/20">
        <div className="container px-4 mx-auto">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4 max-w-7xl mx-auto">
            {plans.map((p) => (
              <Card
                key={p.id}
                className={cn(
                  "relative rounded-[2.5rem] border border-border/50 bg-card p-4 transition-all duration-500 hover:shadow-2xl hover:-translate-y-1 overflow-hidden group",
                  p.highlight ? "ring-2 ring-primary shadow-2xl shadow-primary/10" : ""
                )}
              >
                {p.highlight && (
                  <div className="absolute top-6 right-6">
                    <Badge className="bg-primary text-white border-none font-black uppercase text-[8px] tracking-widest px-2 py-1 rounded-lg">Best</Badge>
                  </div>
                )}

                <CardHeader className="p-6">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground mb-2">{p.name}</p>
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-4xl font-black tracking-tighter text-foreground">{p.price}</span>
                    <span className="text-xs font-bold text-muted-foreground">{p.period}</span>
                  </div>
                  <CardTitle className="text-sm font-medium text-muted-foreground leading-relaxed">
                    {p.tagline}
                  </CardTitle>
                </CardHeader>

                <CardContent className="p-6 pt-0 space-y-8">
                  <Separator className="opacity-50" />
                  <ul className="space-y-4">
                    {p.bullets.map((b) => (
                      <li key={b} className="flex items-center gap-3 text-sm font-bold text-foreground/80">
                        <CheckCircle2 className="h-5 w-5 text-primary shrink-0 opacity-70" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    asChild
                    className={cn(
                      "w-full h-12 rounded-xl font-black shadow-lg transition-all active:scale-95",
                      p.highlight ? "bg-primary text-white" : "bg-muted text-foreground hover:bg-muted/80 shadow-none"
                    )}
                  >
                    <Link href={p.ctaHref}>{p.ctaLabel}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== COMPARISON TABLE ===================== */}
      <section className="py-24 border-t border-border/50 overflow-hidden">
        <div className="container px-4 mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-4">Comparez les fonctionnalités</h2>
            <p className="text-muted-foreground font-medium italic max-w-xl mx-auto">Détail des outils inclus par abonnement pour piloter votre agence sans friction.</p>
          </div>

          <div className="max-w-6xl mx-auto overflow-x-auto rounded-[2rem] border border-border/50 shadow-2xl bg-card">
            <table className="w-full min-w-[800px] border-collapse">
              <thead>
                <tr className="bg-muted/30">
                  <th className="sticky left-0 z-10 bg-muted/30 px-8 py-6 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Modules</th>
                  {plans.map(p => (
                    <th key={p.id} className="px-8 py-6 text-center text-sm font-black text-foreground">{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {features.map((f) => (
                  <tr key={f.label} className="group hover:bg-muted/20 transition-colors">
                    <td className="sticky left-0 z-10 bg-card px-8 py-5 group-hover:bg-muted/5 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="h-8 w-8 rounded-lg bg-primary/5 border border-primary/10 flex items-center justify-center shrink-0">
                          <f.icon className="h-4 w-4 text-primary" />
                        </div>
                        <span className="text-sm font-bold text-foreground">{f.label}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-center"><Cell ok={f.availability.free} /></td>
                    <td className="px-8 py-5 text-center"><Cell ok={f.availability.starter} /></td>
                    <td className="px-8 py-5 text-center"><Cell ok={f.availability.pro} /></td>
                    <td className="px-8 py-5 text-center"><Cell ok={f.availability.growth} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ===================== FAQ ===================== */}
      <section className="py-24 bg-background border-t">
        <div className="container px-4 mx-auto max-w-4xl">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl font-black tracking-tighter italic">FAQ Abonnements</h2>
          </div>
          <Accordion type="single" collapsible className="space-y-4">
            {[
              { q: "Puis-je changer de plan à tout moment ?", a: "Oui. Vous pouvez passer d'un plan à un autre instantanément depuis votre tableau de bord. La facturation sera proratisée automatiquement." },
              { q: "Comment fonctionne le multi-sociétés (Growth) ?", a: "Le plan Growth débloque l'architecture multi-tenant. Vous pouvez créer des sous-comptes isolés pour vos différentes filiales tout en gardant une vision d'ensemble centralisée." },
              { q: "Quelles sont les méthodes de paiement ?", a: "Nous acceptons toutes les cartes de crédit via Stripe. Pour les plans Growth, le paiement par virement SEPA est également disponible." },
            ].map((faq, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border rounded-2xl px-8 bg-card shadow-sm data-[state=open]:ring-1 ring-primary/20">
                <AccordionTrigger className="text-base font-bold hover:no-underline py-6">{faq.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-sm pb-6 leading-relaxed">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ===================== FINAL CTA ===================== */}
      <section className="py-24">
        <div className="container px-4 mx-auto">
          <div className="relative max-w-6xl mx-auto rounded-[3rem] bg-foreground p-8 md:p-20 overflow-hidden">
             <div className="absolute top-0 right-0 p-10 opacity-10"><Infinity className="w-64 h-64 text-white" /></div>
             <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-12">
                <div className="text-center md:text-left space-y-4">
                   <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter">Votre agence mérite <br /> le meilleur outil.</h2>
                   <p className="text-white/50 font-medium text-lg">Rejoignez Sentrys aujourd'hui et libérez-vous de l'administratif.</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-4">
                   <Button asChild size="lg" className="h-14 rounded-2xl px-10 font-black bg-white text-black hover:bg-white/90">
                     <Link href="/signup">Essai gratuit</Link>
                   </Button>
                   <Button asChild variant="outline" size="lg" className="h-14 rounded-2xl px-10 font-bold border-white/20 text-white hover:bg-white/10">
                     <Link href="/contact">Support ventes</Link>
                   </Button>
                </div>
             </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
