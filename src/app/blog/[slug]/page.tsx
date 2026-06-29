// src/app/blog/[slug]/page.tsx
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import React from "react";
import {
  ArrowLeft,
  Clock3,
  Share2,
  Bookmark,
  ChevronRight,
} from "lucide-react";

import PublicLayout from "@/components/layouts/public-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";

import { getAllPosts, getPostBySlug } from "@/lib/blog";
import { cn } from "@/lib/utils";

type Props = {
  params: Promise<{ slug: string }>;
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sentrys.app";

/** -------- utils -------- */
function readingTimeMinutes(text: string) {
  const words = text.trim().match(/\S+/g)?.length ?? 0;
  return Math.max(1, Math.round(words / 220));
}

function getNodeText(node: React.ReactNode): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getNodeText).join("");
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return getNodeText(props.children);
  }
  return "";
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function createHeadingIdFactory() {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base = slugify(text);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  };
}

function extractTocFromMdx(source: string) {
  const lines = source.split("\n");
  const items: { rawId: string; text: string; level: 2 | 3 }[] = [];

  for (const line of lines) {
    const m2 = line.match(/^##\s+(.+)\s*$/);
    const m3 = line.match(/^###\s+(.+)\s*$/);

    if (m2) items.push({ rawId: slugify(m2[1]), text: m2[1], level: 2 });
    else if (m3) items.push({ rawId: slugify(m3[1]), text: m3[1], level: 3 });
  }

  const seen = new Map<string, number>();

  return items.map((it) => {
    const n = (seen.get(it.rawId) ?? 0) + 1;
    seen.set(it.rawId, n);

    return {
      id: n === 1 ? it.rawId : `${it.rawId}-${n}`,
      text: it.text,
      level: it.level,
    };
  });
}

/** -------- MDX components -------- */
function createMdxComponents() {
  const getId = createHeadingIdFactory();

  return {
    h2: (props: any) => {
      const text = getNodeText(props.children);
      const id = getId(text);

      return (
        <h2
          id={id}
          className="group relative mt-12 mb-6 scroll-mt-28 text-3xl font-black tracking-tight text-foreground"
        >
          <a
            href={`#${id}`}
            className="absolute -left-8 top-1.5 opacity-0 transition-all group-hover:opacity-100 text-primary/40 hover:text-primary"
          >
            #
          </a>
          {props.children}
        </h2>
      );
    },

    h3: (props: any) => {
      const text = getNodeText(props.children);
      const id = getId(text);

      return (
        <h3
          id={id}
          className="group relative mt-8 mb-4 scroll-mt-28 text-xl font-bold tracking-tight text-foreground"
        >
          <a
            href={`#${id}`}
            className="absolute -left-6 top-1 opacity-0 transition-all group-hover:opacity-100 text-primary/40 hover:text-primary"
          >
            #
          </a>
          {props.children}
        </h3>
      );
    },

    p: (props: any) => (
      <p
        className="mt-6 text-lg font-medium leading-relaxed text-muted-foreground/90"
        {...props}
      />
    ),

    ul: (props: any) => (
      <ul className="mt-6 list-none space-y-3 pl-2" {...props} />
    ),

    li: (props: any) => (
      <li className="flex items-start gap-3 font-medium text-muted-foreground">
        <div className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
        <span>{props.children}</span>
      </li>
    ),

    blockquote: (props: any) => (
      <blockquote
        className="mt-8 rounded-[2rem] border-l-8 border-primary bg-primary/5 px-8 py-10 text-xl font-semibold italic text-foreground"
        {...props}
      />
    ),

    a: (props: any) => (
      <a
        className="font-bold text-primary underline underline-offset-4 transition-colors hover:text-primary/80"
        {...props}
      />
    ),
  };
}

/** -------- Next.js metadata -------- */
export async function generateStaticParams() {
  const posts = await getAllPosts();
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { post } = await getPostBySlug(slug);

  if (!post) return {};

  const url = `/blog/${post.slug}`;

  return {
    title: `${post.title} — Expertise Sentrys`,
    description: post.description,
    alternates: { canonical: url },
    openGraph: {
      title: `${post.title} — Expertise Sentrys`,
      description: post.description,
      url: `${SITE_URL}${url}`,
      type: "article",
      images: post.image ? [{ url: post.image }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: `${post.title} — Expertise Sentrys`,
      description: post.description,
      images: post.image ? [post.image] : undefined,
    },
  };
}

/** -------- Page -------- */
export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;

  const result = await getPostBySlug(slug).catch(() => null);
  if (!result?.post) notFound();

  const { post, content } = result;

  const minutes = readingTimeMinutes(content);
  const toc = extractTocFromMdx(content);
  const mdxComponents = createMdxComponents();

  return (
    <PublicLayout>
      {/* ===================== ARTICLE HEADER ===================== */}
      <section className="relative overflow-hidden border-b border-border/50 pb-12 pt-16">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(var(--primary-rgb),0.05),transparent)]" />

        <div className="container mx-auto max-w-4xl px-4">
          <div className="flex flex-col items-center space-y-6 text-center">
            <Button
              asChild
              variant="ghost"
              className="group mb-4 rounded-xl px-4 text-muted-foreground hover:bg-muted"
            >
              <Link href="/blog">
                <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
                Retour au Mag
              </Link>
            </Button>

            <div className="flex items-center gap-3">
              {post.category && (
                <Badge className="border-none bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary">
                  {post.category}
                </Badge>
              )}
              <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-tighter text-muted-foreground/60">
                <Clock3 className="h-3.5 w-3.5" />
                {minutes} min de lecture
              </span>
            </div>

            <h1 className="text-4xl font-black leading-[1.1] tracking-tighter text-foreground md:text-6xl">
              {post.title}
            </h1>

            <p className="max-w-2xl text-xl font-medium italic leading-relaxed text-muted-foreground">
              "{post.description}"
            </p>

            <div className="flex w-full items-center justify-center gap-4 border-t border-border/40 pt-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 font-black text-primary">
                S
              </div>
              <div className="text-left text-sm">
                <p className="font-black uppercase tracking-tight text-foreground">
                  Rédaction Sentrys
                </p>
                <p className="font-medium text-muted-foreground">
                  {format(new Date(post.date), "dd MMMM yyyy", { locale: fr })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== MAIN CONTENT AREA ===================== */}
      <section className="bg-muted/10 py-16">
        <div className="container mx-auto max-w-7xl px-4">
          <div className="grid items-start gap-12 lg:grid-cols-12">
            {/* SIDEBAR GAUCHE */}
            <aside className="sticky top-32 hidden flex-col items-center gap-4 lg:col-span-1 lg:flex">
              <div className="space-y-2 rounded-2xl border bg-background p-2 shadow-sm">
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-xl hover:text-primary"
                >
                  <Share2 className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-xl hover:text-primary"
                >
                  <Bookmark className="h-5 w-5" />
                </Button>
              </div>
              <div className="h-20 w-px bg-border/50" />
            </aside>

            {/* ARTICLE */}
            <main className="lg:col-span-8">
              {post.image && (
                <div className="relative mb-12 aspect-[16/9] overflow-hidden rounded-[2.5rem] border border-border/50 shadow-2xl shadow-black/5">
                  <Image
                    src={post.image}
                    alt={post.title}
                    fill
                    priority
                    className="object-cover"
                  />
                </div>
              )}

              <article className="prose prose-lg max-w-none prose-headings:text-foreground prose-p:text-muted-foreground/90 prose-strong:font-black prose-strong:text-foreground prose-img:rounded-[2rem]">
                <MDXRemote
                  source={content}
                  options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }}
                  components={mdxComponents as any}
                />
              </article>

              <div className="group relative mt-20 overflow-hidden rounded-[2.5rem] bg-foreground p-8 text-white">
                <div className="absolute -bottom-10 -right-10 rotate-12 opacity-10 transition-transform duration-700 group-hover:rotate-0">
                  <Logo className="h-64 w-64 grayscale invert" />
                </div>

                <div className="relative z-10 space-y-6">
                  <h3 className="text-2xl font-black tracking-tight">
                    Cet article vous a été utile ?
                  </h3>
                  <p className="max-w-lg font-medium text-white/60">
                    Découvrez comment Sentrys aide les entreprises de sécurité à
                    automatiser leur planning et leur traçabilité.
                  </p>
                  <div className="flex flex-col gap-4 sm:flex-row">
                    <Button
                      asChild
                      className="h-12 rounded-xl bg-primary px-8 font-black text-white hover:bg-primary/90"
                    >
                      <Link href="/signup">Essayer gratuitement</Link>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      className="h-12 rounded-xl border-white/20 px-8 font-bold text-white hover:bg-white/10"
                    >
                      <Link href="/tarifs">Voir nos solutions</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </main>

            {/* SIDEBAR DROITE */}
            <aside className="sticky top-32 hidden lg:col-span-3 lg:block">
              <div className="space-y-8">
                <div className="rounded-[2rem] border border-border/50 bg-card p-6 shadow-sm">
                  <h4 className="mb-6 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                    <ChevronRight className="h-3 w-3" />
                    Sommaire
                  </h4>
                  <nav className="space-y-1">
                    {toc.map((it) => (
                      <a
                        key={it.id}
                        href={`#${it.id}`}
                        className={cn(
                          "block py-2 text-sm leading-tight transition-all hover:text-primary",
                          it.level === 2
                            ? "font-bold text-muted-foreground"
                            : "pl-4 font-medium text-muted-foreground/60"
                        )}
                      >
                        {it.text}
                      </a>
                    ))}
                  </nav>
                </div>

                <div className="space-y-4 rounded-[2rem] border border-primary/20 bg-primary/5 p-6 text-center">
                  <Clock3 className="mx-auto h-8 w-8 text-primary opacity-50" />
                  <p className="text-sm font-bold text-foreground">
                    Besoin d'aller plus loin ?
                  </p>
                  <p className="text-xs font-medium text-muted-foreground">
                    Nos experts vous accompagnent dans la digitalisation de votre
                    agence.
                  </p>
                  <Button
                    asChild
                    variant="link"
                    className="text-[10px] font-black uppercase tracking-widest text-primary"
                  >
                    <Link href="/contact">Prendre RDV</Link>
                  </Button>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

function Logo({ className }: { className?: string }) {
  return <div className={cn("text-4xl font-black italic", className)}>SENTRY.</div>;
}
