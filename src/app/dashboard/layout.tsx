// src/app/dashboard/layout.tsx
"use client";

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Bell,
  Building2,
  CalendarClock,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  Siren,
  Users,
  MapPin,
  CreditCard,
  CalendarDays,
  User,
  LifeBuoy,
  Activity,
  Calculator,
  Search,
  Radar,
  FileWarning,
  CheckCircle2,
  ExternalLink,
  Maximize2,
  Minimize2,
} from "lucide-react";

import { useAuth } from "@/lib/auth-provider";
import { auth, db } from "@/lib/firebase/client";
import {
  AppRole,
  canReadBackoffice,
  canManageUsers,
  getRoleLabel,
  hasRole,
  normalizeRole,
} from "@/lib/auth/role";

import { doc, onSnapshot } from "firebase/firestore";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarSeparator,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  useSidebar,
} from "@/components/ui/sidebar";

import Logo from "@/components/logo";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import NavLink from "@/components/nav-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { DashboardGate } from "@/components/auth/DashboardGate";
import { useBillingUsage } from "@/hooks/use-billing-usage";
import { apiFetch } from "@/lib/api/client-fetch";

const userAvatar = PlaceHolderImages.find((p) => p.id === "user-avatar-1");

/* =========================================================
   Helpers
   ========================================================= */

type UserDoc = {
  role?: AppRole | string;
  status?: "active" | "pending" | "rejected" | "archived" | string;
  clientId?: string | null;
  tenantId?: string | null;
};

type ComplianceSummaryResponse = {
  ok: boolean;
  stats?: {
    to_regularize?: number;
  };
};

type InternalNotification = {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string | null;
  href: string | null;
  sourceId: string | null;
  createdAtIso: string | null;
  read: boolean;
};

type NotificationsResponse = {
  ok: boolean;
  unreadCount: number;
  items: InternalNotification[];
};

type DisplayDensity = "comfortable" | "compact";

const DISPLAY_DENSITY_STORAGE_KEY = "sentrys:display-density";
const DISPLAY_DENSITY_SOURCE_STORAGE_KEY = "sentrys:display-density-source";
const DISPLAY_DENSITY_EVENT = "sentrys:density-change";

function norm(v: unknown) {
  return String(v ?? "").trim().toLowerCase();
}

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = (el.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if ((el as any).isContentEditable) return true;
  return false;
}

/* =========================================================
   UserDoc live (avoid mismatch user vs claims)
   ========================================================= */
function useUserDoc(enabled: boolean, uid?: string | null) {
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [loadingUserDoc, setLoadingUserDoc] = useState<boolean>(enabled);

  useEffect(() => {
    if (!enabled || !uid || !db) {
      setUserDoc(null);
      setLoadingUserDoc(false);
      return;
    }

    setLoadingUserDoc(true);
    const ref = doc(db as any, "users", uid);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        setUserDoc((snap.exists() ? (snap.data() as any) : null) as UserDoc | null);
        setLoadingUserDoc(false);
      },
      () => {
        setUserDoc(null);
        setLoadingUserDoc(false);
      }
    );

    return () => unsub();
  }, [enabled, uid]);

  return { userDoc, loadingUserDoc };
}

/**
 * Auto-collapse sidebar on planning route
 * - Force "icon" mode (collapsed) when planning is visible
 * - Restores previous state when leaving planning
 * - Adds a safe resize reflow to reduce layout glitches
 */
function SidebarAutoCollapse({ isPlanning }: { isPlanning: boolean }) {
  const { open, setOpen, setOpenMobile } = useSidebar();
  const prevOpenRef = useRef<boolean | null>(null);

  useEffect(() => {
    setOpenMobile?.(false);

    if (isPlanning) {
      if (prevOpenRef.current === null) prevOpenRef.current = open;
      setOpen(false);
    } else {
      if (prevOpenRef.current !== null) {
        setOpen(prevOpenRef.current);
        prevOpenRef.current = null;
      }
    }

    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  }, [isPlanning, open, setOpen, setOpenMobile]);

  return null;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const billing = useBillingUsage(Boolean(user));
  const [complianceOpenCount, setComplianceOpenCount] = useState(0);
  const [notifications, setNotifications] = useState<InternalNotification[]>([]);
  const [notificationsUnreadCount, setNotificationsUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [displayDensity, setDisplayDensity] =
    useState<DisplayDensity>("comfortable");
  const [densityHydrated, setDensityHydrated] = useState(false);

  const isPlanning = pathname?.startsWith("/dashboard/planning") ?? false;
  const isCompactDisplay = displayDensity === "compact";

  const { userDoc, loadingUserDoc } = useUserDoc(!loading, user?.uid ?? null);

  useEffect(() => {
    const stored = window.localStorage.getItem(DISPLAY_DENSITY_STORAGE_KEY);

    if (stored === "compact" || stored === "comfortable") {
      setDisplayDensity(stored);
    }

    setDensityHydrated(true);
  }, []);

  useEffect(() => {
    function onDensityChange(event: Event) {
      const density = (event as CustomEvent<{ density?: DisplayDensity }>).detail
        ?.density;

      if (density === "compact" || density === "comfortable") {
        setDisplayDensity(density);
      }
    }

    window.addEventListener(DISPLAY_DENSITY_EVENT, onDensityChange);
    return () => window.removeEventListener(DISPLAY_DENSITY_EVENT, onDensityChange);
  }, []);

  useEffect(() => {
    if (!densityHydrated) return;

    document.documentElement.dataset.density = displayDensity;
    window.localStorage.setItem(DISPLAY_DENSITY_STORAGE_KEY, displayDensity);
    window.dispatchEvent(
      new CustomEvent(DISPLAY_DENSITY_EVENT, {
        detail: { density: displayDensity },
      })
    );
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  }, [densityHydrated, displayDensity]);

  /**
   * IMPORTANT:
   * - staff role/status MUST come from tenantUsers (via /api/me) handled by DashboardGate
   * - users/{uid} is ONLY for "client onboarding" (pending/rejected/archived) flows
   * - So here we protect staff from being blocked by users/{uid}.status
   */
  const role = useMemo<AppRole>(() => {
    return (
      normalizeRole((userDoc as any)?.role) ??
      normalizeRole((user as any)?.role) ??
      "client"
    );
  }, [userDoc, user]);

  const canSeeUsersTeam = useMemo(() => canManageUsers(role), [role]);
  const canSeeBackoffice = useMemo(() => canReadBackoffice(role), [role]);
  const tenantStatus = useMemo(() => {
    return norm((user as any)?.tenant?.status);
  }, [user]);
  const tenantOnboardingStatus = useMemo(() => {
    return norm((user as any)?.tenant?.onboarding?.status);
  }, [user]);
  const isPlatformSuperAdmin = role === "super_admin" && user?.tenantId === "platform";
  const needsAgencyOnboarding = useMemo(() => {
    if (!user?.tenantId || user.tenantId === "platform") return false;
    if (!hasRole(role, ["owner", "admin", "manager"])) return false;
    if (!tenantStatus) return false;
    return !["active", "trial", "trialing", "ok"].includes(tenantStatus);
  }, [role, tenantStatus, user?.tenantId]);

  const gateStatus = useMemo(() => {
    const s = norm((userDoc as any)?.status ?? "active");
    return (s || "active") as UserDoc["status"];
  }, [userDoc]);

  const isStaff = useMemo(() => {
    return hasRole(role, [
      "super_admin",
      "owner",
      "admin",
      "manager",
      "agent",
      "viewer",
    ]);
  }, [role]);

  useEffect(() => {
    if (loading || loadingUserDoc) return;

    if (!user?.uid) {
      router.push("/login");
      return;
    }

    if (isStaff) return;

    if (!userDoc) {
      if (!pathname?.startsWith("/dashboard/pending")) router.push("/dashboard/pending");
      return;
    }

    if (gateStatus === "pending") {
      if (!pathname?.startsWith("/dashboard/pending")) router.push("/dashboard/pending");
      return;
    }

    if (gateStatus === "rejected") {
      if (!pathname?.startsWith("/dashboard/rejected")) router.push("/dashboard/rejected");
      return;
    }

    if (gateStatus === "archived") {
      if (!pathname?.startsWith("/dashboard/archived")) router.push("/dashboard/archived");
      return;
    }
  }, [
    loading,
    loadingUserDoc,
    user?.uid,
    userDoc,
    gateStatus,
    isStaff,
    router,
    pathname,
  ]);

  useEffect(() => {
    if (loading || loadingUserDoc || !user?.uid || !needsAgencyOnboarding) return;

    const allowedDuringOnboarding = [
      "/dashboard/onboarding",
      "/dashboard/settings",
      "/dashboard/clients",
      "/dashboard/sites",
      "/dashboard/users",
      "/dashboard/pending",
      "/dashboard/rejected",
      "/dashboard/archived",
    ];
    const currentPath = pathname ?? "";
    const allowed = allowedDuringOnboarding.some((href) => {
      return currentPath === href || currentPath.startsWith(href + "/");
    });

    if (!allowed) {
      router.replace("/dashboard/onboarding");
    }
  }, [
    loading,
    loadingUserDoc,
    needsAgencyOnboarding,
    pathname,
    router,
    user?.uid,
  ]);

  useEffect(() => {
    if (loading || loadingUserDoc || !user?.uid || !canSeeBackoffice) {
      setComplianceOpenCount(0);
      return;
    }

    let mounted = true;

    void (async () => {
      try {
        const response = await apiFetch<ComplianceSummaryResponse>(
          "/api/compliance-overrides/summary"
        );

        if (!mounted) return;

        setComplianceOpenCount(
          response.ok ? Number(response.stats?.to_regularize ?? 0) : 0
        );
      } catch {
        if (mounted) setComplianceOpenCount(0);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [canSeeBackoffice, loading, loadingUserDoc, pathname, user?.uid]);

  const loadNotifications = React.useCallback(async () => {
    if (loading || loadingUserDoc || !user?.uid || !canSeeBackoffice) {
      setNotifications([]);
      setNotificationsUnreadCount(0);
      return;
    }

    setNotificationsLoading(true);
    try {
      const response = await apiFetch<NotificationsResponse>("/api/notifications");
      setNotifications(response.items ?? []);
      setNotificationsUnreadCount(Number(response.unreadCount ?? 0));
    } catch {
      setNotifications([]);
      setNotificationsUnreadCount(0);
    } finally {
      setNotificationsLoading(false);
    }
  }, [canSeeBackoffice, loading, loadingUserDoc, user?.uid]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications, pathname]);

  const markNotificationsRead = React.useCallback(
    async (ids?: string[]) => {
      try {
        await apiFetch("/api/notifications", {
          method: "PATCH",
          body: ids?.length ? { ids } : { markAll: true },
        });
        await loadNotifications();
      } catch {
        // Non bloquant: la prochaine ouverture retentera la synchronisation.
      }
    },
    [loadNotifications]
  );

  const menuGroups = useMemo(() => {
    return [
      {
        label: "Opérations",
        items: [
          { href: "/dashboard", icon: LayoutDashboard, label: "Vue d'ensemble" },
          ...(role === "agent"
            ? [{ href: "/dashboard/agent-planning", icon: Bell, label: "Mes diffusions" }]
            : []),
          { href: "/dashboard/planning", icon: CalendarDays, label: "Planning" },
          { href: "/dashboard/prepaie", icon: Calculator, label: "Pré-paie" },
          { href: "/dashboard/vacations", icon: CalendarClock, label: "Vacations" },
          { href: "/dashboard/patrols", icon: Activity, label: "Rondes" },
          { href: "/dashboard/incidents", icon: Siren, label: "Incidents" },
          { href: "/dashboard/command", icon: Radar, label: "Command Center" },
          { href: "/dashboard/conduite", icon: CheckCircle2, label: "Conduite" },
        ],
      },
      {
        label: "Ressources",
        items: [
          { href: "/dashboard/sites", icon: MapPin, label: "Sites" },
          { href: "/dashboard/agents", icon: ShieldCheck, label: "Agents" },
          { href: "/dashboard/clients", icon: Building2, label: "Clients" },
        ],
      },
      {
        label: "Administration",
        items: [
          ...(isPlatformSuperAdmin
            ? [{ href: "/platform", icon: ShieldCheck, label: "Backoffice SaaS" }]
            : []),
          ...(needsAgencyOnboarding
            ? [{ href: "/dashboard/onboarding", icon: CheckCircle2, label: tenantOnboardingStatus === "activation_requested" ? "Activation demandee" : "Demarrage agence" }]
            : []),
          { href: "/dashboard/activity", icon: Activity, label: "Audit Log" },
          { href: "/dashboard/recette", icon: CheckCircle2, label: "Recette MVP" },
          { href: "/dashboard/conformite", icon: FileWarning, label: "Conformité" },
          ...(canSeeUsersTeam
            ? [{ href: "/dashboard/users", icon: Users, label: "Équipe" }]
            : []),
        ],
      },
    ];
  }, [canSeeUsersTeam, isPlatformSuperAdmin, needsAgencyOnboarding, role, tenantOnboardingStatus]);

  const handleLogout = async () => {
    await auth.signOut();
    router.push("/login");
  };

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (loading || loadingUserDoc) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-6 animate-pulse">
          <Logo />
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
              Synchronisation
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <DashboardGate>
      <SidebarProvider>
        <SidebarAutoCollapse isPlanning={isPlanning} />

        <Sidebar collapsible="icon" className="border-r border-border/10 glass-card">
          <SidebarHeader
            className={cn(
              "flex items-center justify-center border-b border-border/10",
              isCompactDisplay ? "h-16" : "h-20"
            )}
          >
            <Link
              href="/dashboard"
              className="group-data-[collapsible=icon]:hidden transition-opacity hover:opacity-80"
            >
              <Logo />
            </Link>
            <div className="hidden group-data-[collapsible=icon]:flex">
              <ShieldCheck className="size-6 text-primary animate-pulse" />
            </div>
          </SidebarHeader>

          <SidebarContent className={cn("px-2", isCompactDisplay ? "py-3" : "py-6")}>
            {menuGroups.map((group) => (
              <SidebarGroup key={group.label} className={cn(isCompactDisplay ? "mb-3" : "mb-6")}>
                <SidebarGroupLabel className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/40 px-4 mb-3 group-data-[collapsible=icon]:hidden">
                  {group.label}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="gap-1">
                    {group.items.map((item) => (
                      <SidebarMenuItem key={item.label}>
                        <NavLink href={item.href} icon={item.icon} label={item.label} />
                        {item.href === "/dashboard/conformite" &&
                          complianceOpenCount > 0 && (
                            <SidebarMenuBadge
                              variant="destructive"
                              className="animate-pulse shadow-lg shadow-destructive/20"
                            >
                              {complianceOpenCount > 99
                                ? "99+"
                                : complianceOpenCount}
                            </SidebarMenuBadge>
                          )}
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}

            <SidebarSeparator className="mx-4 my-4 opacity-10" />

            <SidebarGroup>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    tooltip="Facturation"
                    className={cn(
                      "transition-all",
                      pathname === "/dashboard/billing" && "glass-card border-l-4 border-l-primary/50 text-foreground"
                    )}
                  >
                    <Link href="/dashboard/billing" className="font-bold flex items-center gap-3">
                      <CreditCard className="size-4 text-muted-foreground" />
                      <span className="text-muted-foreground/80">Abonnement</span>
                    </Link>
                  </SidebarMenuButton>

                  {!billing.loading && (
                    <div className="group-data-[collapsible=icon]:hidden">
                      {billing.hasLimitIssue ? (
                        <SidebarMenuBadge variant="destructive" className="animate-pulse shadow-lg shadow-destructive/20">
                          {billing.atLimitList.length}
                        </SidebarMenuBadge>
                      ) : billing.isFree ? (
                        <SidebarMenuBadge
                          variant="outline"
                          className="text-[8px] font-black border-primary/20 text-primary bg-primary/5 uppercase tracking-tighter"
                        >
                          FREE
                        </SidebarMenuBadge>
                      ) : null}
                    </div>
                  )}
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className={cn("border-t border-border/10", isCompactDisplay ? "p-3" : "p-6")}>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Paramètres de l'agence">
                  <Link href="/dashboard/settings" className="hover:bg-muted/30 transition-all rounded-xl border border-transparent hover:border-border/20">
                    <Settings className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground/80 font-medium">Configuration</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="bg-transparent flex flex-col min-h-screen">
          <header
            className={cn(
              "flex shrink-0 items-center justify-between gap-4 border-b border-border/10 bg-background/20 backdrop-blur-2xl sticky top-0 z-40",
              isCompactDisplay ? "h-14 px-4" : "h-20 px-8"
            )}
          >
            <div className="flex items-center gap-6">
              <SidebarTrigger className="-ml-2 hover:bg-primary/5 text-muted-foreground hover:text-primary transition-all duration-300 rounded-lg p-2" />

              <div className="hidden lg:flex items-center gap-3 px-4 py-2 rounded-xl bg-background/40 border border-border/10 text-muted-foreground transition-all duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 cursor-pointer group w-80">
                <Search className="size-4 group-hover:text-primary transition-colors" />
                <span className="text-xs font-semibold tracking-tight uppercase opacity-60">Recherche d'élite...</span>
                <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded bg-muted/50 px-2 font-mono text-[10px] font-bold text-muted-foreground border border-border/10">
                  <span className="text-xs">⌘</span>K
                </kbd>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <ThemeToggle />

              <Button
                type="button"
                variant={isCompactDisplay ? "default" : "ghost"}
                size="sm"
                aria-label={
                  isCompactDisplay
                    ? "Revenir a l'affichage confortable"
                    : "Activer l'affichage compact"
                }
                title={
                  isCompactDisplay
                    ? "Revenir a l'affichage confortable"
                    : "Activer l'affichage compact"
                }
                onClick={() => {
                  window.localStorage.setItem(DISPLAY_DENSITY_SOURCE_STORAGE_KEY, "manual");
                  setDisplayDensity(isCompactDisplay ? "comfortable" : "compact");
                }}
                className={cn(
                  "h-9 rounded-xl px-3 text-xs font-black",
                  isCompactDisplay && "shadow-lg shadow-primary/15"
                )}
              >
                {isCompactDisplay ? (
                  <Maximize2 className="mr-0 h-4 w-4 xl:mr-2" />
                ) : (
                  <Minimize2 className="mr-0 h-4 w-4 xl:mr-2" />
                )}
                <span className="hidden xl:inline">
                  {isCompactDisplay ? "Confort" : "Compact"}
                </span>
              </Button>

              <DropdownMenu onOpenChange={(open) => open && void loadNotifications()}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative rounded-full transition-colors hover:bg-muted"
                    aria-label="Notifications exploitation"
                  >
                    <Bell className="h-4 w-4" />
                    {notificationsUnreadCount > 0 ? (
                      <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-black text-destructive-foreground ring-2 ring-background">
                        {notificationsUnreadCount > 9
                          ? "9+"
                          : notificationsUnreadCount}
                      </span>
                    ) : (
                      <span className="absolute right-2 top-2 size-2 rounded-full bg-primary/70 ring-2 ring-background" />
                    )}
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                  align="end"
                  className="w-[360px] rounded-3xl border-border/10 p-3 shadow-2xl"
                >
                  <DropdownMenuLabel className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/70">
                          Centre de notifications
                        </p>
                        <p className="mt-1 text-sm font-black text-foreground">
                          Exploitation
                        </p>
                      </div>
                      {notificationsUnreadCount > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void markNotificationsRead()}
                          className="h-8 rounded-xl px-2 text-[10px] font-black uppercase"
                        >
                          Tout lu
                        </Button>
                      )}
                    </div>
                  </DropdownMenuLabel>

                  <DropdownMenuSeparator className="my-2 opacity-10" />

                  <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                    {notificationsLoading ? (
                      <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-muted/20 p-4 text-sm font-semibold text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        Synchronisation...
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-200">
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                          <div>
                            <p className="font-black">Aucune alerte active</p>
                            <p className="mt-1 text-xs opacity-80">
                              Les notifications exploitation apparaîtront ici.
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      notifications.slice(0, 8).map((notification) => {
                        const content = (
                          <div
                            className={cn(
                              "rounded-2xl border p-3 transition hover:bg-muted/40",
                              notification.read
                                ? "border-border/50 bg-background"
                                : "border-amber-500/30 bg-amber-500/10"
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={cn(
                                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                                  notification.severity === "critical"
                                    ? "bg-red-500/15 text-red-700 dark:text-red-300"
                                    : notification.severity === "warning"
                                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                    : "bg-primary/10 text-primary"
                                )}
                              >
                                <FileWarning className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="line-clamp-1 text-sm font-black text-foreground">
                                  {notification.title}
                                </p>
                                {notification.message && (
                                  <p className="mt-1 line-clamp-2 text-xs font-semibold leading-relaxed text-muted-foreground">
                                    {notification.message}
                                  </p>
                                )}
                                <div className="mt-2 flex items-center justify-between gap-2">
                                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
                                    {notification.read ? "Lu" : "Non lu"}
                                  </span>
                                  {notification.href && (
                                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );

                        return notification.href ? (
                          <Link
                            key={notification.id}
                            href={notification.href}
                            onClick={() =>
                              void markNotificationsRead([notification.id])
                            }
                            className="block"
                          >
                            {content}
                          </Link>
                        ) : (
                          <button
                            key={notification.id}
                            type="button"
                            onClick={() =>
                              void markNotificationsRead([notification.id])
                            }
                            className="block w-full text-left"
                          >
                            {content}
                          </button>
                        );
                      })
                    )}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="relative h-9 w-9 rounded-full ring-offset-background transition-all hover:ring-2 hover:ring-primary/20 hover:ring-offset-2"
                  >
                    <Avatar className="h-9 w-9 border border-border/40">
                      <AvatarImage src={userAvatar?.imageUrl} alt="User" />
                      <AvatarFallback className="bg-primary/5 text-primary text-[10px] font-black uppercase">
                        {(user?.email?.charAt(0) ?? "S").toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                  align="end"
                  className="w-72 rounded-3xl p-3 glass-card shadow-2xl border-border/10 animate-in slide-in-from-top-4 duration-500 backdrop-blur-3xl"
                >
                  <DropdownMenuLabel className="p-4 mb-2">
                    <div className="flex flex-col space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60">
                        Profil Opérationnel
                      </p>
                      <p className="text-sm font-black truncate leading-tight tracking-tighter text-foreground">{user?.email}</p>
                      <div className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 w-fit">
                        <p className="text-[8px] font-black uppercase tracking-widest text-primary">
                          {getRoleLabel(role)}
                        </p>
                      </div>
                    </div>
                  </DropdownMenuLabel>

                  <DropdownMenuSeparator className="opacity-10 my-2" />

                  <DropdownMenuItem className="rounded-2xl gap-4 p-3.5 cursor-pointer hover:bg-primary/5 transition-all group">
                    <User className="size-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="text-sm font-semibold text-muted-foreground group-hover:text-foreground">Profil de commandement</span>
                  </DropdownMenuItem>

                  <DropdownMenuItem className="rounded-2xl gap-4 p-3.5 cursor-pointer hover:bg-primary/5 transition-all group">
                    <LifeBuoy className="size-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="text-sm font-semibold text-muted-foreground group-hover:text-foreground">Soutien logistique</span>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator className="opacity-10 my-2" />

                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="rounded-2xl gap-4 p-3.5 cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive transition-all group font-bold"
                  >
                    <LogOut className="size-4 group-hover:translate-x-1 transition-transform" />
                    <span className="text-sm">Fin de service</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <main
            className={cn(
              "flex-1 min-h-0 overflow-x-hidden",
              isPlanning ? "overflow-hidden" : "overflow-y-auto"
            )}
          >
            <div
              className={cn(
                "animate-in fade-in slide-in-from-bottom-2 duration-1000 ease-out",
                isPlanning
                  ? isCompactDisplay
                    ? "p-2 h-full min-h-0"
                    : "p-4 h-full min-h-0"
                  : isCompactDisplay
                    ? "p-4 lg:p-6"
                    : "p-8 lg:p-12"
              )}
            >
              <div
                className={cn(
                  "w-full mx-auto",
                  isPlanning
                    ? "max-w-none h-full min-h-0"
                    : "max-w-[1600px] min-h-[calc(100vh-14rem)]"
                )}
              >
                {children}
              </div>
            </div>
          </main>

          <footer
            className={cn(
              "flex items-center border-t border-border/10 bg-background/5 backdrop-blur-md mt-auto",
              isCompactDisplay ? "h-12 px-4" : "h-20 px-10"
            )}
          >
            <div className="w-full max-w-[1600px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-[0.3em]">
                &copy; {new Date().getFullYear()} SENTRYS OPERATIONAL SYSTEMS <span className="mx-3 opacity-20">|</span>{" "}
                QUANTUM SECURITY PROTOCOL
              </p>
              <div className="flex items-center gap-6">
                <Link
                  href="#"
                  className="text-[10px] font-black text-muted-foreground/30 hover:text-primary transition-colors uppercase"
                >
                  Confidentialité
                </Link>
                <Link
                  href="#"
                  className="text-[10px] font-black text-muted-foreground/30 hover:text-primary transition-colors uppercase"
                >
                  Légal
                </Link>
              </div>
            </div>
          </footer>
        </SidebarInset>
      </SidebarProvider>
    </DashboardGate>
  );
}

/* =========================================================
   Loader optimisé
   ========================================================= */
function Loader2({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("animate-spin", className)}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
