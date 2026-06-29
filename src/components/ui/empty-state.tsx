import type * as React from "react";
import { CircleDashed } from "lucide-react";

import { cn } from "@/lib/utils";

type EmptyStateTone = "neutral" | "success" | "warning" | "danger" | "info";

type EmptyStateProps = {
  icon?: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  tone?: EmptyStateTone;
  compact?: boolean;
  className?: string;
};

const toneClassNames: Record<
  EmptyStateTone,
  {
    container: string;
    iconWrap: string;
    icon: string;
  }
> = {
  neutral: {
    container: "border-border/70 bg-muted/20",
    iconWrap: "bg-background text-muted-foreground ring-border/70",
    icon: "text-muted-foreground",
  },
  success: {
    container: "border-emerald-500/25 bg-emerald-500/10",
    iconWrap: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/20",
    icon: "text-emerald-700 dark:text-emerald-300",
  },
  warning: {
    container: "border-amber-500/30 bg-amber-500/10",
    iconWrap: "bg-amber-500/15 text-amber-700 ring-amber-500/20",
    icon: "text-amber-700 dark:text-amber-300",
  },
  danger: {
    container: "border-destructive/30 bg-destructive/10",
    iconWrap: "bg-destructive/15 text-destructive ring-destructive/20",
    icon: "text-destructive",
  },
  info: {
    container: "border-sky-500/25 bg-sky-500/10",
    iconWrap: "bg-sky-500/15 text-sky-700 ring-sky-500/20",
    icon: "text-sky-700 dark:text-sky-300",
  },
};

export function EmptyState({
  icon: Icon = CircleDashed,
  title,
  description,
  action,
  secondaryAction,
  tone = "neutral",
  compact = false,
  className,
}: EmptyStateProps) {
  const styles = toneClassNames[tone];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[1.75rem] border text-center shadow-sm",
        compact ? "p-5" : "p-8 md:p-10",
        styles.container,
        className
      )}
    >
      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-background/60 blur-3xl" />

      <div className="relative mx-auto flex max-w-xl flex-col items-center">
        <div
          className={cn(
            "mb-5 flex items-center justify-center rounded-2xl ring-1",
            compact ? "h-11 w-11" : "h-14 w-14",
            styles.iconWrap
          )}
        >
          <Icon className={cn(compact ? "h-5 w-5" : "h-6 w-6", styles.icon)} />
        </div>

        <h3 className={cn("font-black tracking-tight text-foreground", compact ? "text-base" : "text-xl")}>
          {title}
        </h3>

        {description ? (
          <div className="mt-2 text-sm font-medium leading-relaxed text-muted-foreground">
            {description}
          </div>
        ) : null}

        {(action || secondaryAction) && (
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {action}
            {secondaryAction}
          </div>
        )}
      </div>
    </div>
  );
}
