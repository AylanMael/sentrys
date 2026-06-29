// src/app/dashboard/sites/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";

import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api/client-fetch";
import { canManageSites, hasRole, normalizeRole } from "@/lib/auth/role";

import type { Site } from "@/lib/sites/types";
import { SiteForm, type SiteFormValues } from "@/components/sites/site-form";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  PlusCircle,
  Search,
  MapPin,
  Building2,
  ShieldAlert,
  BriefcaseBusiness,
  Info,
  ChevronRight,
  LayoutGrid,
  List,
} from "lucide-react";

const GRID_BATCH_SIZE = 9;
const LIST_PAGE_SIZE_OPTIONS = [12, 25, 50] as const;
type ViewMode = "grid" | "list";
type StatusFilter = "all" | "active" | "inactive";
type SiteTypeFilter = "all" | Site["siteType"];
type RiskFilter = "all" | "1" | "2" | "3" | "4" | "5" | "high";

const SITE_TYPE_FILTER_OPTIONS: Array<{ value: SiteTypeFilter; label: string }> = [
  { value: "all", label: "Tous types" },
  { value: "bureaux", label: "Bureaux" },
  { value: "chantier", label: "Chantier" },
  { value: "boutique", label: "Boutique" },
  { value: "evenement", label: "Evenement" },
  { value: "hotel", label: "Hotel" },
  { value: "autre", label: "Autre" },
];
function siteTypeLabel(v: Site["siteType"]) {
  const map: Record<Site["siteType"], string> = {
    bureaux: "Bureaux",
    chantier: "Chantier",
    boutique: "Boutique",
    evenement: "Événement",
    hotel: "Hôtel",
    autre: "Autre",
  };
  return map[v] ?? "Autre";
}

function safeArr(v: unknown): string[] {
  return Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : [];
}
function siteClientFilterKey(site: any) {
  const clientId = typeof site?.clientId === "string" ? site.clientId.trim() : "";
  const clientName = typeof site?.clientName === "string" ? site.clientName.trim() : "";
  return clientId || clientName || "__no_client__";
}

export default function SitesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const clientIdParam = searchParams.get("clientId") ?? "";
  const clientNameParam = searchParams.get("clientName") ?? "";
  const shouldOpenCreate = searchParams.get("new") === "1";

  const [sites, setSites] = useState<Site[]>([]);
  const [qText, setQText] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [visibleGridCount, setVisibleGridCount] = useState(GRID_BATCH_SIZE);
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState<(typeof LIST_PAGE_SIZE_OPTIONS)[number]>(12);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<SiteTypeFilter>("all");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const role = useMemo(
    () => normalizeRole((user as any)?.role) ?? "client",
    [user]
  );

  const isAdmin = useMemo(() => {
    return hasRole(role, ["super_admin", "owner", "admin"]);
  }, [role]);

  const canWrite = useMemo(() => canManageSites(role), [role]);

  const clientOptions = useMemo(() => {
    const map = new Map<string, string>();
    let hasSitesWithoutClient = false;

    sites.forEach((site: any) => {
      const key = siteClientFilterKey(site);
      if (key === "__no_client__") {
        hasSitesWithoutClient = true;
        return;
      }
      map.set(key, site.clientName || "Client sans nom");
    });

    const rows = Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr"));

    if (hasSitesWithoutClient) {
      rows.push({ value: "__no_client__", label: "Sans client" });
    }

    return rows;
  }, [sites]);
  useEffect(() => {
    if (!(user as any)?.tenantId) return;

    const ref = collection(db, "sites");

    const qy = isAdmin
      ? query(ref, where("tenantId", "==", (user as any).tenantId), orderBy("createdAt", "desc"))
      : query(
          ref,
          where("tenantId", "==", (user as any).tenantId),
          where("accessUids", "array-contains", (user as any).uid),
          orderBy("createdAt", "desc")
        );

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const data: Site[] = snap.docs.map((d) => {
          const raw = d.data() as any;
          return {
            id: d.id,
            ...(raw as any),
            managerIds: safeArr(raw?.managerIds),
            agentIds: safeArr(raw?.agentIds),
            accessUids: safeArr(raw?.accessUids),
            clientId: typeof raw?.clientId === "string" ? raw.clientId : null,
            clientName:
              typeof raw?.clientName === "string"
                ? raw.clientName
                : (raw?.clientName ?? null),
          } as any;
        });

        setSites(data);
      },
      (err) => {
        console.error(err);

        const msg =
          err?.message?.includes("requires an index")
            ? "Index Firestore requis pour la liste des sites (tenantId + accessUids + createdAt)."
            : err?.message?.includes("Missing or insufficient permissions")
              ? "Permissions Firestore insuffisantes (règles sites)."
              : "Impossible de charger les sites.";

        toast({
          title: "Erreur",
          description: msg,
          variant: "destructive",
        });
      }
    );

    return () => unsub();
  }, [toast, (user as any)?.tenantId, (user as any)?.uid, isAdmin]);

  useEffect(() => {
    if (shouldOpenCreate && canWrite) {
      setOpen(true);
    }
  }, [canWrite, shouldOpenCreate]);

  const filtered = useMemo(() => {
    const scopedSites = clientIdParam
      ? sites.filter((site: any) => site.clientId === clientIdParam)
      : sites;
    const t = qText.trim().toLowerCase();

    return scopedSites.filter((s: any) => {
      if (statusFilter === "active" && !s?.isActive) return false;
      if (statusFilter === "inactive" && s?.isActive) return false;

      if (!clientIdParam && clientFilter !== "all" && siteClientFilterKey(s) !== clientFilter) {
        return false;
      }

      if (typeFilter !== "all" && s?.siteType !== typeFilter) return false;

      const riskLevel = Number(s?.riskLevel ?? 3);
      if (riskFilter === "high" && riskLevel < 4) return false;
      if (riskFilter !== "all" && riskFilter !== "high" && riskLevel !== Number(riskFilter)) {
        return false;
      }

      if (!t) return true;

      const hay =
        `${s?.name ?? ""} ${s?.clientName ?? ""} ${s?.city ?? ""} ${s?.address ?? ""}`.toLowerCase();
      return hay.includes(t);
    });
  }, [clientFilter, clientIdParam, qText, riskFilter, sites, statusFilter, typeFilter]);

  useEffect(() => {
    setVisibleGridCount(GRID_BATCH_SIZE);
    setListPage(1);
  }, [clientFilter, clientIdParam, qText, riskFilter, statusFilter, typeFilter]);

  const gridSites = useMemo(
    () => filtered.slice(0, visibleGridCount),
    [filtered, visibleGridCount]
  );

  const listPageCount = Math.max(1, Math.ceil(filtered.length / listPageSize));

  useEffect(() => {
    setListPage((current) => Math.min(current, listPageCount));
  }, [listPageCount]);

  const listSites = useMemo(() => {
    const start = (listPage - 1) * listPageSize;
    return filtered.slice(start, start + listPageSize);
  }, [filtered, listPage, listPageSize]);

  const hasMoreGridSites = visibleGridCount < filtered.length;
  const remainingGridSites = Math.max(0, filtered.length - visibleGridCount);
  const listStart = filtered.length === 0 ? 0 : (listPage - 1) * listPageSize + 1;
  const listEnd = Math.min(filtered.length, listPage * listPageSize);
  const hasActiveFilters =
    Boolean(qText.trim()) ||
    statusFilter !== "all" ||
    (!clientIdParam && clientFilter !== "all") ||
    typeFilter !== "all" ||
    riskFilter !== "all";
  const creationInitialValues = useMemo(
    () =>
      clientIdParam
        ? ({
            clientId: clientIdParam,
            clientName: clientNameParam,
          } satisfies Partial<SiteFormValues>)
        : undefined,
    [clientIdParam, clientNameParam]
  );

  async function createSite(values: SiteFormValues) {
    if (!user) {
      toast({
        title: "Non connecté",
        description: "Veuillez vous reconnecter.",
        variant: "destructive",
      });
      return;
    }

    if (!(user as any)?.tenantId) {
      toast({
        title: "Profil incomplet",
        description: "Provisioning en cours : tenantId manquant.",
        variant: "destructive",
      });
      return;
    }

    if (!canWrite) {
      toast({
        title: "Accès refusé",
        description: "Droits insuffisants.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      const res = await apiFetch<{
        ok: boolean;
        site?: any;
        id?: string;
        error?: string;
        code?: string;
        limits?: any;
        usage?: any;
        kind?: string;
      }>("/api/sites", {
        method: "POST",
        body: {
          name: values.name,
          clientId: values.clientId ?? null,
          clientName: values.clientName || null,
          siteType: values.siteType,
          riskLevel: values.riskLevel,
          address: values.address || null,
          city: values.city || null,
          postalCode: values.postalCode || null,
          instructions: values.instructions || null,
          latitude: values.latitude ?? null,
          longitude: values.longitude ?? null,
          isActive: values.isActive,
          emergencyContacts: values.emergencyContacts,
        },
      });

      if (!res.ok) {
        const isQuota =
          typeof res.error === "string" &&
          res.error.toLowerCase().includes("quota atteint");

        toast({
          title: "Erreur",
          description: isQuota ? res.error : (res.error ?? "Création impossible."),
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Site créé",
        description: "Le site est enregistré.",
      });

      setOpen(false);
    } catch (e: any) {
      const message = e?.message ?? "Creation impossible.";
      const isQuota = String(message).toLowerCase().includes("quota atteint");

      if (!isQuota) {
        console.error(e);
      }
      toast({
        title: isQuota ? "Quota de sites atteint" : "Erreur",
        description: e?.message ?? "Création impossible.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-10 w-full">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between bg-card p-6 md:p-8 rounded-[2rem] border shadow-sm ring-1 ring-black/5 bg-gradient-to-br from-card to-muted/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex items-center gap-5">
          <div className="bg-primary shadow-xl shadow-primary/20 p-4 rounded-2xl">
            <MapPin className="h-7 w-7 text-primary-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Badge
                variant="outline"
                className="bg-background text-[10px] font-black uppercase tracking-widest py-1 px-3 rounded-full border-muted-foreground/30"
              >
                Lieux d'intervention
              </Badge>
            </div>
            <h1 className="text-3xl font-black tracking-tighter text-foreground">
              {clientIdParam ? "Sites du client" : "Sites"}
            </h1>
            {clientNameParam && (
              <p className="mt-1 text-sm font-bold text-muted-foreground">
                {clientNameParam}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 relative z-10 w-full md:w-auto">
          <div className="relative w-full sm:w-[320px]">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={qText}
              onChange={(e) => setQText(e.target.value)}
              placeholder="Rechercher (nom, ville, client...)"
              className="pl-12 h-12 rounded-xl bg-background border-muted-foreground/20 font-medium text-base shadow-sm focus-visible:ring-primary/30"
            />
          </div>

          {canWrite && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="h-12 rounded-xl px-6 font-black shadow-lg shadow-primary/20 hover:translate-y-[-2px] active:scale-95 transition-all w-full sm:w-auto">
                  <PlusCircle className="mr-2 h-5 w-5" />
                  Nouveau site
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl rounded-[2rem] p-0 overflow-hidden border-none shadow-2xl">
                <div className="p-6 md:p-8 bg-muted/20 border-b">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-black">Ajouter un Site</DialogTitle>
                  </DialogHeader>
                </div>
                <div className="p-6 md:p-8 bg-background">
                  <SiteForm
                    initialValues={creationInitialValues}
                    submitLabel="Créer le site"
                    onSubmit={createSite}
                    isSubmitting={saving}
                  />
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="rounded-[1.5rem] border bg-card/80 p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-black text-foreground">Filtres exploitation</p>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">
              Combinez statut, client, type et risque pour retrouver un site rapidement.
            </p>
          </div>

          {hasActiveFilters && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setQText("");
                setStatusFilter("all");
                setClientFilter("all");
                setTypeFilter("all");
                setRiskFilter("all");
              }}
              className="h-10 rounded-xl font-bold"
            >
              Reinitialiser
            </Button>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1.5">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
              Statut
            </span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="h-11 w-full rounded-xl border bg-background px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">Tous statuts</option>
              <option value="active">Actifs</option>
              <option value="inactive">Inactifs</option>
            </select>
          </label>

          {!clientIdParam && (
            <label className="space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                Client
              </span>
              <select
                value={clientFilter}
                onChange={(event) => setClientFilter(event.target.value)}
                className="h-11 w-full rounded-xl border bg-background px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="all">Tous clients</option>
                {clientOptions.map((client) => (
                  <option key={client.value} value={client.value}>
                    {client.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="space-y-1.5">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
              Type
            </span>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as SiteTypeFilter)}
              className="h-11 w-full rounded-xl border bg-background px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/30"
            >
              {SITE_TYPE_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
              Risque
            </span>
            <select
              value={riskFilter}
              onChange={(event) => setRiskFilter(event.target.value as RiskFilter)}
              className="h-11 w-full rounded-xl border bg-background px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">Tous risques</option>
              <option value="high">Risque eleve (4-5)</option>
              <option value="1">Niveau 1</option>
              <option value="2">Niveau 2</option>
              <option value="3">Niveau 3</option>
              <option value="4">Niveau 4</option>
              <option value="5">Niveau 5</option>
            </select>
          </label>
        </div>
      </div>
      <div className="flex flex-col gap-4 rounded-[1.5rem] border bg-card/80 p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-black text-foreground">
            {filtered.length} site{filtered.length > 1 ? "s" : ""} affiche{filtered.length > 1 ? "s" : ""}
          </p>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            Grille pour le visuel rapide, liste pour piloter un grand portefeuille.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={viewMode === "grid" ? "default" : "outline"}
            onClick={() => setViewMode("grid")}
            className="h-10 rounded-xl font-bold"
          >
            <LayoutGrid className="mr-2 h-4 w-4" />
            Grille
          </Button>
          <Button
            type="button"
            variant={viewMode === "list" ? "default" : "outline"}
            onClick={() => setViewMode("list")}
            className="h-10 rounded-xl font-bold"
          >
            <List className="mr-2 h-4 w-4" />
            Liste
          </Button>
        </div>
      </div>

      {viewMode === "grid" ? (
        <>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {gridSites.map((s: any) => {
          const uid = (user as any)?.uid;
          const isAssigned = !!uid && safeArr(s?.accessUids).includes(uid);

          return (
            <Link key={s.id} href={`/dashboard/sites/${s.id}`} className="group block">
              <Card className="rounded-[2rem] border-none shadow-xl shadow-black/[0.02] bg-background ring-1 ring-black/5 hover:ring-primary/20 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 overflow-hidden h-full flex flex-col">
                <div className="p-6 pb-4 bg-gradient-to-b from-muted/20 to-transparent border-b border-muted/50">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20 transition-transform group-hover:scale-105 group-hover:bg-primary/20">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-black text-lg text-foreground truncate group-hover:text-primary transition-colors">
                          {s.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          {s.city && (
                            <span className="text-xs font-bold text-muted-foreground flex items-center gap-1 uppercase tracking-widest">
                              <MapPin className="h-3 w-3" /> {s.city}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={s.isActive ? "default" : "secondary"}
                      className={cn(
                        "rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wider",
                        s.isActive
                          ? "bg-green-500/10 text-green-600 border-transparent hover:bg-green-500/20"
                          : "opacity-60"
                      )}
                    >
                      {s.isActive ? "Actif" : "Inactif"}
                    </Badge>

                    {isAssigned && (
                      <Badge
                        variant="outline"
                        className="rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wider border-primary/30 text-primary bg-primary/5"
                      >
                        Assigné
                      </Badge>
                    )}
                  </div>
                </div>

                <CardContent className="p-6 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-muted/30 p-3 rounded-xl border border-muted/50">
                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1">
                          Type
                        </span>
                        <span className="text-sm font-bold text-foreground">
                          {siteTypeLabel(s.siteType)}
                        </span>
                      </div>

                      <div
                        className={cn(
                          "p-3 rounded-xl border",
                          (s.riskLevel ?? 3) > 3
                            ? "bg-orange-500/10 border-orange-200"
                            : "bg-muted/30 border-muted/50"
                        )}
                      >
                        <span
                          className={cn(
                            "text-[10px] font-black uppercase tracking-widest block mb-1 flex items-center gap-1",
                            (s.riskLevel ?? 3) > 3
                              ? "text-orange-600"
                              : "text-muted-foreground"
                          )}
                        >
                          <ShieldAlert className="h-3 w-3" /> Risque
                        </span>
                        <span
                          className={cn(
                            "text-sm font-bold",
                            (s.riskLevel ?? 3) > 3 ? "text-orange-700" : "text-foreground"
                          )}
                        >
                          Niveau {s.riskLevel ?? 3}
                        </span>
                      </div>
                    </div>

                    {s.clientName && (
                      <div className="flex items-center gap-2 text-sm text-foreground font-medium bg-muted/20 p-3 rounded-xl">
                        <BriefcaseBusiness className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="truncate">{s.clientName}</span>
                      </div>
                    )}

                    {s.instructions ? (
                      <div className="text-sm font-medium italic text-muted-foreground line-clamp-2 bg-primary/5 p-3 rounded-xl border border-primary/10">
                        "{s.instructions}"
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground opacity-60">
                        <Info className="h-3.5 w-3.5" /> Aucune consigne spécifique.
                      </div>
                    )}
                  </div>

                  <div className="pt-2 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity translate-x-[-10px] group-hover:translate-x-0 duration-300">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <ChevronRight className="h-4 w-4 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {hasMoreGridSites && (
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setVisibleGridCount((current) =>
                Math.min(current + GRID_BATCH_SIZE, filtered.length)
              )
            }
            className="h-12 rounded-xl px-6 font-black"
          >
            Afficher plus
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">
              {Math.min(GRID_BATCH_SIZE, remainingGridSites)} / {remainingGridSites}
            </span>
          </Button>
        </div>
      )}
        </>
      ) : (
        <Card className="overflow-hidden rounded-[2rem] border shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="min-w-[260px] px-5 py-4 text-xs font-black uppercase tracking-[0.14em]">
                      Site
                    </TableHead>
                    <TableHead className="px-5 py-4 text-xs font-black uppercase tracking-[0.14em]">
                      Client
                    </TableHead>
                    <TableHead className="px-5 py-4 text-xs font-black uppercase tracking-[0.14em]">
                      Type
                    </TableHead>
                    <TableHead className="px-5 py-4 text-xs font-black uppercase tracking-[0.14em]">
                      Risque
                    </TableHead>
                    <TableHead className="px-5 py-4 text-xs font-black uppercase tracking-[0.14em]">
                      Agents
                    </TableHead>
                    <TableHead className="px-5 py-4 text-right text-xs font-black uppercase tracking-[0.14em]">
                      Action
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listSites.map((s: any) => {
                    const riskLevel = s.riskLevel ?? 3;

                    return (
                      <TableRow key={s.id} className="hover:bg-muted/30">
                        <TableCell className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
                              <Building2 className="h-4 w-4 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <Link
                                href={`/dashboard/sites/${s.id}`}
                                className="block truncate font-black text-foreground hover:text-primary"
                              >
                                {s.name}
                              </Link>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
                                {s.city && (
                                  <span className="inline-flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {s.city}
                                  </span>
                                )}
                                <Badge
                                  variant={s.isActive ? "default" : "secondary"}
                                  className={cn(
                                    "rounded-md px-1.5 py-0 text-[9px] font-black uppercase tracking-wider",
                                    s.isActive
                                      ? "bg-green-500/10 text-green-600 hover:bg-green-500/20"
                                      : "opacity-60"
                                  )}
                                >
                                  {s.isActive ? "Actif" : "Inactif"}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate px-5 py-4 text-sm font-semibold text-muted-foreground">
                          {s.clientName || "-"}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-sm font-bold">
                          {siteTypeLabel(s.siteType)}
                        </TableCell>
                        <TableCell className="px-5 py-4">
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-lg font-black",
                              riskLevel > 3
                                ? "border-orange-300 bg-orange-500/10 text-orange-700"
                                : "bg-muted/40"
                            )}
                          >
                            Niveau {riskLevel}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-5 py-4 text-sm font-bold">
                          {safeArr(s.agentIds).length}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-right">
                          <Button asChild variant="outline" size="sm" className="rounded-xl font-bold">
                            <Link href={`/dashboard/sites/${s.id}`}>
                              Ouvrir
                              <ChevronRight className="ml-2 h-4 w-4" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-col gap-3 border-t bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-muted-foreground">
                {filtered.length === 0
                  ? "Aucun site"
                  : `${listStart}-${listEnd} sur ${filtered.length} site${filtered.length > 1 ? "s" : ""}`}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={listPageSize}
                  onChange={(event) => {
                    setListPageSize(Number(event.target.value) as (typeof LIST_PAGE_SIZE_OPTIONS)[number]);
                    setListPage(1);
                  }}
                  className="h-10 rounded-xl border bg-background px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {LIST_PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size} / page
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setListPage((page) => Math.max(1, page - 1))}
                  disabled={listPage <= 1}
                  className="h-10 rounded-xl font-bold"
                >
                  Precedent
                </Button>
                <span className="min-w-20 text-center text-sm font-black">
                  {listPage} / {listPageCount}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setListPage((page) => Math.min(listPageCount, page + 1))}
                  disabled={listPage >= listPageCount}
                  className="h-10 rounded-xl font-bold"
                >
                  Suivant
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center px-4 rounded-[2rem] border-2 border-dashed border-muted">
          <div className="bg-muted p-6 rounded-full mb-4">
            <Building2 className="h-10 w-10 text-muted-foreground/50" />
          </div>
          <h3 className="text-xl font-black text-foreground">Aucun site trouvé</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm">
            Il semblerait qu&apos;il n&apos;y ait pas de site correspondant à votre recherche.
          </p>
        </div>
      )}
    </div>
  );
}
