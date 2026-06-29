// src/app/dashboard/sites/[id]/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  ArrowLeft,
  Loader2,
  Siren,
  Trash2,
  Users,
  PlusCircle,
  MapPin,
  Building2,
  Search,
  Settings2,
  ShieldAlert,
  PhoneCall,
  Mail,
  ChevronRight,
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
import { canManageSites, hasRole, normalizeRole } from "@/lib/auth/role";

import type { Site } from "@/lib/sites/types";
import { SiteForm, type SiteFormValues } from "@/components/sites/site-form";

import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
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

function tsToDate(ts?: Timestamp) {
  return ts?.toDate?.() ?? new Date(0);
}

function safeArr(v: unknown): string[] {
  return Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : [];
}


function safeEmergencyContacts(v: unknown) {
  if (!Array.isArray(v)) return [];

  return v
    .map((item, index) => {
      const raw = (item ?? {}) as Record<string, unknown>;
      return {
        name: String(raw.name ?? "").trim(),
        role: String(raw.role ?? "").trim(),
        phone: String(raw.phone ?? "").trim(),
        email: String(raw.email ?? "").trim(),
        priority: Number(raw.priority ?? index + 1),
      };
    })
    .filter((contact) => contact.name && (contact.phone || contact.email))
    .sort((a, b) => (a.priority || 99) - (b.priority || 99))
    .slice(0, 10);
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

  const { user } = useAuth();
  const { toast } = useToast();

  const role = useMemo(
    () => normalizeRole((user as any)?.role) ?? "client",
    [user]
  );

  const isAdmin = useMemo(() => {
    return hasRole(role, ["super_admin", "owner", "admin"]);
  }, [role]);

  const canWrite = useMemo(() => canManageSites(role), [role]);

  const [site, setSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [incidentsLoading, setIncidentsLoading] = useState(true);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);
  const [agentsApi, setAgentsApi] = useState<AgentApi[]>([]);
  const [agentsApiLoading, setAgentsApiLoading] = useState(false);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [agentSearch, setAgentSearch] = useState("");

  const [assignedAgents, setAssignedAgents] = useState<AgentApi[]>([]);
  const [assignedLoading, setAssignedLoading] = useState(false);

  useEffect(() => {
    if (!id || !(user as any)?.tenantId) return;

    if (!db) {
      setLoading(false);
      toast({
        title: "Firestore indisponible",
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
          clientId: typeof raw?.clientId === "string" ? raw.clientId : null,
          managerIds: safeArr(raw?.managerIds),
          agentIds: safeArr(raw?.agentIds),
          accessUids: safeArr(raw?.accessUids),
        } as Site;

        if ((data as any).tenantId && (data as any).tenantId !== (user as any).tenantId) {
          setSite(null);
          toast({
            title: "Accès refusé",
            variant: "destructive",
          });
          return;
        }

        if (!isAdmin) {
          const uid = (user as any)?.uid;
          const access = safeArr((data as any).accessUids);
          const legacy = uniq([...safeArr((data as any).managerIds)]);
          const allowed =
            !!uid && (access.includes(uid) || (access.length === 0 && legacy.includes(uid)));

          if (!allowed) {
            setSite(null);
            toast({
              title: "Accès refusé",
              variant: "destructive",
            });
            return;
          }
        }

        setSite(data);

        if (!assignOpen) {
          setSelectedAgentIds(safeArr((data as any).agentIds));
        }
      },
      (err) => {
        console.error(err);
        setLoading(false);
        toast({
          title: "Erreur",
          variant: "destructive",
        });
      }
    );

    return () => unsub();
  }, [id, toast, (user as any)?.tenantId, (user as any)?.uid, isAdmin, assignOpen]);

  useEffect(() => {
    if (!id || !(user as any)?.tenantId) {
      setIncidents([]);
      setIncidentsLoading(false);
      return;
    }

    if (!db) {
      setIncidentsLoading(false);
      return;
    }

    setIncidentsLoading(true);

    const qy = query(
      collection(db, "incidents"),
      where("tenantId", "==", (user as any).tenantId),
      where("siteId", "==", id),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      qy,
      (snap) => {
        setIncidents(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        setIncidentsLoading(false);
      },
      () => {
        setIncidentsLoading(false);
      }
    );

    return () => unsub();
  }, [id, (user as any)?.tenantId]);

  useEffect(() => {
    if (!assignOpen) return;

    setAgentsApiLoading(true);

    void (async () => {
      try {
        const data = await apiFetch<{
          ok: boolean;
          agents?: AgentApi[];
          error?: string;
        }>("/api/agents?status=active&max=200");

        if (!data.ok) {
          toast({
            title: "Erreur",
            variant: "destructive",
          });
          setAgentsApi([]);
          return;
        }

        const rows = (data.agents ?? [])
          .slice()
          .sort((a, b) =>
            `${(a.firstName ?? "").toLowerCase()} ${(a.lastName ?? "").toLowerCase()}`
              .trim()
              .localeCompare(
                `${(b.firstName ?? "").toLowerCase()} ${(b.lastName ?? "").toLowerCase()}`.trim()
              )
          );

        setAgentsApi(rows);
      } catch {
        toast({
          title: "Erreur",
          variant: "destructive",
        });
        setAgentsApi([]);
      } finally {
        setAgentsApiLoading(false);
      }
    })();
  }, [assignOpen, toast]);

  const filteredAgentsApi = useMemo(() => {
    const q = agentSearch.trim().toLowerCase();
    if (!q) return agentsApi;

    return agentsApi.filter((a) =>
      `${agentLabel(a)} ${a.email ?? ""} ${a.phone ?? ""}`.toLowerCase().includes(q)
    );
  }, [agentsApi, agentSearch]);

  useEffect(() => {
    if (!site) return;

    const agentIds = safeArr((site as any)?.agentIds);

    if (agentIds.length === 0) {
      setAssignedAgents([]);
      setAssignedLoading(false);
      return;
    }

    setAssignedLoading(true);

    void (async () => {
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
          return;
        }

        const byId = new Map((data.agents ?? []).map((a) => [a.id, a]));
        setAssignedAgents(agentIds.map((aid) => byId.get(aid)).filter(Boolean) as AgentApi[]);
      } catch {
        setAssignedAgents([]);
      } finally {
        setAssignedLoading(false);
      }
    })();
  }, [site]);

  const initialValues = useMemo(() => {
    if (!site) return undefined;

    return {
      name: (site as any).name ?? "",
      clientId: (site as any).clientId ?? null,
      clientName: (site as any).clientName ?? "",
      siteType: ((site as any).siteType ?? "bureaux") as any,
      riskLevel: ((site as any).riskLevel ?? 3) as any,
      address: (site as any).address ?? "",
      city: (site as any).city ?? "",
      postalCode: (site as any).postalCode ?? "",
      instructions: (site as any).instructions ?? "",
      latitude: (site as any).latitude ?? null,
      longitude: (site as any).longitude ?? null,
      isActive: Boolean((site as any).isActive ?? true),
      emergencyContacts: safeEmergencyContacts((site as any).emergencyContacts),
    } satisfies Partial<SiteFormValues>;
  }, [site]);

  const isAssigned = useMemo(() => {
    const uid = (user as any)?.uid;
    if (!uid || !site) return false;

    const access = safeArr((site as any).accessUids);
    if (access.length > 0) return access.includes(uid);

    return safeArr((site as any).managerIds).includes(uid);
  }, [site, (user as any)?.uid]);

  function toggleInList(list: string[], value: string) {
    return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
  }

  async function save(values: SiteFormValues) {
    if (!id || !canWrite) return;

    setSaving(true);

    try {
      const res = await apiFetch<{ ok: boolean; error?: string }>(`/api/sites/${id}`, {
        method: "PATCH",
        body: {
          ...values,
          clientId: (values as any).clientId ?? null,
          clientName: values.clientName || null,
          latitude: values.latitude ?? null,
          longitude: values.longitude ?? null,
        },
      });

      if (!res.ok) {
        toast({
          title: "Erreur",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Modifications enregistrées",
      });
    } catch {
      toast({
        title: "Erreur",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveAssignments() {
    if (!id || !site || !canWrite) return;

    const agentIds = uniq(selectedAgentIds);
    setAssignSaving(true);

    try {
      const res = await apiFetch<{
        ok: boolean;
        error?: string;
        warnings?: ApiWarning[];
      }>(`/api/sites/${id}`, {
        method: "PATCH",
        body: { agentIds },
      });

      if (!res.ok) {
        toast({
          title: "Erreur",
          variant: "destructive",
        });
        return;
      }

      const w = res.warnings?.find((x) => x.code === "site_agentIds_rejected");

      if (w?.rejected?.length) {
        toast({
          title: "Affectation partielle",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Affectations enregistrées",
        });
      }

      setAssignOpen(false);
      setAgentSearch("");
    } catch {
      toast({
        title: "Erreur",
        variant: "destructive",
      });
    } finally {
      setAssignSaving(false);
    }
  }

  async function remove() {
    if (!id || !canWrite) return;
    if (!window.confirm("Désactiver ce site ?")) return;

    setDeleting(true);

    try {
      const res = await apiFetch<{ ok: boolean; error?: string }>(`/api/sites/${id}`, {
        method: "PATCH",
        body: { isActive: false },
      });

      if (!res.ok) {
        toast({
          title: "Erreur",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Site désactivé",
      });
    } catch {
      toast({
        title: "Erreur",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm font-medium">Chargement du site...</p>
        </div>
      </div>
    );
  }

  if (!site) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95 duration-500">
        <div className="bg-muted p-4 rounded-full mb-4">
          <MapPin className="h-8 w-8 text-muted-foreground/50" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight mb-2">Site introuvable</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Ce site n&apos;existe pas ou vous n&apos;y avez pas accès.
        </p>
        <Button variant="outline" asChild className="rounded-lg font-medium">
          <Link href="/dashboard/sites">
            <ArrowLeft className="mr-2 h-4 w-4" /> Retour aux sites
          </Link>
        </Button>
      </div>
    );
  }

  const siteAgentIds = safeArr((site as any).agentIds);
  const emergencyContacts = safeEmergencyContacts((site as any).emergencyContacts);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-7xl mx-auto pb-12 w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-card border rounded-2xl shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild className="shrink-0 rounded-full hover:bg-muted">
            <Link href="/dashboard/sites">
              <ArrowLeft className="h-5 w-5 text-muted-foreground" />
            </Link>
          </Button>

          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge
                variant={(site as any).isActive ? "secondary" : "outline"}
                className={cn(
                  "text-[10px] font-medium uppercase tracking-wider",
                  (site as any).isActive
                    ? "bg-green-500/10 text-green-700"
                    : "text-muted-foreground"
                )}
              >
                {(site as any).isActive ? "Actif" : "Inactif"}
              </Badge>

              {isAssigned && (
                <Badge
                  variant="outline"
                  className="text-[10px] font-medium uppercase tracking-wider text-primary border-primary/20 bg-primary/5"
                >
                  Assigné
                </Badge>
              )}
            </div>

            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {(site as any).name}
            </h1>

            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground font-medium">
              {(site as any).clientName && (
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" /> {(site as any).clientName}
                </span>
              )}
              {(site as any).city && (
                <>
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" /> {(site as any).city}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pl-14 md:pl-0">
          <Button asChild size="sm" className="rounded-lg font-medium shadow-sm">
            <Link href={`/dashboard/incidents?create=1&siteId=${id}`}>
              <PlusCircle className="h-4 w-4 mr-2" /> Nouveau rapport
            </Link>
          </Button>

          {canWrite && (
            <Button
              variant="outline"
              size="sm"
              onClick={remove}
              disabled={deleting}
              className="rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive border-transparent hover:border-destructive/20"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-1">
          <Card className="border rounded-2xl shadow-sm bg-card">
            <div className="p-5 border-b border-border/50 flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Paramètres du site</h2>
            </div>
            <CardContent className="p-5">
              <SiteForm
                initialValues={initialValues}
                submitLabel="Enregistrer"
                onSubmit={save}
                isSubmitting={saving}
              />
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card className="border rounded-2xl shadow-sm bg-card">
            <div className="p-5 border-b border-border/50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <PhoneCall className="h-4 w-4 text-amber-600" />
                <h2 className="text-sm font-semibold text-foreground">Contacts d'urgence</h2>
                <Badge
                  variant="secondary"
                  className="ml-1 px-1.5 min-w-[1.25rem] justify-center font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300"
                >
                  {emergencyContacts.length}
                </Badge>
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Escalade client
              </span>
            </div>

            <CardContent className="p-0">
              {emergencyContacts.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Aucun contact d'urgence client n'est renseigne pour ce site.
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {emergencyContacts.map((contact, index) => (
                    <div
                      key={`${contact.name}-${index}`}
                      className="flex flex-col gap-3 p-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="border-none bg-amber-500/10 text-[10px] font-black uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
                            Priorite {index + 1}
                          </Badge>
                          <p className="truncate text-sm font-semibold text-foreground">
                            {contact.name}
                          </p>
                        </div>
                        <p className="mt-1 text-xs font-medium text-muted-foreground">
                          {contact.role || "Contact client"}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          {contact.phone && <span>{contact.phone}</span>}
                          {contact.email && <span>{contact.email}</span>}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {contact.phone && (
                          <Button asChild size="sm" className="h-9 rounded-lg text-xs font-bold">
                            <a href={`tel:${contact.phone.replace(/\s+/g, "")}`}>
                              <PhoneCall className="mr-2 h-3.5 w-3.5" /> Appeler
                            </a>
                          </Button>
                        )}
                        {contact.email && (
                          <Button asChild variant="outline" size="sm" className="h-9 rounded-lg text-xs font-bold">
                            <a href={`mailto:${contact.email}`}>
                              <Mail className="mr-2 h-3.5 w-3.5" /> Email
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="border rounded-2xl shadow-sm bg-card">
            <div className="p-5 border-b border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Équipe affectée</h2>
                <Badge
                  variant="secondary"
                  className="ml-1 px-1.5 min-w-[1.25rem] justify-center font-medium bg-muted text-muted-foreground"
                >
                  {siteAgentIds.length}
                </Badge>
              </div>

              {canWrite && (
                <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="rounded-lg text-xs font-medium">
                      Gérer l'équipe
                    </Button>
                  </DialogTrigger>

                  <DialogContent className="max-w-xl rounded-2xl p-0 gap-0 overflow-hidden">
                    <div className="p-5 border-b bg-muted/30">
                      <DialogHeader>
                        <DialogTitle className="text-lg font-semibold">
                          Gérer les affectations
                        </DialogTitle>
                      </DialogHeader>

                      <div className="mt-4 relative">
                        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Rechercher un agent..."
                          value={agentSearch}
                          onChange={(e) => setAgentSearch(e.target.value)}
                          className="pl-9 bg-background rounded-xl border-border/50"
                        />
                      </div>
                    </div>

                    <div className="p-2">
                      <div className="max-h-[300px] overflow-y-auto p-2 space-y-1">
                        {agentsApiLoading ? (
                          <div className="py-8 flex justify-center">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : filteredAgentsApi.length === 0 ? (
                          <div className="py-8 text-center text-sm text-muted-foreground">
                            Aucun agent trouvé.
                          </div>
                        ) : (
                          filteredAgentsApi.map((a) => (
                            <label
                              key={a.id}
                              className={cn(
                                "flex items-center gap-3 p-3 rounded-xl border border-transparent hover:bg-muted/50 cursor-pointer transition-colors",
                                selectedAgentIds.includes(a.id) &&
                                  "bg-primary/5 border-primary/20 hover:bg-primary/10"
                              )}
                            >
                              <Checkbox
                                checked={selectedAgentIds.includes(a.id)}
                                onCheckedChange={() =>
                                  setSelectedAgentIds((p) => toggleInList(p, a.id))
                                }
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{agentLabel(a)}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {a.email ?? "Sans email"} • {a.phone ?? "Sans tel"}
                                </p>
                              </div>
                            </label>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="p-5 border-t bg-muted/10 flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        {selectedAgentIds.length} agent(s) sélectionné(s)
                      </span>
                      <Button
                        onClick={saveAssignments}
                        disabled={assignSaving}
                        size="sm"
                        className="rounded-lg px-6"
                      >
                        {assignSaving && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                        )}
                        Enregistrer
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>

            <CardContent className="p-0">
              {assignedLoading ? (
                <div className="py-10 flex justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : assignedAgents.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Aucun agent n&apos;est affecté à ce site.
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {assignedAgents.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                          {agentLabel(a).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{agentLabel(a)}</p>
                          <p className="text-xs text-muted-foreground">
                            {a.phone || a.email || "Aucun contact"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-md hover:text-primary"
                        >
                          <Link href={`/dashboard/incidents?create=1&siteId=${id}&agentId=${a.id}`}>
                            <Siren className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button asChild variant="ghost" size="icon" className="h-8 w-8 rounded-md">
                          <Link href={`/dashboard/agents/${a.id}`}>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border rounded-2xl shadow-sm bg-card">
            <div className="p-5 border-b border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">
                  Historique des incidents
                </h2>
              </div>
              <Button asChild variant="ghost" size="sm" className="h-8 rounded-lg text-xs font-medium">
                <Link href="/dashboard/incidents">Voir tout</Link>
              </Button>
            </div>

            <CardContent className="p-0">
              {incidentsLoading ? (
                <div className="py-10 flex justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : incidents.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Aucun incident rapporté sur ce site.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-medium text-muted-foreground h-10">
                        Gravité
                      </TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground h-10">
                        Statut
                      </TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground h-10">
                        Date
                      </TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground h-10 text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {incidents.map((it) => (
                      <TableRow key={it.id} className="hover:bg-muted/30">
                        <TableCell className="py-3">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] font-medium px-2 py-0 h-5",
                              it.severity === "Moyenne" &&
                                "text-orange-600 border-orange-200 bg-orange-50",
                              it.severity === "Élevée" &&
                                "text-destructive border-destructive/30 bg-destructive/10"
                            )}
                          >
                            {it.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3">
                          <span
                            className={cn(
                              "text-xs font-medium",
                              it.status === "Ouvert"
                                ? "text-foreground"
                                : "text-muted-foreground"
                            )}
                          >
                            {it.status}
                          </span>
                        </TableCell>
                        <TableCell className="py-3 text-xs text-muted-foreground">
                          {format(tsToDate(it.createdAt), "dd MMM yyyy", { locale: fr })}
                        </TableCell>
                        <TableCell className="py-3 text-right">
                          <Button asChild variant="ghost" size="sm" className="h-7 text-xs rounded-md">
                            <Link href={`/dashboard/incidents/${it.id}`}>Détails</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
