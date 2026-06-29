// src/app/fonctionnalites/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import PublicLayout from "@/components/layouts/public-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

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
  Layers,
  Lock,
  Target,
  Zap,
  Clock,
  ShieldAlert
} from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Fonctionnalités Sentrys — Planning, incidents, sites, agents, reporting",
  description: "Découvrez comment Sentrys simplifie la gestion de vos opérations de sécurité : planning centralisé, gestion des incidents, dossiers agents, sites & consignes, reporting.",
};

type Feature = {
  id: string;
  icon: any;
  title: string;
  desc: string;
  solves: string;
  details: string[];
  color: string;
  bg: string;
};

const featureCards: Feature[] = [
  {
    id: "planning",
    icon: CalendarClock,
    title: "Planning centralisé",
    desc: "Générez les besoins, créez les vacations et assignez rapidement les agents.",
    solves: "Éliminez les plannings papier et les conflits d'agenda. Gagnez 4h par semaine sur la planification.",
    details: ["Calendrier interactif", "Gestion des vacations par site", "Alertes de sous-effectif", "Calcul automatique des heures"],
    color: "text-blue-500",
    bg: "bg-blue-500/10"
  },
  {
    id: "incidents",
    icon: Siren,
    title: "Main Courante Digitale",
    desc: "Tracez chaque incident du début à la fin. Preuves photos, commentaires et actions.",
    solves: "Traçabilité juridique totale et réactivité immédiate en cas de sinistre sur site.",
    details: ["Rapports photos temps réel", "Fil de discussion par incident", "Géolocalisation des rapports", "Statuts de résolution"],
    color: "text-red-500",
    bg: "bg-red-500/10"
  },
  {
    id: "agents",
    icon: Users,
    title: "Dossiers RH Agents",
    desc: "Profils, documents d'identité, cartes pro et historique : tout est au même endroit.",
    solves: "Fini les dossiers incomplets lors des audits. Soyez alerté avant l'expiration d'une carte pro.",
    details: ["Alertes expiration documents", "Historique complet des missions", "Suivi des formations (SST, etc.)", "Fiche de contact rapide"],
    color: "text-emerald-500",
    bg: "bg-emerald-500/10"
  },
  {
    id: "sites",
    icon: Building2,
    title: "Gestion des Sites",
    desc: "Consignes, contacts, risques : toute l'information opérationnelle centralisée.",
    solves: "Assurez-vous que vos agents ont toujours les bonnes consignes, même lors d'un remplacement.",
    details: ["Base de connaissances par site", "Contacts d'urgence dédiés", "Niveaux de risques paramétrables", "Documents techniques partagés"],
    color: "text-amber-500",
    bg: "bg-amber-500/10"
  },
  {
    id: "reporting",
    icon: BarChart,
    title: "Pilotage & Data",
    desc: "Des indicateurs de performance clairs pour piloter votre agence.",
    solves: "Prouvez votre valeur à vos clients avec des rapports d'activité professionnels et factuels.",
    details: ["KPIs de performance", "Top sites par incidents", "Exports PDF/Excel personnalisés", "Taux de remplissage des vacations"],
    color: "text-indigo-500",
    bg: "bg-indigo-500/10"
  },
  {
    id: "securite",
    icon: ShieldCheck,
    title: "Sécurité & Multi-tenant",
    desc: "Architecture sécurisée et gestion multi-sociétés pour les groupes en croissance.",
    solves: "Isolez les données de vos différentes agences tout en gardant une vision globale.",
    details: ["Rôles granulaires (RBAC)", "Logs d'audit des actions", "Isolation stricte des données", "Authentification sécurisée"],
    color: "text-purple-500",
    bg: "bg-purple-500/10"
  },
];

export default function FonctionnalitesPage() {
  return (
    <PublicLayout>
      {/* ===================== HERO ===================== */}
      <section className="relative pt-20 pb-16 md:pt-32 md:pb-24 overflow-hidden border-b">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(45%_40%_at_50%_50%,rgba(var(--primary-rgb),0.08)_0%,transparent_100%)]" />

        <div className="container px-4 mx-auto text-center">
          <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
            <Badge variant="outline" className="rounded-full px-4 border-primary/30 text-primary font-black uppercase text-[10px] tracking-widest bg-primary/5">
              Catalogue Modules
            </Badge>
          </div>

          <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-8 leading-[1.1]">
            Une suite complète pour <br /> <span className="text-primary">l'excellence opérationnelle.</span>
          </h1>

          <p className="max-w-2xl mx-auto text-lg text-muted-foreground font-medium mb-12">
            Sentrys a été conçu avec des directeurs d'exploitation pour répondre aux réalités du terrain. Chaque clic compte, chaque information est sécurisée.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
             {featureCards.map((l) => (
                <a key={l.id} href={`#${l.id}`} className="px-5 py-2.5 rounded-full border border-border/50 bg-background text-sm font-bold text-muted-foreground hover:text-primary hover:border-primary/30 hover:shadow-lg transition-all">
                  {l.title}
                </a>
             ))}
          </div>
        </div>
      </section>

      {/* ===================== GRID FEATURES ===================== */}
      <section className="py-24 bg-muted/10">
        <div className="container px-4 mx-auto">
          <div className="grid gap-12 lg:grid-cols-2 max-w-6xl mx-auto">
            {featureCards.map((f) => (
              <article
                id={f.id}
                key={f.id}
                className="group relative flex flex-col rounded-[2.5rem] border border-border/50 bg-card p-8 md:p-10 shadow-sm hover:shadow-2xl transition-all duration-500 scroll-mt-28 overflow-hidden"
              >
                {/* Background Decor */}
                <div className={cn("absolute -top-12 -right-12 w-48 h-48 rounded-full blur-[80px] opacity-20 transition-opacity group-hover:opacity-40", f.bg)} />

                <div className="flex items-center gap-5 mb-8">
                  <div className={cn("flex h-14 w-14 items-center justify-center rounded-2xl border border-border/50 shadow-sm transition-transform group-hover:scale-110", f.bg)}>
                    <f.icon className={cn("h-7 w-7", f.color)} />
                  </div>
                  <h3 className="text-2xl font-black tracking-tight">{f.title}</h3>
                </div>

                <p className="text-lg font-medium text-foreground mb-6 leading-relaxed">
                  {f.desc}
                </p>

                <div className="flex-1 space-y-8">
                  <div className="p-6 rounded-[1.5rem] bg-muted/40 border border-border/30 relative">
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-2 flex items-center gap-2">
                      <Zap className="h-3 w-3 fill-primary" /> Cas d'usage
                    </p>
                    <p className="text-sm font-bold text-muted-foreground leading-relaxed italic">
                      "{f.solves}"
                    </p>
                  </div>

                  <div className="space-y-4">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground/60">Détails techniques</p>
                    <ul className="grid gap-3 sm:grid-cols-2">
                      {f.details.map((detail) => (
                        <li key={detail} className="flex items-center gap-3 text-sm font-bold text-foreground/80">
                          <div className={cn("h-5 w-5 rounded-full flex items-center justify-center shrink-0", f.bg)}>
                            <CheckCircle2 className={cn("h-3 w-3", f.color)} />
                          </div>
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== VALUE PROPS = [Diagramme possible ici] ===================== */}
      <section className="py-24 border-y">
        <div className="container px-4 mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-black tracking-tight mb-4 uppercase text-[10px] tracking-[0.3em] text-primary">Pourquoi choisir Sentrys ?</h2>
            <h3 className="text-3xl md:text-5xl font-black tracking-tighter">Conçu pour les pros de la sécurité.</h3>
          </div>

          {/* Logic flow diagram placeholder */}


          <div className="grid gap-8 md:grid-cols-3 max-w-6xl mx-auto mt-16">
            {[
              { icon: Target, t: "Moins de friction", d: "Une UX fluide qui réduit le temps administratif de 30%." },
              { icon: Layers, t: "Traçabilité 360°", d: "Archives horodatées et inaltérables pour chaque événement." },
              { icon: Lock, t: "Données Souveraines", d: "Hébergement sécurisé et conformité RGPD stricte." },
            ].map((v) => (
              <div key={v.t} className="text-center space-y-4 p-8 rounded-3xl bg-muted/20 border">
                 <div className="h-16 w-16 mx-auto rounded-2xl bg-background border flex items-center justify-center">
                    <v.icon className="h-8 w-8 text-primary" />
                 </div>
                 <h4 className="text-xl font-black tracking-tight">{v.t}</h4>
                 <p className="text-sm font-medium text-muted-foreground leading-relaxed">{v.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== FAQ ===================== */}
      <section id="faq" className="py-24 bg-card">
        <div className="container px-4 mx-auto max-w-4xl">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl font-black tracking-tighter">Une question ?</h2>
            <p className="text-muted-foreground font-medium italic">Nous répondons aux interrogations les plus fréquentes des agences de sécurité.</p>
          </div>

          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border rounded-[2rem] px-8 bg-background data-[state=open]:border-primary/50 transition-all">
                <AccordionTrigger className="text-lg font-bold hover:no-underline py-8 tracking-tight">{faq.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-base pb-8 leading-relaxed">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ===================== CTA ===================== */}
      <section className="py-24">
        <div className="container px-4 mx-auto">
          <div className="relative max-w-6xl mx-auto rounded-[3rem] bg-foreground p-8 md:p-20 overflow-hidden text-center">
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />

            <div className="relative z-10 space-y-8">
              <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter">
                Passez à la gestion connectée.
              </h2>
              <p className="text-white/60 max-w-xl mx-auto font-medium text-lg">
                Aucun frais d'installation, aucune formation complexe nécessaire. Commencez dès aujourd'hui.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button asChild size="lg" className="h-14 rounded-2xl px-10 font-black text-base bg-white text-black hover:bg-white/90 shadow-2xl">
                  <Link href="/signup">Créer un compte gratuitement</Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="h-14 rounded-2xl px-10 font-bold text-base border-white/20 text-white hover:bg-white/10 transition-all">
                  <Link href="/contact">Démonstration privée</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

const faqs = [
  { q: "Est-ce que Sentrys fonctionne hors-ligne ?", a: "Notre application est conçue pour être résiliente. Les agents peuvent saisir des rapports d'incidents même en zone blanche (sous-sols, parkings) ; les données sont synchronisées automatiquement dès que la connexion est rétablie." },
  { q: "Puis-je gérer plusieurs sociétés de sécurité avec un seul compte ?", a: "Oui, via le plan Growth. Vous pouvez configurer des 'Tenants' (sociétés) isolés tout en gardant une interface de gestion unifiée. C'est la solution idéale pour les holdings ou les franchisés." },
  { q: "Les données sont-elles exportables ?", a: "Absolument. Vous restez propriétaire de vos données. Tous les rapports d'incidents, plannings et fiches agents sont exportables aux formats PDF, Excel et CSV à tout moment." },
  { q: "Comment se passe l'onboarding ?", a: "Dès votre inscription, un guide interactif vous aide à configurer votre premier site et votre premier agent. Pour les structures plus importantes, nous proposons des sessions d'accompagnement personnalisées." },
];
