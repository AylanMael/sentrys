"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import type { Unsubscribe } from "firebase/firestore";
import {
  ArrowLeft,
  Loader2,
  RefreshCcw,
  AlertTriangle,
  Users,
  Save,
} from "lucide-react";

import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api/client-fetch";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";

// ✅ REBRANCH COMMENTAIRES
import { IncidentComments } from "@/components/incidents/incident-comments";

// -------------------------------------
// Types (alignés sur ton modèle)
// -------------------------------------
type Severity = "Faible" | "Moyenne" | "Élevée";
type Status = "Ouvert" | "Clos";

type AssignedAgentSnapshot = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
};

type IncidentDoc = {
  tenantId: string;

  siteId: string;
  siteName: string;

  severity: Severity;
  status: Status;
  description: string;

  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  closedAt?: Timestamp | null;

  createdBy: { uid: string; name?: string | null; email?: string | null };
  closedBy?: { uid: string; email?: string | null } | null;

  // ✅ Assignation agent (nouveaux champs)
  assignedAgentId?: string | null; // id doc agents/{id}
  assignedAgentSnapshot?: AssignedAgentSnapshot | null;
  assignedAt?: Timestamp | null;
  assignedBy?: { uid: string; email?: string | null } | null;

  statusKey?: "ouvert" | "clos";
  severityKey?: "faible" | "moyenne" | "elevee";
};

type SiteDoc = {
  tenantId: string;
  name?: string;
  // ⚠️ agentIds = ids des docs "agents"
  agentIds?: string[];
  // managers (uids) pour RBAC
  managerIds?: string[];
  accessUids?: string[];
};

type AgentApi = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  status?: "active" | "inactive";
};

function formatFR(ts?: Timestamp | null) {
  const d = ts?.toDate?.();
  if (!d) return "—";
  return d.toLocaleString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SeverityBadge({ v }: { v?: Severity }) {
  if (!v) return <Badge variant="outline">—</Badge>;
  const variant =
    v === "Élevée" ? "destructive" : v === "Moyenne" ? "secondary" : "outline";
  return <Badge variant={variant}>{v}</Badge>;
}

function StatusBadge({ v }: { v?: Status }) {
  if (!v) return <Badge variant="outline">—</Badge>;
  const variant = v === "Ouvert" ? "destructive" : "outline";
  return <Badge variant={variant}>{v}</Badge>;
}

function safeArr(v: unknown): string[] {
  return Array.isArray(v)
    ? (v.filter((x) => typeof x === "string") as string[])
    : [];
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function agentLabel(a?: AgentApi | AssignedAgentSnapshot | null) {
  if (!a) return "—";
  const n = `${(a as any).firstName ?? ""} ${(a as any).lastName ?? ""}`.trim();
  return n || (a as any).email || (a as any).id || "—";
}

export default function IncidentDetailPage() {
  const router = useRouter();
  const params = useParams();

  const rawId = (params as any)?.id as string | string[] | undefined;
  const incidentId = Array.isArray(rawId) ? rawId[0] : rawId;

  const { toast } = useToast();
  const { user, loading } = useAuth();

  const tenantId = (user as any)?.tenantId ?? null;
  const role = String((user as any)?.role ?? "");
  const canWrite = role === "admin" || role === "manager";
  const canClose = canWrite;

  const canRead = useMemo(() => {
    return !!db && !!incidentId && !loading && !!tenantId;
  }, [incidentId, loading, tenantId]);

  const [incident, setIncident] = useState<(IncidentDoc & { id: string }) | null>(
    null
  );
  const [loadingIncident, setLoadingIncident] = useState(true);
  const [busy, setBusy] = useState(false);

  // ✅ Site doc (pour connaître agentIds affectés)
  const [siteDoc, setSiteDoc] = useState<(SiteDoc & { id: string }) | null>(null);
  const [siteLoading, setSiteLoading] = useState(false);

  // ✅ Assignation UI
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);

  const [agentsApi, setAgentsApi] = useState<AgentApi[]>([]);
  const [agentsApiLoading, setAgentsApiLoading] = useState(false);

  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);

  // Listen Incident
  useEffect(() => {
    let unsub: Unsubscribe | null = null;

    if (!canRead) {
      setIncident(null);
      setLoadingIncident(false);
      return;
    }

    setLoadingIncident(true);

    unsub = onSnapshot(
      doc(db!, "incidents", incidentId!),
      (snap) => {
        if (!snap.exists()) {
          setIncident(null);
          setLoadingIncident(false);
          return;
        }

        const data = snap.data() as any;

        // garde-fou tenant
        if (data?.tenantId && data.tenantId !== tenantId) {
          setIncident(null);
          setLoadingIncident(false);
          toast({
            variant: "destructive",
            title: "Accès refusé",
            description: "Cet incident n’appartient pas à votre organisation.",
          });
          return;
        }

        const next = { ...(data as IncidentDoc), id: snap.id };
        setIncident(next);
        setLoadingIncident(false);

        // ✅ si incident déjà assigné, on sync le state
        const currentAssigned = String(next.assignedAgentId ?? "").trim();
        setSelectedAgentIds(currentAssigned ? [currentAssigned] : []);
      },
      (err) => {
        console.error("Incident onSnapshot error:", err);
        setIncident(null);
        setLoadingIncident(false);
        toast({
          variant: "destructive",
          title: "Erreur",
          description: err?.message ?? "Impossible de charger l’incident.",
        });
      }
    );

    return () => unsub?.();
  }, [canRead, incidentId, tenantId, toast]);

  // ✅ Listen Site doc (dépend de incident.siteId)
  useEffect(() => {
    let unsub: Unsubscribe | null = null;

    if (!db || !incident?.siteId || !tenantId) {
      setSiteDoc(null);
      return;
    }

    setSiteLoading(true);

    unsub = onSnapshot(
      doc(db, "sites", incident.siteId),
      (snap) => {
        setSiteLoading(false);
        if (!snap.exists()) {
          setSiteDoc(null);
          return;
        }

        const data = snap.data() as any;

        // garde-fou tenant (si le site ne matche pas)
        if (data?.tenantId && data.tenantId !== tenantId) {
          setSiteDoc(null);
          return;
        }

        setSiteDoc({
          id: snap.id,
          ...(data as SiteDoc),
          agentIds: safeArr(data?.agentIds),
          managerIds: safeArr(data?.managerIds),
          accessUids: safeArr(data?.accessUids),
        });
      },
      (err) => {
        console.error("Site onSnapshot error:", err);
        setSiteLoading(false);
        setSiteDoc(null);
      }
    );

    return () => unsub?.();
  }, [incident?.siteId, tenantId]);

  // ---- Load agents (API) when dialog opens ----
  useEffect(() => {
    if (!assignOpen) return;

    setAgentsApiLoading(true);

    (async () => {
      try {
        // On charge "active" + "inactive" si tu veux. Ici active suffit.
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

  const siteAgentIds = useMemo(() => {
    return uniq(safeArr(siteDoc?.agentIds));
  }, [siteDoc?.agentIds]);

  const agentsForThisSite = useMemo(() => {
    if (!siteAgentIds.length) return [];
    const set = new Set(siteAgentIds);
    return agentsApi.filter((a) => set.has(a.id));
  }, [agentsApi, siteAgentIds]);

  const assignedAgent = useMemo(() => {
    // priorité au snapshot (très rapide)
    const snap = incident?.assignedAgentSnapshot;
    if (snap?.id) return snap;

    // fallback : retrouver via agentsApi
    const id = String(incident?.assignedAgentId ?? "").trim();
    if (!id) return null;

    return agentsApi.find((a) => a.id === id) ?? null;
  }, [incident?.assignedAgentId, incident?.assignedAgentSnapshot, agentsApi]);

  function toggleSingle(list: string[], value: string) {
    // ici on veut 1 seul agent : si clique sur le même => désassigne
    return list.includes(value) ? [] : [value];
  }

  async function toggleClose() {
    if (!db || !incidentId || !incident) return;
    if (!user) return;

    if (!canClose) {
      toast({
        variant: "destructive",
        title: "Accès refusé",
        description: "Droits insuffisants pour changer le statut.",
      });
      return;
    }

    setBusy(true);
    try {
      const nextStatus: Status = incident.status === "Ouvert" ? "Clos" : "Ouvert";

      await updateDoc(doc(db, "incidents", incidentId), {
        status: nextStatus,
        statusKey: nextStatus === "Ouvert" ? "ouvert" : "clos",
        closedAt: nextStatus === "Clos" ? serverTimestamp() : null,
        closedBy:
          nextStatus === "Clos"
            ? { uid: (user as any).uid, email: (user as any).email ?? null }
            : null,
        updatedAt: serverTimestamp(),
      });

      toast({
        title: nextStatus === "Clos" ? "Incident clôturé" : "Incident ré-ouvert",
        description: "Statut mis à jour.",
      });
    } catch (e: any) {
      console.error(e);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: e?.message ?? "Mise à jour impossible.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveAssignment() {
    if (!db || !incidentId || !incident) return;
    if (!user) return;

    if (!canWrite) {
      toast({
        variant: "destructive",
        title: "Accès refusé",
        description: "Droits insuffisants pour affecter un agent.",
      });
      return;
    }

    // 1 seul agent (ou null)
    const nextId = selectedAgentIds[0] ? String(selectedAgentIds[0]).trim() : "";
    const selected = nextId
      ? (agentsApi.find((a) => a.id === nextId) ?? null)
      : null;

    // sécurité : imposer que l’agent appartienne au site
    if (selected && !siteAgentIds.includes(selected.id)) {
      toast({
        variant: "destructive",
        title: "Affectation invalide",
        description: "Cet agent n’est pas affecté à ce site.",
      });
      return;
    }

    setAssignSaving(true);
    try {
      await updateDoc(doc(db, "incidents", incidentId), {
        assignedAgentId: selected ? selected.id : null,
        assignedAgentSnapshot: selected
          ? {
              id: selected.id,
              firstName: selected.firstName ?? null,
              lastName: selected.lastName ?? null,
              email: selected.email ?? null,
              phone: selected.phone ?? null,
            }
          : null,
        assignedAt: selected ? serverTimestamp() : null,
        assignedBy: selected
          ? { uid: (user as any).uid, email: (user as any).email ?? null }
          : null,
        updatedAt: serverTimestamp(),
      });

      toast({
        title: "Agent assigné",
        description: selected ? `Assigné à ${agentLabel(selected)}` : "Assignation retirée.",
      });
      setAssignOpen(false);
    } catch (e: any) {
      console.error(e);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: e?.message ?? "Impossible d’enregistrer l’assignation.",
      });
    } finally {
      setAssignSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <Button
            variant="ghost"
            className="gap-2 w-fit"
            onClick={() => router.push("/dashboard/incidents")}
          >
            <ArrowLeft className="h-4 w-4" />
            Retour aux incidents
          </Button>

          <h1 className="text-2xl font-semibold">
            {loadingIncident
              ? "Chargement…"
              : incident
              ? "Détail incident"
              : "Incident introuvable"}
          </h1>

          {incident ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">{incident.siteName ?? "—"}</Badge>
              <SeverityBadge v={incident.severity} />
              <StatusBadge v={incident.status} />
              <Badge variant="outline">Créé : {formatFR(incident.createdAt)}</Badge>

              {/* ✅ Agent assigné */}
              <Badge variant="outline">
                Agent : {agentLabel(assignedAgent)}
              </Badge>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => router.refresh()} className="gap-2">
            <RefreshCcw className="h-4 w-4" />
            Actualiser
          </Button>

          {/* ✅ Assignation agent */}
          {incident ? (
            <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="gap-2"
                  disabled={!canWrite || siteLoading}
                  title={!canWrite ? "Droits insuffisants" : undefined}
                >
                  <Users className="h-4 w-4" />
                  {incident.assignedAgentId ? "Modifier agent" : "Assigner agent"}
                </Button>
              </DialogTrigger>

              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Assignation d’un agent</DialogTitle>
                </DialogHeader>

                <div className="text-sm text-muted-foreground">
                  Agents disponibles = agents <span className="font-medium">affectés au site</span>.
                  <div className="mt-1 text-xs text-muted-foreground">
                    Site : <span className="font-medium">{incident.siteName}</span>
                    {siteLoading ? " • chargement…" : ""}
                  </div>
                </div>

                <Separator />

                {agentsApiLoading ? (
                  <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Chargement des agents…
                  </div>
                ) : siteAgentIds.length === 0 ? (
                  <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                    Aucun agent n’est affecté à ce site pour le moment.
                    <div className="text-xs mt-1">
                      Va sur{" "}
                      <Link className="underline" href={`/dashboard/sites/${incident.siteId}`}>
                        la fiche du site
                      </Link>{" "}
                      pour affecter des agents.
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-xs text-muted-foreground">
                      Clique sur un agent pour l’assigner (un seul agent possible). Clique à nouveau pour désassigner.
                    </div>

                    <div className="rounded-lg border p-3 space-y-2 max-h-[420px] overflow-auto">
                      {agentsForThisSite.length === 0 ? (
                        <div className="text-sm text-muted-foreground">
                          Aucun agent actif correspondant aux affectations du site.
                          <div className="text-xs mt-1">
                            (Vérifie le statut des agents ou l’affectation sur le site.)
                          </div>
                        </div>
                      ) : (
                        agentsForThisSite.map((a) => {
                          const checked = selectedAgentIds.includes(a.id);
                          const label = agentLabel(a);

                          return (
                            <label
                              key={a.id}
                              className="flex items-start gap-3 rounded-md p-2 hover:bg-muted/50 cursor-pointer"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() =>
                                  setSelectedAgentIds((prev) => toggleSingle(prev, a.id))
                                }
                              />
                              <div className="text-sm">
                                <div className="font-medium">{label}</div>
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
                    Sélection :{" "}
                    <span className="font-medium">
                      {selectedAgentIds[0]
                        ? agentLabel(agentsApi.find((x) => x.id === selectedAgentIds[0]) ?? { id: selectedAgentIds[0] })
                        : "Aucun"}
                    </span>
                  </div>

                  <Button
                    onClick={saveAssignment}
                    disabled={assignSaving || !canWrite}
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

          {incident ? (
            <Button
              onClick={toggleClose}
              disabled={busy || !canClose}
              variant={incident.status === "Ouvert" ? "destructive" : "outline"}
              className="gap-2"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {incident.status === "Ouvert" ? "Clôturer" : "Ré-ouvrir"}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Not found */}
      {!loadingIncident && !incident ? (
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle>Incident introuvable</CardTitle>
            <CardDescription>Le document n’existe pas (ou accès refusé).</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-3 rounded-2xl border p-4 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4 mt-0.5" />
              <div>
                Vérifie l’URL, l’ID, ou les permissions Firestore (rules).<br />
                {incidentId ? (
                  <span className="text-xs">ID : {incidentId}</span>
                ) : (
                  <span className="text-xs">ID manquant</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Body */}
      {incident ? (
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle>Description</CardTitle>
            <CardDescription>Détails déclarés lors de la création.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3 text-sm">
              <div className="rounded-2xl border p-3">
                <div className="text-muted-foreground">Signalé par</div>
                <div className="font-medium">{incident.createdBy?.email ?? "—"}</div>
              </div>

              <div className="rounded-2xl border p-3">
                <div className="text-muted-foreground">Agent assigné</div>
                <div className="font-medium">{agentLabel(assignedAgent)}</div>
                <div className="text-xs text-muted-foreground">
                  {incident.assignedAt ? `Assigné : ${formatFR(incident.assignedAt)}` : "Non assigné"}
                </div>
              </div>

              <div className="rounded-2xl border p-3">
                <div className="text-muted-foreground">Statut</div>
                <div className="font-medium">{incident.status ?? "—"}</div>
                <div className="text-xs text-muted-foreground">
                  {incident.closedAt ? `Clôturé : ${formatFR(incident.closedAt)}` : "—"}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border p-4">
              <div className="text-sm text-muted-foreground mb-1">Texte</div>
              <div className="whitespace-pre-wrap">{incident.description ?? "—"}</div>
            </div>

            <div className="grid gap-3 md:grid-cols-3 text-sm">
              <div className="rounded-2xl border p-3">
                <div className="text-muted-foreground">Créé le</div>
                <div className="font-medium">{formatFR(incident.createdAt)}</div>
              </div>
              <div className="rounded-2xl border p-3">
                <div className="text-muted-foreground">Mis à jour</div>
                <div className="font-medium">{formatFR(incident.updatedAt)}</div>
              </div>
              <div className="rounded-2xl border p-3">
                <div className="text-muted-foreground">Clôturé le</div>
                <div className="font-medium">{formatFR(incident.closedAt ?? null)}</div>
              </div>
            </div>

            <div className="pt-2 text-sm">
              <span className="text-muted-foreground">Site :</span>{" "}
              <Link className="underline" href={`/dashboard/sites/${incident.siteId}`}>
                {incident.siteName}
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ✅ Commentaires incident */}
      {incident && tenantId ? (
        <IncidentComments incidentId={incident.id} tenantId={tenantId} />
      ) : null}
    </div>
  );
}