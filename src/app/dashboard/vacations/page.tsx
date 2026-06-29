"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Loader2,
  PlusCircle,
  Filter,
  CalendarClock,
  Building2,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";

import { apiFetch } from "@/lib/api/client-fetch";
import { useAuth } from "@/lib/auth-provider";
import { canManagePlanning, normalizeRole } from "@/lib/auth/role";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/* ================= types ================= */

type VacationStatus =
  | "planned"
  | "partially_filled"
  | "filled"
  | "closed"
  | "cancelled";

type SiteApi = {
  id: string;
  name?: string;
  clientName?: string | null;
  city?: string | null;
  isActive?: boolean;
};

type VacationApi = {
  id: string;
  siteId: string;
  siteName?: string | null;
  startAtIso?: string | null;
  endAtIso?: string | null;
  requiredAgents?: number;
  assignedAgentIds?: string[];
  status?: VacationStatus;
  notes?: string | null;
};

const STATUS_OPTIONS: Array<{ value: "all" | VacationStatus; label: string }> = [
  { value: "all", label: "Toutes les vacations" },
  { value: "planned", label: "Planifiée" },
  { value: "partially_filled", label: "Partiellement remplie" },
  { value: "filled", label: "Complète" },
  { value: "closed", label: "Clôturée" },
  { value: "cancelled", label: "Annulée" },
];

/* ================= helpers ================= */

function isoToDate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

function toDateTimeLocalValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function statusBadge(status?: VacationStatus) {
  switch (status) {
    case "filled":
      return (
        <Badge className="bg-green-500/10 text-green-700 border-transparent hover:bg-green-500/20 font-bold px-2.5">
          Complète
        </Badge>
      );
    case "partially_filled":
      return (
        <Badge className="bg-blue-500/10 text-blue-700 border-transparent hover:bg-blue-500/20 font-bold px-2.5">
          Partielle
        </Badge>
      );
    case "planned":
      return (
        <Badge className="bg-muted text-muted-foreground border-transparent hover:bg-muted/80 font-bold px-2.5">
          Planifiée
        </Badge>
      );
    case "closed":
      return (
        <Badge variant="outline" className="text-muted-foreground font-bold px-2.5 opacity-60">
          Clôturée
        </Badge>
      );
    case "cancelled":
      return (
        <Badge className="bg-destructive/10 text-destructive border-transparent hover:bg-destructive/20 font-bold px-2.5 line-through">
          Annulée
        </Badge>
      );
    default:
      return <Badge variant="outline">—</Badge>;
  }
}

function safeNumber(v: unknown, def: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function normalizeText(v: unknown) {
  return String(v ?? "").trim();
}

/* ================= component ================= */

export default function VacationsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const aliveRef = useRef(true);

  const role = useMemo(
    () => normalizeRole((user as any)?.role) ?? "client",
    [user]
  );
  const canWrite = useMemo(() => canManagePlanning(role), [role]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // DATA
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<VacationApi[]>([]);
  const [error, setError] = useState<string | null>(null);

  // FILTRES
  const [siteId, setSiteId] = useState<string>("all");
  const [status, setStatus] = useState<"all" | VacationStatus>("all");

  // SITES DROPDOWN
  const [sitesLoading, setSitesLoading] = useState(false);
  const [sites, setSites] = useState<SiteApi[]>([]);

  // CREATION
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const defaultStart = useMemo(() => toDateTimeLocalValue(new Date()), []);
  const defaultEnd = useMemo(
    () => toDateTimeLocalValue(new Date(Date.now() + 2 * 60 * 60 * 1000)),
    []
  );

  const [cSiteId, setCSiteId] = useState<string>("");
  const [cStart, setCStart] = useState<string>(defaultStart);
  const [cEnd, setCEnd] = useState<string>(defaultEnd);
  const [cRequired, setCRequired] = useState<number>(1);
  const [cNotes, setCNotes] = useState<string>("");

  const siteLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sites) map.set(s.id, s.name ?? s.id);
    return map;
  }, [sites]);

  const queryString = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set("max", "200");
    if (siteId !== "all") qs.set("siteId", siteId);
    qs.set("status", status === "all" ? "all" : status);
    return qs.toString();
  }, [siteId, status]);

  const loadVacations = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await apiFetch<{
        ok: boolean;
        vacations?: VacationApi[];
        error?: string;
      }>(`/api/vacations?${queryString}`);

      if (!aliveRef.current) return;

      if (!data.ok) {
        setRows([]);
        setError(data.error ?? "Impossible de charger les vacations.");
        return;
      }

      setRows(data.vacations ?? []);
    } catch (e: any) {
      if (!aliveRef.current) return;
      setRows([]);
      setError(e?.message ?? "Impossible de charger les vacations.");
    } finally {
      if (!aliveRef.current) return;
      setLoading(false);
    }
  }, [queryString]);

  const loadSitesOnce = useCallback(async () => {
    setSitesLoading(true);

    try {
      const data = await apiFetch<{
        ok: boolean;
        sites?: any[];
        error?: string;
      }>(`/api/sites?max=200&isActive=true`);

      if (!aliveRef.current) return;

      if (!data.ok) {
        setSites([]);
        toast({
          title: "Erreur",
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      const list: SiteApi[] = (data.sites ?? []).map((s: any) => ({
        id: s.id,
        name: s.name ?? "",
        clientName: s.clientName ?? null,
        city: s.city ?? null,
        isActive: Boolean(s.isActive ?? true),
      }));

      list.sort((a, b) =>
        String(a.name ?? "")
          .toLowerCase()
          .localeCompare(String(b.name ?? "").toLowerCase())
      );

      setSites(list);
    } catch (e: any) {
      if (!aliveRef.current) return;
      setSites([]);
      toast({
        title: "Erreur",
        description: e?.message,
        variant: "destructive",
      });
    } finally {
      if (!aliveRef.current) return;
      setSitesLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadSitesOnce();
  }, [loadSitesOnce]);

  useEffect(() => {
    void loadVacations();
  }, [loadVacations]);

  useEffect(() => {
    if (!createOpen) return;
    if (siteId !== "all") {
      setCSiteId(siteId);
      return;
    }
    if (!cSiteId && sites.length > 0) {
      setCSiteId(sites[0].id);
    }
  }, [createOpen, siteId, cSiteId, sites]);

  useEffect(() => {
    if (createOpen) return;
    setCreating(false);
    setCNotes("");
    setCRequired(1);
    setCStart(defaultStart);
    setCEnd(defaultEnd);
    if (siteId === "all") setCSiteId("");
  }, [createOpen, defaultStart, defaultEnd, siteId]);

  async function createVacation() {
    if (!canWrite) {
      toast({
        title: "Accès refusé",
        description: "Vous ne pouvez pas créer de vacation.",
        variant: "destructive",
      });
      return;
    }

    const sid = normalizeText(cSiteId);
    if (!sid) {
      toast({
        title: "Champ requis",
        description: "Sélectionne un site.",
        variant: "destructive",
      });
      return;
    }

    const start = new Date(cStart);
    const end = new Date(cEnd);

    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      toast({
        title: "Dates invalides",
        variant: "destructive",
      });
      return;
    }

    if (end.getTime() <= start.getTime()) {
      toast({
        title: "Dates incohérentes",
        description: "La fin doit être après le début.",
        variant: "destructive",
      });
      return;
    }

    const required = Math.max(1, Math.floor(safeNumber(cRequired, 1)));

    setCreating(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        vacation?: VacationApi;
        warnings?: any[];
        error?: string;
      }>(`/api/vacations`, {
        method: "POST",
        body: {
          siteId: sid,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          requiredAgents: required,
          notes: normalizeText(cNotes) || null,
        },
      });

      if (!res.ok || !res.vacation?.id) {
        toast({
          title: "Erreur",
          description: res.error,
          variant: "destructive",
        });
        return;
      }

      if (res.warnings?.length) {
        toast({ title: "Créée (avec avertissements)" });
      } else {
        toast({ title: "Vacation créée" });
      }

      setCreateOpen(false);
      router.push(`/dashboard/vacations/${res.vacation.id}`);
    } catch (e: any) {
      toast({
        title: "Erreur",
        description: e?.message,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-10 w-full max-w-[1600px] mx-auto">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between bg-card p-6 md:p-8 rounded-[2rem] border shadow-sm ring-1 ring-black/5 bg-gradient-to-br from-card to-muted/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex items-center gap-5">
          <div className="bg-primary shadow-xl shadow-primary/20 p-4 rounded-2xl">
            <CalendarClock className="h-7 w-7 text-primary-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Badge
                variant="outline"
                className="bg-background text-[10px] font-bold uppercase tracking-widest py-1 px-3 rounded-full border-muted-foreground/30"
              >
                Planification
              </Badge>
            </div>
            <h1 className="text-3xl font-black tracking-tighter text-foreground">
              Vacations
            </h1>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 relative z-10 w-full md:w-auto">
          <Button
            asChild
            variant="outline"
            className="h-12 rounded-xl px-5 font-bold border-muted-foreground/20 hover:bg-muted transition-all"
          >
            <Link href="/dashboard/sites">
              <Building2 className="h-4 w-4 mr-2" /> Voir les sites
            </Link>
          </Button>

          {canWrite && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="h-12 rounded-xl px-6 font-black shadow-lg shadow-primary/20 hover:translate-y-[-2px] active:scale-95 transition-all">
                  <PlusCircle className="mr-2 h-5 w-5" /> Nouvelle vacation
                </Button>
              </DialogTrigger>

              <DialogContent className="max-w-xl rounded-[2rem] p-0 overflow-hidden border-none shadow-2xl">
                <div className="p-6 md:p-8 bg-muted/20 border-b flex items-center gap-3">
                  <div className="bg-background p-2.5 rounded-xl shadow-sm">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <DialogTitle className="text-2xl font-black">
                      Créer une vacation
                    </DialogTitle>
                    <p className="text-sm font-medium text-muted-foreground mt-1">
                      Planifiez une intervention sur site.
                    </p>
                  </div>
                </div>

                <div className="p-6 md:p-8 bg-background space-y-6">
                  <div className="space-y-3">
                    <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                      Sélection du site <span className="text-destructive">*</span>
                    </Label>
                    {sitesLoading ? (
                      <div className="h-12 flex items-center px-4 rounded-xl bg-muted/30 text-sm font-medium text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Chargement...
                      </div>
                    ) : (
                      <Select value={cSiteId} onValueChange={setCSiteId}>
                        <SelectTrigger className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-bold focus-visible:ring-primary/30">
                          <SelectValue placeholder="Choisir un site d'intervention" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {sites.map((s) => (
                            <SelectItem key={s.id} value={s.id} className="font-medium">
                              {s.name ?? s.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div className="space-y-3">
                      <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                        Heure de début
                      </Label>
                      <Input
                        type="datetime-local"
                        value={cStart}
                        onChange={(e) => setCStart(e.target.value)}
                        className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-bold focus-visible:ring-primary/30"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                        Heure de fin
                      </Label>
                      <Input
                        type="datetime-local"
                        value={cEnd}
                        onChange={(e) => setCEnd(e.target.value)}
                        className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-bold focus-visible:ring-primary/30"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div className="space-y-3">
                      <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                        Effectif Requis
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        value={String(cRequired)}
                        onChange={(e) => setCRequired(Number(e.target.value))}
                        className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-bold focus-visible:ring-primary/30"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                        Consignes (Optionnel)
                      </Label>
                      <Input
                        value={cNotes}
                        onChange={(e) => setCNotes(e.target.value)}
                        placeholder="Tenue, matériel spécifique..."
                        className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-medium focus-visible:ring-primary/30"
                      />
                    </div>
                  </div>

                  <div className="pt-6 border-t flex justify-end gap-3 mt-8">
                    <Button
                      variant="outline"
                      onClick={() => setCreateOpen(false)}
                      className="h-12 rounded-xl px-6 font-bold"
                    >
                      Annuler
                    </Button>
                    <Button
                      onClick={createVacation}
                      disabled={creating}
                      className="h-12 rounded-xl px-8 font-black shadow-lg shadow-primary/20"
                    >
                      {creating ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
                      Valider
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <Card className="rounded-[2.5rem] border-none shadow-2xl shadow-black/[0.03] overflow-hidden bg-background ring-1 ring-black/5">
        <div className="p-6 md:p-8 border-b border-border/50 bg-muted/10 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-muted-foreground" />
            <span className="font-bold text-muted-foreground">Filtres actifs</span>
          </div>

          <div className="w-full md:w-auto flex flex-col sm:flex-row items-center gap-3">
            <Select value={siteId} onValueChange={setSiteId}>
              <SelectTrigger className="w-full sm:w-[220px] h-12 rounded-2xl bg-card border-border/50 font-bold shadow-sm">
                <SelectValue placeholder="Tous les sites" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border shadow-2xl">
                <SelectItem value="all" className="font-black">
                  Tous les sites
                </SelectItem>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="font-medium">
                    {s.name ?? s.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={status ?? "all"} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger className="w-full sm:w-[220px] h-12 rounded-2xl bg-card border-border/50 font-bold shadow-sm">
                <SelectValue placeholder="Tous les statuts" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border shadow-2xl">
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value as any} className="font-medium">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-xs font-semibold uppercase tracking-widest">
                Recherche des vacations...
              </p>
            </div>
          ) : error ? (
            <div className="m-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-6 flex flex-col items-center text-center gap-3">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <p className="text-sm font-bold text-destructive">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={loadVacations}
                className="mt-2 bg-background"
              >
                Réessayer
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center px-4">
              <div className="bg-muted p-6 rounded-full mb-4">
                <CalendarClock className="h-10 w-10 text-muted-foreground/50" />
              </div>
              <h3 className="text-xl font-semibold text-foreground">Aucune vacation</h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm mb-6">
                Aucune mission planifiée ne correspond à vos filtres actuels.
              </p>
              {canWrite && (
                <Button
                  onClick={() => setCreateOpen(true)}
                  className="rounded-xl font-semibold shadow-lg shadow-primary/20"
                >
                  Planifier une vacation
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-black text-[10px] uppercase tracking-widest py-5 pl-8">
                      Lieu d'intervention
                    </TableHead>
                    <TableHead className="font-black text-[10px] uppercase tracking-widest py-5">
                      Créneau
                    </TableHead>
                    <TableHead className="font-black text-[10px] uppercase tracking-widest py-5">
                      Effectif
                    </TableHead>
                    <TableHead className="font-black text-[10px] uppercase tracking-widest py-5">
                      Statut
                    </TableHead>
                    <TableHead className="font-black text-[10px] uppercase tracking-widest py-5 text-right pr-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((v) => {
                    const sd = isoToDate(v.startAtIso);
                    const ed = isoToDate(v.endAtIso);
                    const assigned = (v.assignedAgentIds ?? []).length;
                    const required = v.requiredAgents ?? 1;

                    return (
                      <TableRow
                        key={v.id}
                        className="hover:bg-muted/20 cursor-pointer group transition-colors"
                        onClick={() => router.push(`/dashboard/vacations/${v.id}`)}
                      >
                        <TableCell className="py-4 pl-8">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                              <Building2 className="h-4 w-4 text-primary" />
                            </div>
                            <span className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">
                              {v.siteName || siteLabelById.get(v.siteId) || v.siteId}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="py-4">
                          <div className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
                            <span>
                              De :{" "}
                              <strong className="text-foreground">
                                {sd ? format(sd, "Pp", { locale: fr }) : "—"}
                              </strong>
                            </span>
                            <span>
                              À :{" "}
                              <strong className="text-foreground">
                                {ed ? format(ed, "Pp", { locale: fr }) : "—"}
                              </strong>
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="py-4">
                          <Badge
                            variant="outline"
                            className={cn(
                              "font-bold",
                              assigned < required
                                ? "border-orange-500/30 text-orange-600 bg-orange-50"
                                : "border-border/50 bg-background"
                            )}
                          >
                            {assigned} / {required}
                          </Badge>
                        </TableCell>

                        <TableCell className="py-4">{statusBadge(v.status)}</TableCell>

                        <TableCell className="py-4 pr-8 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full bg-background border opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0"
                          >
                            <ArrowRight className="h-4 w-4 text-primary" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
