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
        isActive &&
          "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
      )}
      tooltip={label}
    >
      <Link href={href}>
        <Icon />
        <span>{label}</span>
      </Link>
    </SidebarMenuButton>
  );
}
