// src/app/dashboard/vacations/new/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  ArrowLeft,
  Save,
  CalendarPlus,
  AlertCircle,
  AlertTriangle,
  MapPin,
  Clock,
  Users,
  FileText,
  CheckCircle2,
  CalendarDays
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge"; // ✅ IMPORT AJOUTÉ ICI
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
import { cn } from "@/lib/utils";

/* ================= types ================= */

type SiteRow = { id: string; tenantId: string; name?: string; isActive?: boolean; city?: string | null; createdAt?: Timestamp; };
type AgentRow = { id: string; tenantId: string; firstName?: string | null; lastName?: string | null; status?: "active" | "inactive"; createdAt?: Timestamp; };
type VacationCreateBody = { siteId: string; title?: string | null; startAt: string; endAt: string; requiredAgents?: number; assignedAgentIds?: string[]; notes?: string | null; };
type OverlapApiItem = { agentId: string; withVacationId: string; withSiteId?: string | null; withSiteName?: string | null; withStatus?: string; withStartAtIso?: string | null; withEndAtIso?: string | null; };
type OverlapGroup = { agentId: string; agentName?: string | null; conflict: Array<{ vacationId: string; siteId?: string | null; siteName?: string | null; startAtIso: string; endAtIso: string; status?: string; }>; };
type OverlapsResponse = { ok: boolean; error?: string; overlaps?: OverlapApiItem[]; hasOverlaps?: boolean; count?: number; };

/* ================= utils ================= */

function normalizeText(v: any) { return String(v ?? "").trim(); }
function parseIntSafe(v: any, def: number) { const n = Number(v); if (!Number.isFinite(n)) return def; return Math.floor(n); }
function toLocalInput(d: Date) { const pad = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function localInputToIso(value: string): string | null { const s = normalizeText(value); if (!s) return null; const d = new Date(s); return Number.isFinite(d.getTime()) ? d.toISOString() : null; }
function agentLabel(a: AgentRow) { const fn = normalizeText(a.firstName); const ln = normalizeText(a.lastName); const full = `${fn} ${ln}`.trim(); return full || `Agent ${a.id.slice(0, 6)}`; }
function uniq(arr: string[]) { return Array.from(new Set(arr.map((x) => String(x)).filter(Boolean))); }

function groupOverlaps(input: { overlaps: OverlapApiItem[]; agents: AgentRow[]; }): OverlapGroup[] {
  const agentNameById = new Map<string, string>();
  input.agents.forEach((a) => agentNameById.set(a.id, agentLabel(a)));
  const map = new Map<string, OverlapGroup>();

  input.overlaps.forEach((o) => {
    const agentId = String(o.agentId ?? "").trim();
    if (!agentId) return;
    const g = map.get(agentId) ?? ({ agentId, agentName: agentNameById.get(agentId) ?? null, conflict: [] } as OverlapGroup);
    const startAtIso = o.withStartAtIso ?? null;
    const endAtIso = o.withEndAtIso ?? null;
    if (!startAtIso || !endAtIso) return;
    g.conflict.push({ vacationId: o.withVacationId, siteId: o.withSiteId ?? null, siteName: o.withSiteName ?? null, startAtIso, endAtIso, status: o.withStatus ?? undefined });
    map.set(agentId, g);
  });

  const out = Array.from(map.values());
  out.sort((a, b) => {
    if (b.conflict.length !== a.conflict.length) return b.conflict.length - a.conflict.length;
    return String(a.agentName ?? a.agentId).localeCompare(String(b.agentName ?? b.agentId));
  });
  out.forEach((g) => { g.conflict.sort((a, b) => new Date(a.startAtIso).getTime() - new Date(b.startAtIso).getTime()); });
  return out;
}

/* ================= page ================= */

export default function NewVacationPage() {
  const router = useRouter();
  const { user, getIdToken } = useAuth() as any;
  const { toast } = useToast();

  const role = String((user as any)?.role ?? "");
  const canWrite = role === "admin" || role === "manager";
  const tenantId = (user as any)?.tenantId as string | undefined;

  const [sites, setSites] = useState<SiteRow[]>([]);
  const [sitesLoading, setSitesLoading] = useState(true);
  const [sitesError, setSitesError] = useState<string | null>(null);

  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [agentsError, setAgentsError] = useState<string | null>(null);

  const [siteId, setSiteId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [requiredAgents, setRequiredAgents] = useState<number>(1);
  const [startLocal, setStartLocal] = useState<string>("");
  const [endLocal, setEndLocal] = useState<string>("");

  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [overlapLoading, setOverlapLoading] = useState(false);
  const [overlapError, setOverlapError] = useState<string | null>(null);
  const [overlaps, setOverlaps] = useState<OverlapGroup[]>([]);
  const hasOverlaps = overlaps.length > 0;
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (startLocal || endLocal) return;
    const now = new Date();
    const start = new Date(now.getTime() + 60 * 60 * 1000);
    const end = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    setStartLocal(toLocalInput(start));
    setEndLocal(toLocalInput(end));
  }, [startLocal, endLocal]);

  useEffect(() => {
    if (!tenantId) { setSites([]); setSitesLoading(false); return; }
    if (!db) { setSitesLoading(false); setSitesError("Firestore indisponible."); return; }
    setSitesLoading(true); setSitesError(null);
    const qy = query(collection(db, "sites"), where("tenantId", "==", tenantId), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(qy, (snap) => {
      const rows: SiteRow[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      rows.sort((a, b) => String(a.name ?? "").toLowerCase().localeCompare(String(b.name ?? "").toLowerCase()));
      setSites(rows); setSitesLoading(false);
      if (!siteId && rows.length === 1) setSiteId(rows[0].id);
    }, (err) => { setSitesError("Impossible de charger les sites."); setSitesLoading(false); });
    return () => unsub();
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) { setAgents([]); setAgentsLoading(false); return; }
    if (!db) { setAgentsLoading(false); setAgentsError("Firestore indisponible."); return; }
    setAgentsLoading(true); setAgentsError(null);
    const qy = query(collection(db, "agents"), where("tenantId", "==", tenantId), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(qy, (snap) => {
      const rows: AgentRow[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      rows.sort((a, b) => {
        const aa = String(a.status ?? "active") === "active" ? 0 : 1;
        const bb = String(b.status ?? "active") === "active" ? 0 : 1;
        if (aa !== bb) return aa - bb;
        return agentLabel(a).toLowerCase().localeCompare(agentLabel(b).toLowerCase());
      });
      setAgents(rows); setAgentsLoading(false);
      setSelectedAgentIds((prev) => {
        const allowed = new Set(rows.filter((a) => String(a.status ?? "active") === "active").map((a) => a.id));
        const next = prev.filter((id) => allowed.has(id));
        return next.length === prev.length ? prev : next;
      });
    }, (err) => { setAgentsError("Impossible de charger les agents."); setAgentsLoading(false); });
    return () => unsub();
  }, [tenantId]);

  const activeSites = useMemo(() => sites, [sites]);
  const startAtIso = useMemo(() => localInputToIso(startLocal) ?? "", [startLocal]);
  const endAtIso = useMemo(() => localInputToIso(endLocal) ?? "", [endLocal]);
  const isDateRangeValid = useMemo(() => {
    if (!startAtIso || !endAtIso) return false;
    return new Date(endAtIso).getTime() > new Date(startAtIso).getTime();
  }, [startAtIso, endAtIso]);

  useEffect(() => {
    let t: any;
    if (!user || !canWrite || !tenantId || !siteId || !startAtIso || !endAtIso || !isDateRangeValid || !selectedAgentIds.length) {
      setOverlaps([]); setOverlapError(null); return;
    }
    t = setTimeout(async () => {
      setOverlapLoading(true); setOverlapError(null);
      try {
        const token = typeof getIdToken === "function" ? await getIdToken() : await (user as any)?.getIdToken?.();
        if (!token) { setOverlapError("Token manquant."); setOverlaps([]); return; }
        const res = await fetch(`/api/vacations/_check-overlaps`, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ agentIds: uniq(selectedAgentIds).slice(0, 200), startAt: startAtIso, endAt: endAtIso, siteId }),
        });
        const data = (await res.json()) as OverlapsResponse;
        if (!res.ok || !data?.ok) { setOverlapError(data?.error ?? "Erreur vérification conflits."); setOverlaps([]); return; }
        setOverlaps(groupOverlaps({ overlaps: Array.isArray(data.overlaps) ? data.overlaps : [], agents }));
      } catch (e: any) { setOverlapError(e?.message ?? "Erreur réseau overlaps."); setOverlaps([]); } finally { setOverlapLoading(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [user, canWrite, tenantId, siteId, startAtIso, endAtIso, isDateRangeValid, selectedAgentIds, getIdToken, agents]);

  useEffect(() => { setOverlapError(null); setOverlaps([]); }, [siteId, startAtIso, endAtIso]);

  const isReady = useMemo(() => {
    if (!canWrite || !tenantId || !siteId || !startAtIso || !endAtIso || !isDateRangeValid) return false;
    if (selectedAgentIds.length > 0 && hasOverlaps) return false;
    return true;
  }, [canWrite, tenantId, siteId, startAtIso, endAtIso, isDateRangeValid, selectedAgentIds.length, hasOverlaps]);

  function toggleAgent(id: string) {
    setSelectedAgentIds((prev) => {
      const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return Array.from(s);
    });
  }

  async function submit() {
    if (!user || !tenantId || !canWrite) { toast({ title: "Erreur", description: "Problème d'accès ou de droits.", variant: "destructive" }); return; }
    if (!siteId) { toast({ title: "Champ requis", description: "Choisis un site.", variant: "destructive" }); return; }
    if (!startAtIso || !endAtIso || !isDateRangeValid) { toast({ title: "Erreur", description: "Dates invalidés.", variant: "destructive" }); return; }
    if (selectedAgentIds.length > 0 && hasOverlaps) { toast({ title: "Conflits", description: "Retire les agents en conflit.", variant: "destructive" }); return; }

    const reqAgents = Math.max(1, parseIntSafe(requiredAgents, 1));
    const cleanSelected = uniq(selectedAgentIds).slice(0, 200);

    if (cleanSelected.length > reqAgents) {
      toast({ title: "Trop d’agents", description: `Tu as sélectionné ${cleanSelected.length} agents pour ${reqAgents} requis.`, variant: "destructive" }); return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch<{ ok: boolean; error?: string; id?: string; vacation?: { id: string }; warnings?: any[]; }>(`/api/vacations`, {
        method: "POST",
        body: JSON.stringify({ siteId, title: normalizeText(title) || null, notes: normalizeText(notes) || null, startAt: startAtIso, endAt: endAtIso, requiredAgents: reqAgents, assignedAgentIds: cleanSelected.length ? cleanSelected : undefined }),
      });
      if (!res?.ok) { toast({ title: "Erreur", description: (res as any)?.error ?? "Création impossible.", variant: "destructive" }); return; }
      toast({ title: (res as any)?.warnings?.length ? "Créé avec avertissements" : "Vacation créée" });
      router.push("/dashboard/vacations");
    } catch (e: any) { toast({ title: "Erreur", description: e?.message, variant: "destructive" }); } finally { setSubmitting(false); }
  }

  if (!user) return <div className="p-8 text-muted-foreground">Vous devez être connecté.</div>;
  if (!canWrite) return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center animate-in fade-in zoom-in-95 duration-500">
      <div className="bg-destructive/10 p-6 rounded-full mb-6"><AlertTriangle className="h-12 w-12 text-destructive" /></div>
      <h2 className="text-2xl font-black tracking-tight mb-2">Accès refusé</h2>
      <p className="text-muted-foreground mb-8">Seuls les administrateurs et managers peuvent créer une vacation.</p>
      <Button asChild variant="outline" className="h-12 rounded-xl px-6 font-bold"><Link href="/dashboard/vacations"><ArrowLeft className="mr-2 h-4 w-4" /> Retour</Link></Button>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-24 w-full max-w-5xl mx-auto">

      {/* HEADER */}
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between bg-card p-6 md:p-8 rounded-[2rem] border shadow-sm ring-1 ring-black/5 bg-gradient-to-br from-card to-muted/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-start gap-4">
          <Button variant="outline" asChild className="h-9 rounded-xl px-4 font-bold border-muted-foreground/20 text-muted-foreground hover:text-foreground transition-all">
            <Link href="/dashboard/vacations"><ArrowLeft className="mr-2 h-4 w-4" /> Retour</Link>
          </Button>

          <div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-foreground flex items-center gap-3">
              <div className="bg-primary/10 p-2.5 rounded-xl border border-primary/20 text-primary hidden sm:flex"><CalendarPlus className="h-6 w-6" /></div>
              Planifier une vacation
            </h1>
            <p className="text-sm font-medium text-muted-foreground mt-2 max-w-xl">
              Définissez le lieu, les horaires et le besoin en effectif. Vous pourrez affecter des agents maintenant ou plus tard.
            </p>
          </div>
        </div>

        <div className="hidden md:flex relative z-10">
          <Button onClick={submit} disabled={!isReady || submitting} className="h-12 rounded-xl px-8 font-black shadow-lg shadow-primary/20 hover:translate-y-[-2px] active:scale-95 transition-all">
            {submitting ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Save className="h-5 w-5 mr-2" />} Créer la vacation
          </Button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">

        {/* COLONNE GAUCHE (PARAMÈTRES PRINCIPAUX) */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="rounded-[2rem] border-none shadow-xl shadow-black/[0.02] bg-background ring-1 ring-black/5 overflow-hidden">
            <div className="p-6 md:p-8 bg-muted/20 border-b flex items-center gap-3">
              <div className="bg-background p-2.5 rounded-xl shadow-sm"><MapPin className="h-5 w-5 text-primary" /></div>
              <h2 className="text-xl font-black tracking-tight">Paramètres Généraux</h2>
            </div>
            <CardContent className="p-6 md:p-8 space-y-6">

              <div className="space-y-3">
                <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Site d'intervention <span className="text-destructive">*</span></Label>
                {sitesLoading ? (
                  <div className="h-12 flex items-center px-4 rounded-xl bg-muted/30 text-sm font-medium text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2"/> Chargement...</div>
                ) : sitesError ? (
                  <div className="p-3 bg-destructive/10 text-destructive rounded-xl text-sm font-bold flex items-center gap-2"><AlertCircle className="h-4 w-4"/> {sitesError}</div>
                ) : activeSites.length === 0 ? (
                  <div className="p-3 bg-muted rounded-xl text-sm text-muted-foreground">Aucun site disponible.</div>
                ) : (
                  <Select value={siteId} onValueChange={setSiteId}>
                    <SelectTrigger className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-bold focus-visible:ring-primary/30">
                      <SelectValue placeholder="Choisir un site..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {activeSites.map((s) => (
                        <SelectItem key={s.id} value={s.id} className="font-medium">
                          {s.name ?? "Site sans nom"} {s.isActive === false ? " (Inactif)" : ""} {s.city ? ` - ${s.city}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Titre de la mission (Optionnel)</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Ronde de nuit + Filtrage" className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-bold focus-visible:ring-primary/30" />
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Effectif Requis <span className="text-destructive">*</span></Label>
                <Input type="number" min={1} max={200} value={requiredAgents} onChange={(e) => setRequiredAgents(Math.max(1, parseIntSafe(e.target.value, 1)))} className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-bold focus-visible:ring-primary/30" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border-none shadow-xl shadow-black/[0.02] bg-background ring-1 ring-black/5 overflow-hidden">
            <div className="p-6 md:p-8 bg-muted/20 border-b flex items-center gap-3">
              <div className="bg-background p-2.5 rounded-xl shadow-sm"><Clock className="h-5 w-5 text-primary" /></div>
              <h2 className="text-xl font-black tracking-tight">Horaires</h2>
            </div>
            <CardContent className="p-6 md:p-8 grid gap-6 sm:grid-cols-2">
              <div className="space-y-3">
                <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Heure de début <span className="text-destructive">*</span></Label>
                <Input type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-bold focus-visible:ring-primary/30" />
              </div>
              <div className="space-y-3">
                <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">Heure de fin <span className="text-destructive">*</span></Label>
                <Input type="datetime-local" value={endLocal} onChange={(e) => setEndLocal(e.target.value)} className={cn("h-12 rounded-xl border-muted-foreground/20 font-bold focus-visible:ring-primary/30", startAtIso && endAtIso && !isDateRangeValid ? "bg-destructive/10 border-destructive text-destructive" : "bg-muted/30")} />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border-none shadow-xl shadow-black/[0.02] bg-background ring-1 ring-black/5 overflow-hidden">
            <div className="p-6 md:p-8 bg-muted/20 border-b flex items-center gap-3">
              <div className="bg-background p-2.5 rounded-xl shadow-sm"><FileText className="h-5 w-5 text-primary" /></div>
              <h2 className="text-xl font-black tracking-tight">Consignes</h2>
            </div>
            <CardContent className="p-6 md:p-8">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ajoutez ici les consignes spécifiques, tenue exigée, matériel à prévoir..." rows={5} className="rounded-xl bg-muted/30 border-muted-foreground/20 font-medium resize-y focus-visible:ring-primary/30 p-4" />
            </CardContent>
          </Card>
        </div>

        {/* COLONNE DROITE (AFFECTATION RAPIDE) */}
        <div className="lg:col-span-5">
          <Card className="rounded-[2rem] border-none shadow-xl shadow-black/[0.02] bg-background ring-1 ring-black/5 overflow-hidden sticky top-24">
            <div className="p-6 bg-muted/20 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black tracking-tight flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> Pré-affectation</h2>
                <Badge variant="secondary" className="font-black">{selectedAgentIds.length} / {requiredAgents}</Badge>
              </div>
              <p className="text-xs font-medium text-muted-foreground mt-2">Vérification automatique des conflits d'agenda.</p>
            </div>

            <div className="p-4">
              {/* Box d'Alerte Overlap */}
              {selectedAgentIds.length > 0 && isDateRangeValid && (
                <div className="mb-4">
                  {overlapLoading ? (
                    <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground p-3 rounded-xl bg-muted/50"><Loader2 className="h-4 w-4 animate-spin"/> Analyse IA...</div>
                  ) : overlapError ? (
                    <div className="p-3 bg-destructive/10 text-destructive rounded-xl text-xs font-bold flex items-center gap-2"><AlertTriangle className="h-4 w-4"/> {overlapError}</div>
                  ) : hasOverlaps ? (
                    <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-200 text-sm">
                      <div className="flex items-center gap-2 font-black text-orange-600 mb-2"><AlertTriangle className="h-4 w-4" /> Conflit(s) d'agenda</div>
                      <div className="space-y-2">
                        {overlaps.map((o, idx) => (
                          <div key={idx} className="bg-background/80 p-2 rounded-lg text-xs font-medium">
                            <span className="font-bold">{o.agentName ?? o.agentId}</span> n'est pas disponible.
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-green-500/10 border border-green-200 text-green-700 rounded-xl text-xs font-bold flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" /> Aucun conflit détecté
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
                {agentsLoading ? (
                  <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : agents.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground italic">Aucun agent dans votre base.</div>
                ) : (
                  agents.map((a) => {
                    const inactive = String(a.status ?? "active") !== "active";
                    const checked = selectedAgentIds.includes(a.id);
                    return (
                      <label key={a.id} className={cn("flex items-center justify-between p-3 rounded-xl border border-transparent transition-all cursor-pointer", inactive ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/50", checked && "bg-primary/5 border-primary/20 hover:bg-primary/10")}>
                        <div className="flex items-center gap-3">
                          <input type="checkbox" className="h-4 w-4 rounded text-primary border-muted-foreground/30 focus:ring-primary" checked={checked} disabled={inactive} onChange={() => toggleAgent(a.id)} />
                          <div className="min-w-0">
                            <p className="font-bold text-sm truncate">{agentLabel(a)}</p>
                            {inactive && <p className="text-[10px] uppercase font-bold text-destructive">Inactif</p>}
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* STICKY BOTTOM BAR (Mobile) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-xl border-t z-50 flex gap-3">
        <Button variant="outline" onClick={() => router.back()} disabled={submitting} className="h-14 rounded-2xl font-bold flex-1">Annuler</Button>
        <Button onClick={submit} disabled={!isReady || submitting} className="h-14 rounded-2xl font-black shadow-xl shadow-primary/20 flex-1">
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />} Créer
        </Button>
      </div>

    </div>
  );
}
