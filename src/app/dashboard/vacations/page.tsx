"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Loader2, PlusCircle, ExternalLink, Filter } from "lucide-react";

import { apiFetch } from "@/lib/api/client-fetch";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";

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
  // le backend peut ne pas renvoyer siteName -> on le reconstruit via sites
  siteName?: string | null;
  startAtIso?: string | null;
  endAtIso?: string | null;
  requiredAgents?: number;
  assignedAgentIds?: string[];
  status?: VacationStatus;
  notes?: string | null;
};

const STATUS_OPTIONS: Array<{ value: "all" | VacationStatus; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "planned", label: "Planifiée" },
  { value: "partially_filled", label: "Partielle" },
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
  // yyyy-MM-ddTHH:mm (input datetime-local)
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function statusBadge(status?: VacationStatus) {
  switch (status) {
    case "filled":
      return <Badge variant="default">Complète</Badge>;
    case "partially_filled":
      return <Badge variant="outline">Partielle</Badge>;
    case "planned":
      return <Badge variant="secondary">Planifiée</Badge>;
    case "closed":
      return <Badge variant="outline">Clôturée</Badge>;
    case "cancelled":
      return <Badge variant="destructive">Annulée</Badge>;
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

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // data
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<VacationApi[]>([]);
  const [error, setError] = useState<string | null>(null);

  // filtres
  const [siteId, setSiteId] = useState<string>("all");
  const [status, setStatus] = useState<"all" | VacationStatus>("all");

  // sites dropdown
  const [sitesLoading, setSitesLoading] = useState(false);
  const [sites, setSites] = useState<SiteApi[]>([]);

  // création
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
          description: data.error ?? "Impossible de charger les sites.",
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
        description: e?.message ?? "Impossible de charger les sites.",
        variant: "destructive",
      });
    } finally {
      if (!aliveRef.current) return;
      setSitesLoading(false);
    }
  }, [toast]);

  // initial loads
  useEffect(() => {
    loadSitesOnce();
  }, [loadSitesOnce]);

  useEffect(() => {
    loadVacations();
  }, [loadVacations]);

  // when dialog opens: preselect site
  useEffect(() => {
    if (!createOpen) return;

    // 1) si filtre site actif -> pré-sélection
    if (siteId !== "all") {
      setCSiteId(siteId);
      return;
    }

    // 2) sinon premier site si vide
    if (!cSiteId && sites.length > 0) {
      setCSiteId(sites[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createOpen]);

  // reset form when dialog closes
  useEffect(() => {
    if (createOpen) return;
    setCreating(false);
    setCNotes("");
    setCRequired(1);
    setCStart(defaultStart);
    setCEnd(defaultEnd);

    // ne reset pas cSiteId si filtre site actif
    if (siteId === "all") setCSiteId("");
  }, [createOpen, defaultStart, defaultEnd, siteId]);

  async function createVacation() {
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
        description: "Vérifie la date/heure de début et de fin.",
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
        warnings?: Array<{ code: string; rejected?: any[]; acceptedCount?: number }>;
        error?: string;
      }>(`/api/vacations`, {
        method: "POST",
        body: JSON.stringify({
          siteId: sid,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          requiredAgents: required,
          notes: normalizeText(cNotes) || null,
        }),
      });

      if (!res.ok || !res.vacation?.id) {
        toast({
          title: "Erreur",
          description: res.error ?? "Création impossible.",
          variant: "destructive",
        });
        return;
      }

      if (res.warnings?.length) {
        toast({
          title: "Créée (avec avertissements)",
          description: "Certains agents proposés ont été rejetés automatiquement.",
        });
      } else {
        toast({ title: "Créée", description: "La vacation a été créée." });
      }

      setCreateOpen(false);
      router.push(`/dashboard/vacations/${res.vacation.id}`);
    } catch (e: any) {
      toast({
        title: "Erreur",
        description: e?.message ?? "Création impossible.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Vacations</h1>
          <p className="text-sm text-muted-foreground">
            Planification des besoins et affectations d’agents.
          </p>
        </div>

        <div className="flex gap-2">
          <Button asChild variant="outline" className="gap-2">
            <Link href="/dashboard/sites">
              <ExternalLink className="h-4 w-4" />
              Sites
            </Link>
          </Button>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <PlusCircle className="h-4 w-4" />
                Créer une vacation
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Créer une vacation</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Site</div>
                  {sitesLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Chargement des sites…
                    </div>
                  ) : (
                    <Select value={cSiteId} onValueChange={setCSiteId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner un site" />
                      </SelectTrigger>
                      <SelectContent>
                        {sites.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name ?? s.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Début</div>
                    <Input
                      type="datetime-local"
                      value={cStart}
                      onChange={(e) => setCStart(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">Fin</div>
                    <Input
                      type="datetime-local"
                      value={cEnd}
                      onChange={(e) => setCEnd(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Agents requis</div>
                    <Input
                      type="number"
                      min={1}
                      value={String(cRequired)}
                      onChange={(e) => setCRequired(Number(e.target.value))}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">Notes (optionnel)</div>
                    <Input
                      value={cNotes}
                      onChange={(e) => setCNotes(e.target.value)}
                      placeholder="Ex: événement, consignes…"
                    />
                  </div>
                </div>

                <Separator />

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>
                    Annuler
                  </Button>
                  <Button onClick={createVacation} disabled={creating} className="gap-2">
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Créer
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Button variant="outline" onClick={loadVacations} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Rafraîchir
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="space-y-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" /> Filtres
            </CardTitle>
            <CardDescription>Filtre par site et statut.</CardDescription>
          </div>
        </CardHeader>

        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm font-medium">Site</div>
            <Select value={siteId} onValueChange={setSiteId}>
              <SelectTrigger>
                <SelectValue placeholder="Tous les sites" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name ?? s.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Statut</div>
            <Select value={status ?? "all"} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Tous" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value as any}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>Liste des vacations</CardTitle>
          <CardDescription>
            {loading ? "Chargement…" : `${rows.length} vacation(s)`}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement des vacations…
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <div className="font-medium text-destructive">Erreur</div>
              <div className="text-muted-foreground">{error}</div>
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border p-6 text-sm text-muted-foreground">
              Aucune vacation pour ces filtres.
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Site</TableHead>
                    <TableHead>Début</TableHead>
                    <TableHead>Fin</TableHead>
                    <TableHead>Agents</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {rows.map((v) => {
                    const sd = isoToDate(v.startAtIso);
                    const ed = isoToDate(v.endAtIso);
                    const assigned = (v.assignedAgentIds ?? []).length;
                    const required = v.requiredAgents ?? 1;

                    return (
                      <TableRow key={v.id}>
                        <TableCell className="font-medium">
                          {v.siteName ||
                            siteLabelById.get(v.siteId) ||
                            v.siteId}
                        </TableCell>

                        <TableCell className="text-muted-foreground">
                          {sd ? format(sd, "Pp", { locale: fr }) : "—"}
                        </TableCell>

                        <TableCell className="text-muted-foreground">
                          {ed ? format(ed, "Pp", { locale: fr }) : "—"}
                        </TableCell>

                        <TableCell>
                          <Badge variant="outline">
                            {assigned}/{required}
                          </Badge>
                        </TableCell>

                        <TableCell>{statusBadge(v.status)}</TableCell>

                        <TableCell className="text-right">
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/dashboard/vacations/${v.id}`}>Ouvrir</Link>
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
