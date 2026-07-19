"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Clock3,
  LifeBuoy,
  LogOut,
  Rocket,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-provider";
import { normalizeRole } from "@/lib/auth/role";
import { auth } from "@/lib/firebase/client";
import { PLATFORM_ADMIN } from "@/lib/platform/admin";
import { cn } from "@/lib/utils";

type PlatformShellProps = {
  children: ReactNode;
};

const navItems = [
  {
    href: "/platform#overview",
    label: "Vue SaaS",
    detail: "Pilotage global",
    icon: ShieldCheck,
    active: (pathname: string, activeView: string) =>
      pathname === "/platform" && activeView === "overview",
  },
  {
    href: "/platform#onboarding",
    label: "Onboarding",
    detail: "Mises en service",
    icon: Rocket,
    active: (pathname: string, activeView: string) =>
      pathname === "/platform" && activeView === "onboarding",
  },
  {
    href: "/platform#tenants",
    label: "Agences",
    detail: "Parc clients",
    icon: Building2,
    active: (pathname: string, activeView: string) =>
      pathname.startsWith("/platform/tenants") ||
      (pathname === "/platform" && activeView === "tenants"),
  },
  {
    href: "/platform#guardrails",
    label: "Garde-fous",
    detail: "Risques et quotas",
    icon: CheckCircle2,
    active: (pathname: string, activeView: string) =>
      pathname === "/platform" && activeView === "guardrails",
  },
  {
    href: "/platform#audit",
    label: "Audit",
    detail: "Journal sensible",
    icon: Clock3,
    active: (pathname: string, activeView: string) =>
      pathname === "/platform" && activeView === "audit",
  },
] as const;

function initials(value: string | null | undefined) {
  const source = value?.trim() || PLATFORM_ADMIN.name;
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function PlatformShell({ children }: PlatformShellProps) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { user, loading } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [activeView, setActiveView] = useState("overview");

  const role = normalizeRole(user?.role);
  const isPlatformSuperAdmin =
    !loading && role === "super_admin" && user?.tenantId === "platform";

  useEffect(() => {
    const syncView = () => {
      const value = window.location.hash.replace(/^#/, "").trim() || "overview";
      setActiveView(value === "onboarding-requests" ? "onboarding" : value);
    };
    const handleViewChange = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      setActiveView(detail || "overview");
    };

    syncView();
    window.addEventListener("hashchange", syncView);
    window.addEventListener("popstate", syncView);
    window.addEventListener("platform:view-change", handleViewChange);
    return () => {
      window.removeEventListener("hashchange", syncView);
      window.removeEventListener("popstate", syncView);
      window.removeEventListener("platform:view-change", handleViewChange);
    };
  }, []);

  function activateMenu(href: string) {
    if (pathname !== "/platform") return false;
    const nextView = href.split("#")[1] || "overview";
    window.history.pushState(null, "", href);
    setActiveView(nextView);
    window.dispatchEvent(new CustomEvent("platform:view-change", { detail: nextView }));
    return true;
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await auth.signOut();
      router.replace("/login?next=/platform");
    } finally {
      setSigningOut(false);
    }
  }

  if (!isPlatformSuperAdmin) {
    return <>{children}</>;
  }

  const displayName = user?.name?.trim() || PLATFORM_ADMIN.name;
  const displayEmail = user?.email || PLATFORM_ADMIN.email;

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.10),transparent_34%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--muted))/0.28)] lg:flex">
      <aside className="sticky top-0 hidden h-dvh w-[286px] shrink-0 border-r bg-background/90 p-4 shadow-[18px_0_45px_rgba(15,23,42,0.05)] backdrop-blur-xl lg:flex lg:flex-col">
        <Link href="/platform" className="flex items-center gap-3 rounded-[1.5rem] border bg-card/80 p-3 shadow-sm">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg dark:bg-white dark:text-slate-950">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-black uppercase tracking-[0.22em] text-primary">
              Backoffice
            </span>
            <span className="block truncate text-lg font-black leading-tight">
              {PLATFORM_ADMIN.name}
            </span>
          </span>
        </Link>

        <div className="mt-5 rounded-[1.5rem] border border-primary/15 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-black">Console SaaS uniquement</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-muted-foreground">
                Pas de planning, agents ou sites agence ici : VSW Digital pilote la plateforme.
              </p>
            </div>
          </div>
        </div>

        <nav className="mt-5 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.active(pathname, activeView);

            return (
              <Button
                key={item.href}
                asChild
                variant={active ? "default" : "ghost"}
                className={cn(
                  "h-auto w-full justify-start rounded-2xl px-3 py-3 text-left",
                  active ? "shadow-md" : "hover:bg-muted/70"
                )}
              >
                <Link
                  href={item.href}
                  onClick={(event) => {
                    if (activateMenu(item.href)) {
                      event.preventDefault();
                    }
                  }}
                >
                  <Icon className="mr-3 h-4 w-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-black">{item.label}</span>
                    <span
                      className={cn(
                        "block text-[11px] font-semibold",
                        active ? "text-primary-foreground/75" : "text-muted-foreground"
                      )}
                    >
                      {item.detail}
                    </span>
                  </span>
                </Link>
              </Button>
            );
          })}
        </nav>

        <div className="mt-auto space-y-3">
          <a
            href={"mailto:" + PLATFORM_ADMIN.email}
            className="flex items-center gap-3 rounded-[1.4rem] border bg-muted/25 p-3 text-sm font-black transition hover:border-primary/30 hover:bg-primary/5"
          >
            <LifeBuoy className="h-4 w-4 text-primary" />
            Support VSW
          </a>

          <div className="rounded-[1.5rem] border bg-card/90 p-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-sm font-black text-primary">
                {initials(displayEmail)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{displayName}</p>
                <p className="truncate text-xs font-semibold text-muted-foreground">
                  {displayEmail}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="mt-3 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]">
              {PLATFORM_ADMIN.role}
            </Badge>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="mt-3 w-full rounded-2xl font-black"
            >
              <LogOut className="mr-2 h-4 w-4" />
              {signingOut ? "Déconnexion..." : "Déconnexion"}
            </Button>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-40 border-b bg-background/90 px-4 py-3 backdrop-blur-xl lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <Link href="/platform" className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-black">{PLATFORM_ADMIN.name}</span>
                <span className="block truncate text-[11px] font-semibold text-muted-foreground">
                  {displayEmail}
                </span>
              </span>
            </Link>
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="rounded-2xl"
              aria-label="Déconnexion"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = item.active(pathname, activeView);

              return (
                <Button
                  key={item.href}
                  asChild
                  size="sm"
                  variant={active ? "default" : "outline"}
                  className="shrink-0 rounded-full font-black"
                >
                  <Link
                  href={item.href}
                  onClick={(event) => {
                    if (activateMenu(item.href)) {
                      event.preventDefault();
                    }
                  }}
                >
                    <Icon className="mr-2 h-3.5 w-3.5" />
                    {item.label}
                  </Link>
                </Button>
              );
            })}
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}
