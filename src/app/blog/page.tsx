// src/app/blog/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowRight, Rss, BookOpen, Clock, Tag } from "lucide-react";

import PublicLayout from "@/components/layouts/public-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getAllPosts } from "@/lib/blog";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Le Mag Sentrys — Expertise en Sécurité Privée",
  description: "Analyses, nouveautés technologiques et conseils opérationnels pour les professionnels de la sécurité privée.",
  alternates: { canonical: "/blog" },
};

export default async function BlogPage() {
  const posts = await getAllPosts();
  const [latestPost, ...otherPosts] = posts;

  return (
    <PublicLayout>
      {/* ===================== HERO SECTION ===================== */}
      <section className="relative overflow-hidden border-b border-border/50 pt-20 pb-16 md:pt-32 md:pb-24">
        {/* Background Gradients */}
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(45%_40%_at_50%_50%,rgba(var(--primary-rgb),0.08)_0%,transparent_100%)]" />

        <div className="container px-4 mx-auto">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline" className="gap-2 border-primary/30 text-primary font-black uppercase text-[10px] tracking-[0.2em] px-4 py-1.5 bg-primary/5 rounded-full mb-8">
              <Rss className="h-3.5 w-3.5" />
              Intelligence Opérationnelle
            </Badge>

            <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-8 leading-[1.1]">
              Le Mag <span className="text-primary">Sentrys.</span>
            </h1>

            <p className="max-w-2xl mx-auto text-lg text-muted-foreground font-medium mb-10">
              Expertises métier, analyses de données et meilleures pratiques pour transformer votre exploitation en un centre de performance.
            </p>

            <div className="flex items-center justify-center gap-4">
              <Button asChild variant="outline" className="h-11 rounded-xl px-6 font-bold border-border/50 bg-background/50 backdrop-blur-sm">
                <Link href="/rss.xml" className="flex items-center gap-2">S'abonner au flux</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== ARTICLES SECTION ===================== */}
      <section className="py-24 bg-muted/10">
        <div className="container px-4 mx-auto max-w-7xl">
          {!latestPost ? (
            <div className="mx-auto max-w-2xl rounded-[2rem] border-2 border-dashed border-border/50 bg-card p-12 text-center">
              <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                <BookOpen className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <h3 className="text-xl font-black mb-2">Les rédacteurs sont au travail</h3>
              <p className="text-sm text-muted-foreground">Revenez bientôt pour découvrir nos premières analyses terrain.</p>
            </div>
          ) : (
            <div className="space-y-24">
              {/* FEATURED POST */}
              <article className="relative group">
                <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
                  <Link
                    href={`/blog/${latestPost.slug}`}
                    className="relative aspect-[16/10] overflow-hidden rounded-[2.5rem] border border-border/50 shadow-2xl shadow-black/5"
                  >
                    <Image
                      src={latestPost.image ?? "https://picsum.photos/seed/sentrysblog/1200/800"}
                      alt={latestPost.title}
                      fill
                      priority
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  </Link>

                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <Badge className="bg-primary text-white font-bold uppercase text-[9px] tracking-widest px-3 py-1 rounded-lg">À la une</Badge>
                      {latestPost.category && (
                        <Badge variant="outline" className="font-bold uppercase text-[9px] tracking-widest px-3 py-1 rounded-lg border-primary/30 text-primary">
                          {latestPost.category}
                        </Badge>
                      )}
                      <span className="text-xs font-black text-muted-foreground flex items-center gap-1.5 uppercase tracking-tighter">
                        <Clock className="h-3 w-3" /> 5 min de lecture
                      </span>
                    </div>

                    <h2 className="text-3xl md:text-5xl font-black tracking-tighter leading-none">
                      <Link href={`/blog/${latestPost.slug}`} className="hover:text-primary transition-colors">
                        {latestPost.title}
                      </Link>
                    </h2>

                    <p className="text-lg text-muted-foreground font-medium leading-relaxed italic">
                      {latestPost.description}
                    </p>

                    <div className="flex items-center gap-4 pt-4">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-black text-primary text-xs">S</div>
                        <div>
                            <p className="text-sm font-bold">Rédaction Sentrys</p>
                            <p className="text-xs text-muted-foreground font-medium">{format(new Date(latestPost.date), "dd MMMM yyyy", { locale: fr })}</p>
                        </div>
                    </div>

                    <div className="pt-6">
                      <Button asChild size="lg" className="h-12 rounded-xl font-black shadow-lg shadow-primary/20 group">
                        <Link href={`/blog/${latestPost.slug}`}>
                          Lire l'article complet <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </article>

              <Separator className="opacity-50" />

              {/* OTHER POSTS GRID */}
              <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-3">
                {otherPosts.map((post) => (
                  <article key={post.slug} className="group flex flex-col bg-card rounded-[2rem] border border-border/50 overflow-hidden hover:shadow-2xl hover:shadow-black/5 transition-all duration-500">
                    <Link href={`/blog/${post.slug}`} className="block relative aspect-[16/10] overflow-hidden">
                      <Image
                        src={post.image ?? "https://picsum.photos/seed/sentrysblog2/1200/800"}
                        alt={post.title}
                        fill
                        className="object-cover transition-transform duration-700 group-hover:scale-110"
                        sizes="(max-width: 768px) 100vw, 400px"
                      />
                      <div className="absolute top-4 left-4 flex gap-2">
                        {post.category && (
                          <Badge className="bg-background/90 backdrop-blur-md text-foreground border-none font-bold text-[9px] uppercase tracking-widest">{post.category}</Badge>
                        )}
                      </div>
                    </Link>

                    <div className="p-8 flex flex-col flex-1">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
                           <Clock className="h-3 w-3" /> {format(new Date(post.date), "dd MMM yyyy", { locale: fr })}
                        </span>
                      </div>

                      <h3 className="text-xl font-black tracking-tight mb-4 group-hover:text-primary transition-colors leading-tight">
                        <Link href={`/blog/${post.slug}`}>{post.title}</Link>
                      </h3>

                      <p className="text-sm text-muted-foreground font-medium leading-relaxed line-clamp-3 mb-8">
                        {post.description}
                      </p>

                      <div className="mt-auto pt-6 border-t border-border/50">
                        <Link
                          href={`/blog/${post.slug}`}
                          className="text-xs font-black uppercase tracking-widest flex items-center gap-2 text-primary group-hover:gap-4 transition-all"
                        >
                          Découvrir <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ===================== NEWSLETTER CTA ===================== */}
      <section className="py-24 border-t border-border/50">
        <div className="container px-4 mx-auto max-w-5xl">
            <div className="relative rounded-[3rem] bg-foreground p-8 md:p-16 overflow-hidden flex flex-col md:flex-row items-center justify-between gap-12">
                <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-primary/20 rounded-full blur-[80px]" />

                <div className="relative z-10 text-center md:text-left space-y-4">
                    <h2 className="text-3xl md:text-4xl font-black text-white tracking-tighter">Restez à la pointe de <br /> l'innovation sécurité.</h2>
                    <p className="text-white/60 font-medium max-w-sm">Rejoignez 2 000+ décideurs qui reçoivent nos analyses mensuelles.</p>
                </div>

                <div className="relative z-10 flex flex-col sm:flex-row gap-3 w-full max-w-md">
                   <div className="flex-1 px-5 py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-sm font-medium focus-within:border-primary/50 transition-all">
                        votre@email.com
                   </div>
                   <Button className="h-12 rounded-2xl px-8 font-black bg-white text-black hover:bg-white/90">S'inscrire</Button>
                </div>
            </div>
        </div>
      </section>
    </PublicLayout>
  );
}
