"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileWarning,
  Loader2,
  Mail,
  Phone,
  Plus,
  Search,
  UserRound,
  Users,
  XCircle,
} from "lucide-react";

import { useAuth } from "@/lib/auth-provider";
import { canManageAgents, normalizeRole } from "@/lib/auth/role";
import { apiFetch } from "@/lib/api/client-fetch";
import { computeAgentCompliance } from "@/lib/agents/compliance";
import { type AgentDocumentItem } from "@/lib/agents/profile";
import { SecureAgentPhoto } from "@/components/agents/secure-agent-photo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";


type Agent = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: "active" | "inactive";
  photoUrl?: string | null;
  employeeNumber?: string | null;
  professionalCardNumber?: string | null;
  professionalCardExpiresAt?: string | null;
  qualifications?: string[];
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  documents?: AgentDocumentItem[];
};

type AgentsPageResponse = {
  ok: boolean;
  agents?: Agent[];
  pageInfo?: {
    pageSize: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
};

type AuthUserLike = { role?: string | null } | null;
type StatusFilter = "all" | "active" | "inactive";

function agentName(agent: Agent) {
  return `${agent.firstName ?? ""} ${agent.lastName ?? ""}`.trim() || "Agent sans nom";
}

function initials(agent: Agent) {
  return `${agent.firstName?.charAt(0) ?? ""}${agent.lastName?.charAt(0) ?? "?"}`.toUpperCase();
}

function statusRank(status: ReturnType<typeof computeAgentCompliance>["status"]) {
  if (status === "blocking") return 0;
  if (status === "warning") return 1;
  if (status === "info") return 2;
  return 3;
}

function complianceLabel(status: ReturnType<typeof computeAgentCompliance>["status"]) {
  if (status === "blocking") return "Bloquant";
  if (status === "warning") return "À compléter";
  if (status === "info") return "À vérifier";
  return "Prêt";
}

function complianceClass(status: ReturnType<typeof computeAgentCompliance>["status"]) {
  if (status === "blocking") return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
  if (status === "warning") return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200";
  if (status === "info") return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
}

function actionLabel(status: ReturnType<typeof computeAgentCompliance>["status"]) {
  if (status === "blocking") return "Régulariser";
  if (status === "warning" || status === "info") return "Compléter";
  return "Ouvrir";
}

export default function AgentsPage() {
  const { user } = useAuth();
  const role = useMemo(
    () => normalizeRole((user as AuthUserLike)?.role) ?? "client",
    [user]
  );
  const canWrite = useMemo(() => canManageAgents(role), [role]);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [pageSize, setPageSize] = useState(25);
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const currentCursor = cursorStack[pageIndex] ?? null;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setCursorStack([null]);
      setPageIndex(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const params = new URLSearchParams({
          status,
          pageSize: String(pageSize),
        });
        if (debouncedQuery) params.set("q", debouncedQuery);
        if (currentCursor) params.set("cursor", currentCursor);

        const response = await apiFetch<AgentsPageResponse>(`/api/agents?${params.toString()}`);
        if (!mounted) return;
        setAgents(response.agents ?? []);
        setNextCursor(response.pageInfo?.nextCursor ?? null);
        setHasMore(Boolean(response.pageInfo?.hasMore && response.pageInfo.nextCursor));
      } catch {
        if (!mounted) return;
        setAgents([]);
        setNextCursor(null);
        setHasMore(false);
        setError("Impossible de charger les agents. Réessayez dans quelques instants.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [currentCursor, debouncedQuery, pageSize, status]);

  const operationalAgents = useMemo(
    () =>
      [...agents].sort((left, right) => {
        const priority =
          statusRank(computeAgentCompliance(left).status) -
          statusRank(computeAgentCompliance(right).status);
        return priority || agentName(left).localeCompare(agentName(right), "fr");
      }),
    [agents]
  );

  const summary = useMemo(
    () =>
      agents.reduce(
        (result, agent) => {
          const compliance = computeAgentCompliance(agent);
          if (compliance.status === "blocking") result.blocking += 1;
          else if (compliance.status === "warning" || compliance.status === "info") result.attention += 1;
          else result.ready += 1;
          return result;
        },
        { blocking: 0, attention: 0, ready: 0 }
      ),
    [agents]
  );

  function changeStatus(nextStatus: StatusFilter) {
    setStatus(nextStatus);
    setCursorStack([null]);
    setPageIndex(0);
  }

  function changePageSize(nextPageSize: number) {
    setPageSize(nextPageSize);
    setCursorStack([null]);
    setPageIndex(0);
  }

  function nextPage() {
    if (!nextCursor || !hasMore) return;
    setCursorStack((current) => [...current.slice(0, pageIndex + 1), nextCursor]);
    setPageIndex((current) => current + 1);
  }

  function previousPage() {
    if (pageIndex <= 0) return;
    setPageIndex((current) => current - 1);
  }

  const hasFilters = Boolean(query.trim()) || status !== "all";

  return (
    <div className="w-full space-y-6 pb-10 animate-in fade-in duration-500">
      <header className="rounded-[1.75rem] border bg-card p-5 shadow-sm md:p-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-primary/10 p-3 text-primary">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">Vivier opérationnel</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight">Agents</h1>
              <p className="mt-1 text-sm font-medium text-muted-foreground">
                Les dossiers nécessitant une action apparaissent en premier sur chaque page.
              </p>
            </div>
          </div>
          {canWrite && (
            <Button asChild className="h-11 rounded-xl px-5 font-black">
              <Link href="/dashboard/agents/new">
                <Plus className="mr-2 h-4 w-4" />
                Ajouter un agent
              </Link>
            </Button>
          )}
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Card className="rounded-2xl border-red-500/20 bg-red-500/5"><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Bloquants</p><p className="mt-1 text-2xl font-black">{summary.blocking}</p></div><AlertTriangle className="h-6 w-6 text-red-600" /></CardContent></Card>
        <Card className="rounded-2xl border-amber-500/20 bg-amber-500/5"><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs font-black uppercase tracking-wider text-muted-foreground">À traiter</p><p className="mt-1 text-2xl font-black">{summary.attention}</p></div><FileWarning className="h-6 w-6 text-amber-600" /></CardContent></Card>
        <Card className="rounded-2xl border-emerald-500/20 bg-emerald-500/5"><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Prêts</p><p className="mt-1 text-2xl font-black">{summary.ready}</p></div><CheckCircle2 className="h-6 w-6 text-emerald-600" /></CardContent></Card>
      </section>
      <p className="-mt-3 text-xs font-medium text-muted-foreground">Indicateurs de la page courante.</p>

      <Card className="overflow-hidden rounded-[1.75rem] shadow-sm">
        <div className="flex flex-col gap-4 border-b bg-muted/15 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full xl:max-w-xl">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher par nom, téléphone, email ou matricule"
              className="h-12 rounded-xl pl-11"
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex rounded-xl border bg-background p-1">
              {(["all", "active", "inactive"] as const).map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant={status === value ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => changeStatus(value)}
                  className="flex-1 rounded-lg px-4 font-bold sm:flex-none"
                >
                  {value === "all" ? "Tous" : value === "active" ? "Actifs" : "Inactifs"}
                </Button>
              ))}
            </div>
            <select
              aria-label="Nombre d’agents par page"
              value={pageSize}
              onChange={(event) => changePageSize(Number(event.target.value))}
              className="h-10 rounded-xl border bg-background px-3 text-sm font-bold"
            >
              <option value={25}>25 par page</option>
              <option value={50}>50 par page</option>
              <option value={100}>100 par page</option>
            </select>
            {hasFilters && (
              <Button type="button" variant="outline" onClick={() => { setQuery(""); changeStatus("all"); }} className="rounded-xl font-bold">
                <XCircle className="mr-2 h-4 w-4" /> Réinitialiser
              </Button>
            )}
          </div>
        </div>

        <CardContent className="p-0">
          {loading ? (
            <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-sm font-semibold">Chargement des agents…</p>
            </div>
          ) : error ? (
            <div className="m-5 rounded-2xl border border-red-500/20 bg-red-500/5 p-8 text-center">
              <AlertTriangle className="mx-auto h-7 w-7 text-red-600" />
              <p className="mt-3 font-bold">{error}</p>
            </div>
          ) : operationalAgents.length === 0 ? (
            <div className="m-5 rounded-2xl border border-dashed p-12 text-center">
              <UserRound className="mx-auto h-9 w-9 text-muted-foreground" />
              <h2 className="mt-3 text-lg font-black">Aucun agent trouvé</h2>
              <p className="mt-1 text-sm text-muted-foreground">Modifiez la recherche ou les filtres pour élargir les résultats.</p>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader><TableRow className="bg-muted/30"><TableHead className="pl-6">Agent</TableHead><TableHead>État opérationnel</TableHead><TableHead>Action prioritaire</TableHead><TableHead>Contact</TableHead><TableHead className="pr-6 text-right">Dossier</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {operationalAgents.map((agent) => {
                      const compliance = computeAgentCompliance(agent);
                      const alert = compliance.alerts[0] ?? null;
                      return (
                        <TableRow key={agent.id}>
                          <TableCell className="pl-6">
                            <div className="flex items-center gap-3">
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted font-black">
                                {agent.photoUrl ? <SecureAgentPhoto src={agent.photoUrl} alt={`Photo ${agentName(agent)}`} className="h-full w-full object-cover" fallback={initials(agent)} /> : initials(agent)}
                              </div>
                              <div><p className="font-black">{agentName(agent)}</p><p className="text-xs text-muted-foreground">{agent.employeeNumber || "Sans matricule"} · {agent.status === "inactive" ? "Inactif" : "Actif"}</p></div>
                            </div>
                          </TableCell>
                          <TableCell><Badge variant="outline" className={cn("font-black", complianceClass(compliance.status))}>{complianceLabel(compliance.status)}</Badge><p className="mt-1 text-xs text-muted-foreground">Dossier {compliance.completeness}%</p></TableCell>
                          <TableCell><p className="max-w-xs font-bold">{alert?.title ?? "Aucune anomalie majeure"}</p><p className="mt-1 max-w-sm truncate text-xs text-muted-foreground">{alert?.detail ?? "L’agent peut être utilisé dans le planning."}</p></TableCell>
                          <TableCell><p className="flex items-center gap-2 text-sm"><Phone className="h-3.5 w-3.5" />{agent.phone || "Non renseigné"}</p><p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><Mail className="h-3.5 w-3.5" />{agent.email || "Non renseigné"}</p></TableCell>
                          <TableCell className="pr-6 text-right"><Button asChild size="sm" variant={compliance.status === "blocking" ? "default" : "outline"} className="rounded-xl font-black"><Link href={`/dashboard/agents/${agent.id}`}>{actionLabel(compliance.status)}<ChevronRight className="ml-1 h-4 w-4" /></Link></Button></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="divide-y md:hidden">
                {operationalAgents.map((agent) => {
                  const compliance = computeAgentCompliance(agent);
                  const alert = compliance.alerts[0] ?? null;
                  return (
                    <div key={agent.id} className="space-y-3 p-5">
                      <div className="flex items-start justify-between gap-3"><div><p className="font-black">{agentName(agent)}</p><p className="text-xs text-muted-foreground">{agent.employeeNumber || "Sans matricule"}</p></div><Badge variant="outline" className={cn("font-black", complianceClass(compliance.status))}>{complianceLabel(compliance.status)}</Badge></div>
                      <div className="rounded-xl bg-muted/30 p-3"><p className="text-sm font-bold">{alert?.title ?? "Aucune anomalie majeure"}</p><p className="mt-1 text-xs text-muted-foreground">{alert?.detail ?? "L’agent peut être utilisé dans le planning."}</p></div>
                      <Button asChild className="w-full rounded-xl font-black" variant={compliance.status === "blocking" ? "default" : "outline"}><Link href={`/dashboard/agents/${agent.id}`}>{actionLabel(compliance.status)}<ChevronRight className="ml-1 h-4 w-4" /></Link></Button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>

        <footer className="flex flex-col gap-3 border-t bg-muted/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-muted-foreground">Page {pageIndex + 1} · {agents.length} agent{agents.length > 1 ? "s" : ""} affiché{agents.length > 1 ? "s" : ""}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={previousPage} disabled={loading || pageIndex === 0} className="flex-1 rounded-xl font-bold sm:flex-none"><ChevronLeft className="mr-1 h-4 w-4" />Précédent</Button>
            <Button type="button" variant="outline" onClick={nextPage} disabled={loading || !hasMore} className="flex-1 rounded-xl font-bold sm:flex-none">Suivant<ChevronRight className="ml-1 h-4 w-4" /></Button>
          </div>
        </footer>
      </Card>
    </div>
  );
}