"use client";

import React, { useMemo, useState, useEffect } from "react";
import { PlusCircle, MoreHorizontal, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  type QuerySnapshot,
  type DocumentData,
} from "firebase/firestore";

import { useAuth } from "@/lib/auth-provider";
import { db } from "@/lib/firebase/client";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { apiFetch } from "@/lib/api/client-fetch";

/* ================= UI types (FR) ================= */

type SeverityFR = "Faible" | "Moyenne" | "Élevée";
type StatusFR = "Ouvert" | "Clos";
type TabKey = "all" | "open" | "closed";

/* ================= API types ================= */

type IncidentStatusAPI = "open" | "investigating" | "resolved" | "closed";
type IncidentSeverityAPI = "low" | "medium" | "high" | "critical";

type IncidentApiItem = {
  id: string;
  tenantId: string;
  title: string | null;
  description: string | null;
  status: IncidentStatusAPI;
  severity: IncidentSeverityAPI;
  siteId: string | null;
  agentId: string | null;
  vacationId: string | null;
  tags: string[];
  isDeleted: boolean;
  createdAtIso: string | null;
  updatedAtIso: string | null;
};

type IncidentsListResponse = {
  ok: boolean;
  tenantId?: string;
  count?: number;
  incidents?: IncidentApiItem[];
  error?: string;
};

type IncidentCreateResponse = {
  ok: boolean;
  tenantId?: string;
  id?: string;
  incident?: IncidentApiItem;
  error?: string;
};

type IncidentPatchResponse = {
  ok: boolean;
  tenantId?: string;
  incident?: IncidentApiItem;
  error?: string;
};

/* ================= Sites (pour Select) ================= */

type SiteSnapshot = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  riskLevel?: number | null;
};

type SiteRow = SiteSnapshot;

/* ================= helpers ================= */

function isoToDate(iso?: string | null) {
  if (!iso) return new Date(0);
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : new Date(0);
}

function severityToVariant(sev: SeverityFR) {
  if (sev === "Élevée") return "destructive";
  return "outline";
}

function toKey(v: string) {
  return (v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function mapSeverityToApi(sev: SeverityFR): IncidentSeverityAPI {
  if (sev === "Faible") return "low";
  if (sev === "Moyenne") return "medium";
  return "high";
}

function mapSeverityToFr(sev: IncidentSeverityAPI): SeverityFR {
  if (sev === "low") return "Faible";
  if (sev === "medium") return "Moyenne";
  // high|critical => "Élevée" (tu peux affiner si tu veux)
  return "Élevée";
}

function mapStatusToFr(st: IncidentStatusAPI): StatusFR {
  return st === "closed" ? "Clos" : "Ouvert";
}

/* ================= page ================= */

export default function IncidentsPage() {
  const { toast } = useToast();
  const { user, loading } = useAuth();

  // incidents list (API)
  const [rows, setRows] = useState<IncidentApiItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // sites list (Firestore realtime, OK)
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loadingSites, setLoadingSites] = useState(true);

  // UI
  const [queryText, setQueryText] = useState("");
  const [tab, setTab] = useState<TabKey>("all");
  const [open, setOpen] = useState(false);

  // form
  const [siteId, setSiteId] = useState<string>("");
  const [severity, setSeverity] = useState<SeverityFR | "">("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const selectedSite = useMemo(() => {
    if (!siteId) return null;
    return sites.find((s) => s.id === siteId) ?? null;
  }, [siteId, sites]);

  // 0) LISTEN Sites (Select)
  useEffect(() => {
    if (loading) return;

    if (!db || !user?.tenantId) {
      setLoadingSites(false);
      setSites([]);
      return;
    }

    setLoadingSites(true);

    const qy = query(
      collection(db, "sites"),
      where("tenantId", "==", user.tenantId),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      qy,
      (snap: QuerySnapshot<DocumentData>) => {
        const next: SiteRow[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: (data?.name ?? "Site sans nom") as string,
            address: data?.address ?? null,
            city: data?.city ?? null,
            riskLevel: typeof data?.riskLevel === "number" ? data.riskLevel : null,
          };
        });
        setSites(next);
        setLoadingSites(false);
      },
      (err) => {
        console.error("Sites onSnapshot error:", err);
        setLoadingSites(false);
        toast({
          variant: "destructive",
          title: "Erreur de lecture (sites)",
          description:
            err?.message?.includes("requires an index")
              ? "Index Firestore manquant pour la requête sites."
              : err?.message?.includes("Missing or insufficient permissions")
              ? "Permissions Firestore insuffisantes (règles sites)."
              : "Impossible de charger les sites.",
        });
      }
    );

    return () => unsub();
  }, [loading, toast, user?.tenantId]);

  async function loadIncidents() {
    if (!user?.tenantId) {
      setRows([]);
      setLoadingList(false);
      return;
    }

    setLoadingList(true);
    try {
      const res = await apiFetch<IncidentsListResponse>("/api/incidents?max=200");
      if (!res?.ok) {
        setRows([]);
        toast({
          variant: "destructive",
          title: "Impossible de charger les incidents",
          description: res?.error ?? "Erreur API",
        });
        return;
      }
      setRows(res.incidents ?? []);
    } catch (e: any) {
      setRows([]);
      toast({
        variant: "destructive",
        title: "Impossible de charger les incidents",
        description: e?.message ?? "Erreur inconnue",
      });
    } finally {
      setLoadingList(false);
    }
  }

  // 1) LOAD Incidents (API)
  useEffect(() => {
    if (loading) return;
    loadIncidents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.tenantId]);

  const counts = useMemo(() => {
    const openCount = rows.filter((r) => r.status !== "closed").length;
    const closedCount = rows.filter((r) => r.status === "closed").length;
    return { all: rows.length, open: openCount, closed: closedCount };
  }, [rows]);

  const filtered = useMemo(() => {
    const base =
      tab === "open"
        ? rows.filter((r) => r.status !== "closed")
        : tab === "closed"
        ? rows.filter((r) => r.status === "closed")
        : rows;

    const q = queryText.trim().toLowerCase();
    if (!q) return base;

    return base.filter((r) => {
      const siteName = sites.find((s) => s.id === r.siteId)?.name ?? "";
      const hay = `${siteName} ${r.severity} ${r.status} ${r.title ?? ""} ${r.description ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [queryText, rows, tab, sites]);

  const resetForm = () => {
    setSiteId("");
    setSeverity("");
    setDescription("");
  };

  // 2) CREATE via API (=> activity feed OK)
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
  
    if (!user?.tenantId || !user?.uid) return;
  
    if (!siteId || !selectedSite) {
      toast({
        variant: "destructive",
        title: "Site requis",
        description: "Sélectionne un site existant.",
      });
      return;
    }
  
    const cleanDesc = description.trim();
    if (!severity || !cleanDesc) return;
  
    // mapping UI -> API
    const severityApi =
      severity === "Faible" ? "low" : severity === "Moyenne" ? "medium" : "high";
  
    setIsSaving(true);
    try {
      await apiFetch("/api/incidents", {
        method: "POST",
        body: {
          title: `Incident — ${selectedSite.name}`, // ou un vrai champ title si tu veux
          description: cleanDesc,
          severity: severityApi,
          status: "open",
          siteId: selectedSite.id,
          tags: [],
        },
      });
  
      toast({
        title: "Incident créé",
        description: "Il apparaît dans la boîte de réception.",
      });
  
      setOpen(false);
      resetForm();
      setTab("open");
    } catch (err: any) {
      console.error("Create incident API error:", err);
      toast({
        variant: "destructive",
        title: "Création impossible",
        description: err?.message ?? "Erreur API.",
      });
    } finally {
      setIsSaving(false);
    }
  };  

  // 3) Close via API (=> activity feed OK)
  const markClosed = async (id: string) => {
    try {
      await apiFetch(`/api/incidents/${id}`, {
        method: "PATCH",
        body: { status: "closed" },
      });
  
      toast({ title: "Incident clos", description: "Statut mis à jour." });
    } catch (err: any) {
      console.error("Close incident API error:", err);
      toast({
        variant: "destructive",
        title: "Action impossible",
        description: err?.message ?? "Erreur API.",
      });
    }
  };  

  const canCreate = !!user?.tenantId && !loadingSites && sites.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Boîte de réception — Incidents</CardTitle>
            <CardDescription>Derniers rapports d&apos;incidents de votre tenant.</CardDescription>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <div className="w-full sm:w-[300px]">
              <Input
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                placeholder="Rechercher (site, statut, texte...)"
              />
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1" disabled={!canCreate}>
                  <PlusCircle className="h-3.5 w-3.5" />
                  <span className="sm:whitespace-nowrap">
                    {loadingSites ? "Sites…" : sites.length === 0 ? "Aucun site" : "Nouveau rapport"}
                  </span>
                </Button>
              </DialogTrigger>

              <DialogContent className="sm:max-w-[560px]">
                <DialogHeader>
                  <DialogTitle>Créer un rapport</DialogTitle>
                  <DialogDescription>
                    Création via API (log automatique dans l’activité).
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleCreate}>
                  <div className="grid gap-4 py-4">
                    {/* SITE SELECT */}
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label className="text-right">Site</Label>

                      <div className="col-span-3">
                        <Select value={siteId} onValueChange={setSiteId} disabled={isSaving || loadingSites}>
                          <SelectTrigger>
                            <SelectValue placeholder={loadingSites ? "Chargement des sites…" : "Sélectionnez un site"} />
                          </SelectTrigger>
                          <SelectContent>
                            {sites.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}{s.city ? ` — ${s.city}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {selectedSite ? (
                          <div className="mt-2 rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                            <div className="font-medium text-foreground">{selectedSite.name}</div>
                            <div>
                              {selectedSite.address ? selectedSite.address : "Adresse non renseignée"}
                              {selectedSite.city ? ` • ${selectedSite.city}` : ""}
                              {typeof selectedSite.riskLevel === "number" ? ` • Risque ${selectedSite.riskLevel}/5` : ""}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {/* SEVERITY */}
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label className="text-right">Sévérité</Label>
                      <div className="col-span-3">
                        <Select value={severity} onValueChange={(v) => setSeverity(v as SeverityFR)} disabled={isSaving}>
                          <SelectTrigger>
                            <SelectValue placeholder="Sélectionnez la sévérité" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Faible">Faible</SelectItem>
                            <SelectItem value="Moyenne">Moyenne</SelectItem>
                            <SelectItem value="Élevée">Élevée</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* DESCRIPTION */}
                    <div className="grid grid-cols-4 items-start gap-4">
                      <Label className="pt-2 text-right">Description</Label>
                      <Textarea
                        className="col-span-3 min-h-[110px]"
                        placeholder="Décrivez l'incident…"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        disabled={isSaving}
                        required
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setOpen(false);
                        resetForm();
                      }}
                      disabled={isSaving}
                    >
                      Annuler
                    </Button>

                    <Button
                      type="submit"
                      disabled={
                        isSaving ||
                        !user?.tenantId ||
                        !siteId ||
                        !selectedSite ||
                        !severity ||
                        !description.trim()
                      }
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Enregistrement…
                        </>
                      ) : (
                        "Enregistrer"
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Onglets + compteurs */}
        <div className="pt-2">
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
            <TabsList>
              <TabsTrigger value="all">
                Tous <span className="ml-2 text-xs text-muted-foreground">({counts.all})</span>
              </TabsTrigger>
              <TabsTrigger value="open">
                Ouverts <span className="ml-2 text-xs text-muted-foreground">({counts.open})</span>
              </TabsTrigger>
              <TabsTrigger value="closed">
                Clos <span className="ml-2 text-xs text-muted-foreground">({counts.closed})</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>

      <CardContent>
        {loadingList ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement de la boîte de réception…
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead>Sévérité</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Horodatage</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    Aucun incident {tab === "open" ? "ouvert" : tab === "closed" ? "clos" : ""}.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((incident) => {
                  const siteName = sites.find((s) => s.id === incident.siteId)?.name ?? "—";
                  const sevFR = mapSeverityToFr(incident.severity);
                  const stFR = mapStatusToFr(incident.status);

                  return (
                    <TableRow key={incident.id}>
                      <TableCell>
                        <div className="font-medium">{siteName}</div>
                        <div className="text-sm text-muted-foreground">{incident.title ?? "—"}</div>
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant={severityToVariant(sevFR)}
                          className={cn(sevFR === "Moyenne" && "bg-accent text-accent-foreground border-accent")}
                        >
                          {sevFR}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant={stFR === "Ouvert" ? "default" : "outline"}
                          className={cn(stFR === "Ouvert" && "bg-red-500 hover:bg-red-500/80")}
                        >
                          {stFR}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        {format(isoToDate(incident.createdAtIso), "PPPP 'à' p", { locale: fr })}
                      </TableCell>

                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button aria-haspopup="true" size="icon" variant="ghost">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Toggle menu</span>
                            </Button>
                          </DropdownMenuTrigger>

                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/incidents/${incident.id}`}>Voir les détails</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => markClosed(incident.id)}
                              disabled={incident.status === "closed"}
                            >
                              Marquer comme clos
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
