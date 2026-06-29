// src/app/dashboard/clients/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Loader2,
  Building2,
  BriefcaseBusiness,
  Mail,
  Phone,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  LayoutGrid,
  List,
} from "lucide-react";

import { useClients } from "@/hooks/use-clients";
import { useAuth } from "@/lib/auth-provider";
import { hasRole, normalizeRole } from "@/lib/auth/role";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";

const GRID_BATCH_SIZE = 9;
const CLIENTS_SERVER_PAGE_SIZE = 20;
const LIST_PAGE_SIZE_OPTIONS = [12, 25, 50] as const;

type ViewMode = "grid" | "list";
type ClientStatusFilter = "all" | "active" | "inactive";

function clientInitial(client: any) {
  return String(client?.name ?? "?").charAt(0).toUpperCase() || "?";
}

function clientStatusBadge(status?: string) {
  const active = status === "active";

  return (
    <Badge
      variant={active ? "default" : "secondary"}
      className={cn(
        "rounded-lg px-3 py-1 text-[10px] font-bold uppercase tracking-wider",
        active
          ? "border-transparent bg-green-500/10 text-green-600 hover:bg-green-500/20"
          : "opacity-60"
      )}
    >
      {active ? "Actif" : "Inactif"}
    </Badge>
  );
}

export default function ClientsPage() {
  const router = useRouter();
  const { loading: authLoading, user } = useAuth();

  const role = useMemo(
    () => normalizeRole((user as any)?.role) ?? "client",
    [user]
  );

  const canViewClients = useMemo(() => {
    return hasRole(role, ["super_admin", "owner", "admin", "manager"]);
  }, [role]);

  const canWrite = canViewClients;

  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [status, setStatus] = useState<ClientStatusFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [visibleGridCount, setVisibleGridCount] = useState(GRID_BATCH_SIZE);
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] =
    useState<(typeof LIST_PAGE_SIZE_OPTIONS)[number]>(12);

  const clientsEnabled = !authLoading && Boolean(user) && canViewClients;

  const { items, loading, error, nextCursor, loadMore, reload } = useClients({
    q: qDebounced,
    status,
    limit: CLIENTS_SERVER_PAGE_SIZE,
    enabled: clientsEnabled,
  });

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setVisibleGridCount(GRID_BATCH_SIZE);
    setListPage(1);
  }, [qDebounced, status, viewMode, listPageSize]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;

    if (!canViewClients) {
      if (role === "client") {
        router.replace("/dashboard/pending");
      } else {
        router.replace("/dashboard");
      }
    }
  }, [authLoading, user, canViewClients, role, router]);

  const gridItems = useMemo(
    () => items.slice(0, visibleGridCount),
    [items, visibleGridCount]
  );

  const listTotalPages = Math.max(1, Math.ceil(items.length / listPageSize));
  const safeListPage = Math.min(listPage, listTotalPages);
  const listItems = useMemo(() => {
    const start = (safeListPage - 1) * listPageSize;
    return items.slice(start, start + listPageSize);
  }, [items, safeListPage, listPageSize]);

  const canLoadMoreGrid = visibleGridCount < items.length || Boolean(nextCursor);
  const listHasNextLocalPage = safeListPage < listTotalPages;
  const canGoNextList = listHasNextLocalPage || Boolean(nextCursor);

  async function handleGridLoadMore() {
    if (visibleGridCount < items.length) {
      setVisibleGridCount((current) =>
        Math.min(current + GRID_BATCH_SIZE, items.length)
      );
      return;
    }

    if (nextCursor) {
      await loadMore();
      setVisibleGridCount((current) => current + GRID_BATCH_SIZE);
    }
  }

  async function handleNextListPage() {
    if (listHasNextLocalPage) {
      setListPage((current) => current + 1);
      return;
    }

    if (nextCursor) {
      await loadMore();
      setListPage((current) => current + 1);
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium tracking-widest uppercase">
            Chargement de l&apos;espace...
          </p>
        </div>
      </div>
    );
  }

  if (!canViewClients) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm font-medium">Redirection...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-10 w-full">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between bg-card p-6 md:p-8 rounded-[2rem] border shadow-sm ring-1 ring-black/5 bg-gradient-to-br from-card to-muted/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex items-center gap-5">
          <div className="bg-primary shadow-xl shadow-primary/20 p-4 rounded-2xl">
            <BriefcaseBusiness className="h-7 w-7 text-primary-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Badge
                variant="outline"
                className="bg-background text-[10px] font-black uppercase tracking-widest py-1 px-3 rounded-full border-muted-foreground/30"
              >
                Donneurs d&apos;ordre
              </Badge>
            </div>
            <h1 className="text-3xl font-black tracking-tighter text-foreground">
              Clients
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 relative z-10">
          <Button
            variant="outline"
            onClick={() => reload?.()}
            disabled={loading}
            className="h-12 rounded-xl px-5 font-bold border-muted-foreground/20 hover:bg-muted transition-all"
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Actualiser
          </Button>

          {canWrite && (
            <Button
              asChild
              className="h-12 rounded-xl px-6 font-black shadow-lg shadow-primary/20 hover:translate-y-[-2px] active:scale-95 transition-all"
            >
              <Link href="/dashboard/clients/new">
                <Plus className="h-5 w-5 mr-2" />
                Nouveau client
              </Link>
            </Button>
          )}
        </div>
      </div>

      <Card className="rounded-[2.5rem] border-none shadow-2xl shadow-black/[0.03] overflow-hidden bg-background/50 backdrop-blur-xl ring-1 ring-black/5">
        <div className="p-6 md:p-8 border-b bg-card/50 flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:max-w-md">
              <Search className="h-5 w-5 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher (nom, email, SIRET...)"
                className="pl-12 h-12 rounded-2xl bg-background border-muted-foreground/20 font-medium text-base shadow-sm focus-visible:ring-primary/30"
              />
            </div>

            <div className="w-full md:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as ClientStatusFilter)}
              >
                <SelectTrigger className="w-full md:w-[200px] h-12 rounded-2xl bg-background border-muted-foreground/20 font-bold shadow-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        status === "active"
                          ? "bg-green-500"
                          : status === "inactive"
                          ? "bg-muted-foreground"
                          : "bg-primary"
                      )}
                    />
                    <SelectValue placeholder="Statut" />
                  </div>
                </SelectTrigger>
                <SelectContent className="rounded-2xl border shadow-2xl">
                  <SelectItem value="all" className="font-medium">
                    Tous les statuts
                  </SelectItem>
                  <SelectItem value="active" className="font-medium">
                    Clients actifs
                  </SelectItem>
                  <SelectItem value="inactive" className="font-medium">
                    Clients inactifs
                  </SelectItem>
                </SelectContent>
              </Select>

              <div className="flex rounded-2xl border bg-muted/30 p-1">
                <Button
                  type="button"
                  variant={viewMode === "grid" ? "default" : "ghost"}
                  onClick={() => setViewMode("grid")}
                  className="h-10 rounded-xl px-4 font-black"
                >
                  <LayoutGrid className="mr-2 h-4 w-4" />
                  Grille
                </Button>
                <Button
                  type="button"
                  variant={viewMode === "list" ? "default" : "ghost"}
                  onClick={() => setViewMode("list")}
                  className="h-10 rounded-xl px-4 font-black"
                >
                  <List className="mr-2 h-4 w-4" />
                  Liste
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted/20 px-4 py-3 text-sm">
            <p className="font-bold text-muted-foreground">
              <span className="text-foreground">{items.length}</span> client(s)
              charges
              {nextCursor ? " - d'autres resultats sont disponibles" : ""}
            </p>
            <Badge variant="outline" className="rounded-full font-black uppercase tracking-widest text-[10px]">
              Vue {viewMode === "grid" ? "grille" : "liste"}
            </Badge>
          </div>
        </div>

        <CardContent className="p-0">
          {error && (
            <div className="m-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
              <p className="text-sm font-bold text-destructive">{error}</p>
            </div>
          )}

          {items.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-4">
              <div className="bg-muted p-6 rounded-full mb-4">
                <Building2 className="h-10 w-10 text-muted-foreground/50" />
              </div>
              <h3 className="text-lg font-bold text-foreground">
                Aucun client trouve
              </h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Essayez de modifier vos termes de recherche ou ajoutez un nouveau
                client.
              </p>
            </div>
          ) : viewMode === "grid" ? (
            <div className="p-6 md:p-8">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {gridItems.map((c: any) => (
                  <Link
                    key={c.id}
                    href={`/dashboard/clients/${c.id}`}
                    className="group rounded-[1.75rem] border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-xl"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20 transition-transform group-hover:scale-105">
                          <span className="font-black text-primary text-xl">
                            {clientInitial(c)}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-lg font-black tracking-tight text-foreground group-hover:text-primary">
                            {c.name}
                          </p>
                          <p className="mt-0.5 truncate text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            {c.legalName || "Client operationnel"}
                          </p>
                        </div>
                      </div>
                      {clientStatusBadge(c.status)}
                    </div>

                    <div className="mt-5 grid gap-3 rounded-2xl bg-muted/25 p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{c.email || "Email non renseigne"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                        <Phone className="h-4 w-4 shrink-0" />
                        <span className="truncate">{c.phone || "Telephone non renseigne"}</span>
                      </div>
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-3">
                      <code className="truncate rounded-lg bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                        SIRET: {c.siret || "Non renseigne"}
                      </code>
                      <span className="flex items-center text-xs font-black uppercase tracking-widest text-primary">
                        Ouvrir
                        <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>

              {(loading || canLoadMoreGrid) && (
                <div className="mt-8 flex flex-col items-center justify-center gap-3">
                  {loading && (
                    <div className="flex items-center gap-3 rounded-full border bg-muted/40 px-5 py-2 text-sm font-bold text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      Chargement...
                    </div>
                  )}

                  {canLoadMoreGrid && (
                    <Button
                      variant="outline"
                      onClick={handleGridLoadMore}
                      disabled={loading}
                      className="h-11 rounded-xl px-8 font-bold border-muted-foreground/30 hover:bg-muted"
                    >
                      {loading ? "Chargement..." : "Charger plus"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/35 hover:bg-muted/35">
                      <TableHead className="min-w-[280px] pl-6 font-black uppercase tracking-[0.12em]">
                        Client
                      </TableHead>
                      <TableHead className="min-w-[260px] font-black uppercase tracking-[0.12em]">
                        Contact
                      </TableHead>
                      <TableHead className="min-w-[170px] font-black uppercase tracking-[0.12em]">
                        SIRET
                      </TableHead>
                      <TableHead className="font-black uppercase tracking-[0.12em]">
                        Statut
                      </TableHead>
                      <TableHead className="pr-6 text-right font-black uppercase tracking-[0.12em]">
                        Action
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {listItems.map((c: any) => (
                      <TableRow
                        key={c.id}
                        className="group cursor-pointer hover:bg-muted/30"
                        onClick={() => router.push(`/dashboard/clients/${c.id}`)}
                      >
                        <TableCell className="pl-6">
                          <div className="flex items-center gap-4">
                            <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                              <span className="font-black text-primary text-sm">
                                {clientInitial(c)}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-black text-foreground group-hover:text-primary">
                                {c.name}
                              </p>
                              <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">
                                {c.legalName || "Client operationnel"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm text-foreground">
                              <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="truncate">{c.email || "Email non renseigne"}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                              <Phone className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{c.phone || "Telephone non renseigne"}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                            {c.siret || "Non renseigne"}
                          </code>
                        </TableCell>
                        <TableCell>{clientStatusBadge(c.status)}</TableCell>
                        <TableCell className="pr-6 text-right">
                          <Button variant="ghost" size="sm" className="rounded-xl font-bold">
                            Ouvrir
                            <ChevronRight className="ml-1 h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {loading && (
                <div className="px-8 py-8 flex justify-center">
                  <div className="flex items-center gap-3 bg-muted/50 px-6 py-3 rounded-full border">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span className="text-sm font-bold text-muted-foreground">
                      Chargement des donnees...
                    </span>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-4 border-t bg-card p-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-sm font-bold text-muted-foreground">
                  Page <span className="text-foreground">{safeListPage}</span>
                  {" / "}
                  <span className="text-foreground">{listTotalPages}</span>
                  {" - "}
                  <span className="text-foreground">{items.length}</span> client(s)
                  charges
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <label className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
                    Lignes
                    <select
                      value={listPageSize}
                      onChange={(event) => {
                        setListPageSize(
                          Number(event.target.value) as (typeof LIST_PAGE_SIZE_OPTIONS)[number]
                        );
                        setListPage(1);
                      }}
                      className="h-10 rounded-xl border bg-background px-3 text-sm font-bold text-foreground"
                    >
                      {LIST_PAGE_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setListPage((current) => Math.max(1, current - 1))}
                      disabled={safeListPage <= 1 || loading}
                      className="h-10 rounded-xl px-4 font-bold"
                    >
                      Precedent
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleNextListPage}
                      disabled={!canGoNextList || loading}
                      className="h-10 rounded-xl px-4 font-bold"
                    >
                      {nextCursor && !listHasNextLocalPage ? "Charger suite" : "Suivant"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
