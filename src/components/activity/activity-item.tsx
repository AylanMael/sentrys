"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import {
  UserPlus,
  UserX,
  ShieldCheck,
  CalendarClock,
  MapPin,
  Siren,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  Activity as ActivityIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type Activity = {
  id: string;
  tenantId?: string | null;

  actorId?: string | null;
  actorRole?: string | null;

  action?: string | null;
  entity?: string | null;
  entityId?: string | null;

  message?: string | null;
  metadata?: any;

  createdAtIso?: string | null;
  createdAtMs?: number;
};

function iconFor(a: Activity) {
  const action = String(a.action ?? "");
  const entity = String(a.entity ?? "");

  // Actions fréquentes
  if (action === "agent.created") return UserPlus;
  if (action === "agent.deleted" || action === "agent.deactivated") return UserX;
  if (action === "agent.updated") return Pencil;

  if (action.startsWith("site.")) return MapPin;
  if (action.startsWith("vacation.")) return CalendarClock;
  if (action.startsWith("incident.")) return Siren;

  // Fallback par entity
  if (entity === "agent") return ShieldCheck;
  if (entity === "site") return MapPin;
  if (entity === "vacation") return CalendarClock;
  if (entity === "incident") return Siren;

  return ActivityIcon;
}

function toneFor(a: Activity) {
  const action = String(a.action ?? "");
  if (action.includes("deleted") || action.includes("deactivated") || action.includes("cancelled")) return "danger";
  if (action.includes("created") || action.includes("activated")) return "success";
  if (action.includes("updated")) return "info";
  return "neutral";
}

function entityHref(entity?: string | null, entityId?: string | null) {
  if (!entity || !entityId) return null;
  if (entity === "agent") return `/dashboard/agents/${entityId}`;
  if (entity === "site") return `/dashboard/sites/${entityId}`;
  if (entity === "vacation") return `/dashboard/vacations/${entityId}`;
  if (entity === "incident") return `/dashboard/incidents/${entityId}`;
  return null;
}

export function ActivityItem({ activity }: { activity: Activity }) {
  const Icon = iconFor(activity);
  const tone = toneFor(activity);

  const href = entityHref(activity.entity, activity.entityId);

  const dateLabel =
    activity.createdAtIso
      ? formatDistanceToNow(new Date(activity.createdAtIso), { addSuffix: true, locale: fr })
      : "—";

  const msg = activity.message ?? `${activity.action ?? "activity"} (${activity.entity ?? "?"})`;

  return (
    <div className="flex gap-3 rounded-2xl border bg-card p-3">
      <div
        className={cn(
          "mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border",
          tone === "success" && "bg-emerald-500/10 border-emerald-500/20",
          tone === "info" && "bg-sky-500/10 border-sky-500/20",
          tone === "danger" && "bg-red-500/10 border-red-500/20",
          tone === "neutral" && "bg-muted/40"
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {href ? (
              <Link href={href} className="text-sm font-medium hover:underline">
                {msg}
              </Link>
            ) : (
              <div className="text-sm font-medium">{msg}</div>
            )}

            <div className="mt-0.5 text-xs text-muted-foreground">
              {activity.action ? (
                <span className="mr-2 inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 opacity-70" />
                  {activity.action}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1">
                <XCircle className="h-3.5 w-3.5 opacity-0" />
                {dateLabel}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
