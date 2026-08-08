import Link from "next/link";
import PublicLayout from "@/components/layouts/public-layout";
import { Button } from "@/components/ui/button";

type Section = { title: string; paragraphs: string[] };
export function LegalPage({ eyebrow, title, updated, sections }: { eyebrow: string; title: string; updated: string; sections: Section[] }) {
  return <PublicLayout><main className="bg-muted/15 py-16 md:py-24"><article className="mx-auto max-w-4xl px-4"><p className="text-xs font-black uppercase tracking-[0.2em] text-primary">{eyebrow}</p><h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">{title}</h1><p className="mt-3 text-sm text-muted-foreground">Dernière mise à jour : {updated}</p><div className="mt-10 space-y-8 rounded-[2rem] border bg-background p-6 shadow-sm md:p-10">{sections.map((section) => <section key={section.title}><h2 className="text-xl font-black">{section.title}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph} className="mt-3 leading-7 text-muted-foreground">{paragraph}</p>)}</section>)}</div><div className="mt-8 flex gap-3"><Button asChild><Link href="/contact?reason=support">Nous contacter</Link></Button><Button asChild variant="outline"><Link href="/">Retour à l’accueil</Link></Button></div></article></main></PublicLayout>;
}