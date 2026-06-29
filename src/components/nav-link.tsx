"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import { SidebarMenuButton } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

interface NavLinkProps {
  href: string;
  icon: LucideIcon;
  label: string;
  /** Si true, le lien est actif quand l’URL commence par href (ex: /dashboard/sites/123) */
  match?: "exact" | "startsWith";
}

export default function NavLink({
  href,
  icon: Icon,
  label,
  match = "startsWith",
}: NavLinkProps) {
  const pathname = usePathname() ?? "";

  const isActive =
    match === "exact" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <SidebarMenuButton
      asChild
      data-active={isActive}
      className={cn(
        "transition-all duration-300",
        isActive &&
          "glass-card border-l-4 border-l-primary/50 text-foreground font-bold shadow-lg shadow-primary/5"
      )}
      tooltip={label}
    >
      <Link href={href} className="flex items-center gap-3">
        <Icon className={cn("size-4 transition-transform group-hover:scale-110", isActive ? "text-primary" : "text-muted-foreground")} />
        <span className={cn("transition-colors", isActive ? "text-foreground" : "text-muted-foreground/80")}>{label}</span>
      </Link>
    </SidebarMenuButton>
  );
}
