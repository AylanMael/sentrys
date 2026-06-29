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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePlanning } from "./PlanningContext";
import { Loader2, Repeat } from "lucide-react";

export const PropagateVacationSheet: React.FC = () => {
  const {
    propagationOpen,
    setPropagationOpen,
    activeVacation,
    propagateActiveVacation,
  } = usePlanning();

  const [occurrences, setOccurrences] = React.useState("4");
  const [frequency, setFrequency] = React.useState<"week" | "month" | "weekdays">("week");
  const [includeAssignments, setIncludeAssignments] = React.useState(true);
  const [includeNotes, setIncludeNotes] = React.useState(true);
  const [skipDuplicates, setSkipDuplicates] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (propagationOpen) {
      setOccurrences("4");
      setFrequency("week");
      setIncludeAssignments(true);
      setIncludeNotes(true);
      setSkipDuplicates(true);
      setSaving(false);
    }
  }, [propagationOpen]);

  const sourceLabel = React.useMemo(() => {
    if (!activeVacation) return "Vacation";
    const title = activeVacation.title || activeVacation.siteName || "Vacation";
    return `${title}`;
  }, [activeVacation]);

  const handleSubmit = async () => {
    const count = Number(occurrences);
    if (frequency !== "weekdays" && (!Number.isFinite(count) || count < 1)) return;

    setSaving(true);
    try {
      await propagateActiveVacation({
        occurrences: frequency === "weekdays" ? 1 : Math.min(Math.floor(count), 24),
        frequency,
        includeAssignments,
        includeNotes,
        skipDuplicates,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={propagationOpen} onOpenChange={setPropagationOpen}>
      <SheetContent className="overflow-y-auto border-l bg-white shadow-2xl dark:bg-slate-950 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-xl font-bold">
            <Repeat className="h-5 w-5 text-primary" />
            Propager la vacation
          </SheetTitle>
          <SheetDescription>
            Reproduis automatiquement <strong>{sourceLabel}</strong> sur les prochaines
            semaines, les prochains mois ou toute la semaine ouvree.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          <div className="space-y-2">
            <Label>Frequence</Label>
            <Select
              value={frequency}
              onValueChange={(value) =>
                setFrequency(value as "week" | "month" | "weekdays")
              }
            >
              <SelectTrigger className="bg-background/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekdays">
                  Tous les jours ouvres de la semaine
                </SelectItem>
                <SelectItem value="week">Chaque semaine</SelectItem>
                <SelectItem value="month">Chaque mois</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {frequency === "weekdays" ? (
            <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/70 p-4 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
              Cette option cree automatiquement la meme vacation sur tous les jours
              ouvres de la semaine source, du lundi au vendredi, en sautant le
              week-end et le jour deja existant.
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Nombre d&apos;occurrences a creer</Label>
              <Input
                type="number"
                min="1"
                max="24"
                value={occurrences}
                onChange={(event) => setOccurrences(event.target.value)}
                className="bg-background/50"
              />
              <p className="text-xs text-muted-foreground">
                Exemple : `4` pour reconduire les 4 prochaines semaines.
              </p>
            </div>
          )}

          <div className="space-y-4 rounded-2xl border border-border/50 bg-muted/20 p-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="includeAssignments"
                checked={includeAssignments}
                onCheckedChange={(checked) =>
                  setIncludeAssignments(Boolean(checked))
                }
              />
              <div className="space-y-1">
                <Label htmlFor="includeAssignments" className="font-semibold">
                  Reprendre les agents affectes
                </Label>
                <p className="text-xs text-muted-foreground">
                  Utile quand le meme agent revient habituellement sur la meme mission.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="includeNotes"
                checked={includeNotes}
                onCheckedChange={(checked) => setIncludeNotes(Boolean(checked))}
              />
              <div className="space-y-1">
                <Label htmlFor="includeNotes" className="font-semibold">
                  Reprendre les consignes
                </Label>
                <p className="text-xs text-muted-foreground">
                  Conserve les notes et consignes standard de la mission.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="skipDuplicates"
                checked={skipDuplicates}
                onCheckedChange={(checked) => setSkipDuplicates(Boolean(checked))}
              />
              <div className="space-y-1">
                <Label htmlFor="skipDuplicates" className="font-semibold">
                  Ignorer les doublons
                </Label>
                <p className="text-xs text-muted-foreground">
                  Evite de recreer une vacation identique si elle existe deja sur
                  la periode cible.
                </p>
              </div>
            </div>
          </div>
        </div>

        <SheetFooter>
          <Button
            variant="outline"
            onClick={() => setPropagationOpen(false)}
            disabled={saving}
          >
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !activeVacation}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Repeat className="mr-2 h-4 w-4" />
            )}
            {frequency === "weekdays" ? "Etendre la semaine" : "Propager"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
