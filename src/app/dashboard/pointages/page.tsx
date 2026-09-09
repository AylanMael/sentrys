"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, RefreshCw, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-provider";
import { canReadBackoffice } from "@/lib/auth/role";
import { apiFetch, getApiErrorMessage } from "@/lib/api/client-fetch";
import { attendanceLabels, type AttendanceRow } from "@/lib/agents/attendance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Page = { rows: AttendanceRow[]; nextCursor: string | null; unavailable: number; serverNow: number };
const stamp = (value: string | null) => value ? new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
}).format(new Date(value)) : "Non enregistré";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");

export default function PointagesPage() {
  const { user } = useAuth();
  const allowed = canReadBackoffice(user?.role);
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(0);
  const [synced, setSynced] = useState<number | null>(null);
  const [agent, setAgent] = useState("");
  const [site, setSite] = useState("");
  const sequence = useRef(0);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const load = useCallback(async (after?: string) => {
    const request = ++sequence.current;
    setLoading(true); setError("");
    if (!after) { setRows([]); setCursor(null); setUnavailable(0); setSynced(null); }
    try {
      const page = await apiFetch<Page>(`/api/attendance?date=${encodeURIComponent(date)}${after ? `&cursor=${encodeURIComponent(after)}` : ""}`);
      if (request !== sequence.current) return;
      setRows(previous => after ? [...new Map([...previous, ...page.rows].map(row => [row.id, row])).values()] : page.rows);
      setUnavailable(previous => after ? previous + page.unavailable : page.unavailable);
      setCursor(page.nextCursor); setSynced(page.serverNow);
    } catch (e) {
      if (request === sequence.current) setError(getApiErrorMessage(e));
    } finally { if (request === sequence.current) setLoading(false); }
  }, [date]);
  useEffect(() => {
    setRows([]); setCursor(null); setSynced(null);
    if (allowed && date) void load();
    return invalidate;
  }, [load, invalidate, allowed, date, user?.uid, user?.tenantId, user?.tenant?.status, user?.tenant?.suspensionMode]);
  const filtered = rows.filter(row => normalize(row.agentName).includes(normalize(agent)) && normalize(row.siteName).includes(normalize(site)));
  const attention = rows.filter(row => ["not_checked_in", "missing_out", "inconsistent"].includes(row.status)).length;
  if (!allowed) return <div className="rounded-2xl border bg-card p-8"><h1 className="text-xl font-semibold">Pointages</h1><p className="mt-2 text-muted-foreground">Cette vue est réservée aux responsables autorisés de l’agence.</p></div>;
  return <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
    <header className="relative overflow-hidden rounded-3xl border border-primary/15 bg-card p-6 shadow-sm sm:p-8">
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-5">
        <div><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary"><ShieldCheck className="h-4 w-4" aria-hidden="true" />Suivi terrain · Lecture seule</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Pointages</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Qui a pris son service ? Qui a terminé ? Retrouvez les horaires prévus et les pointages enregistrés, agent par agent.</p></div>
        <Button variant="outline" className="min-h-11 rounded-xl" disabled={loading || !date} onClick={() => void load()}><RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} aria-hidden="true" />Actualiser</Button>
      </div>
      <div className="relative mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[["Affectations chargées", rows.length], ["En service", rows.filter(r => r.status === "on_duty").length], ["À contrôler", attention]].map(([label, count]) =>
          <div key={label} className="rounded-2xl border bg-background/70 p-4"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{count}</p></div>)}
      </div>
      <p className="relative mt-3 text-xs text-muted-foreground">{synced ? `Dernière lecture : ${stamp(new Date(synced).toISOString())} · Paris.` : "Chargement initial."} Compteurs limités aux lignes chargées, sans actualisation automatique.</p>
    </header>

    <section aria-label="Filtres des pointages" className="space-y-4 rounded-2xl border bg-card p-5">
      <div className="grid gap-4 md:grid-cols-3">
        <div><label htmlFor="attendance-date" className="text-sm font-medium">Date de début des missions · Paris</label><Input id="attendance-date" type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-2 min-h-11" /></div>
        <div><label htmlFor="attendance-agent" className="text-sm font-medium">Agent · lignes chargées</label><Input id="attendance-agent" value={agent} onChange={e => setAgent(e.target.value)} placeholder="Rechercher un nom" className="mt-2 min-h-11" /></div>
        <div><label htmlFor="attendance-site" className="text-sm font-medium">Site · lignes chargées</label><Input id="attendance-site" value={site} onChange={e => setSite(e.target.value)} placeholder="Rechercher un site" className="mt-2 min-h-11" /></div>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">Pour une mission de nuit, sélectionnez sa date de début. Cette vue suit les affectations actuelles du planning ; les anciennes affectations retirées restent consultables dans les traces d’audit.</p>
    </section>

    {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">{error} Les données affichées peuvent ne plus être à jour.</p>}
    {unavailable > 0 && <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">{unavailable} élément(s) non restitué(s) en raison de données incohérentes. Le suivi est incomplet ; vérifiez les affectations avec un administrateur.</p>}
    {loading && <p role="status" className="text-sm text-muted-foreground">Chargement des pointages…</p>}
    {!loading && !error && !filtered.length && <div className="rounded-2xl border border-dashed bg-card p-10 text-center"><CalendarClock aria-hidden="true" className="mx-auto mb-3 h-8 w-8 text-primary" /><h2 className="font-semibold">Aucun résultat dans les lignes chargées</h2><p className="mt-2 text-sm text-muted-foreground">{cursor ? "Chargez la suite pour poursuivre la recherche." : "Vérifiez la date, les filtres et les affectations du planning."}</p></div>}

    <section aria-label="Liste des pointages" className="space-y-3">
      {filtered.map(row => <article key={row.id} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-5 py-4">
          <div><Link href={`/dashboard/agents/${encodeURIComponent(row.agentId)}`} className="font-semibold underline-offset-4 hover:underline focus-visible:underline">{row.agentName}</Link><p className="mt-1 text-sm text-muted-foreground"><Link href={`/dashboard/sites/${encodeURIComponent(row.siteId)}`} className="hover:underline">{row.siteName}</Link></p></div>
          <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", row.status === "on_duty" ? "border-primary/25 bg-primary/10 text-primary" : row.status === "completed" ? "border-emerald-600/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : ["missing_out", "inconsistent", "not_checked_in"].includes(row.status) ? "border-amber-600/25 bg-amber-500/10 text-amber-800 dark:text-amber-200" : "text-muted-foreground")}>{attendanceLabels[row.status]}</span>
        </div>
        <dl className="grid gap-5 p-5 sm:grid-cols-3">
          <div><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Horaires prévus</dt><dd className="mt-2 text-sm tabular-nums">{stamp(row.startAt)}<br />→ {stamp(row.endAt)}</dd></div>
          <div><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prise de service réelle</dt><dd className="mt-2 text-sm font-medium tabular-nums">{stamp(row.checkedInAt)}</dd></div>
          <div><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fin de service réelle</dt><dd className="mt-2 text-sm font-medium tabular-nums">{stamp(row.checkedOutAt)}</dd></div>
        </dl>
      </article>)}
    </section>
    {cursor && <div className="text-center"><Button variant="outline" className="min-h-11 rounded-xl" disabled={loading} onClick={() => void load(cursor)}>Charger les missions suivantes</Button><p className="mt-2 text-xs text-muted-foreground">Liste et compteurs encore partiels.</p></div>}
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t pt-5 text-sm text-muted-foreground"><span>Une ligne par agent et mission · Horaires en heure de Paris.</span><Link className="inline-flex min-h-11 items-center gap-2 font-medium text-primary hover:underline" href="/dashboard/activity">Journal d’activité et audit <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link></footer>
  </main>;
}
