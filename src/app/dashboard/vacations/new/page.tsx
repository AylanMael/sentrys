"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, Save, CalendarPlus, AlertCircle } from "lucide-react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  type Timestamp,
} from "firebase/firestore";

import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api/client-fetch";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

/* ================= types ================= */

type SiteRow = {
  id: string;
  tenantId: string;
  name?: string;
  isActive?: boolean;
  city?: string | null;
  createdAt?: Timestamp;
};

type VacationCreateBody = {
  siteId: string;
  title?: string | null;
  startAt: string; // ISO
  endAt: string; // ISO
  requiredAgents?: number;
  assignedAgentIds?: string[];
  notes?: string | null;
};

function normalizeText(v: any) {
  return String(v ?? "").trim();
}

function parseIntSafe(v: any, def: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.floor(n);
}

/**
 * Convertit un "datetime-local" (ex: 2026-02-01T14:30)
 * en ISO string locale -> Date -> ISO (UTC).
 */
function localInputToIso(value: string): string | null {
  const s = normalizeText(value);
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export default function NewVacationPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const role = String((user as any)?.role ?? "");
  const canWrite = role === "admin" || role === "manager";

  // ---- Sites list ----
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [sitesLoading, setSitesLoading] = useState(true);
  const [sitesError, setSitesError] = useState<string | null>(null);

  // ---- Form state ----
  const [siteId, setSiteId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [requiredAgents, setRequiredAgents] = useState<number>(1);
  const [startLocal, setStartLocal] = useState<string>("");
  const [endLocal, setEndLocal] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);

  const tenantId = (user as any)?.tenantId as string | undefined;

  // Default dates (propre UX): maintenant + 1h, puis +2h
  useEffect(() => {
    if (startLocal || endLocal) return;

    const now = new Date();
    const start = new Date(now.getTime() + 60 * 60 * 1000);
    const end = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const toLocalInput = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, "0");
      const yyyy = d.getFullYear();
      const mm = pad(d.getMonth() + 1);
      const dd = pad(d.getDate());
      const hh = pad(d.getHours());
      const mi = pad(d.getMinutes());
      return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
    };

    setStartLocal(toLocalInput(start));
    setEndLocal(toLocalInput(end));
  }, [startLocal, endLocal]);

  // ---- Load sites (tenant) ----
  useEffect(() => {
    if (!tenantId) {
      setSites([]);
      setSitesLoading(false);
      return;
    }
    if (!db) {
      setSitesLoading(false);
      setSitesError("Firestore indisponible (config Firebase).");
      return;
    }

    setSitesLoading(true);
    setSitesError(null);

    const qy = query(
      collection(db, "sites"),
      where("tenantId", "==", tenantId),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const rows: SiteRow[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));

        // Tri alpha par name (UX)
        rows.sort((a, b) =>
          String(a.name ?? "").toLowerCase().localeCompare(String(b.name ?? "").toLowerCase())
        );

        setSites(rows);
        setSitesLoading(false);

        // auto-select si un seul site
        if (!siteId && rows.length === 1) setSiteId(rows[0].id);
      },
      (err) => {
        console.error("Sites onSnapshot error:", err);
        setSitesError(
          err?.message?.includes("Missing or insufficient permissions")
            ? "Permissions insuffisantes pour lire les sites (rules Firestore)."
            : "Impossible de charger la liste des sites."
        );
        setSitesLoading(false);
      }
    );

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const activeSites = useMemo(() => {
    // On affiche tout, mais on marque inactif et on peut désactiver la sélection si tu veux.
    return sites;
  }, [sites]);

  const isReady = useMemo(() => {
    if (!canWrite) return false;
    if (!tenantId) return false;
    if (!siteId) return false;

    const startIso = localInputToIso(startLocal);
    const endIso = localInputToIso(endLocal);
    if (!startIso || !endIso) return false;

    const start = new Date(startIso);
    const end = new Date(endIso);
    if (end.getTime() <= start.getTime()) return false;

    return true;
  }, [canWrite, tenantId, siteId, startLocal, endLocal]);

  async function submit() {
    if (!user) {
      toast({
        title: "Non connecté",
        description: "Veuillez vous reconnecter.",
        variant: "destructive",
      });
      return;
    }
    if (!canWrite) {
      toast({
        title: "Accès refusé",
        description: "Droits insuffisants (admin/manager requis).",
        variant: "destructive",
      });
      return;
    }
    if (!tenantId) {
      toast({
        title: "Profil incomplet",
        description: "tenantId manquant (provisioning).",
        variant: "destructive",
      });
      return;
    }

    const startAt = localInputToIso(startLocal);
    const endAt = localInputToIso(endLocal);

    if (!siteId) {
      toast({ title: "Erreur", description: "Choisis un site.", variant: "destructive" });
      return;
    }
    if (!startAt || !endAt) {
      toast({ title: "Erreur", description: "Dates invalides.", variant: "destructive" });
      return;
    }
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      toast({
        title: "Erreur",
        description: "La date de fin doit être après la date de début.",
        variant: "destructive",
      });
      return;
    }

    const reqAgents = Math.max(1, parseIntSafe(requiredAgents, 1));

    const body: VacationCreateBody = {
      siteId,
      title: normalizeText(title) || null,
      notes: normalizeText(notes) || null,
      startAt,
      endAt,
      requiredAgents: reqAgents,
      // assignedAgentIds: [] // (optionnel) : on peut le faire plus tard sur l'écran détail
    };

    setSubmitting(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        error?: string;
        vacation?: { id: string };
        warnings?: any[];
      }>(`/api/vacations`, {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        toast({
          title: "Erreur",
          description: res.error ?? "Création impossible.",
          variant: "destructive",
        });
        return;
      }

      // warnings (agents rejetés etc.) -> ici normalement vide car on n'envoie pas assignedAgentIds
      if (res.warnings?.length) {
        toast({
          title: "Créé (avec avertissements)",
          description: "La vacation a été créée, mais certains éléments ont été ajustés.",
        });
      } else {
        toast({ title: "Créé", description: "La vacation a été créée." });
      }

      router.push("/dashboard/vacations");
    } catch (e: any) {
      console.error(e);
      toast({
        title: "Erreur",
        description: e?.message ?? "Création impossible.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) {
    return (
      <div className="rounded-lg border p-6 text-sm text-muted-foreground">
        Vous devez être connecté.
      </div>
    );
  }

  if (!canWrite) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border p-6 text-sm text-muted-foreground">
          Accès refusé : droits admin/manager requis.
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/vacations">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour au planning
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <Button asChild variant="outline">
            <Link href="/dashboard/vacations">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <CalendarPlus className="h-5 w-5" />
            Nouvelle vacation
          </h1>
          <p className="text-sm text-muted-foreground">
            Crée une vacation (site + dates + besoin). Tu pourras affecter les agents ensuite.
          </p>
        </div>

        <Button onClick={submit} disabled={!isReady || submitting} className="gap-2">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Créer
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informations</CardTitle>
          <CardDescription>Renseigne les paramètres de la vacation.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Site */}
          <div className="space-y-2">
            <Label>Site *</Label>

            {sitesLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement des sites…
              </div>
            ) : sitesError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
                  <div className="space-y-1">
                    <p className="font-medium text-destructive">Erreur</p>
                    <p className="text-muted-foreground">{sitesError}</p>
                  </div>
                </div>
              </div>
            ) : activeSites.length === 0 ? (
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                Aucun site trouvé. Crée d’abord un site.
              </div>
            ) : (
              <Select value={siteId} onValueChange={setSiteId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un site" />
                </SelectTrigger>
                <SelectContent>
                  {activeSites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {String(s.name ?? "Site sans nom")}
                      {s.isActive === false ? " (Inactif)" : ""}
                      {s.city ? ` — ${s.city}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <Separator />

          {/* Titre + Required */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2 md:col-span-2">
              <Label>Titre</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Nuit – Rondes + accueil"
              />
              <p className="text-xs text-muted-foreground">
                Optionnel. Utile pour distinguer plusieurs vacations sur un même site.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Agents requis *</Label>
              <Input
                type="number"
                min={1}
                max={200}
                value={requiredAgents}
                onChange={(e) => setRequiredAgents(parseIntSafe(e.target.value, 1))}
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Début *</Label>
              <Input
                type="datetime-local"
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Fin *</Label>
              <Input
                type="datetime-local"
                value={endLocal}
                onChange={(e) => setEndLocal(e.target.value)}
              />
              {startLocal && endLocal ? (
                (() => {
                  const s = localInputToIso(startLocal);
                  const en = localInputToIso(endLocal);
                  if (!s || !en) return null;
                  if (new Date(en).getTime() <= new Date(s).getTime()) {
                    return (
                      <p className="text-xs text-destructive">
                        La fin doit être après le début.
                      </p>
                    );
                  }
                  return null;
                })()
              ) : null}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Consignes, matériel, tenue, point de rendez-vous…"
              rows={4}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
