"use client";

import React, { useMemo, useState, useEffect } from "react";
import { PlusCircle, MoreHorizontal, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  collection,
  addDoc,
  onSnapshot,
  orderBy,
  query,
  where,
  serverTimestamp,
  Timestamp,
  FieldValue,
  doc,
  updateDoc,
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

type Severity = "Faible" | "Moyenne" | "Élevée";
type Status = "Ouvert" | "Clos";
type TabKey = "all" | "open" | "closed";

type CreatedBy = { uid: string; name?: string | null; email?: string | null };

// ---- Sites (pour Select) ----
type SiteSnapshot = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  riskLevel?: number | null;
};

type SiteRow = SiteSnapshot;

// ---- Incidents ----
type IncidentDoc = {
  tenantId: string;

  siteId: string;
  siteName: string;
  siteSnapshot: SiteSnapshot;

  severity: Severity;
  status: Status;
  description: string;

  createdAt?: Timestamp;
  createdBy: CreatedBy;

  updatedAt?: Timestamp;
  closedAt?: Timestamp;
  closedBy?: { uid: string; email?: string | null };

  // optionnels (si tu les stockes)
  severityKey?: string;
  statusKey?: string;
};

type IncidentCreate = Omit<
  IncidentDoc,
  "createdAt" | "updatedAt" | "closedAt"
> & {
  createdAt: FieldValue;
  updatedAt?: FieldValue;
  closedAt?: FieldValue;
};

type IncidentRow = IncidentDoc & { id: string };

function severityToVariant(sev: Severity) {
  if (sev === "Élevée") return "destructive";
  return "outline";
}

function tsToDate(ts?: Timestamp) {
  return ts?.toDate?.() ?? new Date(0);
}

function toKey(v: string) {
  return (v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default function IncidentsPage() {
  const { toast } = useToast();
  const { user, loading } = useAuth();

  // incidents list
  const [rows, setRows] = useState<IncidentRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // sites list (pour le select)
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loadingSites, setLoadingSites] = useState(true);

  // UI
  const [queryText, setQueryText] = useState("");
  const [tab, setTab] = useState<TabKey>("all");
  const [open, setOpen] = useState(false);

  // form
  const [siteId, setSiteId] = useState<string>("");
  const [severity, setSeverity] = useState<Severity | "">("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const selectedSite = useMemo(() => {
    if (!siteId) return null;
    return sites.find((s) => s.id === siteId) ?? null;
  }, [siteId, sites]);

  // 0) LISTEN Sites (pour Select)
  useEffect(() => {
    if (loading) return;

    if (!db) {
      setLoadingSites(false);
      setSites([]);
      return;
    }

    if (!user?.tenantId) {
      setLoadingSites(false);
      setSites([]);
      return;
    }

    setLoadingSites(true);

    // On ne récupère que les sites du tenant + tri
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

  // 1) LISTEN Incidents (Inbox)
  useEffect(() => {
    if (loading) return;

    if (!db) {
      setLoadingList(false);
      toast({
        variant: "destructive",
        title: "Firestore indisponible",
        description: "Vérifie la config Firebase (.env).",
      });
      return;
    }

    if (!user?.tenantId) {
      setLoadingList(false);
      setRows([]);
      return;
    }

    setLoadingList(true);

    const qy = query(
      collection(db, "incidents"),
      where("tenantId", "==", user.tenantId),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const next: IncidentRow[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as IncidentDoc),
        }));
        setRows(next);
        setLoadingList(false);
      },
      (err) => {
        console.error("Incidents onSnapshot error:", err);
        setLoadingList(false);
        toast({
          variant: "destructive",
          title: "Erreur de lecture",
          description:
            err?.message?.includes("requires an index")
              ? "Index Firestore manquant pour cette requête."
              : err?.message?.includes("Missing or insufficient permissions")
              ? "Permissions Firestore insuffisantes (règles incidents)."
              : "Impossible de charger les incidents.",
        });
      }
    );

    return () => unsub();
  }, [loading, toast, user?.tenantId]);

  const counts = useMemo(() => {
    const openCount = rows.filter((r) => r.status === "Ouvert").length;
    const closedCount = rows.filter((r) => r.status === "Clos").length;
    return { all: rows.length, open: openCount, closed: closedCount };
  }, [rows]);

  const filtered = useMemo(() => {
    const base =
      tab === "open"
        ? rows.filter((r) => r.status === "Ouvert")
        : tab === "closed"
        ? rows.filter((r) => r.status === "Clos")
        : rows;

    const q = queryText.trim().toLowerCase();
    if (!q) return base;

    return base.filter((r) => {
      const hay = `${r.siteName} ${r.severity} ${r.status} ${r.createdBy?.email ?? ""} ${r.description ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [queryText, rows, tab]);

  const resetForm = () => {
    setSiteId("");
    setSeverity("");
    setDescription("");
  };

  // 2) CREATE
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!db) return;
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

    setIsSaving(true);
    try {
      const payload: IncidentCreate = {
        tenantId: user.tenantId,

        siteId: selectedSite.id,
        siteName: selectedSite.name,
        siteSnapshot: {
          id: selectedSite.id,
          name: selectedSite.name,
          address: selectedSite.address ?? null,
          city: selectedSite.city ?? null,
          riskLevel: typeof selectedSite.riskLevel === "number" ? selectedSite.riskLevel : null,
        },

        severity: severity as Severity,
        severityKey: toKey(severity as string),
        status: "Ouvert",
        statusKey: "ouvert",
        description: cleanDesc,

        createdAt: serverTimestamp(),
        createdBy: {
          uid: user.uid,
          name: null,
          email: user.email ?? null,
        },
      };

      await addDoc(collection(db, "incidents"), payload);

      toast({
        title: "Incident créé",
        description: "Il apparaît dans la boîte de réception.",
      });

      setOpen(false);
      resetForm();
      setTab("open");
    } catch (err: any) {
      console.error("Create incident error:", err);
      toast({
        variant: "destructive",
        title: "Création impossible",
        description:
          err?.message?.includes("Missing or insufficient permissions")
            ? "Permissions Firestore insuffisantes (règles incidents)."
            : err?.message ?? "Erreur Firestore.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // 3) Close
  const markClosed = async (id: string) => {
    if (!db) return;

    try {
      await updateDoc(doc(db, "incidents", id), {
        status: "Clos",
        statusKey: "clos",
        updatedAt: serverTimestamp(),
        closedAt: serverTimestamp(),
        closedBy: { uid: user?.uid ?? "unknown", email: user?.email ?? null },
      });

      toast({ title: "Incident clos", description: "Statut mis à jour." });
    } catch (err: any) {
      console.error("Close incident error:", err);
      toast({
        variant: "destructive",
        title: "Action impossible",
        description:
          err?.message?.includes("Missing or insufficient permissions")
            ? "Permissions Firestore insuffisantes (règles incidents)."
            : err?.message ?? "Erreur Firestore.",
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
                placeholder="Rechercher (site, statut, email...)"
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
                    Il sera ajouté à la boîte de réception (incident lié à un site existant).
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
                        <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)} disabled={isSaving}>
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
                    Aucun incident {tab === "open" ? "ouvert" : tab === "closed" ? "clos" : ""} dans la boîte de réception.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((incident) => (
                  <TableRow key={incident.id}>
                    <TableCell>
                      <div className="font-medium">{incident.siteName}</div>
                      <div className="text-sm text-muted-foreground">{incident.createdBy?.email ?? "—"}</div>
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant={severityToVariant(incident.severity)}
                        className={cn(
                          incident.severity === "Moyenne" && "bg-accent text-accent-foreground border-accent"
                        )}
                      >
                        {incident.severity}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant={incident.status === "Ouvert" ? "default" : "outline"}
                        className={cn(incident.status === "Ouvert" && "bg-red-500 hover:bg-red-500/80")}
                      >
                        {incident.status}
                      </Badge>
                    </TableCell>

                    <TableCell>{format(tsToDate(incident.createdAt), "PPPP 'à' p", { locale: fr })}</TableCell>

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
                          <DropdownMenuItem onClick={() => markClosed(incident.id)} disabled={incident.status === "Clos"}>
                            Marquer comme clos
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
