import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowRight, Rss } from "lucide-react";

import PublicLayout from "@/components/layouts/public-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Blog Sentrys — Analyses, nouveautés et conseils pour la sécurité privée",
  description:
    "Suivez l'actualité de Sentrys et du secteur de la sécurité privée. Découvrez nos analyses, les nouvelles fonctionnalités et des conseils pour optimiser vos opérations.",
  alternates: { canonical: "/blog" },
};

// Placeholder data for blog posts
const posts = [
  {
    id: "post-1",
    title: "Comment Sentrys améliore la traçabilité des incidents",
    description: "Une analyse détaillée de notre module de gestion des incidents et de son impact sur la réactivité terrain.",
    imageUrl: "https://picsum.photos/seed/blog1/1200/800",
    imageHint: "data analysis chart",
    category: "Analyse",
    publishedAt: new Date("2024-05-15"),
    href: "#",
  },
  {
    id: "post-2",
    title: "Nouveauté : Le reporting avancé est disponible",
    description: "Découvrez les nouvelles fonctionnalités de reporting pour un pilotage plus fin de vos opérations de sécurité.",
    imageUrl: "https://picsum.photos/seed/blog2/1200/800",
    imageHint: "dashboard interface",
    category: "Produit",
    publishedAt: new Date("2024-05-10"),
    href: "#",
  },
  {
    id: "post-3",
    title: "Sécurité des données : notre engagement",
    description: "Architecture, rôles, permissions... Comment nous protégeons vos données les plus sensibles.",
    imageUrl: "https://picsum.photos/seed/blog3/1200/800",
    imageHint: "data security lock",
    category: "Sécurité",
    publishedAt: new Date("2024-05-01"),
    href: "#",
  },
  {
    id: "post-4",
    title: "Optimiser le planning de vos agents : 5 astuces",
    description: "Comment utiliser notre module de planification pour éviter les trous de planning et améliorer l'efficacité.",
    imageUrl: "https://picsum.photos/seed/blog4/1200/800",
    imageHint: "calendar schedule",
    category: "Analyse",
    publishedAt: new Date("2024-04-25"),
    href: "#",
  },
  {
    id: "post-5",
    title: 'Les avantages d\'un suivi des sites en temps réel',
    description: 'De la mise à jour des consignes à la gestion des accès, découvrez pourquoi un référentiel de sites centralisé est crucial.',
    imageUrl: 'https://picsum.photos/seed/blog5/1200/800',
    imageHint: 'map location gps',
    category: 'Analyse',
    publishedAt: new Date('2024-04-18'),
    href: '#',
  },
];

const [latestPost, ...otherPosts] = posts;

export default function BlogPage() {
  return (
    <PublicLayout>
      <section className="relative overflow-hidden border-b py-12 md:py-20">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5" />
        </div>
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline" className="gap-2 border-primary/20 bg-primary/10 text-primary">
              <Rss className="h-4 w-4" />
              Blog Sentrys
            </Badge>
            <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              Analyses, nouveautés et conseils
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
              Suivez l&apos;actualité de Sentrys et du secteur de la sécurité privée. Découvrez nos
              analyses, les nouvelles fonctionnalités et des conseils pour optimiser vos opérations.
            </p>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="container">
          {/* Latest Post */}
          <article className="grid gap-8 md:grid-cols-2 md:items-center">
            <Link href={latestPost.href} className="group block overflow-hidden rounded-3xl">
              <Image
                src={latestPost.imageUrl}
                alt={`Image pour l'article: ${latestPost.title}`}
                width={600}
                height={400}
                data-ai-hint={latestPost.imageHint}
                className="aspect-[3/2] w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </Link>
            <div>
              <Badge variant="secondary">{latestPost.category}</Badge>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
                <Link href={latestPost.href} className="hover:text-primary transition-colors">
                  {latestPost.title}
                </Link>
              </h2>
              <p className="mt-3 text-muted-foreground">
                {latestPost.description}
              </p>
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {format(latestPost.publishedAt, "d MMMM yyyy", { locale: fr })}
                </p>
                <Button asChild variant="ghost" className="gap-2">
                  <Link href={latestPost.href}>
                    Lire l&apos;article <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </article>

          {/* Other Posts */}
          <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {otherPosts.map((post) => (
              <article key={post.id} className="group flex flex-col">
                <Link href={post.href} className="block overflow-hidden rounded-3xl">
                  <Image
                    src={post.imageUrl}
                    alt={`Image pour l'article: ${post.title}`}
                    width={400}
                    height={267}
                    data-ai-hint={post.imageHint}
                    className="aspect-[3/2] w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </Link>
                <div className="mt-4 flex flex-1 flex-col">
                  <Badge variant="secondary">{post.category}</Badge>
                  <h3 className="mt-3 text-lg font-semibold">
                    <Link href={post.href} className="hover:text-primary transition-colors">
                      {post.title}
                    </Link>
                  </h3>
                  <p className="mt-2 flex-1 text-sm text-muted-foreground">
                    {post.description}
                  </p>
                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {format(post.publishedAt, "d MMMM yyyy", { locale: fr })}
                    </p>
                    <Button asChild size="sm" variant="ghost" className="gap-1">
                      <Link href={post.href}>
                        Lire <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
