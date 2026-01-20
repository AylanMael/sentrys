"use client";

import Link from "next/link";
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
} from "lucide-react";

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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import Logo from "@/components/logo";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import NavLink from "@/components/nav-link";
import { ThemeToggle } from "@/components/theme-toggle";

const userAvatar = PlaceHolderImages.find((p) => p.id === "user-avatar-1");

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Tableau de bord" },
  { href: "/dashboard/planning", icon: CalendarClock, label: "Planification" },
  { href: "/dashboard/incidents", icon: Siren, label: "Incidents" },
  { href: "/dashboard/agents", icon: ShieldCheck, label: "Agents" },
  { href: "/dashboard/clients", icon: Building2, label: "Clients" },
  { href: "/dashboard/users", icon: Users, label: "Utilisateurs" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
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
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link href="#">
                  <Settings />
                  Paramètres
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center gap-4 border-b bg-card px-4 lg:h-[60px] lg:px-6 sticky top-0 z-30">
          <SidebarTrigger className="md:hidden" />
          <div className="w-full flex-1">
            {/* Can add a global search here later */}
          </div>
          <ThemeToggle />
          <Button variant="ghost" size="icon" className="rounded-full">
            <Bell className="h-4 w-4" />
            <span className="sr-only">Activer/Désactiver les notifications</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={userAvatar?.imageUrl} alt="User avatar" />
                  <AvatarFallback>AD</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Mon compte</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Paramètres</DropdownMenuItem>
              <DropdownMenuItem>Support</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/login">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Déconnexion</span>
                </Link>
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
  );
}
