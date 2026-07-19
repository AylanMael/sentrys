"use client";

import { useEffect, useMemo, useState } from "react";
import type { SiteEmergencyContact, SiteType } from "@/lib/sites/types";
import { useClientsLite } from "@/hooks/use-clients-lite";

import { Badge } from "@/components/ui/badge";
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
import { MapPin, PhoneCall, PlusCircle, Trash2 } from "lucide-react";

export type SiteFormValues = {
  name: string;

  // liaison structurée
  clientId: string | null;

  // dénormalisé (compat / affichage)
  clientName: string;

  siteType: SiteType;
  riskLevel: 1 | 2 | 3 | 4 | 5;
  address: string;
  city: string;
  postalCode: string;
  instructions: string;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  emergencyContacts: SiteEmergencyContact[];
};

const SITE_TYPES: { value: SiteType; label: string }[] = [
  { value: "bureaux", label: "Bureaux" },
  { value: "chantier", label: "Chantier" },
  { value: "boutique", label: "Boutique" },
  { value: "evenement", label: "Événement" },
  { value: "hotel", label: "Hôtel" },
  { value: "autre", label: "Autre" },
];

const NONE_VALUE = "__none__"; // ✅ valeur non vide imposée par Radix


function createEmptyEmergencyContact(priority: number): SiteEmergencyContact {
  return {
    name: "",
    role: "",
    phone: "",
    email: "",
    priority,
  };
}

function normalizeEmergencyContacts(contacts: SiteEmergencyContact[]) {
  return contacts
    .map((contact, index) => ({
      name: String(contact.name ?? "").trim(),
      role: String(contact.role ?? "").trim() || null,
      phone: String(contact.phone ?? "").trim() || null,
      email: String(contact.email ?? "").trim() || null,
      priority: Number.isFinite(Number(contact.priority))
        ? Math.min(Math.max(Math.floor(Number(contact.priority)), 1), 20)
        : index + 1,
    }))
    .filter((contact) => contact.name && (contact.phone || contact.email))
    .slice(0, 10);
}
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
  // ✅ charge la liste clients via API /api/clients
  const {
    items: clients,
    loading: clientsLoading,
    error: clientsError,
  } = useClientsLite({ status: "active", limit: 200 });

  const defaults: SiteFormValues = useMemo(
    () => ({
      name: initialValues?.name ?? "",
      clientId: initialValues?.clientId ?? null,
      clientName: initialValues?.clientName ?? "",
      siteType: initialValues?.siteType ?? "bureaux",
      riskLevel: initialValues?.riskLevel ?? 3,
      address: initialValues?.address ?? "",
      city: initialValues?.city ?? "",
      postalCode: initialValues?.postalCode ?? "",
      instructions: initialValues?.instructions ?? "",
      latitude: initialValues?.latitude ?? null,
      longitude: initialValues?.longitude ?? null,
      isActive: initialValues?.isActive ?? true,
      emergencyContacts: initialValues?.emergencyContacts ?? [],
    }),
    [initialValues]
  );

  const [values, setValues] = useState<SiteFormValues>(defaults);

  // ✅ resync quand initialValues change (page détail)
  useEffect(() => {
    setValues(defaults);
  }, [defaults]);

  function update<K extends keyof SiteFormValues>(
    key: K,
    value: SiteFormValues[K]
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }


  function updateEmergencyContact(
    index: number,
    key: keyof SiteEmergencyContact,
    value: string | number | null
  ) {
    setValues((prev) => ({
      ...prev,
      emergencyContacts: prev.emergencyContacts.map((contact, itemIndex) =>
        itemIndex === index ? { ...contact, [key]: value } : contact
      ),
    }));
  }

  function addEmergencyContact() {
    setValues((prev) => ({
      ...prev,
      emergencyContacts: [
        ...prev.emergencyContacts,
        createEmptyEmergencyContact(prev.emergencyContacts.length + 1),
      ].slice(0, 10),
    }));
  }

  function removeEmergencyContact(index: number) {
    setValues((prev) => ({
      ...prev,
      emergencyContacts: prev.emergencyContacts.filter((_, itemIndex) => itemIndex !== index),
    }));
  }
  function onClientSelect(v: string) {
    if (v === NONE_VALUE) {
      update("clientId", null);
      update("clientName", "");
      return;
    }
    const c = clients.find((x) => x.id === v);
    update("clientId", v);
    update("clientName", c?.name ?? "");
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
      emergencyContacts: normalizeEmergencyContacts(values.emergencyContacts),
    });
  }

  // ✅ valeur affichée par le Select : soit id client, soit "__none__"
  const selectClientValue = values.clientId ? values.clientId : NONE_VALUE;

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

          <Select
            value={selectClientValue}
            onValueChange={onClientSelect}
            disabled={clientsLoading}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={clientsLoading ? "Chargement…" : "Choisir un client"}
              />
            </SelectTrigger>

            <SelectContent>
              {/* ✅ pas de value="" */}
              <SelectItem value={NONE_VALUE}>Aucun</SelectItem>

              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* ✅ feedback si API clients KO / vide */}
          {clientsError ? (
            <div className="text-xs text-destructive">
              Impossible de charger la liste des clients : {clientsError}
            </div>
          ) : null}

          {!clientsLoading && !clientsError && clients.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              Aucun client disponible (ou accès insuffisant).
            </div>
          ) : null}

          {/* fallback manuel */}
          <div className="mt-2">
            <Input
              value={values.clientName}
              onChange={(e) => update("clientName", e.target.value)}
              placeholder="Ou saisir le nom du client"
            />
          </div>
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

      <div className="grid gap-4 md:grid-cols-2 p-4 bg-primary/5 rounded-xl border border-primary/10">
        <div className="md:col-span-2">
          <h3 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2 mb-2">
            <MapPin className="h-4 w-4" /> Géolocalisation (Geofencing)
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Indiquez les coordonnées exactes du site pour permettre la validation automatique du pointage des agents par GPS.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Latitude</Label>
          <Input
            type="number"
            step="any"
            value={values.latitude ?? ""}
            onChange={(e) => update("latitude", e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="Ex: 48.8566"
          />
        </div>
        <div className="space-y-2">
          <Label>Longitude</Label>
          <Input
            type="number"
            step="any"
            value={values.longitude ?? ""}
            onChange={(e) => update("longitude", e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="Ex: 2.3522"
          />
        </div>
      </div>


      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
              <PhoneCall className="h-4 w-4" /> Contacts d'urgence
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Personnes a appeler en priorite en cas d'incident grave, effraction, incendie ou doute terrain.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addEmergencyContact}
            disabled={values.emergencyContacts.length >= 10}
            className="shrink-0 rounded-lg text-xs font-bold"
          >
            <PlusCircle className="mr-2 h-3.5 w-3.5" /> Ajouter
          </Button>
        </div>

        {values.emergencyContacts.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-background/60 p-4 text-sm text-muted-foreground">
            Aucun contact d'urgence renseigné. Ajoutez au moins un contact client joignable hors horaires ouvrables.
          </div>
        ) : (
          <div className="space-y-3">
            {values.emergencyContacts.map((contact, index) => (
              <div key={index} className="rounded-xl border bg-background/80 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <Badge className="border-none bg-amber-500/10 text-[10px] font-black uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
                    Priorite {index + 1}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeEmergencyContact(index)}
                    className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
                    aria-label="Supprimer ce contact"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nom</Label>
                    <Input
                      value={contact.name ?? ""}
                      onChange={(e) => updateEmergencyContact(index, "name", e.target.value)}
                      placeholder="Ex: Marie Dupont"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Fonction</Label>
                    <Input
                      value={contact.role ?? ""}
                      onChange={(e) => updateEmergencyContact(index, "role", e.target.value)}
                      placeholder="Ex: Directrice sécurité"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Telephone</Label>
                    <Input
                      value={contact.phone ?? ""}
                      onChange={(e) => updateEmergencyContact(index, "phone", e.target.value)}
                      placeholder="Ex: 06 00 00 00 00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={contact.email ?? ""}
                      onChange={(e) => updateEmergencyContact(index, "email", e.target.value)}
                      placeholder="contact@client.fr"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
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
