"use client";

import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { usePlanning } from "./PlanningContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
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

function roundDateToStep(date: Date, stepMinutes = SLOT_STEP_MINUTES) {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  const roundedMinutes =
    Math.round(rounded.getMinutes() / stepMinutes) * stepMinutes;
  rounded.setMinutes(roundedMinutes);
  return rounded;
}

function normalizeDateTimeInput(value: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return toLocalDateTimeValue(roundDateToStep(parsed));
}

function buildDefaultVacationWindow(baseDate?: Date) {
  const source =
    baseDate && !Number.isNaN(baseDate.getTime()) ? baseDate : new Date();
  const start = new Date(
    source.getFullYear(),
    source.getMonth(),
    source.getDate(),
    8,
    0,
    0,
    0
  );
  const end = new Date(
    source.getFullYear(),
    source.getMonth(),
    source.getDate(),
    18,
    0,
    0,
    0
  );

  return {
    startAt: toLocalDateTimeValue(start),
    endAt: toLocalDateTimeValue(end),
  };
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
  return value.includes("T")
    ? value.split("T")[1]?.slice(0, 5) || "08:00"
    : "08:00";
}

function combineDateAndTime(date: string, time: string) {
  if (!date) return "";
  return `${date}T${time}`;
}

const createSchema = z.object({
  siteId: z.string().min(1, "Site requis"),
  title: z.string().optional(),
  missionType: z.string().optional(),
  startAt: z.string().min(1, "Debut requis"),
  endAt: z.string().min(1, "Fin requise"),
  requiredAgents: z.coerce.number().min(1, "Au moins 1 agent"),
  notes: z.string().optional(),
});

type CreateFormValues = z.infer<typeof createSchema>;

const TIME_OPTIONS = buildTimeOptions();

export const CreateVacationSheet: React.FC = () => {
  const {
    createOpen,
    setCreateOpen,
    sites,
    createVacation,
    initialCreateData,
    setInitialCreateData,
  } = usePlanning();
  const { toast } = useToast();
  const [saving, setSaving] = React.useState(false);
  const defaultWindow = React.useMemo(() => buildDefaultVacationWindow(), []);

  const form = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      siteId: "",
      title: "",
      missionType: "",
      startAt: defaultWindow.startAt,
      endAt: defaultWindow.endAt,
      requiredAgents: 1,
      notes: "",
    },
  });

  React.useEffect(() => {
    if (createOpen) {
      const seededDate = initialCreateData?.startAt
        ? new Date(initialCreateData.startAt)
        : new Date();
      const nextWindow = buildDefaultVacationWindow(seededDate);

      form.reset({
        siteId: initialCreateData?.siteId ?? "",
        title: "",
        missionType: "",
        startAt: nextWindow.startAt,
        endAt: nextWindow.endAt,
        requiredAgents: 1,
        notes: "",
      });
    } else {
      setInitialCreateData(null);
    }
  }, [createOpen, form, initialCreateData, setInitialCreateData]);

  const onSubmit = async (data: CreateFormValues) => {
    setSaving(true);
    try {
      const site = sites.find((entry) => entry.id === data.siteId);
      const resId = await createVacation({
        ...data,
        missionType: data.missionType?.trim() || null,
        startAt: normalizeDateTimeInput(data.startAt),
        endAt: normalizeDateTimeInput(data.endAt),
        siteName: site?.name || null,
        status: "planned",
      });

      if (resId) {
        toast({
          title: "Vacation créée",
          description: "L'operation a été ajoutee au planning.",
        });
        setCreateOpen(false);
        form.reset({
          siteId: "",
          title: "",
          missionType: "",
          startAt: defaultWindow.startAt,
          endAt: defaultWindow.endAt,
          requiredAgents: 1,
          notes: "",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Erreur",
          description: "Impossible de créer la vacation.",
        });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={createOpen} onOpenChange={setCreateOpen}>
      <SheetContent className="overflow-y-auto border-l bg-white shadow-2xl dark:bg-slate-950 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-xl font-bold">Nouvelle vacation</SheetTitle>
          <SheetDescription>
            La vacation démarre par défaut a 08:00 et se termine a 18:00 le meme jour.
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-6">
            <FormField
              control={form.control}
              name="siteId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Site client</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-background/50">
                        <SelectValue placeholder="Selectionner un site" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {sites.map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                          {site.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="missionType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type de mission</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ? field.value : undefined}
                  >
                    <FormControl>
                      <SelectTrigger className="bg-background/50">
                        <SelectValue placeholder="Choisir un poste type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {MISSION_TYPE_OPTIONS.map((missionType) => (
                        <SelectItem key={missionType} value={missionType}>
                          {missionType}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Standardise les postes pour rendre le planning plus lisible.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Titre complementaire</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex : ronde de nuit, filtrage porte nord"
                      {...field}
                      className="bg-background/50"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="startAt"
              render={({ field }) => {
                const dateValue = getDatePart(field.value);
                const timeValue = getTimePart(field.value);

                return (
                  <FormItem>
                    <FormLabel>Debut</FormLabel>
                    <div className="grid grid-cols-[1.2fr_0.8fr] gap-3">
                      <FormControl>
                        <Input
                          type="date"
                          value={dateValue}
                          onChange={(event) =>
                            field.onChange(
                              combineDateAndTime(event.target.value, timeValue)
                            )
                          }
                          className="bg-background/50"
                        />
                      </FormControl>
                      <Select
                        value={timeValue}
                        onValueChange={(value) =>
                          field.onChange(combineDateAndTime(dateValue, value))
                        }
                      >
                        <FormControl>
                          <SelectTrigger className="bg-background/50">
                            <SelectValue placeholder="Heure" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-72">
                          {TIME_OPTIONS.map((time) => (
                            <SelectItem key={`start-${time}`} value={time}>
                              {time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Creneaux par tranche de 30 minutes.
                    </p>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <FormField
              control={form.control}
              name="endAt"
              render={({ field }) => {
                const dateValue = getDatePart(field.value);
                const timeValue = getTimePart(field.value);

                return (
                  <FormItem>
                    <FormLabel>Fin</FormLabel>
                    <div className="grid grid-cols-[1.2fr_0.8fr] gap-3">
                      <FormControl>
                        <Input
                          type="date"
                          value={dateValue}
                          onChange={(event) =>
                            field.onChange(
                              combineDateAndTime(event.target.value, timeValue)
                            )
                          }
                          className="bg-background/50"
                        />
                      </FormControl>
                      <Select
                        value={timeValue}
                        onValueChange={(value) =>
                          field.onChange(combineDateAndTime(dateValue, value))
                        }
                      >
                        <FormControl>
                          <SelectTrigger className="bg-background/50">
                            <SelectValue placeholder="Heure" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-72">
                          {TIME_OPTIONS.map((time) => (
                            <SelectItem key={`end-${time}`} value={time}>
                              {time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Consignes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Consignes d'accès, zone sensible, matériel, point de rendez-vous..."
                      {...field}
                      className="min-h-[120px] bg-background/50"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <SheetFooter className="pt-2">
              <Button
                variant="outline"
                type="button"
                onClick={() => setCreateOpen(false)}
                disabled={saving}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Créer la vacation
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
};
