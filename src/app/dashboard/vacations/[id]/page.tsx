"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  ArrowLeft,
  CalendarClock,
  Loader2,
  Save,
  Trash2,
  Users,
  Building2,
  FileText,
  AlertTriangle,
  LockKeyhole,
} from "lucide-react";

import { AssignAgentsDialog } from "@/components/vacations/AssignAgentsDialog";
import { AssignedAgentsTable } from "@/components/vacations/AssignedAgentsTable";

import { useAuth } from "@/lib/auth-provider";
import { canManagePlanning, normalizeRole } from "@/lib/auth/role";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api/client-fetch";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

/* ================= types ================= */

type VacationStatus = "planned" | "partially_filled" | "filled" | "closed" | "cancelled";

type VacationApi = {
  id: string;
  tenantId: string;
  siteId: string;
  siteName?: string | null;
  startAtIso: string;
  endAtIso: string;
  requiredAgents: number;
  assignedAgentIds?: string[];
  status?: VacationStatus;
  notes?: string | null;
};

type SiteApi = {
  id: string;
  name?: string;
  tenantId: string;
  agentIds?: string[];
};

type AgentApi = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: "active" | "inactive";
};

/* ================= helpers ================= */

function safeArr(v: unknown): string[] {
  return Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : [];
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function normalizeText(v: unknown) {
  return String(v ?? "").trim();
}

function StatusBadge({ status }: { status?: VacationStatus }) {
  switch (status) {
    case "filled":
      return (
        <Badge className="bg-green-500/10 text-green-700 hover:bg-green-500/20 border-transparent font-bold uppercase tracking-wider px-3 py-1">
          Complète
        </Badge>
      );
    case "partially_filled":
      return (
        <Badge className="bg-blue-500/10 text-blue-700 hover:bg-blue-500/20 border-transparent font-bold uppercase tracking-wider px-3 py-1">
          Partielle
        </Badge>
      );
    case "planned":
      return (
        <Badge className="bg-muted text-muted-foreground hover:bg-muted/80 border-transparent font-bold uppercase tracking-wider px-3 py-1">
          Planifiée
        </Badge>
      );
    case "closed":
      return (
        <Badge variant="outline" className="font-bold uppercase tracking-wider px-3 py-1 opacity-60">
          Clôturée
        </Badge>
      );
    case "cancelled":
      return (
        <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/20 border-transparent font-bold uppercase tracking-wider px-3 py-1 line-through">
          Annulée
        </Badge>
      );
    default:
      return <Badge variant="outline">—</Badge>;
  }
}

function isoToLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(value: string) {
  return new Date(value).toISOString();
}

/* ================= component ================= */

export default function VacationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const role = useMemo(
    () => normalizeRole((user as any)?.role) ?? "client",
    [user]
  );
  const canWrite = useMemo(() => canManagePlanning(role), [role]);

  const [loading, setLoading] = useState(true);
  const [vacation, setVacation] = useState<VacationApi | null>(null);

  const [site, setSite] = useState<SiteApi | null>(null);
  const [siteLoading, setSiteLoading] = useState(false);

  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [requiredAgents, setRequiredAgents] = useState(1);
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [closing, setClosing] = useState(false);

  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [assignedAgents, setAssignedAgents] = useState<AgentApi[]>([]);
  const [assignedLoading, setAssignedLoading] = useState(false);
  const [assignedError, setAssignedError] = useState<string | null>(null);

  const allowedAgentIds = useMemo(() => uniq(safeArr(site?.agentIds)), [site?.agentIds]);
  const assignedIds = useMemo(
    () => uniq(safeArr(vacation?.assignedAgentIds)),
    [vacation?.assignedAgentIds]
  );
  const assignedCount = assignedIds.length;
  const isClosedOrCancelled = useMemo(
    () => vacation?.status === "closed" || vacation?.status === "cancelled",
    [vacation?.status]
  );

  const startD = useMemo(() => {
    if (!vacation?.startAtIso) return null;
    const d = new Date(vacation.startAtIso);
    return Number.isFinite(d.getTime()) ? d : null;
  }, [vacation?.startAtIso]);

  const endD = useMemo(() => {
    if (!vacation?.endAtIso) return null;
    const d = new Date(vacation.endAtIso);
    return Number.isFinite(d.getTime()) ? d : null;
  }, [vacation?.endAtIso]);

  /* ================= load vacation ================= */
  useEffect(() => {
    if (!id) return;

    setLoading(true);
    void (async () => {
      try {
        const data = await apiFetch<{
          ok: boolean;
          vacation?: VacationApi;
          error?: string;
        }>(`/api/vacations/${id}`);

        if (!aliveRef.current) return;

        if (!data.ok || !data.vacation) {
          toast({
            title: "Erreur",
            description: data.error ?? "Impossible de charger la vacation.",
            variant: "destructive",
          });
          setVacation(null);
          return;
        }

        setVacation(data.vacation);
        setStartLocal(isoToLocalInput(data.vacation.startAtIso));
        setEndLocal(isoToLocalInput(data.vacation.endAtIso));
        setRequiredAgents(Number(data.vacation.requiredAgents ?? 1));
        setNotes(String(data.vacation.notes ?? ""));
        setSelectedAgentIds(uniq(safeArr(data.vacation.assignedAgentIds)));
      } catch (e: any) {
        if (!aliveRef.current) return;
        toast({
          title: "Erreur",
          description: e?.message ?? "Impossible de charger.",
          variant: "destructive",
        });
        setVacation(null);
      } finally {
        if (!aliveRef.current) return;
        setLoading(false);
      }
    })();
  }, [id, toast]);

  /* ================= load site ================= */
  useEffect(() => {
    if (!vacation?.siteId) return;

    setSiteLoading(true);
    void (async () => {
      try {
        const data = await apiFetch<{
          ok: boolean;
          site?: SiteApi;
          error?: string;
        }>(`/api/sites/${vacation.siteId}`);

        if (!aliveRef.current) return;

        if (!data.ok || !data.site) {
          setSite(null);
          toast({ title: "Erreur", description: data.error, variant: "destructive" });
          return;
        }

        setSite(data.site);
      } catch (e: any) {
        if (!aliveRef.current) return;
        setSite(null);
        toast({ title: "Erreur", description: e?.message, variant: "destructive" });
      } finally {
        if (!aliveRef.current) return;
        setSiteLoading(false);
      }
    })();
  }, [vacation?.siteId, toast]);

  /* ================= load assigned agents ================= */
  useEffect(() => {
    const ids = assignedIds;

    if (!vacation || ids.length === 0) {
      setAssignedAgents([]);
      setAssignedError(null);
      setAssignedLoading(false);
      return;
    }

    setAssignedLoading(true);
    setAssignedError(null);

    void (async () => {
      try {
        const qs = new URLSearchParams();
        qs.set("ids", ids.join(","));

        const data = await apiFetch<{
          ok: boolean;
          agents?: AgentApi[];
          error?: string;
        }>(`/api/agents?${qs.toString()}`);

        if (!aliveRef.current) return;

        if (!data.ok) {
          setAssignedAgents([]);
          setAssignedError(data.error ?? "Erreur agents.");
          return;
        }

        const byId = new Map((data.agents ?? []).map((a) => [a.id, a]));
        setAssignedAgents(ids.map((x) => byId.get(x)).filter(Boolean) as AgentApi[]);
      } catch (e: any) {
        if (!aliveRef.current) return;
        setAssignedAgents([]);
        setAssignedError(e?.message ?? "Erreur agents.");
      } finally {
        if (!aliveRef.current) return;
        setAssignedLoading(false);
      }
    })();
  }, [vacation?.id, assignedIds]);

  /* ================= actions ================= */
  async function save() {
    if (!id || !vacation || !canWrite) return;
    if (!startLocal || !endLocal) {
      toast({ title: "Champs requis", variant: "destructive" });
      return;
    }

    const startIso = localInputToIso(startLocal);
    const endIso = localInputToIso(endLocal);

    if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
      toast({
        title: "Dates invalides",
        description: "La fin doit être après le début.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        vacation?: VacationApi;
        warnings?: any[];
        error?: string;
      }>(`/api/vacations/${id}`, {
        method: "PATCH",
        body: {
          startAt: startIso,
          endAt: endIso,
          requiredAgents: Math.max(1, Math.floor(Number(requiredAgents || 1))),
          notes: normalizeText(notes) || null,
        },
      });

      if (!res.ok || !res.vacation) {
        toast({ title: "Erreur", description: res.error, variant: "destructive" });
        return;
      }

      setVacation(res.vacation);
      toast({
        title: "Enregistré",
        description: res.warnings?.length ? "Avec avertissements." : "Modifications appliquées.",
      });
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function closeVacation() {
    if (!id || !vacation || !canWrite) return;
    if (!window.confirm("Clôturer cette vacation ?")) return;

    setClosing(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        vacation?: VacationApi;
        error?: string;
      }>(`/api/vacations/${id}`, {
        method: "PATCH",
        body: { status: "closed" },
      });

      if (!res.ok || !res.vacation) {
        toast({ title: "Erreur", variant: "destructive" });
        return;
      }

      setVacation(res.vacation);
      toast({ title: "Clôturée" });
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    } finally {
      setClosing(false);
    }
  }

  async function cancelVacation() {
    if (!id || !canWrite) return;
    if (!window.confirm("Annuler cette vacation ?")) return;

    setDeleting(true);
    try {
      const res = await apiFetch<{ ok: boolean; error?: string }>(`/api/vacations/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        toast({ title: "Erreur", variant: "destructive" });
        return;
      }

      toast({ title: "Annulée" });
      router.push("/dashboard/vacations");
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  /* ================= render ================= */
  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-semibold tracking-widest uppercase">
            Chargement de la vacation...
          </p>
        </div>
      </div>
    );
  }

  if (!vacation) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500">
        <div className="bg-muted p-6 rounded-full mb-6">
          <CalendarClock className="h-12 w-12 text-muted-foreground/50" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight mb-2">Vacation introuvable</h2>
        <Button
          variant="outline"
          onClick={() => router.push("/dashboard/vacations")}
          className="h-12 rounded-xl px-6 font-medium mt-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Retour aux vacations
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-12 w-full max-w-[1400px] mx-auto">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between bg-card p-6 md:p-8 rounded-[2rem] border shadow-sm ring-1 ring-black/5 bg-gradient-to-br from-card to-muted/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-start gap-4">
          <Button
            variant="ghost"
            onClick={() => router.push("/dashboard/vacations")}
            className="h-9 rounded-xl px-4 font-bold text-muted-foreground hover:bg-muted transition-all -ml-2"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Retour
          </Button>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <StatusBadge status={vacation.status} />
              <Badge
                variant="outline"
                className="font-mono text-[10px] py-1 border-muted-foreground/30 uppercase tracking-tighter"
              >
                ID: {id.slice(0, 8)}
              </Badge>
            </div>

            <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-foreground">
              Détails Vacation
            </h1>

            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm font-semibold text-muted-foreground">
              {siteLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Site...
                </span>
              ) : site ? (
                <span className="flex items-center gap-2 text-foreground">
                  <Building2 className="h-4 w-4 text-primary" /> {site.name ?? vacation.siteName ?? site.id}
                </span>
              ) : (
                <span className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4" /> Site inconnu
                </span>
              )}
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
              <span>
                {startD && endD
                  ? `${format(startD, "dd MMM", { locale: fr })} de ${format(startD, "HH:mm")} à ${format(endD, "HH:mm")}`
                  : "Dates invalides"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 relative z-10">
          {canWrite && !isClosedOrCancelled && (
            <Button
              variant="outline"
              onClick={closeVacation}
              disabled={closing}
              className="h-11 rounded-xl px-5 font-bold border-muted-foreground/20 hover:bg-muted transition-all"
            >
              {closing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <LockKeyhole className="h-4 w-4 mr-2" />
              )}
              Clôturer
            </Button>
          )}

          {canWrite && vacation.status !== "cancelled" && (
            <Button
              variant="destructive"
              onClick={cancelVacation}
              disabled={deleting}
              className="h-11 rounded-xl px-5 font-bold"
            >
              <Trash2 className="h-4 w-4 mr-2" /> Annuler
            </Button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8 items-start">
        <div className="lg:col-span-2 space-y-6">
          <Card className="rounded-[2rem] border-none shadow-xl shadow-black/[0.02] bg-background ring-1 ring-black/5 overflow-hidden">
            <div className="p-6 md:p-8 bg-muted/20 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black tracking-tight flex items-center gap-3">
                  <Users className="h-6 w-6 text-primary" />
                  Agents affectés
                  <Badge variant="secondary" className="ml-1 font-black">
                    {assignedCount} / {vacation.requiredAgents}
                  </Badge>
                </h2>
                <p className="text-xs font-bold text-muted-foreground mt-1 uppercase tracking-widest">
                  {assignedCount < vacation.requiredAgents ? "Il manque du personnel" : "Effectif complet"}
                </p>
              </div>

              {canWrite && !isClosedOrCancelled && (
                <AssignAgentsDialog
                  canWrite={canWrite}
                  disabled={isClosedOrCancelled}
                  siteId={vacation.siteId ?? null}
                  allowedAgentIds={allowedAgentIds}
                  selectedAgentIds={selectedAgentIds}
                  setSelectedAgentIds={setSelectedAgentIds}
                  onSave={async (nextAssigned) => {
                    const res = await apiFetch<any>(`/api/vacations/${id}`, {
                      method: "PATCH",
                      body: { assignedAgentIds: nextAssigned },
                    });
                    if (!res.ok) throw new Error(res.error ?? "Erreur affectation");
                    setVacation(res.vacation);
                    toast({ title: "Affectations enregistrées" });
                  }}
                />
              )}
            </div>

            <CardContent className="p-0">
              <AssignedAgentsTable
                canWrite={canWrite}
                isClosedOrCancelled={isClosedOrCancelled}
                assignedCount={assignedCount}
                assignedLoading={assignedLoading}
                assignedError={assignedError}
                assignedAgents={assignedAgents}
              />
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <Card className="rounded-[2rem] border-none shadow-xl shadow-black/[0.02] bg-background ring-1 ring-black/5 overflow-hidden">
            <div className="p-6 border-b border-border/50 flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Paramètres</h2>
            </div>

            <CardContent className="p-6 space-y-6">
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest pl-1">
                  Heure de début
                </Label>
                <Input
                  type="datetime-local"
                  value={startLocal}
                  onChange={(e) => setStartLocal(e.target.value)}
                  disabled={!canWrite || isClosedOrCancelled}
                  className="h-12 rounded-xl bg-muted/30 border-border/50 font-medium"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest pl-1">
                  Heure de fin
                </Label>
                <Input
                  type="datetime-local"
                  value={endLocal}
                  onChange={(e) => setEndLocal(e.target.value)}
                  disabled={!canWrite || isClosedOrCancelled}
                  className="h-12 rounded-xl bg-muted/30 border-border/50 font-medium"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest pl-1">
                  Effectif Requis
                </Label>
                <Input
                  type="number"
                  min={1}
                  value={requiredAgents}
                  onChange={(e) => setRequiredAgents(Number(e.target.value))}
                  disabled={!canWrite || isClosedOrCancelled}
                  className="h-12 rounded-xl bg-muted/30 border-border/50 font-bold"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest pl-1">
                  Consignes
                </Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={!canWrite || isClosedOrCancelled}
                  placeholder="Instructions spécifiques pour cette vacation..."
                  className="rounded-xl bg-muted/30 border-border/50 font-medium min-h-[100px] resize-y"
                />
              </div>

              {canWrite && !isClosedOrCancelled && (
                <div className="pt-4">
                  <Button
                    onClick={save}
                    disabled={saving}
                    className="w-full h-12 rounded-xl font-bold shadow-lg shadow-primary/20"
                  >
                    {saving ? (
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    ) : (
                      <Save className="h-5 w-5 mr-2" />
                    )}
                    Enregistrer les modifications
                  </Button>
                </div>
              )}

              {isClosedOrCancelled && (
                <div className="p-4 rounded-xl bg-muted/50 border border-border/50 text-center text-xs font-semibold text-muted-foreground">
                  Cette vacation est archivée. Modifications désactivées.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
