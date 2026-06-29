"use client";

import React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { usePlanning } from "./PlanningContext";
import { CalendarRange, Loader2, Repeat2 } from "lucide-react";
import { cn } from "@/lib/utils";

type TargetMode = "next_week" | "current_month" | "next_month";

const TARGET_OPTIONS: Array<{
  value: TargetMode;
  title: string;
  description: string;
}> = [
  {
    value: "next_week",
    title: "Semaine prochaine",
    description: "Reprend la semaine source une seule fois, sur la semaine suivante.",
  },
  {
    value: "current_month",
    title: "Reste du mois",
    description: "Répète la même semaine sur toutes les semaines restantes du mois.",
  },
  {
    value: "next_month",
    title: "Mois prochain",
    description: "Reproduit la semaine type sur tout le mois prochain.",
  },
];

export const PropagateWeekSheet: React.FC = () => {
  const {
    weekPropagationOpen,
    setWeekPropagationOpen,
    range,
    propagateWeekPlan,
  } = usePlanning();

  const [target, setTarget] = React.useState<TargetMode>("next_week");
  const [includeAssignments, setIncludeAssignments] = React.useState(true);
  const [includeNotes, setIncludeNotes] = React.useState(true);
  const [skipDuplicates, setSkipDuplicates] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (weekPropagationOpen) {
      setTarget("next_week");
      setIncludeAssignments(true);
      setIncludeNotes(true);
      setSkipDuplicates(true);
      setSaving(false);
    }
  }, [weekPropagationOpen]);

  const sourceLabel = React.useMemo(() => {
    if (!range?.from || !range?.to) return "Semaine visible";
    const formatter = new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    return `${formatter.format(new Date(range.from))} - ${formatter.format(new Date(range.to))}`;
  }, [range?.from, range?.to]);

  const handleSubmit = async () => {
    if (!range?.from) return;

    setSaving(true);
    try {
      await propagateWeekPlan(new Date(range.from), {
        target,
        includeAssignments,
        includeNotes,
        skipDuplicates,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={weekPropagationOpen} onOpenChange={setWeekPropagationOpen}>
      <SheetContent className="sm:max-w-lg bg-white dark:bg-slate-950 border-l shadow-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-xl font-bold">
            <CalendarRange className="h-5 w-5 text-primary" />
            Reproduire la semaine
          </SheetTitle>
          <SheetDescription>
            Semaine source : <strong>{sourceLabel}</strong>
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          <div className="grid gap-3">
            {TARGET_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setTarget(option.value)}
                className={cn(
                  "rounded-2xl border p-4 text-left transition-all",
                  target === option.value
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border/50 bg-background hover:border-primary/30"
                )}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-foreground">{option.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{option.description}</p>
                  </div>
                  <div
                    className={cn(
                      "h-4 w-4 rounded-full border-2",
                      target === option.value
                        ? "border-primary bg-primary"
                        : "border-muted-foreground/30"
                    )}
                  />
                </div>
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-border/50 bg-muted/20 p-4 space-y-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="week-assignments"
                checked={includeAssignments}
                onCheckedChange={(checked) => setIncludeAssignments(Boolean(checked))}
              />
              <div className="space-y-1">
                <Label htmlFor="week-assignments" className="font-semibold">
                  Reprendre les affectations
                </Label>
                <p className="text-xs text-muted-foreground">
                  Reproduit aussi les agents déjà planifiés sur la semaine source.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="week-notes"
                checked={includeNotes}
                onCheckedChange={(checked) => setIncludeNotes(Boolean(checked))}
              />
              <div className="space-y-1">
                <Label htmlFor="week-notes" className="font-semibold">
                  Reprendre les consignes
                </Label>
                <p className="text-xs text-muted-foreground">
                  Conserve les notes standards des missions lors de la reproduction.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="week-duplicates"
                checked={skipDuplicates}
                onCheckedChange={(checked) => setSkipDuplicates(Boolean(checked))}
              />
              <div className="space-y-1">
                <Label htmlFor="week-duplicates" className="font-semibold">
                  Ignorer les doublons
                </Label>
                <p className="text-xs text-muted-foreground">
                  Empêche de recréer une mission identique si elle est déjà présente sur la cible.
                </p>
              </div>
            </div>
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => setWeekPropagationOpen(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !range?.from}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Repeat2 className="mr-2 h-4 w-4" />}
            Reproduire
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
