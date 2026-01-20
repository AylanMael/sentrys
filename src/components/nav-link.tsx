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
}

export default function NavLink({ href, icon: Icon, label }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <SidebarMenuButton
      asChild
      className={cn(
        isActive &&
          "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
      )}
      tooltip={label}
    >
      <Link href={href}>
        <Icon />
        {label}
      </Link>
    </SidebarMenuButton>
  );
}
