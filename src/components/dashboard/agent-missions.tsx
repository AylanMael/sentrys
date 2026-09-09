"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, MapPin, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth-provider";
import { apiFetch, getApiErrorMessage } from "@/lib/api/client-fetch";
import type { TerrainMission } from "@/lib/agents/terrain-mission";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type Page = { missions: TerrainMission[]; nextCursor: string | null; serverNow: number };
const dateTime = (value: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

export function AgentMissions() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [missions, setMissions] = useState<TerrainMission[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [incidentFor, setIncidentFor] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [now, setNow] = useState(Date.now());
  const generation = useRef(0);
  const clock = useRef({ server: Date.now(), local: Date.now() });
  const load = useCallback(async (after?: string) => {
    const request = ++generation.current;
    setLoading(true); setError("");
    try {
      const page = await apiFetch<Page>(`/api/agent-missions${after ? `?cursor=${encodeURIComponent(after)}` : ""}`);
      if (request !== generation.current) return;
      clock.current = { server: page.serverNow, local: Date.now() }; setNow(page.serverNow);
      setMissions(previous => after ? Array.from(new Map([...previous, ...page.missions].map(m => [m.id, m])).values()) : page.missions);
      setCursor(page.nextCursor);
    } catch (e) {
      if (request === generation.current) { setError(getApiErrorMessage(e)); if (!after) setMissions([]); }
    } finally { if (request === generation.current) setLoading(false); }
  }, []);
  useEffect(() => {
    setMissions([]); setCursor(null);
    if (user?.role !== "agent") { setLoading(false); return; }
    void load();
    const focus = () => { void load(); };
    window.addEventListener("focus", focus);
    const timer = window.setInterval(() => setNow(clock.current.server + Date.now() - clock.current.local), 1000);
    return () => { generation.current++; window.removeEventListener("focus", focus); window.clearInterval(timer); };
  }, [load, user?.uid, user?.agentId, user?.tenantId, user?.role, user?.tenant?.status, user?.tenant?.suspensionMode]);
  const phase = (m: TerrainMission) => m.status === "completed" || now >= Date.parse(m.endAt) ? "ended" : now < Date.parse(m.startAt) ? "upcoming" : "ongoing";
  const actionable = (m: TerrainMission) => m.canAct && phase(m) === "ongoing" && !loading && !error;
  async function point(m: TerrainMission) {
    if (pending || !actionable(m)) return;
    setPending(m.id);
    try {
      if (!navigator.geolocation) throw new Error("La géolocalisation n’est pas disponible dans ce navigateur.");
      const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }));
      await apiFetch(`/api/assignments/${m.id}/${m.status === "present" ? "check-out" : "check-in"}`, { method: "POST", body: { latitude: position.coords.latitude, longitude: position.coords.longitude } });
      toast({ title: "Pointage enregistré", description: m.status === "present" ? "Votre fin de service est enregistrée." : "Votre prise de service est enregistrée." });
      await load();
    } catch (e) {
      const code = e && typeof e === "object" && "code" in e ? e.code : null;
      toast({ variant: "destructive", title: "Pointage impossible", description: code === 1 ? "Autorisez la localisation dans votre navigateur pour pointer." : code === 2 || code === 3 ? "Position indisponible. Vérifiez votre GPS et réessayez." : getApiErrorMessage(e) });
    } finally { setPending(null); }
  }
  async function sendIncident(m: TerrainMission) {
    if (pending || !actionable(m)) return;
    setPending(m.id);
    try {
      await apiFetch("/api/incidents", { method: "POST", body: { title: "Signalement terrain", description, vacationId: m.vacationId, siteId: m.siteId, severity: "medium" } });
      toast({ title: "Incident enregistré" }); setIncidentFor(null); setDescription("");
    } catch (e) { toast({ variant: "destructive", title: "Déclaration impossible", description: getApiErrorMessage(e) }); }
    finally { setPending(null); }
  }
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Horaires en heure de Paris · Actions pendant la mission.</p><Button variant="outline" className="min-h-11 rounded-xl" disabled={loading || pending !== null} onClick={() => void load()}><RefreshCw aria-hidden="true" className="h-4 w-4" />Actualiser</Button></div>
    {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">{error}</p>}
    {loading && <p role="status">Chargement des missions…</p>}
    {!loading && !error && !missions.length && <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">Aucune mission disponible dans cette page d’affectations.</p>}
    {(["ongoing", "upcoming", "ended"] as const).map(group => {
      const rows = missions.filter(m => phase(m) === group).sort((a, b) => group === "ended" ? Date.parse(b.endAt) - Date.parse(a.endAt) : Date.parse(a.startAt) - Date.parse(b.startAt));
      if (!rows.length) return null;
      return <section key={group} className="space-y-3">
        <h2 className="text-lg font-semibold">{group === "ongoing" ? "En cours" : group === "upcoming" ? "À venir" : "Terminées"} <span className="text-sm font-normal text-muted-foreground">({rows.length})</span></h2>
        {rows.map(m => <article key={m.id} className="overflow-hidden rounded-2xl border bg-card shadow-sm"><div className="space-y-4 p-5">
          <div className="flex items-start gap-3"><span className="rounded-xl bg-primary/10 p-3 text-primary"><MapPin aria-hidden="true" className="h-5 w-5" /></span><div className="min-w-0"><h3 className="break-words font-semibold">{m.siteName}</h3><p className="mt-1 text-xs font-medium text-muted-foreground">{m.status === "completed" ? "Fin de service enregistrée" : group === "ended" ? "Période terminée · pointage fermé" : m.status === "present" ? "En service" : "Affectation confirmée"}</p></div></div>
          <p className="flex items-start gap-2 text-sm leading-6"><Clock aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" /><span>Du {dateTime(m.startAt)}<br />au {dateTime(m.endAt)}</span></p>
          {group === "ongoing" ? <div className="flex flex-col gap-3 sm:flex-row"><Button className="min-h-12 rounded-xl" disabled={!actionable(m) || pending !== null} onClick={() => void point(m)}>{pending === m.id ? "Traitement…" : m.status === "present" ? "Terminer mon service" : "Signaler ma présence"}</Button><Button variant="outline" className="min-h-12 rounded-xl" disabled={!actionable(m) || pending !== null} onClick={() => { setIncidentFor(m.id); setDescription(""); }}>Déclarer un incident</Button></div>
            : <p className="text-xs leading-5 text-muted-foreground">{group === "upcoming" ? "Le pointage sera disponible au début prévu. Actualisez à ce moment-là." : "Aucune action terrain disponible. Contactez votre responsable pour toute régularisation."}</p>}
          {group === "ongoing" && !m.canAct && <p className="text-sm text-muted-foreground">Actions indisponibles. Actualisez la liste ; en cas de suspension, contactez votre responsable.</p>}
        </div>{incidentFor === m.id && actionable(m) && <form className="space-y-3 border-t p-5" onSubmit={e => { e.preventDefault(); void sendIncident(m); }}><label htmlFor={`incident-${m.id}`} className="text-sm font-medium">Description de l’incident</label><Textarea id={`incident-${m.id}`} value={description} onChange={e => setDescription(e.target.value)} minLength={5} maxLength={5000} required disabled={pending !== null} /><div className="flex flex-wrap gap-2"><Button type="submit" disabled={pending !== null || description.trim().length < 5}>Enregistrer l’incident</Button><Button type="button" variant="ghost" disabled={pending !== null} onClick={() => setIncidentFor(null)}>Annuler</Button></div></form>}</article>)}
      </section>;
    })}
    {cursor && <div className="space-y-2"><p className="text-xs text-muted-foreground">D’autres affectations sont disponibles. Cette liste et ses compteurs sont partiels.</p><Button variant="outline" disabled={loading || pending !== null} onClick={() => void load(cursor)}>Charger les affectations suivantes</Button></div>}
  </div>;
}
