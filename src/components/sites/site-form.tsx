"use client";

import { useMemo, useState } from "react";
import type { SiteType } from "@/lib/sites/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SiteFormValues = {
  name: string;
  clientName: string;
  siteType: SiteType;
  riskLevel: 1 | 2 | 3 | 4 | 5;
  address: string;
  city: string;
  postalCode: string;
  instructions: string;
  isActive: boolean;
};

const SITE_TYPES: { value: SiteType; label: string }[] = [
  { value: "bureaux", label: "Bureaux" },
  { value: "chantier", label: "Chantier" },
  { value: "boutique", label: "Boutique" },
  { value: "evenement", label: "Événement" },
  { value: "hotel", label: "Hôtel" },
  { value: "autre", label: "Autre" },
];

function toRiskLevel(v: string): 1 | 2 | 3 | 4 | 5 {
  const n = Number(v);
  if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5) return n;
  return 3;
}

export function SiteForm({
  initialValues,
  submitLabel = "Enregistrer",
  onSubmit,
  isSubmitting,
}: {
  initialValues?: Partial<SiteFormValues>;
  submitLabel?: string;
  onSubmit: (values: SiteFormValues) => Promise<void> | void;
  isSubmitting?: boolean;
}) {
  const defaults: SiteFormValues = useMemo(
    () => ({
      name: initialValues?.name ?? "",
      clientName: initialValues?.clientName ?? "",
      siteType: initialValues?.siteType ?? "bureaux",
      riskLevel: initialValues?.riskLevel ?? 3,
      address: initialValues?.address ?? "",
      city: initialValues?.city ?? "",
      postalCode: initialValues?.postalCode ?? "",
      instructions: initialValues?.instructions ?? "",
      isActive: initialValues?.isActive ?? true,
    }),
    [initialValues]
  );

  const [values, setValues] = useState<SiteFormValues>(defaults);

  function update<K extends keyof SiteFormValues>(key: K, value: SiteFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.name.trim()) return;
    await onSubmit({
      ...values,
      name: values.name.trim(),
      clientName: values.clientName.trim(),
      address: values.address.trim(),
      city: values.city.trim(),
      postalCode: values.postalCode.trim(),
      instructions: values.instructions.trim(),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Nom du site *</Label>
          <Input
            value={values.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Ex: Tour A – La Défense (accès nuit)"
            required
          />
        </div>

        <div className="space-y-2">
          <Label>Client (optionnel)</Label>
          <Input
            value={values.clientName}
            onChange={(e) => update("clientName", e.target.value)}
            placeholder="Ex: Groupe X"
          />
        </div>

        <div className="space-y-2">
          <Label>Type</Label>
          <Select
            value={values.siteType}
            onValueChange={(v) => update("siteType", v as SiteType)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choisir un type" />
            </SelectTrigger>
            <SelectContent>
              {SITE_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Niveau de risque</Label>
          <Select
            value={String(values.riskLevel)}
            onValueChange={(v) => update("riskLevel", toRiskLevel(v))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Risque" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 — Faible</SelectItem>
              <SelectItem value="2">2 — Modéré</SelectItem>
              <SelectItem value="3">3 — Normal</SelectItem>
              <SelectItem value="4">4 — Élevé</SelectItem>
              <SelectItem value="5">5 — Critique</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2 md:col-span-2">
          <Label>Adresse</Label>
          <Input
            value={values.address}
            onChange={(e) => update("address", e.target.value)}
            placeholder="Ex: 10 avenue de la Grande Armée"
          />
        </div>
        <div className="space-y-2">
          <Label>Code postal</Label>
          <Input
            value={values.postalCode}
            onChange={(e) => update("postalCode", e.target.value)}
            placeholder="75017"
          />
        </div>
        <div className="space-y-2 md:col-span-3">
          <Label>Ville</Label>
          <Input
            value={values.city}
            onChange={(e) => update("city", e.target.value)}
            placeholder="Paris"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Consignes générales</Label>
        <Textarea
          value={values.instructions}
          onChange={(e) => update("instructions", e.target.value)}
          placeholder="Consignes, points de contrôle, contacts, zones sensibles…"
          rows={5}
        />
      </div>

      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-1">
          <div className="font-medium">Site actif</div>
          <div className="text-sm text-muted-foreground">
            Désactive un site sans le supprimer (historique conservé).
          </div>
        </div>
        <Switch
          checked={values.isActive}
          onCheckedChange={(checked) => update("isActive", Boolean(checked))}
        />
      </div>

      <Button type="submit" disabled={isSubmitting || !values.name.trim()}>
        {isSubmitting ? "Enregistrement..." : submitLabel}
      </Button>
    </form>
  );
}
