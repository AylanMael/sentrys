// src/app/dashboard/agents/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client-fetch";
import { useAuth } from "@/lib/auth-provider";
import { canManageAgents, normalizeRole } from "@/lib/auth/role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { computeAgentCompliance } from "@/lib/agents/compliance";
import { type AgentDocumentItem } from "@/lib/agents/profile";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock3,
  Grid2X2,
  List,
  Loader2,
  Mail,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";

type Agent = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  photoUrl?: string | null;
  employeeNumber?: string | null;
  professionalCardNumber?: string | null;
  professionalCardExpiresAt?: string | null;
  qualifications?: string[];
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  documents?: AgentDocumentItem[];
};

type AuthUserLike = {
  role?: string | null;
} | null;

type ViewMode = "grid" | "list";

const PAGE_SIZE_OPTIONS = [12, 25, 50];

function agentName(agent: Agent) {
  const name = `${agent.firstName ?? ""} ${agent.lastName ?? ""}`.trim();
  return name || "Agent sans nom";
}

function agentInitials(agent: Agent) {
  return `${agent.firstName?.charAt(0) || ""}${agent.lastName?.charAt(0) || "?"}`.toUpperCase();
}

function professionalCardLabel(agent: Agent) {
  if (!agent.professionalCardExpiresAt) return "A verifier";

  const target = new Date(`${agent.professionalCardExpiresAt}T00:00:00`);
  if (Number.isNaN(target.getTime())) return "A verifier";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((target.getTime() - today.getTime()) / 86_400_000);

  if (days < 0) return "Expiree";
  if (days <= 60) return `Expire dans ${days} j`;
  return agent.professionalCardExpiresAt;
}

function complianceBadgeClass(status: string) {
  if (status === "blocking") return "border-red-500/30 bg-red-500/10 text-red-700";
  if (status === "warning") return "border-amber-500/30 bg-amber-500/10 text-amber-700";
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700";
}

function complianceLabel(status: string) {
  if (status === "blocking") return "Bloquant";
  if (status === "warning") return "A completer";
  return "Dossier OK";
}

function complianceIcon(status: string) {
  if (status === "blocking") return <AlertTriangle className="h-3 w-3" />;
  if (status === "warning") return <Clock3 className="h-3 w-3" />;
  return <CheckCircle2 className="h-3 w-3" />;
}

export default function AgentsPage() {
  const { user } = useAuth();

  const role = useMemo(
    () => normalizeRole((user as AuthUserLike)?.role) ?? "client",
    [user]
  );

  const canWrite = useMemo(() => canManageAgents(role), [role]);

  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setCurrentPage(1);
  }, [qDebounced, status, viewMode, pageSize]);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        qs.set("status", status);
        qs.set("max", "200");
        if (qDebounced.trim()) qs.set("q", qDebounced.trim());

        const data = await apiFetch<{ ok: boolean; agents?: Agent[] }>(
          `/api/agents?${qs.toString()}`
        );

        if (mounted) {
          setAgents(data.ok ? (data.agents ?? []) : []);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [qDebounced, status]);

  const countActive = useMemo(
    () => agents.filter((a) => a.status === "active").length,
    [agents]
  );

  const complianceSummary = useMemo(() => {
    return agents.reduce(
      (acc, agent) => {
        const compliance = computeAgentCompliance(agent);
        if (compliance.status === "blocking") acc.blocking += 1;
        else if (compliance.status === "warning") acc.warning += 1;
        else acc.ok += 1;
        return acc;
      },
      { ok: 0, warning: 0, blocking: 0 }
    );
  }, [agents]);

  const totalPages = Math.max(1, Math.ceil(agents.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = agents.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const pageEnd = Math.min(safePage * pageSize, agents.length);

  const paginatedAgents = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return agents.slice(start, start + pageSize);
  }, [agents, pageSize, safePage]);

  function goToPage(page: number) {
    setCurrentPage(Math.min(Math.max(page, 1), totalPages));
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-10 w-full">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between bg-card p-6 md:p-8 rounded-[2rem] border shadow-sm ring-1 ring-black/5 bg-gradient-to-br from-card to-muted/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex items-center gap-5">
          <div className="bg-primary shadow-xl shadow-primary/20 p-4 rounded-2xl">
            <ShieldCheck className="h-7 w-7 text-primary-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Badge
                variant="outline"
                className="bg-background text-[10px] font-medium uppercase tracking-widest py-1 px-3 rounded-full border-muted-foreground/30"
              >
                Equipe terrain
              </Badge>
            </div>
            <h1 className="text-3xl font-semibold tracking-tighter text-foreground">
              Agents
            </h1>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              Grille pour visualiser, liste paginee pour piloter un gros vivier.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 relative z-10 w-full md:w-auto">
          <div className="flex items-center bg-background rounded-xl p-1 border shadow-inner">
            <div className="px-4 py-2 flex flex-col items-center justify-center">
              <span className="text-lg font-bold leading-none">{agents.length}</span>
              <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mt-1">
                Total
              </span>
            </div>
            <div className="w-px h-8 bg-border mx-2" />
            <div className="px-4 py-2 flex flex-col items-center justify-center">
              <span className="text-lg font-bold leading-none text-green-600">
                {countActive}
              </span>
              <span className="text-[9px] font-semibold text-green-600/70 uppercase tracking-widest mt-1">
                Actifs
              </span>
            </div>
            <div className="w-px h-8 bg-border mx-2" />
            <div className="px-4 py-2 flex flex-col items-center justify-center">
              <span className="text-lg font-bold leading-none text-amber-600">
                {complianceSummary.warning + complianceSummary.blocking}
              </span>
              <span className="text-[9px] font-semibold text-amber-600/70 uppercase tracking-widest mt-1">
                A traiter
              </span>
            </div>
          </div>

          {canWrite && (
            <Button
              asChild
              className="h-12 rounded-xl px-6 font-semibold shadow-lg shadow-primary/20 hover:translate-y-[-2px] active:scale-95 transition-all w-full sm:w-auto"
            >
              <Link href="/dashboard/agents/new">
                <Plus className="h-5 w-5 mr-2" />
                Ajouter un agent
              </Link>
            </Button>
          )}
        </div>
      </div>

      <Card className="rounded-[2.5rem] border-none shadow-2xl shadow-black/[0.03] overflow-hidden bg-background ring-1 ring-black/5">
        <div className="p-6 md:p-8 border-b border-border/50 bg-muted/10 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full xl:max-w-md">
            <Search className="h-5 w-5 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher nom, email, tel, matricule..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-12 h-12 rounded-2xl bg-card border-border/50 font-medium text-base shadow-sm focus-visible:ring-primary/30"
            />
          </div>

          <div className="flex w-full flex-col gap-3 xl:w-auto xl:flex-row xl:items-center">
            <div className="flex p-1 bg-muted/50 rounded-xl border">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStatus("all")}
                className={cn(
                  "h-10 flex-1 px-5 rounded-lg text-xs font-semibold transition-all xl:flex-none",
                  status === "all"
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Tous
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStatus("active")}
                className={cn(
                  "h-10 flex-1 px-5 rounded-lg text-xs font-semibold transition-all xl:flex-none",
                  status === "active"
                    ? "bg-background shadow-sm text-green-600"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Actifs
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStatus("inactive")}
                className={cn(
                  "h-10 flex-1 px-5 rounded-lg text-xs font-semibold transition-all xl:flex-none",
                  status === "inactive"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Inactifs
              </Button>
            </div>

            <div className="flex p-1 bg-muted/50 rounded-xl border">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setViewMode("grid")}
                className={cn(
                  "h-10 flex-1 px-4 rounded-lg text-xs font-semibold xl:flex-none",
                  viewMode === "grid" ? "bg-background shadow-sm" : "text-muted-foreground"
                )}
              >
                <Grid2X2 className="mr-2 h-4 w-4" />
                Grille
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setViewMode("list")}
                className={cn(
                  "h-10 flex-1 px-4 rounded-lg text-xs font-semibold xl:flex-none",
                  viewMode === "list" ? "bg-background shadow-sm" : "text-muted-foreground"
                )}
              >
                <List className="mr-2 h-4 w-4" />
                Liste
              </Button>
            </div>
          </div>
        </div>

        <CardContent className="p-6 md:p-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-xs font-semibold uppercase tracking-widest">
                Recherche des profils...
              </p>
            </div>
          ) : agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center px-4 border-2 border-dashed border-border/50 rounded-[2rem]">
              <div className="bg-muted p-6 rounded-full mb-4">
                <Users className="h-10 w-10 text-muted-foreground/50" />
              </div>
              <h3 className="text-xl font-semibold text-foreground">
                Aucun agent trouve
              </h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm mb-6">
                Essayez de modifier vos filtres ou ajoutez un nouveau profil a votre equipe.
              </p>
              {canWrite && (
                <Button asChild variant="outline" className="rounded-xl font-semibold">
                  <Link href="/dashboard/agents/new">Creer le premier agent</Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 rounded-2xl border bg-muted/15 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-black text-foreground">
                    {pageStart}-{pageEnd} sur {agents.length} agent(s)
                  </p>
                  <p className="text-xs font-medium text-muted-foreground">
                    Vue {viewMode === "grid" ? "grille" : "liste"} avec pagination locale.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                    Lignes
                  </span>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <Button
                      key={size}
                      type="button"
                      variant={pageSize === size ? "default" : "outline"}
                      size="sm"
                      className="h-9 rounded-xl font-black"
                      onClick={() => setPageSize(size)}
                    >
                      {size}
                    </Button>
                  ))}
                </div>
              </div>

              {viewMode === "grid" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {paginatedAgents.map((a) => {
                    const compliance = computeAgentCompliance(a);
                    const firstAlert = compliance.alerts[0] ?? null;

                    return (
                      <Link key={a.id} href={`/dashboard/agents/${a.id}`} className="group block">
                        <div className="h-full flex flex-col p-5 rounded-[1.5rem] border border-border/50 bg-card hover:bg-muted/30 hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-black/5 hover:-translate-y-0.5">
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-4">
                              <div
                                className={cn(
                                  "h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 border transition-transform group-hover:scale-105 overflow-hidden",
                                  a.status === "active"
                                    ? "bg-primary/10 border-primary/20 text-primary"
                                    : "bg-muted border-border text-muted-foreground"
                                )}
                              >
                                {a.photoUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={a.photoUrl}
                                    alt={`Photo ${agentName(a)}`}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <span className="font-bold text-sm tracking-widest">
                                    {agentInitials(a)}
                                  </span>
                                )}
                              </div>
                              <div>
                                <h3 className="font-semibold text-base text-foreground group-hover:text-primary transition-colors line-clamp-1">
                                  {agentName(a)}
                                </h3>
                                <Badge
                                  variant={a.status === "active" ? "default" : "secondary"}
                                  className={cn(
                                    "mt-1 px-2 py-0 h-5 text-[9px] font-semibold uppercase tracking-wider",
                                    a.status === "active"
                                      ? "bg-green-500/10 text-green-700 border-transparent"
                                      : "opacity-60"
                                  )}
                                >
                                  {a.status === "active" ? "Actif" : "Inactif"}
                                </Badge>
                              </div>
                            </div>
                            <div className="h-8 w-8 rounded-full bg-background border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0">
                              <ChevronRight className="h-4 w-4 text-primary" />
                            </div>
                          </div>

                          <div className="mb-4 rounded-2xl border bg-muted/20 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "gap-1.5 text-[10px] font-black uppercase tracking-[0.14em]",
                                  complianceBadgeClass(compliance.status)
                                )}
                              >
                                {complianceIcon(compliance.status)}
                                {complianceLabel(compliance.status)}
                              </Badge>
                              <span className="text-xs font-black text-muted-foreground">
                                {compliance.completeness}%
                              </span>
                            </div>
                            {firstAlert && (
                              <p className="mt-2 line-clamp-1 text-xs font-medium text-muted-foreground">
                                {firstAlert.title}
                              </p>
                            )}
                          </div>

                          <div className="mt-auto space-y-2 pt-4 border-t border-border/50">
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                              <Mail className="h-3.5 w-3.5 shrink-0 opacity-50" />
                              <span className="truncate">{a.email || "Aucun email"}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                              <Phone className="h-3.5 w-3.5 shrink-0 opacity-50" />
                              <span className="truncate">{a.phone || "Aucun telephone"}</span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="overflow-hidden rounded-[1.75rem] border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/35 hover:bg-muted/35">
                        <TableHead className="min-w-[260px] pl-6 font-black uppercase tracking-[0.12em]">Agent</TableHead>
                        <TableHead className="font-black uppercase tracking-[0.12em]">Statut</TableHead>
                        <TableHead className="font-black uppercase tracking-[0.12em]">Conformite</TableHead>
                        <TableHead className="font-black uppercase tracking-[0.12em]">Carte pro</TableHead>
                        <TableHead className="font-black uppercase tracking-[0.12em]">Contact</TableHead>
                        <TableHead className="pr-6 text-right font-black uppercase tracking-[0.12em]">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedAgents.map((a) => {
                        const compliance = computeAgentCompliance(a);
                        const firstAlert = compliance.alerts[0] ?? null;

                        return (
                          <TableRow key={a.id} className="group">
                            <TableCell className="pl-6">
                              <div className="flex items-center gap-3">
                                <div
                                  className={cn(
                                    "flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border font-black tracking-widest",
                                    a.status === "active"
                                      ? "border-primary/20 bg-primary/10 text-primary"
                                      : "border-border bg-muted text-muted-foreground"
                                  )}
                                >
                                  {a.photoUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={a.photoUrl} alt={`Photo ${agentName(a)}`} className="h-full w-full object-cover" />
                                  ) : (
                                    agentInitials(a)
                                  )}
                                </div>
                                <div>
                                  <p className="font-black text-foreground">{agentName(a)}</p>
                                  <p className="text-xs font-medium text-muted-foreground">
                                    {a.employeeNumber || "Matricule non renseigne"}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={a.status === "active" ? "default" : "secondary"}
                                className={cn(
                                  "font-black uppercase tracking-[0.12em]",
                                  a.status === "active"
                                    ? "bg-green-500/10 text-green-700 hover:bg-green-500/10"
                                    : "opacity-70"
                                )}
                              >
                                {a.status === "active" ? "Actif" : "Inactif"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <Badge variant="outline" className={cn("gap-1.5 font-black", complianceBadgeClass(compliance.status))}>
                                  {complianceIcon(compliance.status)}
                                  {complianceLabel(compliance.status)}
                                </Badge>
                                <p className="text-xs font-medium text-muted-foreground">
                                  {compliance.completeness}% {firstAlert ? `- ${firstAlert.title}` : "- Pret"}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1 text-sm">
                                <p className="font-bold text-foreground">
                                  {a.professionalCardNumber || "Numero absent"}
                                </p>
                                <p className="text-xs font-medium text-muted-foreground">
                                  {professionalCardLabel(a)}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1 text-xs font-medium text-muted-foreground">
                                <p className="flex items-center gap-2">
                                  <Mail className="h-3.5 w-3.5" />
                                  <span className="max-w-[180px] truncate">{a.email || "Aucun email"}</span>
                                </p>
                                <p className="flex items-center gap-2">
                                  <Phone className="h-3.5 w-3.5" />
                                  <span>{a.phone || "Aucun telephone"}</span>
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="pr-6 text-right">
                              <Button asChild size="sm" className="rounded-xl font-black">
                                <Link href={`/dashboard/agents/${a.id}`}>
                                  Ouvrir
                                  <ChevronRight className="h-4 w-4" />
                                </Link>
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="flex flex-col gap-3 rounded-2xl border bg-muted/15 p-4 md:flex-row md:items-center md:justify-between">
                <p className="text-sm font-semibold text-muted-foreground">
                  Page {safePage} sur {totalPages} - {pageStart}-{pageEnd} / {agents.length}
                </p>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="icon" className="rounded-xl" disabled={safePage <= 1} onClick={() => goToPage(1)}>
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" size="icon" className="rounded-xl" disabled={safePage <= 1} onClick={() => goToPage(safePage - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="min-w-24 rounded-xl border bg-background px-4 py-2 text-center text-sm font-black">
                    {safePage} / {totalPages}
                  </div>
                  <Button type="button" variant="outline" size="icon" className="rounded-xl" disabled={safePage >= totalPages} onClick={() => goToPage(safePage + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" size="icon" className="rounded-xl" disabled={safePage >= totalPages} onClick={() => goToPage(totalPages)}>
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
