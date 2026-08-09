// src/app/contact/page.tsx
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
  MessageSquare,
  Globe,
  Headphones,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ContactForm } from "@/components/contact-form";

export const metadata: Metadata = {
  title: "Contact — Démo et Expertise Opérationnelle",
  description: "Demandez une démo personnalisée ou posez vos questions sur Sentrys. Notre équipe d'experts en sécurité privée vous répond sous 24-48h.",
  alternates: { canonical: "/contact" },
};

const reasons = [
  { value: "demo", label: "Planifier une démonstration" },
  { value: "tarifs", label: "Informations sur les tarifs" },
  { value: "support", label: "Assistance technique" },
  { value: "partenariat", label: "Opportunités de partenariat" },
];

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason = "demo" } = await searchParams;
  return (
    <PublicLayout>
      {/* ===================== HERO SECTION ===================== */}
      <section className="relative pt-20 pb-16 md:pt-32 md:pb-24 overflow-hidden border-b border-border/50">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(var(--primary-rgb),0.05)_0%,transparent_60%)]" />

        <div className="container px-4 mx-auto text-center">
          <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
            <Badge variant="secondary" className="rounded-lg px-3 py-1 font-bold uppercase tracking-wider text-[10px] bg-primary/10 text-primary border-none">
              <Headphones className="h-3 w-3 mr-2" /> Support & Ventes
            </Badge>
          </div>

          <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-8 leading-[1.1]">
            Parlons de vos <span className="text-primary">opérations.</span>
          </h1>

          <p className="max-w-2xl mx-auto text-lg text-muted-foreground font-medium">
            Que vous soyez une agence locale ou un groupe multi-sociétés, nous avons la solution pour structurer votre exploitation.
          </p>
        </div>
      </section>

      {/* ===================== MAIN CONTENT ===================== */}
      <section className="py-24 bg-muted/10">
        <div className="container px-4 mx-auto max-w-7xl">
          <div className="grid lg:grid-cols-12 gap-12 lg:items-start">

            {/* FORM CONTAINER (Col 7) */}
            <div className="lg:col-span-7">
              <div className="rounded-[2.5rem] border border-border/50 bg-card p-8 md:p-12 shadow-2xl shadow-black/[0.03] relative overflow-hidden">
                <div className="relative z-10">
                  <div className="flex items-center justify-between gap-4 mb-8">
                    <div>
                      <h2 className="text-2xl font-black tracking-tight mb-1">Envoyer une demande</h2>
                      <p className="text-sm text-muted-foreground font-medium italic">Nous vous recontactons dans les plus brefs délais.</p>
                    </div>
                    <div className="hidden sm:flex items-center gap-2 rounded-xl bg-primary/5 border border-primary/10 px-4 py-2 text-xs font-black text-primary uppercase tracking-widest">
                      <Clock className="h-3.5 w-3.5" /> 24-48h max
                    </div>
                  </div>

                  <ContactForm reasons={reasons} defaultReason={reason} />
                </div>
              </div>
            </div>

            {/* INFO PANEL (Col 5) */}
            <aside className="lg:col-span-5 space-y-8">

              {/* Card 1: Direct Contact */}
              <div className="p-8 rounded-[2.5rem] border border-border/50 bg-card shadow-sm space-y-8">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary">Informations directes</h3>

                <div className="space-y-6">
                  <div className="flex items-start gap-4 group">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 transition-transform group-hover:scale-110">
                      <Mail className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-foreground uppercase tracking-tight">Email</p>
                      <p className="text-muted-foreground font-medium">contact@vsw-digital.fr</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 group">
                    <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 transition-transform group-hover:scale-110">
                      <Zap className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-foreground uppercase tracking-tight">Pour les démos</p>
                      <p className="text-muted-foreground text-sm leading-relaxed">Préparez votre liste de sites et d'agents pour une démo sur-mesure.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 group">
                    <div className="h-12 w-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 transition-transform group-hover:scale-110">
                      <Globe className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-foreground uppercase tracking-tight">Localisation</p>
                      <p className="text-muted-foreground font-medium">France, Paris & Remote</p>
                    </div>
                  </div>
                </div>

                <Separator className="opacity-50" />

                <ul className="space-y-3">
                   {["Réponse sous 24h ouvrées", "Onboarding personnalisé inclus", "Hébergement Google Cloud en Europe"].map(t => (
                     <li key={t} className="flex items-center gap-3 text-xs font-bold text-foreground/70 italic">
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" /> {t}
                     </li>
                   ))}
                </ul>
              </div>

              {/* Card 2: Quick Links */}
              <div className="p-8 rounded-[2.5rem] border border-border/50 bg-foreground text-white overflow-hidden relative group">
                <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12 transition-transform group-hover:rotate-0 duration-700">
                    <MessageSquare className="w-24 h-24" />
                </div>
                <div className="relative z-10 space-y-6">
                  <h3 className="text-sm font-black uppercase tracking-widest text-white/50">Besoin de décider vite ?</h3>
                  <div className="grid gap-3">
                    <Button variant="outline" className="w-full justify-between h-12 rounded-xl bg-white/5 border-white/10 hover:bg-white/10 hover:text-white group" asChild>
                      <Link href="/tarifs">Consulter les prix <ChevronRight className="h-4 w-4 opacity-30 group-hover:opacity-100 transition-all" /></Link>
                    </Button>
                    <Button variant="outline" className="w-full justify-between h-12 rounded-xl bg-white/5 border-white/10 hover:bg-white/10 hover:text-white group" asChild>
                      <Link href="/fonctionnalites">Catalogue modules <ChevronRight className="h-4 w-4 opacity-30 group-hover:opacity-100 transition-all" /></Link>
                    </Button>
                  </div>
                </div>
              </div>

            </aside>
          </div>
        </div>
      </section>

      {/* ===================== FAQ CTA ===================== */}
      <section className="py-24 border-t border-border/50">
        <div className="container px-4 mx-auto text-center max-w-2xl">
          <h2 className="text-3xl font-black tracking-tight mb-4">Une question sur Sentrys ?</h2>
          <p className="text-muted-foreground font-medium mb-10 italic">Jetez un œil à notre foire aux questions avant de nous contacter, vous y trouverez peut-être votre réponse.</p>
          <Button variant="outline" asChild className="h-12 rounded-xl px-8 font-bold border-primary/20 text-primary hover:bg-primary/5">
            <Link href="/faq">Lire la FAQ complète</Link>
          </Button>
        </div>
      </section>
    </PublicLayout>
  );
}
