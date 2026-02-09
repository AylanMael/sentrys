"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  Loader2,
  Siren,
  Trash2,
  Users,
  Save,
  PlusCircle,
} from "lucide-react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api/client-fetch";

import type { Site } from "@/lib/sites/types";
import { SiteForm, type SiteFormValues } from "@/components/sites/site-form";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";

type Severity = "Faible" | "Moyenne" | "Élevée";
type Status = "Ouvert" | "Clos";

type IncidentDoc = {
  tenantId: string;
  siteId: string;
  siteName?: string;
  severity: Severity;
  status: Status;
  description: string;
  createdAt?: Timestamp;
  createdBy?: { uid: string; email?: string | null };
};

type IncidentRow = IncidentDoc & { id: string };

type AgentApi = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  status?: "active" | "inactive";
};

type ApiWarning = {
  code: string;
  rejected?: Array<{ id: string; reason: string }>;
  acceptedCount?: number;
};

function severityVariant(sev: Severity) {
  if (sev === "Élevée") return "destructive";
  return "outline";
}

function tsToDate(ts?: Timestamp) {
  return ts?.toDate?.() ?? new Date(0);
}

function safeArr(v: unknown): string[] {
  return Array.isArray(v)
    ? (v.filter((x) => typeof x === "string") as string[])
    : [];
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function agentLabel(a: AgentApi) {
  const name = `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim();
  return name || a.email || a.id;
}

export default function SiteDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();

  const { user } = useAuth();
  const { toast } = useToast();

  const role = String((user as any)?.role ?? "");
  const isAdmin = role === "admin";
  const canWrite = role === "admin" || role === "manager";

  const [site, setSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Incidents liés
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [incidentsLoading, setIncidentsLoading] = useState(true);
  const [incidentsError, setIncidentsError] = useState<string | null>(null);

  // Affectations (agents via API)
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);
  const [agentsApi, setAgentsApi] = useState<AgentApi[]>([]);
  const [agentsApiLoading, setAgentsApiLoading] = useState(false);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [agentSearch, setAgentSearch] = useState("");

  // Agents affectés (affichage sur la page)
  const [assignedAgents, setAssignedAgents] = useState<AgentApi[]>([]);
  const [assignedLoading, setAssignedLoading] = useState(false);
  const [assignedError, setAssignedError] = useState<string | null>(null);

  // ---- Listen site ----
  useEffect(() => {
    if (!id || !(user as any)?.tenantId) return;

    if (!db) {
      setLoading(false);
      toast({
        title: "Firestore indisponible",
        description: "Vérifie la config Firebase (.env).",
        variant: "destructive",
      });
      return;
    }

    const ref = doc(db, "sites", id);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setLoading(false);
        if (!snap.exists()) {
          setSite(null);
          return;
        }

        const raw = snap.data() as any;

        const data = {
          id: snap.id,
          ...(raw as any),
          managerIds: safeArr(raw?.managerIds),
          agentIds: safeArr(raw?.agentIds),
          accessUids: safeArr(raw?.accessUids),
        } as Site;

        // garde-fou tenant
        if (
          (data as any).tenantId &&
          (data as any).tenantId !== (user as any).tenantId
        ) {
          setSite(null);
          toast({
            title: "Accès refusé",
            description: "Ce site n’appartient pas à votre organisation.",
            variant: "destructive",
          });
          return;
        }

        // garde-fou RBAC (UI)
        if (!isAdmin) {
          const uid = (user as any)?.uid;
          const access = safeArr((data as any).accessUids);
          const legacy = uniq([...safeArr((data as any).managerIds)]);

          const allowed =
            !!uid &&
            (access.includes(uid) ||
              (access.length === 0 && legacy.includes(uid)));

          if (!allowed) {
            setSite(null);
            toast({
              title: "Accès refusé",
              description: "Vous n’êtes pas affecté à ce site.",
              variant: "destructive",
            });
            return;
          }
        }

        setSite(data);

        // ✅ ne pas écraser la sélection pendant que le dialog est ouvert
        if (!assignOpen) {
          setSelectedAgentIds(safeArr((data as any).agentIds));
        }
      },
      (err) => {
        console.error(err);
        setLoading(false);
        toast({
          title: "Erreur",
          description: "Impossible de charger le site.",
          variant: "destructive",
        });
      }
    );

    return () => unsub();
    // ✅ assignOpen ajouté aux deps
  }, [
    id,
    toast,
    (user as any)?.tenantId,
    (user as any)?.uid,
    isAdmin,
    assignOpen,
  ]);

  // ---- Listen incidents by site ----
  useEffect(() => {
    if (!id) return;

    if (!(user as any)?.tenantId) {
      setIncidents([]);
      setIncidentsLoading(false);
      return;
    }

    if (!db) {
      setIncidentsLoading(false);
      setIncidentsError("Firestore indisponible.");
      return;
    }

    setIncidentsLoading(true);
    setIncidentsError(null);

    const qy = query(
      collection(db, "incidents"),
      where("tenantId", "==", (user as any).tenantId),
      where("siteId", "==", id),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const next: IncidentRow[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));
        setIncidents(next);
        setIncidentsLoading(false);
      },
      (err) => {
        console.error("Incidents by site onSnapshot error:", err);
        const msg =
          err?.message?.includes("requires an index")
            ? "Index Firestore manquant pour cette requête (tenantId + siteId + createdAt)."
            : err?.message?.includes("Missing or insufficient permissions")
            ? "Permissions Firestore insuffisantes (règles incidents)."
            : "Impossible de charger les incidents du site.";
        setIncidentsError(msg);
        setIncidentsLoading(false);
      }
    );

    return () => unsub();
  }, [id, (user as any)?.tenantId]);

  // ---- Load agents (API) when dialog opens ----
  useEffect(() => {
    if (!assignOpen) return;

    setAgentsApiLoading(true);

    (async () => {
      try {
        const data = await apiFetch<{
          ok: boolean;
          agents?: AgentApi[];
          error?: string;
        }>(`/api/agents?status=active&max=200`);

        if (!data.ok) {
          toast({
            title: "Erreur",
            description: data.error ?? "Impossible de charger les agents.",
            variant: "destructive",
          });
          setAgentsApi([]);
          return;
        }

        const rows = (data.agents ?? []).slice().sort((a, b) => {
          const ak = `${(a.firstName ?? "").toLowerCase()} ${(a.lastName ?? "")
            .toLowerCase()
            .trim()}`.trim();
          const bk = `${(b.firstName ?? "").toLowerCase()} ${(b.lastName ?? "")
            .toLowerCase()
            .trim()}`.trim();
          return ak.localeCompare(bk);
        });

        setAgentsApi(rows);
      } catch (e: any) {
        toast({
          title: "Erreur",
          description: e?.message ?? "Impossible de charger les agents.",
          variant: "destructive",
        });
        setAgentsApi([]);
      } finally {
        setAgentsApiLoading(false);
      }
    })();
  }, [assignOpen, toast]);

  // ✅ filtrage agents (recherche)
  const filteredAgentsApi = useMemo(() => {
    const q = agentSearch.trim().toLowerCase();
    if (!q) return agentsApi;
    return agentsApi.filter((a) => {
      const hay = `${agentLabel(a)} ${a.email ?? ""} ${a.phone ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [agentsApi, agentSearch]);

  // ---- Load assigned agents ONLY by ids ----
  useEffect(() => {
    if (!site) return;

    const agentIds = safeArr((site as any)?.agentIds);
    if (agentIds.length === 0) {
      setAssignedAgents([]);
      setAssignedError(null);
      setAssignedLoading(false);
      return;
    }

    setAssignedLoading(true);
    setAssignedError(null);

    (async () => {
      try {
        const qs = new URLSearchParams();
        qs.set("ids", agentIds.join(","));

        const data = await apiFetch<{
          ok: boolean;
          agents?: AgentApi[];
          error?: string;
        }>(`/api/agents?${qs.toString()}`);

        if (!data.ok) {
          setAssignedAgents([]);
          setAssignedError(data.error ?? "Impossible de charger les agents.");
          return;
        }

        const byId = new Map((data.agents ?? []).map((a) => [a.id, a]));
        const ordered = agentIds
          .map((aid) => byId.get(aid))
          .filter(Boolean) as AgentApi[];

        setAssignedAgents(ordered);
      } catch (e: any) {
        setAssignedAgents([]);
        setAssignedError(e?.message ?? "Impossible de charger les agents.");
      } finally {
        setAssignedLoading(false);
      }
    })();
  }, [site]);

  const initialValues = useMemo(() => {
    if (!site) return undefined;
    return {
      name: (site as any).name ?? "",
      clientName: (site as any).clientName ?? "",
      siteType: (((site as any).siteType ?? "bureaux") as any),
      riskLevel: (((site as any).riskLevel ?? 3) as any),
      address: (site as any).address ?? "",
      city: (site as any).city ?? "",
      postalCode: (site as any).postalCode ?? "",
      instructions: (site as any).instructions ?? "",
      isActive: Boolean((site as any).isActive ?? true),
    } satisfies Partial<SiteFormValues>;
  }, [site]);

  const isAssigned = useMemo(() => {
    const uid = (user as any)?.uid;
    if (!uid || !site) return false;

    const access = safeArr((site as any).accessUids);
    if (access.length > 0) return access.includes(uid);

    const managers = safeArr((site as any).managerIds);
    return managers.includes(uid);
  }, [site, (user as any)?.uid]);

  function toggleInList(list: string[], value: string) {
    return list.includes(value)
      ? list.filter((x) => x !== value)
      : [...list, value];
  }

  // ✅ save via API (unification + validation serveur)
  async function save(values: SiteFormValues) {
    if (!user) {
      toast({
        title: "Non connecté",
        description: "Veuillez vous reconnecter.",
        variant: "destructive",
      });
      return;
    }
    if (!(user as any).tenantId) {
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
    if (!id) return;

    setSaving(true);
    try {
      const res = await apiFetch<{ ok: boolean; error?: string }>(
        `/api/sites/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: values.name,
            clientName: values.clientName || null,
            siteType: values.siteType,
            riskLevel: values.riskLevel,
            address: values.address || null,
            city: values.city || null,
            postalCode: values.postalCode || null,
            instructions: values.instructions || null,
            isActive: values.isActive,
          }),
        }
      );

      if (!res.ok) {
        toast({
          title: "Erreur",
          description: res.error ?? "Sauvegarde impossible.",
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Enregistré", description: "Modifications appliquées." });
    } catch (e: any) {
      console.error(e);
      toast({
        title: "Erreur",
        description: e?.message ?? "Sauvegarde impossible.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  // ✅ saveAssignments: warnings + UX
  async function saveAssignments() {
    if (!id || !site) return;

    if (!canWrite) {
      toast({
        title: "Accès refusé",
        description: "Droits insuffisants.",
        variant: "destructive",
      });
      return;
    }

    const agentIds = uniq(selectedAgentIds);

    setAssignSaving(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        error?: string;
        warnings?: ApiWarning[];
      }>(`/api/sites/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ agentIds }),
      });

      if (!res.ok) {
        toast({
          title: "Erreur",
          description: res.error ?? "Impossible d’enregistrer les affectations.",
          variant: "destructive",
        });
        return;
      }

      const w = res.warnings?.find((x) => x.code === "site_agentIds_rejected");
      if (w?.rejected?.length) {
        toast({
          title: "Affectation partielle",
          description: `${w.rejected.length} agent(s) refusé(s) (inactif / introuvable / non autorisé).`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Affectations enregistrées",
          description: "Agents affectés au site.",
        });
      }

      setAssignOpen(false);
      setAgentSearch("");
    } catch (e: any) {
      console.error(e);
      toast({
        title: "Erreur",
        description: e?.message ?? "Impossible d’enregistrer les affectations.",
        variant: "destructive",
      });
    } finally {
      setAssignSaving(false);
    }
  }

  // ✅ soft delete => isActive:false via API
  async function remove() {
    if (!user) {
      toast({
        title: "Non connecté",
        description: "Veuillez vous reconnecter.",
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
    if (!id) return;

    const ok = window.confirm(
      "Désactiver ce site ?\n\nLe site restera dans l’historique, mais ne sera plus “Actif”."
    );
    if (!ok) return;

    setDeleting(true);
    try {
      const res = await apiFetch<{ ok: boolean; error?: string }>(
        `/api/sites/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ isActive: false }),
        }
      );

      if (!res.ok) {
        toast({
          title: "Erreur",
          description: res.error ?? "Désactivation impossible.",
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Désactivé", description: "Le site est maintenant inactif." });
      // on reste sur la page, le badge va se mettre à jour via onSnapshot
    } catch (e) {
      console.error(e);
      toast({
        title: "Erreur",
        description: "Désactivation impossible.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border p-6 text-sm text-muted-foreground">
        Chargement...
      </div>
    );
  }

  if (!site) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border p-6 text-sm text-muted-foreground">
          Site introuvable (ou accès refusé).
        </div>
        <Button variant="outline" onClick={() => router.push("/dashboard/sites")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour aux sites
        </Button>
      </div>
    );
  }

  const siteAgentIds = safeArr((site as any).agentIds);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => router.push("/dashboard/sites")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour
            </Button>

            {isAssigned ? <Badge variant="outline">Assigné</Badge> : null}

            <Badge variant={(site as any).isActive ? "default" : "secondary"}>
              {(site as any).isActive ? "Actif" : "Inactif"}
            </Badge>

            <Badge variant="outline">
              Risque {(site as any).riskLevel ?? 3}/5
            </Badge>
          </div>

          <h1 className="text-2xl font-semibold">{(site as any).name}</h1>
          <p className="text-sm text-muted-foreground">
            {(site as any).clientName
              ? `Client : ${(site as any).clientName} • `
              : ""}
            {(site as any).city ? (site as any).city : "Ville non renseignée"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Nouveau rapport sur ce site (pré-rempli) */}
          <Button asChild className="gap-2">
            <Link href={`/dashboard/incidents?create=1&siteId=${id}`}>
              <PlusCircle className="h-4 w-4" />
              Nouveau rapport
            </Link>
          </Button>

          {/* Affectations */}
          {canWrite ? (
            <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Users className="h-4 w-4" />
                  Affectations
                </Button>
              </DialogTrigger>

              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Affectations du site</DialogTitle>
                </DialogHeader>

                <div className="text-sm text-muted-foreground">
                  Sélectionne les{" "}
                  <span className="font-medium">agents</span> autorisés à intervenir
                  sur ce site.
                </div>

                <Separator />

                {agentsApiLoading ? (
                  <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Chargement des agents…
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <div className="font-medium">Agents</div>
                      <div className="text-xs text-muted-foreground">
                        Sélection multiple — ces agents seront disponibles pour les
                        vacations/assignations sur ce site.
                      </div>
                    </div>

                    {/* ✅ recherche + actions */}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <Input
                        placeholder="Rechercher un agent…"
                        value={agentSearch}
                        onChange={(e) => setAgentSearch(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setSelectedAgentIds(uniq(agentsApi.map((a) => a.id)))
                          }
                        >
                          Tout
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedAgentIds([])}
                        >
                          Aucun
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-lg border p-3 space-y-2 max-h-[420px] overflow-auto">
                      {filteredAgentsApi.length === 0 ? (
                        <div className="text-sm text-muted-foreground">
                          Aucun agent actif.
                        </div>
                      ) : (
                        filteredAgentsApi.map((a) => {
                          const checked = selectedAgentIds.includes(a.id);
                          return (
                            <label
                              key={a.id}
                              className="flex items-start gap-3 rounded-md p-2 hover:bg-muted/50 cursor-pointer"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() =>
                                  setSelectedAgentIds((prev) =>
                                    toggleInList(prev, a.id)
                                  )
                                }
                              />
                              <div className="text-sm">
                                <div className="font-medium">{agentLabel(a)}</div>
                                <div className="text-xs text-muted-foreground">
                                  {a.email ?? "—"} • {a.phone ?? "—"}
                                </div>
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                <Separator />

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-muted-foreground">
                    Agents sélectionnés :{" "}
                    <span className="font-medium">{selectedAgentIds.length}</span>
                  </div>

                  <Button
                    onClick={saveAssignments}
                    disabled={assignSaving}
                    className="gap-2"
                  >
                    {assignSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Enregistrer
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : null}

          {canWrite ? (
            <Button variant="destructive" onClick={remove} disabled={deleting}>
              <Trash2 className="mr-2 h-4 w-4" />
              {deleting ? "Désactivation..." : "Désactiver"}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Affichage Agents affectés */}
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>Agents affectés</CardTitle>
          <CardDescription>
            {siteAgentIds.length === 0
              ? "Aucun agent affecté pour l’instant."
              : `${siteAgentIds.length} agent(s) affecté(s) à ce site.`}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {siteAgentIds.length === 0 ? (
            <div className="rounded-lg border p-6 text-sm text-muted-foreground">
              Utilise “Affectations” pour ajouter des agents.
            </div>
          ) : assignedLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement des agents…
            </div>
          ) : assignedError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
                <div className="space-y-1">
                  <p className="font-medium text-destructive">Erreur</p>
                  <p className="text-muted-foreground">{assignedError}</p>
                </div>
              </div>
            </div>
          ) : assignedAgents.length === 0 ? (
            <div className="rounded-lg border p-6 text-sm text-muted-foreground">
              Agents introuvables (IDs non trouvés côté API). Vérifie les `agentIds`
              dans le document site.
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Téléphone</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {assignedAgents.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">
                        {agentLabel(a)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {a.email ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {a.phone ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={a.status === "inactive" ? "secondary" : "outline"}
                        >
                          {a.status === "inactive" ? "Inactif" : "Actif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/dashboard/agents/${a.id}`}>Voir</Link>
                          </Button>

                          {/* Incident pré-rempli (site + agent) */}
                          <Button asChild size="sm">
                            <Link
                              href={`/dashboard/incidents?create=1&siteId=${id}&agentId=${a.id}`}
                            >
                              <Siren className="mr-2 h-4 w-4" />
                              Incident
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modifier le site</CardTitle>
        </CardHeader>
        <CardContent>
          <SiteForm
            initialValues={initialValues}
            submitLabel="Mettre à jour"
            onSubmit={save}
            isSubmitting={saving}
          />
        </CardContent>
      </Card>

      {/* Incidents liés au site */}
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Siren className="h-5 w-5" />
                Incidents liés à ce site
              </CardTitle>
              <CardDescription>
                Historique des incidents rattachés à ce site (tri décroissant).
              </CardDescription>
            </div>

            <Button asChild variant="outline">
              <Link href="/dashboard/incidents">
                <ExternalLink className="mr-2 h-4 w-4" />
                Ouvrir la boîte incidents
              </Link>
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {incidentsLoading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement des incidents…
            </div>
          ) : incidentsError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
                <div className="space-y-1">
                  <p className="font-medium text-destructive">Erreur</p>
                  <p className="text-muted-foreground">{incidentsError}</p>
                  {incidentsError.includes("Index Firestore") ? (
                    <p className="text-muted-foreground">
                      Ouvre la console Firebase &gt; Firestore &gt; Index et crée
                      l’index proposé.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : incidents.length === 0 ? (
            <div className="rounded-lg border p-6 text-sm text-muted-foreground">
              Aucun incident n’est encore rattaché à ce site.
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sévérité</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Créé le</TableHead>
                    <TableHead>Créé par</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {incidents.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell>
                        <Badge
                          variant={severityVariant(it.severity)}
                          className={cn(
                            it.severity === "Moyenne" &&
                              "bg-accent text-accent-foreground border-accent"
                          )}
                        >
                          {it.severity}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        <Badge variant={it.status === "Ouvert" ? "default" : "outline"}>
                          {it.status}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        {format(tsToDate(it.createdAt), "PPPP 'à' p", { locale: fr })}
                      </TableCell>

                      <TableCell className="text-muted-foreground">
                        {it.createdBy?.email ?? "—"}
                      </TableCell>

                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/dashboard/incidents/${it.id}`}>Voir</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
