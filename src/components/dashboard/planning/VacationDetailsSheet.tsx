"use client";

import React from "react";
import {
  AlertTriangle,
  CalendarPlus,
  Calendar,
  CheckCircle2,
  Clock,
  Info,
  MapPin,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  getVacationPublicationStatus,
  usePlanning,
  type VacationPublicationStatus,
} from "./PlanningContext";
import { MISSION_TYPE_OPTIONS } from "@/lib/planning/mission-types";

const SLOT_STEP_MINUTES = 30;

function toLocalDateTimeValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function buildTimeOptions() {
  const options: string[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    for (let minute = 0; minute < 60; minute += SLOT_STEP_MINUTES) {
      options.push(
        `${`${hour}`.padStart(2, "0")}:${`${minute}`.padStart(2, "0")}`
      );
    }
  }
  return options;
}

function getDatePart(value: string) {
  return value.includes("T") ? value.split("T")[0] : value;
}

function getTimePart(value: string) {
  return value.includes("T") ? value.split("T")[1]?.slice(0, 5) || "08:00" : "08:00";
}

function combineDateAndTime(date: string, time: string) {
  if (!date) return "";
  return `${date}T${time}`;
}

const TIME_OPTIONS = buildTimeOptions();

const publicationConfig: Record<
  VacationPublicationStatus,
  { label: string; color: string; description: string }
> = {
  draft: {
    label: "Brouillon",
    color: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
    description: "Cette vacation n'a pas encore ete publiee aux agents.",
  },
  published: {
    label: "Publie",
    color: "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
    description: "Cette vacation est publiee et a jour.",
  },
  modified: {
    label: "A republier",
    color: "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
    description: "Cette vacation a ete modifiee apres publication.",
  },
};

export const VacationDetailsSheet: React.FC = () => {
  const {
    detailsOpen,
    setDetailsOpen,
    activeVacation,
    deleteVacation,
    setAssignOpen,
    setReplaceOpen,
    setCreateOpen,
    setInitialCreateData,
    updateVacation,
  } = usePlanning();
  const { toast } = useToast();

  const [scheduleDraft, setScheduleDraft] = React.useState({
    startAt: "",
    endAt: "",
  });
  const [scheduleSaving, setScheduleSaving] = React.useState(false);
  const [detailsDraft, setDetailsDraft] = React.useState({
    title: "",
    missionType: "",
    requiredQualification: "",
    notes: "",
  });
  const [detailsSaving, setDetailsSaving] = React.useState(false);

  React.useEffect(() => {
    if (!detailsOpen || !activeVacation) return;

    setScheduleDraft({
      startAt: activeVacation.startAtIso
        ? toLocalDateTimeValue(new Date(activeVacation.startAtIso))
        : "",
      endAt: activeVacation.endAtIso
        ? toLocalDateTimeValue(new Date(activeVacation.endAtIso))
        : "",
    });
    setDetailsDraft({
      title: activeVacation.title ?? "",
      missionType: activeVacation.missionType ?? "",
      requiredQualification: activeVacation.requiredQualification ?? "",
      notes: activeVacation.notes ?? "",
    });
  }, [detailsOpen, activeVacation]);

  if (!activeVacation) return null;

  const vacation = activeVacation;
  const start = vacation.startAtIso ? new Date(vacation.startAtIso) : null;
  const end = vacation.endAtIso ? new Date(vacation.endAtIso) : null;
  const isCancelled = vacation.status === "cancelled";
  const isLocked = vacation.status === "cancelled" || vacation.status === "closed";

  const handleDelete = async () => {
    if (confirm("Supprimer cette vacation ?")) {
      const ok = await deleteVacation(vacation.id);
      if (ok) setDetailsOpen(false);
    }
  };

  const handleScheduleSave = async () => {
    if (isLocked) return;

    const nextStart = new Date(scheduleDraft.startAt);
    const nextEnd = new Date(scheduleDraft.endAt);

    if (
      Number.isNaN(nextStart.getTime()) ||
      Number.isNaN(nextEnd.getTime()) ||
      nextEnd.getTime() <= nextStart.getTime()
    ) {
      toast({
        variant: "destructive",
        title: "Horaires invalides",
        description: "La fin doit être postérieure au début.",
      });
      return;
    }

    setScheduleSaving(true);
    try {
      const ok = await updateVacation(vacation.id, {
        startAt: scheduleDraft.startAt,
        endAt: scheduleDraft.endAt,
      });

      if (ok) {
        toast({
          title: "Horaires mis à jour",
          description: "La vacation a bien été réajustée.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Mise à jour impossible",
          description:
            "Les nouveaux horaires n'ont pas pu être enregistrés. Vérifie les conflits éventuels puis réessaie.",
        });
      }
    } finally {
      setScheduleSaving(false);
    }
  };

  const handleCreateSiblingVacation = () => {
    setInitialCreateData({
      startAt:
        vacation.startAtIso
          ? toLocalDateTimeValue(new Date(vacation.startAtIso))
          : scheduleDraft.startAt,
      endAt:
        vacation.endAtIso
          ? toLocalDateTimeValue(new Date(vacation.endAtIso))
          : scheduleDraft.endAt,
      siteId: vacation.siteId ?? undefined,
    });
    setDetailsOpen(false);
    setCreateOpen(true);
  };

  const handleDetailsSave = async () => {
    if (isLocked) return;

    setDetailsSaving(true);
    try {
      const ok = await updateVacation(vacation.id, {
        title: detailsDraft.title.trim() || null,
        missionType: detailsDraft.missionType.trim() || null,
        requiredQualification: detailsDraft.requiredQualification.trim() || null,
        notes: detailsDraft.notes.trim() || null,
      });

      if (ok) {
        toast({
          title: "Fiche mission mise à jour",
          description: "Le titre, le profil et les consignes ont été enregistrés.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Mise à jour impossible",
          description:
            "Les informations de mission n'ont pas pu être enregistrées. Réessaie dans quelques instants.",
        });
      }
    } finally {
      setDetailsSaving(false);
    }
  };

  const statusConfig: Record<
    string,
    { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
  > = {
    planned: {
      label: "Planifiée",
      color: "border-blue-500/20 bg-blue-500/10 text-blue-500",
      icon: Clock,
    },
    partially_filled: {
      label: "Partielle",
      color: "border-amber-500/20 bg-amber-500/10 text-amber-500",
      icon: Info,
    },
    filled: {
      label: "Complète",
      color: "border-emerald-500/20 bg-emerald-500/10 text-emerald-500",
      icon: CheckCircle2,
    },
    closed: {
      label: "Clôturée",
      color: "border-slate-500/20 bg-slate-500/10 text-slate-500",
      icon: CheckCircle2,
    },
    cancelled: {
      label: "Annulée",
      color: "border-red-500/20 bg-red-500/10 text-red-500",
      icon: XCircle,
    },
  };

  const config = statusConfig[vacation.status] || statusConfig.planned;
  const publicationStatus = getVacationPublicationStatus(vacation);
  const publication = publicationConfig[publicationStatus];

  return (
    <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
      <SheetContent className="overflow-y-auto border-l bg-white shadow-2xl sm:max-w-md dark:bg-slate-950">
        <SheetHeader className="mb-6">
          <div className="flex items-start justify-between">
            <div className="flex flex-wrap gap-2">
              <Badge className={config.color}>
                <config.icon className="mr-1.5 h-3 w-3" />
                {config.label}
              </Badge>
              <Badge variant="outline" className={publication.color}>
                {publication.label}
              </Badge>
            </div>
          </div>
          <SheetTitle className="mt-2 text-2xl font-bold">
            {vacation.title || "Mission sans titre"}
          </SheetTitle>
          <SheetDescription className="mt-1 flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {vacation.siteName || "Site non spécifié"}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1 rounded-xl border bg-muted/30 p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Début
              </span>
              <div className="flex items-center gap-2 font-medium">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                {start ? format(start, "dd MMM yyyy", { locale: fr }) : "-"}
              </div>
              <div className="text-lg font-bold">
                {start ? format(start, "HH:mm") : "-"}
              </div>
            </div>

            <div className="space-y-1 rounded-xl border bg-muted/30 p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Fin
              </span>
              <div className="flex items-center gap-2 font-medium">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                {end ? format(end, "dd MMM yyyy", { locale: fr }) : "-"}
              </div>
              <div className="text-lg font-bold">
                {end ? format(end, "HH:mm") : "-"}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
                  Publication
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {publication.description}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {vacation.publishedAtIso
                    ? `Publiee le ${format(new Date(vacation.publishedAtIso), "dd MMM yyyy HH:mm", { locale: fr })}`
                    : "Aucune date de publication enregistree."}
                  {publicationStatus === "modified" && vacation.updatedAtIso
                    ? ` Derniere modification le ${format(new Date(vacation.updatedAtIso), "dd MMM yyyy HH:mm", { locale: fr })}.`
                    : ""}
                </p>
              </div>
              <Badge variant="outline" className={publication.color}>
                {publication.label}
              </Badge>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-primary/10 bg-primary/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Réajuster les horaires</h3>
                <p className="text-xs text-muted-foreground">
                  Modifiez l&apos;amplitude de la mission par tranche de 30 minutes.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="glass-button"
                onClick={handleScheduleSave}
                disabled={scheduleSaving || isLocked}
              >
                {scheduleSaving ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Début
                </span>
                <Input
                  type="date"
                  value={getDatePart(scheduleDraft.startAt)}
                  onChange={(event) =>
                    setScheduleDraft((previous) => ({
                      ...previous,
                      startAt: combineDateAndTime(
                        event.target.value,
                        getTimePart(previous.startAt)
                      ),
                    }))
                  }
                  disabled={isLocked}
                  className="bg-background/80"
                />
                <Select
                  value={getTimePart(scheduleDraft.startAt)}
                  onValueChange={(value) =>
                    setScheduleDraft((previous) => ({
                      ...previous,
                      startAt: combineDateAndTime(getDatePart(previous.startAt), value),
                    }))
                  }
                  disabled={isLocked}
                >
                  <SelectTrigger className="bg-background/80">
                    <SelectValue placeholder="Heure de début" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {TIME_OPTIONS.map((time) => (
                      <SelectItem key={`details-start-${time}`} value={time}>
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Fin
                </span>
                <Input
                  type="date"
                  value={getDatePart(scheduleDraft.endAt)}
                  onChange={(event) =>
                    setScheduleDraft((previous) => ({
                      ...previous,
                      endAt: combineDateAndTime(
                        event.target.value,
                        getTimePart(previous.endAt)
                      ),
                    }))
                  }
                  disabled={isLocked}
                  className="bg-background/80"
                />
                <Select
                  value={getTimePart(scheduleDraft.endAt)}
                  onValueChange={(value) =>
                    setScheduleDraft((previous) => ({
                      ...previous,
                      endAt: combineDateAndTime(getDatePart(previous.endAt), value),
                    }))
                  }
                  disabled={isLocked}
                >
                  <SelectTrigger className="bg-background/80">
                    <SelectValue placeholder="Heure de fin" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {TIME_OPTIONS.map((time) => (
                      <SelectItem key={`details-end-${time}`} value={time}>
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Fiche mission</h3>
                <p className="text-xs text-muted-foreground">
                  Ajustez le libellé, le profil attendu et les consignes terrain.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="glass-button"
                onClick={handleDetailsSave}
                disabled={detailsSaving || isLocked}
              >
                {detailsSaving ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Titre de mission
                </span>
                <Input
                  value={detailsDraft.title}
                  onChange={(event) =>
                    setDetailsDraft((previous) => ({
                      ...previous,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Ex : Surveillance entrée principale"
                  disabled={isLocked}
                  className="bg-background/80"
                />
              </div>

              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Type de mission
                </span>
                <Select
                  value={detailsDraft.missionType || undefined}
                  onValueChange={(value) =>
                    setDetailsDraft((previous) => ({
                      ...previous,
                      missionType: value,
                    }))
                  }
                  disabled={isLocked}
                >
                  <SelectTrigger className="bg-background/80">
                    <SelectValue placeholder="Choisir un poste type" />
                  </SelectTrigger>
                  <SelectContent>
                    {MISSION_TYPE_OPTIONS.map((missionType) => (
                      <SelectItem key={missionType} value={missionType}>
                        {missionType}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Profil requis
                </span>
                <Input
                  value={detailsDraft.requiredQualification}
                  onChange={(event) =>
                    setDetailsDraft((previous) => ({
                      ...previous,
                      requiredQualification: event.target.value,
                    }))
                  }
                  placeholder="Ex : ADS, SSIAP 1, agent cynophile"
                  disabled={isLocked}
                  className="bg-background/80"
                />
              </div>

              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Notes et consignes
                </span>
                <Textarea
                  value={detailsDraft.notes}
                  onChange={(event) =>
                    setDetailsDraft((previous) => ({
                      ...previous,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Consignes d'accès, point de rendez-vous, zones sensibles..."
                  disabled={isLocked}
                  className="min-h-[110px] bg-background/80"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4 text-primary" />
                Opérationnels ({vacation.assignedAgentIds?.length || 0} /{" "}
                {vacation.requiredAgents})
              </h3>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "glass-button h-7 text-[10px]",
                  isCancelled && "cursor-not-allowed grayscale opacity-50"
                )}
                onClick={() => !isCancelled && setAssignOpen(true)}
                disabled={isCancelled}
              >
                <UserPlus className="mr-1 h-3 w-3" />
                Gérer
              </Button>
            </div>

            <div className="space-y-2">
              {vacation.assignedAgentIds?.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/10 bg-red-500/5 p-3 text-xs italic text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  Aucun agent affecté à cette mission.
                </div>
              ) : (
                <div className="px-2 text-xs italic text-muted-foreground">
                  {vacation.assignedAgentIds.length} agent(s) en place.
                </div>
              )}
            </div>
          </div>

          {vacation.notes && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Notes & Consignes</h3>
              <div className="rounded-xl border bg-muted/20 p-4 text-sm italic leading-relaxed text-foreground/80">
                &quot;{vacation.notes}&quot;
              </div>
            </div>
          )}

          <div className="space-y-3 pt-4">
            <Button
              variant="outline"
              className="glass-button w-full font-bold"
              onClick={handleCreateSiblingVacation}
            >
              <CalendarPlus className="mr-2 h-4 w-4" />
              Ajouter une autre vacation sur ce site
            </Button>

            <Button
              className={cn(
                "w-full bg-indigo-600 font-bold shadow-lg shadow-indigo-600/20 hover:bg-indigo-700",
                isCancelled && "cursor-not-allowed grayscale opacity-50"
              )}
              onClick={() => !isCancelled && setReplaceOpen(true)}
              disabled={isCancelled}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Sentry AI : remplacement intelligent
            </Button>
          </div>
        </div>

        <Separator className="my-8" />

        <SheetFooter className="gap-2">
          <Button
            variant="ghost"
            className="text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Supprimer
          </Button>
          <Button
            variant="outline"
            className="glass-button flex-1"
            onClick={() => setDetailsOpen(false)}
          >
            Fermer
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
