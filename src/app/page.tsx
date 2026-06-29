// src/app/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PublicLayout from "@/components/layouts/public-layout";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { getAllPosts } from "@/lib/blog";

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
  ClipboardList,
  Layers,
  Lock,
  Zap,
  Globe
} from "lucide-react";

import { PlaceHolderImages } from "@/lib/placeholder-images";
import { cn } from "@/lib/utils";

const heroImage = PlaceHolderImages.find((p) => p.id === "hero-landing");

export const metadata: Metadata = {
  title: "Sentrys — Logiciel de gestion pour la sécurité privée",
  description: "Centralisez agents, sites, planning et incidents sur une plateforme SaaS moderne. Gagnez en traçabilité et en efficacité opérationnelle.",
};

const featureCards = [
  { icon: CalendarClock, title: "Planning Intelligent", desc: "Gérez les vacations et les affectations complexes en quelques clics.", color: "text-blue-500", bg: "bg-blue-500/10" },
  { icon: Siren, title: "Main Courante Digitale", desc: "Suivi des incidents en temps réel avec preuves photos et rapports automatiques.", color: "text-red-500", bg: "bg-red-500/10" },
  { icon: Users, title: "Gestion RH & Agents", desc: "Dossiers complets, documents d'identité et suivi des qualifications.", color: "text-emerald-500", bg: "bg-emerald-500/10" },
  { icon: Building2, title: "Contrôle des Sites", desc: "Toutes les consignes et contacts d'urgence centralisés par site client.", color: "text-amber-500", bg: "bg-amber-500/10" },
  { icon: BarChart, title: "Analyses & KPI", desc: "Visualisez la rentabilité et les indicateurs de performance de votre agence.", color: "text-indigo-500", bg: "bg-indigo-500/10" },
  { icon: Lock, title: "Sécurité & Rôles", desc: "Architecture sécurisée avec permissions granulaires pour chaque collaborateur.", color: "text-purple-500", bg: "bg-purple-500/10" },
];

const steps = [
  { k: "01", icon: Layers, t: "Structurez", d: "Configurez vos clients et sites avec leurs spécificités." },
  { k: "02", icon: ClipboardList, t: "Planifiez", d: "Définissez les besoins en effectifs sur vos plages horaires." },
  { k: "03", icon: Users, t: "Affectez", d: "Assignez vos agents en évitant les conflits d'agenda." },
  { k: "04", icon: Siren, t: "Analysez", d: "Suivez les incidents et extrayez vos rapports d'activité." },
];

export default async function Home() {
  const posts = await getAllPosts();
  const latestPosts = posts.slice(0, 3);

  return (
    <PublicLayout>
      {/* ===================== HERO SECTION ===================== */}
      <section className="relative pt-20 pb-16 md:pt-32 md:pb-24 overflow-hidden">
        {/* Background Decorations */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute bottom-[10%] right-[-5%] w-[30%] h-[30%] bg-accent/10 rounded-full blur-[100px]" />
        </div>

        <div className="container px-4 mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted/50 border border-border/50 mb-8 animate-in fade-in slide-in-from-top-4 duration-700">
            <Badge className="bg-primary text-white hover:bg-primary border-none text-[10px] font-black uppercase tracking-widest">Nouveau</Badge>
            <span className="text-xs font-bold text-muted-foreground flex items-center gap-1">
              Version 2.0 disponible : Main courante temps réel <Zap className="h-3 w-3 fill-amber-500 text-amber-500" />
            </span>
          </div>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tighter mb-8 bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/70 leading-[1.1]">
            La sécurité privée a enfin <br className="hidden lg:block" /> son système d'exploitation.
          </h1>

          <p className="max-w-2xl mx-auto text-lg md:text-xl text-muted-foreground font-medium mb-10">
            Sentrys centralise vos opérations pour transformer votre agence de sécurité en une entreprise <span className="text-foreground font-bold underline decoration-primary/30 underline-offset-4">ultra-réactive</span> et connectée.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Button asChild size="lg" className="h-14 rounded-2xl px-8 font-black text-base shadow-xl shadow-primary/20 hover:translate-y-[-2px] transition-all">
              <Link href="/signup">Essayer gratuitement <ArrowRight className="ml-2 h-5 w-5" /></Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-14 rounded-2xl px-8 font-bold text-base border-border/50 bg-background/50 backdrop-blur-sm">
              <Link href="/contact">Réserver une démo</Link>
            </Button>
          </div>

          {/* Product Preview */}
          <div className="relative max-w-6xl mx-auto group">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 rounded-[2.5rem] blur opacity-30 group-hover:opacity-50 transition duration-1000"></div>
            <div className="relative rounded-[2rem] border border-border/50 bg-card/80 backdrop-blur-sm shadow-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-6 py-4 border-b border-border/50 bg-muted/20">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/30" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/20 border border-amber-500/30" />
                  <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/30" />
                </div>
                <div className="mx-auto flex items-center gap-2 px-3 py-1 rounded-lg bg-background/50 border border-border/50 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  <Lock className="h-3 w-3" /> app.sentrys.io
                </div>
              </div>
              <div className="relative aspect-[16/10] sm:aspect-[16/9] w-full">
                {heroImage ? (
                  <Image
                    src={heroImage.imageUrl}
                    alt="Sentrys Dashboard"
                    fill
                    priority
                    className="object-cover"
                    sizes="100vw"
                  />
                ) : (
                  <div className="h-full w-full bg-muted animate-pulse flex items-center justify-center">
                    <Globe className="h-12 w-12 text-muted-foreground/20" />
                  </div>
                )}
              </div>
            </div>

            {/* Floating Stats Bullets */}
            <div className="hidden lg:grid grid-cols-4 gap-4 mt-8">
               {["Planning 0 faute", "Rapports instantanés", "Agents connectés", "Multi-sites"].map((txt) => (
                 <div key={txt} className="flex items-center gap-3 p-4 rounded-2xl border border-border/50 bg-background/50 backdrop-blur-sm shadow-sm group hover:border-primary/30 transition-colors">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    <span className="text-sm font-black uppercase tracking-tight text-foreground/80">{txt}</span>
                 </div>
               ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===================== FEATURES BENTO ===================== */}
      <section id="fonctionnalites" className="py-24 bg-muted/20 border-y border-border/50">
        <div className="container px-4 mx-auto">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4 border-primary/30 text-primary font-black uppercase tracking-widest px-4 py-1">Fonctionnalités</Badge>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-4">Tout pour piloter votre agence.</h2>
            <p className="text-muted-foreground font-medium max-w-2xl mx-auto italic">Oubliez les fichiers Excel et les carnets de bord papier. Sentrys centralise l'intelligence de votre exploitation.</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
            {featureCards.map((f) => (
              <div key={f.title} className="group p-8 rounded-[2rem] border border-border/50 bg-card hover:bg-muted/30 transition-all duration-300 hover:shadow-xl hover:shadow-black/5 hover:-translate-y-1">
                <div className={cn("inline-flex p-3 rounded-2xl mb-6 transition-transform group-hover:scale-110 duration-500", f.bg)}>
                  <f.icon className={cn("h-6 w-6", f.color)} />
                </div>
                <h3 className="text-xl font-black tracking-tight mb-3 text-foreground">{f.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed mb-6">{f.desc}</p>
                <div className="pt-4 border-t border-border/40 opacity-0 group-hover:opacity-100 transition-opacity">
                   <Link href="/fonctionnalites" className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                    Détails module <ArrowRight className="h-3 w-3" />
                   </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== WORKFLOW TIMELINE ===================== */}
      <section className="py-24 overflow-hidden">
        <div className="container px-4 mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-16 max-w-6xl mx-auto">
            <div className="flex-1 space-y-8">
              <h2 className="text-4xl md:text-5xl font-black tracking-tighter leading-none">
                De la commande <br /> <span className="text-primary">à la facturation.</span>
              </h2>
              <div className="space-y-6">
                {steps.map((s) => (
                  <div key={s.k} className="flex gap-6 group">
                    <div className="flex flex-col items-center">
                      <div className="w-10 h-10 rounded-full border-2 border-primary/20 flex items-center justify-center text-xs font-black text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-500">
                        {s.k}
                      </div>
                      <div className="flex-1 w-px bg-border my-2" />
                    </div>
                    <div className="pb-8">
                      <h4 className="text-lg font-black tracking-tight mb-1">{s.t}</h4>
                      <p className="text-muted-foreground text-sm leading-relaxed">{s.d}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-1 relative">
               <div className="absolute inset-0 bg-primary/20 rounded-[3rem] blur-[80px] -z-10" />
               <div className="p-8 rounded-[3rem] border border-border/50 bg-card shadow-2xl">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="p-3 rounded-2xl bg-primary shadow-lg shadow-primary/20 text-white"><CalendarClock className="h-6 w-6"/></div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Module Planning</p>
                      <p className="text-sm font-bold">Aperçu en temps réel</p>
                    </div>
                  </div>
                  <div className="space-y-4 opacity-40 grayscale group-hover:grayscale-0 transition duration-700">
                    <div className="h-12 w-full bg-muted rounded-xl" />
                    <div className="h-12 w-[80%] bg-muted rounded-xl" />
                    <div className="h-12 w-full bg-muted rounded-xl" />
                    <div className="h-12 w-[60%] bg-muted rounded-xl" />
                  </div>
                  <div className="mt-8 pt-8 border-t border-border/50 text-center">
                     <p className="text-xs font-medium text-muted-foreground leading-relaxed italic">
                       "Le passage à Sentrys a réduit nos erreurs de planification de 40% dès le premier mois."
                     </p>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== BLOG & ARTICLES ===================== */}
      <section className="py-24 bg-muted/10 border-t border-border/50">
        <div className="container px-4 mx-auto">
          <div className="flex items-end justify-between mb-12 max-w-6xl mx-auto">
            <div>
              <h2 className="text-3xl font-black tracking-tight">Le Mag Sécu</h2>
              <p className="text-muted-foreground font-medium mt-2">Expertise, méthodes et technologie.</p>
            </div>
            <Button variant="ghost" asChild className="hidden sm:flex font-black uppercase tracking-widest text-xs">
               <Link href="/blog">Tout voir <ArrowRight className="ml-2 h-4 w-4"/></Link>
            </Button>
          </div>

          <div className="grid gap-8 md:grid-cols-3 max-w-6xl mx-auto">
            {latestPosts.length > 0 ? (
              latestPosts.map((post) => (
                <article key={post.slug} className="group flex flex-col rounded-[2rem] border border-border/50 bg-card overflow-hidden hover:shadow-2xl hover:shadow-black/5 transition-all">
                  <Link href={`/blog/${post.slug}`} className="block relative aspect-[16/10] overflow-hidden">
                    {post.image && (
                      <Image
                        src={post.image}
                        alt={post.title}
                        fill
                        className="object-cover transition duration-500 group-hover:scale-105"
                      />
                    )}
                    <div className="absolute top-4 left-4">
                      <Badge className="bg-background/80 backdrop-blur-md text-foreground border-none font-bold">{post.category || "Actualité"}</Badge>
                    </div>
                  </Link>
                  <div className="p-6 flex flex-col flex-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-3">
                      {format(new Date(post.date), "dd MMMM yyyy", { locale: fr })}
                    </p>
                    <h3 className="text-lg font-black tracking-tight mb-3 group-hover:text-primary transition-colors">{post.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-6">{post.description}</p>
                    <div className="mt-auto pt-4 border-t border-border/50">
                       <span className="text-xs font-black uppercase tracking-widest flex items-center gap-2 group-hover:text-primary transition-colors">
                        Lire la suite <ArrowRight className="h-3 w-3" />
                       </span>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="col-span-3 py-12 text-center text-muted-foreground italic">Articles en cours de rédaction...</div>
            )}
          </div>
        </div>
      </section>

      {/* ===================== FAQ ===================== */}
      <section className="py-24 border-t border-border/50">
        <div className="container px-4 mx-auto max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">Questions Fréquentes</h2>
          </div>
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border rounded-[1.5rem] px-6 bg-card data-[state=open]:border-primary/50 transition-all">
                <AccordionTrigger className="text-base font-bold hover:no-underline py-6 tracking-tight">{faq.q}</AccordionTrigger>
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
          <div className="relative max-w-6xl mx-auto rounded-[3rem] bg-foreground p-8 md:p-20 overflow-hidden text-center">
            {/* Background pattern */}
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />
            <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/20 rounded-full blur-[100px]" />

            <div className="relative z-10 space-y-8">
              <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter">
                Prêt à numériser votre agence ?
              </h2>
              <p className="text-white/60 max-w-xl mx-auto font-medium text-lg">
                Rejoignez les sociétés de sécurité qui misent sur la technologie pour gagner leurs futurs appels d'offres.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button asChild size="lg" className="h-14 rounded-2xl px-10 font-black text-base bg-white text-black hover:bg-white/90 shadow-2xl">
                  <Link href="/signup">Démarrer maintenant</Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="h-14 rounded-2xl px-10 font-bold text-base border-white/20 text-white hover:bg-white/10 transition-all">
                  <Link href="/contact">Parler à un expert</Link>
                </Button>
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 pt-4">
                Sans carte de crédit <span className="mx-2">•</span> Annulation à tout moment
              </p>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

// Données FAQ (extraites pour lisibilité)
const faqs = [
  { q: "Sentrys est-il adapté aux sociétés multi-sites ?", a: "Absolument. Sentrys a été conçu pour le multi-tenant. Chaque site dispose de son propre environnement sécurisé avec ses consignes, contacts, risques et historique d'activité dédié." },
  { q: "Est-ce que je peux importer mes agents existants ?", a: "Oui, notre équipe peut vous accompagner pour l'import massif de vos bases agents et sites. Nous proposons également des outils d'importation simplifiés directement dans votre interface." },
  { q: "Comment fonctionne la facturation ?", a: "Nous proposons une tarification flexible basée sur le nombre d'agents actifs ou de sites gérés. Vous pouvez commencer gratuitement et faire évoluer votre plan selon la croissance de votre agence." },
];
