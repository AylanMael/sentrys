"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, PlusCircle, Save } from "lucide-react";

import { apiFetch } from "@/lib/api/client-fetch";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type SiteApi = { id: string; name?: string; clientName?: string | null; city?: string | null };

function toLocalInputValue(d: Date) {
  // yyyy-MM-ddTHH:mm (local)
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CreateVacationDialog({ onCreated }: { onCreated?: () => void }) {
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [sitesLoading, setSitesLoading] = useState(false);
  const [sites, setSites] = useState<SiteApi[]>([]);

  const [siteId, setSiteId] = useState<string>("");
  const [startAt, setStartAt] = useState<string>(() => toLocalInputValue(new Date()));
  const [endAt, setEndAt] = useState<string>(() => toLocalInputValue(new Date(Date.now() + 2 * 60 * 60 * 1000)));
  const [requiredAgents, setRequiredAgents] = useState<number>(1);
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (!open) return;

    setSitesLoading(true);
    (async () => {
      try {
        const data = await apiFetch<{ ok: boolean; sites?: any[]; error?: string }>(`/api/sites?max=200&isActive=true`);
        if (!data.ok) {
          setSites([]);
          toast({ title: "Erreur", description: data.error ?? "Impossible de charger les sites.", variant: "destructive" });
          return;
        }
        const rows = (data.sites ?? []).map((s: any) => ({
          id: s.id,
          name: s.name ?? "",
          clientName: s.clientName ?? null,
          city: s.city ?? null,
        }));
        rows.sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), "fr"));
        setSites(rows);
      } catch (e: any) {
        setSites([]);
        toast({ title: "Erreur", description: e?.message ?? "Impossible de charger les sites.", variant: "destructive" });
      } finally {
        setSitesLoading(false);
      }
    })();
  }, [open, toast]);

  const selectedSite = useMemo(() => sites.find((s) => s.id === siteId), [sites, siteId]);

  async function create() {
    if (!siteId) {
      toast({ title: "Champ requis", description: "Sélectionne un site.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      // input datetime-local => local time. On convertit en ISO (Date interprète local)
      const startIso = new Date(startAt).toISOString();
      const endIso = new Date(endAt).toISOString();

      const payload = {
        siteId,
        siteName: selectedSite?.name ?? null,
        startAt: startIso,
        endAt: endIso,
        requiredAgents,
        notes: notes.trim() || null,
      };

      const res = await apiFetch<{ ok: boolean; error?: string }>(`/api/vacations`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        toast({
          title: "Erreur",
          description: (res as any).error ?? "Création impossible.",
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Créée", description: "Vacation créée avec succès." });
      setOpen(false);
      onCreated?.();
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.message ?? "Création impossible.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <PlusCircle className="h-4 w-4" />
          Nouvelle vacation
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Créer une vacation</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Site</Label>
            {sitesLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement des sites…
              </div>
            ) : (
              <Select value={siteId} onValueChange={setSiteId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un site" />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name || s.id}
                      {s.city ? ` — ${s.city}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Début</Label>
              <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Fin</Label>
              <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Nombre d’agents requis</Label>
            <Input
              type="number"
              min={1}
              max={200}
              value={requiredAgents}
              onChange={(e) => setRequiredAgents(Math.max(1, Number(e.target.value || 1)))}
            />
            <p className="text-xs text-muted-foreground">
              Le statut sera calculé automatiquement (planifiée / partielle / complète).
            </p>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Consignes, tenue, accès..." />
          </div>

          <div className="flex justify-end">
            <Button onClick={create} disabled={saving || sitesLoading} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Créer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
