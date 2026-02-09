"use client";

import React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Moon, Sun } from "lucide-react";

type AuthShellProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
};

export function AuthShell({ title, subtitle, children, footer, className }: AuthShellProps) {
  const toggleTheme = () => {
    const root = document.documentElement;
    root.classList.toggle("dark");
  };

  return (
    <div className={cn("min-h-screen w-full bg-background text-foreground", className)}>
      {/* Top bar (full width) */}
      <header className="w-full border-b bg-background/70 backdrop-blur">
        <div className="flex h-14 w-full items-center justify-between px-4 sm:px-6 lg:px-10">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border bg-card">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span>Sentrys</span>
            <span className="hidden text-xs font-normal text-muted-foreground sm:inline">
              Security workspace
            </span>
          </Link>

          <Button type="button" variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
            <Sun className="h-4 w-4 dark:hidden" />
            <Moon className="hidden h-4 w-4 dark:block" />
          </Button>
        </div>
      </header>

      {/* FULL WIDTH main */}
      <main className="w-full px-4 py-10 sm:px-6 lg:px-10">
        <div className="grid min-h-[calc(100vh-56px-80px)] w-full items-stretch gap-8 lg:grid-cols-2">
          {/* Left panel */}
          <section className="relative hidden overflow-hidden rounded-3xl border bg-card lg:block">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-accent/10" />

            <div className="relative flex h-full flex-col justify-between p-10 xl:p-12">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 rounded-full border bg-background/60 px-3 py-1 text-xs text-muted-foreground">
                  Plateforme B2B — multi-sociétés
                </div>

                <h1 className="max-w-xl text-5xl font-semibold leading-[1.05] tracking-tight">
                  Un espace sécurisé pour piloter vos opérations.
                </h1>

                <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                  Sentrys centralise les données, les accès et les workflows. Conçu pour grandir de 1 à des centaines de
                  sociétés — sans casser la sécurité.
                </p>
              </div>

              <div className="grid gap-3">
                <div className="rounded-2xl border bg-background/60 p-4">
                  <div className="text-sm font-medium">Accès & rôles</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Isolation par tenant, permissions strictes.
                  </div>
                </div>
                <div className="rounded-2xl border bg-background/60 p-4">
                  <div className="text-sm font-medium">Traçabilité</div>
                  <div className="mt-1 text-xs text-muted-foreground">Audit, historique, contrôles.</div>
                </div>
                <div className="rounded-2xl border bg-background/60 p-4">
                  <div className="text-sm font-medium">Europe ready</div>
                  <div className="mt-1 text-xs text-muted-foreground">Conformité & performance.</div>
                </div>
              </div>
            </div>
          </section>

          {/* Right panel */}
          <section className="flex items-center justify-center">
            <div className="w-full max-w-md">
              <div className="mb-6 space-y-2">
                <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
                {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
              </div>

              {children}

              {footer ? <div className="mt-6">{footer}</div> : null}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
