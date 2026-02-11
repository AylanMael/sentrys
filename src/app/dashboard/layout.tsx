// src/app/dashboard/layout/page.tsx
"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
} from "lucide-react";

import { useAuth } from "@/lib/auth-provider";
import { auth } from "@/lib/firebase/client";

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
} from "@/components/ui/sidebar";

import Logo from "@/components/logo";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import NavLink from "@/components/nav-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";

// ✅ Ajuste ce chemin selon l’endroit où tu as créé DashboardGate
import { DashboardGate } from "@/components/auth/DashboardGate";

// ✅ Billing hook
import { useBillingUsage } from "@/hooks/use-billing-usage";

const userAvatar = PlaceHolderImages.find((p) => p.id === "user-avatar-1");

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  // ✅ charge le billing une fois (sidebar)
  const billing = useBillingUsage(Boolean(user)); // évite call si pas user

  const navItems = useMemo(() => {
    const base = [
      { href: "/dashboard", icon: LayoutDashboard, label: "Tableau de bord" },
      { href: "/dashboard/vacations", icon: CalendarClock, label: "Vacations" },
      { href: "/dashboard/incidents", icon: Siren, label: "Incidents" },
      { href: "/dashboard/sites", icon: MapPin, label: "Sites" },
      { href: "/dashboard/agents", icon: ShieldCheck, label: "Agents" },
      { href: "/dashboard/clients", icon: Building2, label: "Clients" },
      { href: "/dashboard/users", icon: Users, label: "Utilisateurs" },
    ];

    const isAdminOrManager = user?.role === "admin" || user?.role === "manager";

    return base.filter((item) => {
      if (item.href === "/dashboard/users") return isAdminOrManager;
      return true;
    });
  }, [user?.role]);

  const handleLogout = async () => {
    await auth.signOut();
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Logo />
          <Skeleton className="h-4 w-[200px]" />
        </div>
      </div>
    );
  }

  return (
    <DashboardGate>
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader>
            <div className="p-2 flex justify-center items-center group-data-[collapsible=icon]:hidden">
              <Logo />
            </div>
            <div className="p-2 hidden justify-center items-center group-data-[collapsible=icon]:flex">
              <ShieldCheck className="size-6 text-primary-foreground" />
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <NavLink href={item.href} icon={item.icon} label={item.label} />
                </SidebarMenuItem>
              ))}

              {/* ✅ Billing / Abonnement */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Abonnement">
                  <Link href="/dashboard/billing">
                    <CreditCard />
                    <span>Abonnement</span>
                  </Link>
                </SidebarMenuButton>

                {/* Badge quota / plan (compact et parlant) */}
                {billing.loading ? null : billing.error ? (
                  <SidebarMenuBadge variant="outline">!</SidebarMenuBadge>
                ) : billing.hasLimitIssue ? (
                  <SidebarMenuBadge variant="destructive">
                    {billing.atLimitList.length}
                  </SidebarMenuBadge>
                ) : billing.isFree ? (
                  <SidebarMenuBadge variant="outline">FREE</SidebarMenuBadge>
                ) : null}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Paramètres">
                  <Link href="#">
                    <Settings />
                    <span>Paramètres</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset>
          <header className="flex h-14 items-center gap-4 border-b bg-card px-4 lg:h-[60px] lg:px-6 sticky top-0 z-30">
            <SidebarTrigger className="md:hidden" />
            <div className="w-full flex-1" />

            <ThemeToggle />

            <Button variant="ghost" size="icon" className="rounded-full">
              <Bell className="h-4 w-4" />
              <span className="sr-only">
                Activer/Désactiver les notifications
              </span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={userAvatar?.imageUrl} alt="User avatar" />
                    <AvatarFallback>
                      {(user?.email?.charAt(0) ?? "U").toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Mon compte</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Paramètres</DropdownMenuItem>
                <DropdownMenuItem>Support</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Déconnexion</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          <div className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6 bg-background">
            {children}
          </div>

          <footer className="py-6 px-4 md:px-6 border-t">
            <p className="text-center text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} SENTRYS. Tous droits réservés.
            </p>
          </footer>
        </SidebarInset>
      </SidebarProvider>
    </DashboardGate>
  );
}
