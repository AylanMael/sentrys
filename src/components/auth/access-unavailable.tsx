"use client";

import { useState } from "react";
import { ArrowUpRight, Headphones, LockKeyhole, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import Logo from "@/components/logo";
import { Button } from "@/components/ui/button";

type Props = {
  onCheck: () => Promise<unknown>;
  onSignOut: () => Promise<unknown>;
};

export function AccessUnavailable({ onCheck, onSignOut }: Props) {
  const [pending, setPending] = useState<"check" | "logout" | null>(null);
  const [feedback, setFeedback] = useState("");

  async function run(action: "check" | "logout") {
    if (pending) return;
    setPending(action);
    setFeedback("");
    try {
      await (action === "check" ? onCheck() : onSignOut());
      // If access is restored the parent replaces this screen.
      if (action === "check") setFeedback("Vérification terminée. Si cet écran reste affiché, contactez le support pour faire vérifier votre accès.");
    } catch {
      setFeedback(action === "check"
        ? "La vérification n’a pas abouti. Réessayez dans un instant ou contactez le support."
        : "La déconnexion n’a pas abouti. Réessayez dans un instant.");
    } finally {
      setPending(null);
    }
  }

  return (
    <main id="main" aria-labelledby="access-unavailable-title" className="relative isolate flex min-h-svh flex-col overflow-hidden bg-background text-foreground">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.09),transparent_65%)]" />
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-7 sm:px-10">
        <Logo />
        <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><ShieldCheck aria-hidden="true" className="h-4 w-4 text-primary" />Espace protégé</span>
      </header>

      <div className="flex flex-1 items-center justify-center px-4 py-4 sm:px-6 sm:py-5">
        <section className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-border/80 bg-card shadow-[0_24px_80px_-32px_hsl(var(--foreground)/0.2)]">
          <div aria-hidden="true" className="h-1 w-full bg-gradient-to-r from-primary via-accent to-primary/30" />
          <div className="p-6 sm:p-8">
            <div aria-hidden="true" className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-sm">
              <LockKeyhole className="h-7 w-7" strokeWidth={1.6} />
            </div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Protection de votre espace</p>
            <h1 id="access-unavailable-title" className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Accès métier indisponible</h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground sm:text-base">Votre accès ne peut pas être autorisé ou votre agence est suspendue pour sécurité. Les données métier ne sont pas accessibles.</p>

            <div className="mt-5 rounded-2xl border border-border/70 bg-muted/40 p-4">
              <p className="text-sm font-semibold">Besoin de reprendre votre activité ?</p>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">Le support peut vérifier votre situation. Si votre accès vient d’être rétabli, lancez une nouvelle vérification.</p>
            </div>

            <div className="mt-5 grid gap-3">
              <Button asChild className="h-12 rounded-xl font-semibold shadow-md shadow-primary/15">
                <a href="/contact?reason=support"><Headphones aria-hidden="true" />Contacter le support<ArrowUpRight aria-hidden="true" /></a>
              </Button>
              <Button type="button" variant="outline" disabled={pending !== null} onClick={() => void run("check")} className="h-12 rounded-xl font-semibold hover:bg-muted hover:text-foreground">
                <RefreshCw aria-hidden="true" className={pending === "check" ? "animate-spin motion-reduce:animate-none" : ""} />
                {pending === "check" ? "Vérification en cours…" : "Vérifier mon accès"}
              </Button>
            </div>
            <div role="status" aria-live="polite" aria-atomic="true" className="text-sm leading-6 text-muted-foreground">
              {feedback && <p className="mt-4">{feedback}</p>}
            </div>
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 bg-muted/20 px-6 py-4 sm:px-10">
            <span className="text-xs text-muted-foreground">Connexion et assistance restent disponibles.</span>
            <Button type="button" variant="ghost" disabled={pending !== null} onClick={() => void run("logout")} className="min-h-11 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"><LogOut aria-hidden="true" />{pending === "logout" ? "Déconnexion…" : "Se déconnecter"}</Button>
          </footer>
        </section>
      </div>
      <p className="px-6 pb-9 pt-3 text-center text-xs text-muted-foreground">Sentrys · Gestion des opérations de sécurité privée</p>
    </main>
  );
}
