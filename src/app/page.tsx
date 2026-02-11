import Link from "next/link";
import Image from "next/image";

import Logo from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import {
  ArrowRight,
  ShieldCheck,
  Menu,
  Sparkles,
  CalendarClock,
  Siren,
  Users,
  Building2,
  FileText,
  BarChart,
} from "lucide-react";

import { PlaceHolderImages } from "@/lib/placeholder-images";

const heroImage = PlaceHolderImages.find((p) => p.id === "hero-landing");

const nav = [
  { label: "Fonctionnalités", href: "#fonctionnalites" },
  { label: "Tarifs", href: "/tarifs" },
  { label: "Contact", href: "/contact" },
];

function MobileMenu() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Ouvrir le menu">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[300px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Logo />
          </SheetTitle>
        </SheetHeader>
        <div className="mt-8 flex flex-col gap-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center justify-between rounded-lg px-3 py-2.5 text-base hover:bg-muted"
            >
              {item.label}
            </Link>
          ))}
          <Separator className="my-4" />
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">Connexion</Link>
          </Button>
          <Button asChild className="w-full">
            <Link href="/signup">Démarrer</Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const featureCards = [
  {
    icon: CalendarClock,
    title: "Planning Centralisé",
    desc: "Générez et assignez les vacations. Offrez une vue claire et en temps réel à vos équipes.",
  },
  {
    icon: Siren,
    title: "Gestion des Incidents",
    desc: "Tracez chaque incident du début à la fin. Attachez des preuves, commentez et clôturez.",
  },
  {
    icon: Users,
    title: "Dossiers Agents",
    desc: "Centralisez profils, documents, qualifications et historique de chaque agent.",
  },
  {
    icon: Building2,
    title: "Suivi des Sites",
    desc: "Consignes, contacts, risques. Toute l'information essentielle de vos sites en un seul lieu.",
  },
  {
    icon: BarChart,
    title: "Reporting",
    desc: "Accédez à des tableaux de bord clairs pour piloter votre activité et prendre les bonnes décisions.",
  },
  {
    icon: ShieldCheck,
    title: "Sécurité & Rôles",
    desc: "Permissions granulaires (Admin, Manager, Agent) pour un accès sécurisé et adapté.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col min-h-dvh bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2" aria-label="Sentrys">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-2 md:flex">
            {nav.map((item) => (
              <Button key={item.href} variant="link" asChild className="text-muted-foreground">
                <Link href={item.href}>
                  {item.label}
                </Link>
              </Button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2">
              <Button variant="ghost" asChild>
                <Link href="/login">Connexion</Link>
              </Button>
              <Button asChild>
                <Link href="/signup">
                  Démarrer <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            </div>
            <MobileMenu />
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative">
          <div className="absolute inset-0 -z-10 h-full w-full bg-white bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] bg-[size:6rem_4rem] dark:bg-background dark:bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)]">
            <div className="absolute bottom-0 left-0 right-0 top-0 bg-[radial-gradient(circle_500px_at_50%_200px,hsl(var(--background)),transparent)] dark:bg-[radial-gradient(circle_500px_at_50%_200px,hsl(var(--background)),transparent)]"></div>
          </div>

          <div className="container px-4 py-20 text-center md:px-6 lg:py-32">
            <div className="mx-auto max-w-3xl">
              <h1 className="text-balance text-4xl font-bold tracking-tighter text-foreground sm:text-5xl lg:text-6xl">
                La plateforme opérationnelle pour les entreprises de sécurité
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-balance text-lg text-muted-foreground">
                Sentrys centralise la gestion de vos agents, sites, plannings et incidents pour vous faire gagner en efficacité et en sérénité.
              </p>
              <div className="mt-8 flex flex-col gap-3 justify-center sm:flex-row sm:items-center">
                <Button asChild size="lg" className="rounded-full">
                  <Link href="/signup">
                    Démarrer gratuitement <ArrowRight className="h-4 w-4 ml-2" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="rounded-full">
                  <Link href="/demo">Demander une démo</Link>
                </Button>
              </div>
            </div>
            <div className="relative mt-16">
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-b from-primary/10 to-transparent blur-xl" />
              {heroImage && (
                <Image
                  src={heroImage.imageUrl}
                  alt="Aperçu du tableau de bord Sentrys"
                  data-ai-hint={heroImage.imageHint}
                  width={1200}
                  height={750}
                  priority
                  className="relative mx-auto rounded-2xl border shadow-2xl shadow-primary/10"
                />
              )}
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="fonctionnalites" className="w-full py-20 lg:py-32 bg-muted/30">
          <div className="container px-4 md:px-6">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-bold tracking-tighter text-foreground sm:text-4xl">
                Un outil unique pour tout piloter
              </h2>
              <p className="mt-4 text-muted-foreground md:text-lg">
                Fini les tableurs et les échanges d'emails. Centralisez toutes vos opérations sur une plateforme unique, simple et sécurisée.
              </p>
            </div>
            <div className="mx-auto mt-12 grid max-w-5xl gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {featureCards.map((feature) => (
                <div key={feature.title} className="flex flex-col gap-3 rounded-xl border bg-card p-6 shadow-sm transition-all hover:shadow-md">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-20 lg:py-32">
          <div className="container px-4 md:px-6">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-bold tracking-tighter text-foreground sm:text-4xl">
                Prêt à moderniser vos opérations ?
              </h2>
              <p className="mt-4 text-muted-foreground md:text-lg">
                Créez votre compte en quelques minutes ou planifiez une démo personnalisée.
              </p>
              <div className="mt-8 flex flex-col gap-3 justify-center sm:flex-row sm:items-center">
                <Button asChild size="lg" className="rounded-full">
                  <Link href="/signup">
                    Essayer Sentrys gratuitement
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t">
        <div className="container px-4 py-12 md:px-6">
          <div className="grid gap-8 md:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Logo />
              <p className="text-sm text-muted-foreground">La plateforme opérationnelle pour les entreprises de sécurité privée.</p>
            </div>
            <div className="grid grid-cols-2 md:col-span-2 md:grid-cols-3 gap-8 text-sm">
              <div className="grid gap-2">
                <h3 className="font-semibold">Produit</h3>
                <Link href="#fonctionnalites" className="text-muted-foreground hover:text-foreground">Fonctionnalités</Link>
                <Link href="/tarifs" className="text-muted-foreground hover:text-foreground">Tarifs</Link>
                <Link href="/demo" className="text-muted-foreground hover:text-foreground">Démo</Link>
              </div>
              <div className="grid gap-2">
                <h3 className="font-semibold">Entreprise</h3>
                <Link href="/blog" className="text-muted-foreground hover:text-foreground">Blog</Link>
                <Link href="/contact" className="text-muted-foreground hover:text-foreground">Contact</Link>
              </div>
              <div className="grid gap-2">
                <h3 className="font-semibold">Légal</h3>
                <Link href="/conditions" className="text-muted-foreground hover:text-foreground">Conditions</Link>
                <Link href="/confidentialite" className="text-muted-foreground hover:text-foreground">Confidentialité</Link>
              </div>
            </div>
          </div>
          <Separator className="my-8" />
          <p className="text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} Sentrys. Tous droits réservés.
          </p>
        </div>
      </footer>
    </div>
  );
}
