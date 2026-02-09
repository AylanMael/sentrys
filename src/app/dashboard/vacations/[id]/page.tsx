"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeft, CalendarClock, Loader2, Save, Trash2 } from "lucide-react";

import { AssignAgentsDialog } from "@/components/vacations/AssignAgentsDialog";
import { AssignedAgentsTable } from "@/components/vacations/AssignedAgentsTable";

import { useAuth } from "@/lib/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api/client-fetch";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/* ================= types ================= */

type VacationStatus =
  | "planned"
  | "partially_filled"
  | "filled"
  | "closed"
  | "cancelled";

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
  return Array.isArray(v)
    ? (v.filter((x) => typeof x === "string") as string[])
    : [];
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function normalizeText(v: unknown) {
  return String(v ?? "").trim();
}

function statusLabel(s?: VacationStatus) {
  switch (s) {
    case "planned":
      return "Planifiée";
    case "partially_filled":
      return "Partiellement affectée";
    case "filled":
      return "Complète";
    case "closed":
      return "Clôturée";
    case "cancelled":
      return "Annulée";
    default:
      return "—";
  }
}

function statusVariant(s?: VacationStatus) {
  if (s === "filled") return "default";
  if (s === "cancelled") return "destructive";
  if (s === "partially_filled") return "secondary";
  if (s === "planned") return "outline";
  if (s === "closed") return "outline";
  return "outline";
}

function isoToLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function localInputToIso(value: string) {
  const d = new Date(value);
  return d.toISOString();
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

  const role = String((user as any)?.role ?? "");
  const canWrite = role === "admin" || role === "manager";

  const [loading, setLoading] = useState(true);
  const [vacation, setVacation] = useState<VacationApi | null>(null);

  const [site, setSite] = useState<SiteApi | null>(null);
  const [siteLoading, setSiteLoading] = useState(false);

  // edit fields
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [requiredAgents, setRequiredAgents] = useState(1);
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [closing, setClosing] = useState(false);

  // assignments
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [assignedAgents, setAssignedAgents] = useState<AgentApi[]>([]);
  const [assignedLoading, setAssignedLoading] = useState(false);
  const [assignedError, setAssignedError] = useState<string | null>(null);

  /* ================= memos ================= */

  const allowedAgentIds = useMemo(
    () => uniq(safeArr(site?.agentIds)),
    [site?.agentIds]
  );

  const assignedIds = useMemo(
    () => uniq(safeArr(vacation?.assignedAgentIds)),
    [vacation?.assignedAgentIds]
  );

  const assignedCount = assignedIds.length;

  const isClosedOrCancelled = useMemo(() => {
    const s = vacation?.status;
    return s === "closed" || s === "cancelled";
  }, [vacation?.status]);

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
    (async () => {
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
          description: e?.message ?? "Impossible de charger la vacation.",
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
    (async () => {
      try {
        const data = await apiFetch<{
          ok: boolean;
          site?: SiteApi;
          error?: string;
        }>(`/api/sites/${vacation.siteId}`);

        if (!aliveRef.current) return;

        if (!data.ok || !data.site) {
          setSite(null);
          toast({
            title: "Erreur",
            description: data.error ?? "Impossible de charger le site associé.",
            variant: "destructive",
          });
          return;
        }

        setSite(data.site);
      } catch (e: any) {
        if (!aliveRef.current) return;
        setSite(null);
        toast({
          title: "Erreur",
          description: e?.message ?? "Impossible de charger le site associé.",
          variant: "destructive",
        });
      } finally {
        if (!aliveRef.current) return;
        setSiteLoading(false);
      }
    })();
  }, [vacation?.siteId, toast]);

  /* ================= load assigned agents (display) ================= */

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

    (async () => {
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
          setAssignedError(
            data.error ?? "Impossible de charger les agents affectés."
          );
          return;
        }

        const byId = new Map((data.agents ?? []).map((a) => [a.id, a]));
        const ordered = ids
          .map((x) => byId.get(x))
          .filter(Boolean) as AgentApi[];
        setAssignedAgents(ordered);
      } catch (e: any) {
        if (!aliveRef.current) return;
        setAssignedAgents([]);
        setAssignedError(
          e?.message ?? "Impossible de charger les agents affectés."
        );
      } finally {
        if (!aliveRef.current) return;
        setAssignedLoading(false);
      }
    })();
  }, [vacation?.id, assignedIds]);

  /* ================= actions ================= */

  async function save() {
    if (!id || !vacation) return;

    if (!canWrite) {
      toast({
        title: "Accès refusé",
        description: "Droits insuffisants.",
        variant: "destructive",
      });
      return;
    }

    if (!startLocal || !endLocal) {
      toast({
        title: "Champs requis",
        description: "Début et fin sont obligatoires.",
        variant: "destructive",
      });
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

    const reqAgents = Math.max(1, Math.floor(Number(requiredAgents || 1)));

    setSaving(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        vacation?: VacationApi;
        warnings?: any[];
        error?: string;
      }>(`/api/vacations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          startAt: startIso,
          endAt: endIso,
          requiredAgents: reqAgents,
          notes: normalizeText(notes) || null,
        }),
      });

      if (!res.ok || !res.vacation) {
        toast({
          title: "Erreur",
          description: res.error ?? "Sauvegarde impossible.",
          variant: "destructive",
        });
        return;
      }

      setVacation(res.vacation);

      toast({
        title: "Enregistré",
        description: res.warnings?.length
          ? "Modifications appliquées (avec avertissements)."
          : "Modifications appliquées.",
      });
    } catch (e: any) {
      toast({
        title: "Erreur",
        description: e?.message ?? "Sauvegarde impossible.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function closeVacation() {
    if (!id || !vacation) return;
    if (!canWrite) {
      toast({
        title: "Accès refusé",
        description: "Droits insuffisants.",
        variant: "destructive",
      });
      return;
    }

    const ok = window.confirm("Clôturer cette vacation ? (statut: closed)");
    if (!ok) return;

    setClosing(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        vacation?: VacationApi;
        error?: string;
      }>(`/api/vacations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "closed" }),
      });

      if (!res.ok || !res.vacation) {
        toast({
          title: "Erreur",
          description: res.error ?? "Clôture impossible.",
          variant: "destructive",
        });
        return;
      }

      setVacation(res.vacation);
      toast({ title: "Clôturée", description: "La vacation a été clôturée." });
    } catch (e: any) {
      toast({
        title: "Erreur",
        description: e?.message ?? "Clôture impossible.",
        variant: "destructive",
      });
    } finally {
      setClosing(false);
    }
  }

  async function cancelVacation() {
    if (!id) return;
    if (!canWrite) {
      toast({
        title: "Accès refusé",
        description: "Droits insuffisants.",
        variant: "destructive",
      });
      return;
    }

    const ok = window.confirm("Annuler cette vacation ? (statut: cancelled)");
    if (!ok) return;

    setDeleting(true);
    try {
      const res = await apiFetch<{ ok: boolean; error?: string }>(
        `/api/vacations/${id}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        toast({
          title: "Erreur",
          description: res.error ?? "Annulation impossible.",
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Annulée", description: "La vacation a été annulée." });
      router.push("/dashboard/vacations");
    } catch (e: any) {
      toast({
        title: "Erreur",
        description: e?.message ?? "Annulation impossible.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }

  /* ================= render ================= */

  if (loading) {
    return (
      <div className="rounded-lg border p-6 text-sm text-muted-foreground">
        Chargement…
      </div>
    );
  }

  if (!vacation) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border p-6 text-sm text-muted-foreground">
          Vacation introuvable (ou accès refusé).
        </div>
        <Button
          variant="outline"
          onClick={() => router.push("/dashboard/vacations")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour aux vacations
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => router.push("/dashboard/vacations")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour
            </Button>

            <Badge variant={statusVariant(vacation.status)}>
              {statusLabel(vacation.status)}
            </Badge>

            <Badge variant="outline">
              Agents {assignedCount}/{vacation.requiredAgents}
            </Badge>

            {siteLoading ? (
              <Badge variant="outline">Site…</Badge>
            ) : site ? (
              <Badge variant="outline">
                Site: {site.name ?? vacation.siteName ?? site.id}
              </Badge>
            ) : (
              <Badge variant="secondary">Site non chargé</Badge>
            )}
          </div>

          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            Vacation
          </h1>

          <p className="text-sm text-muted-foreground">
            {startD && endD
              ? `${format(startD, "PPPP 'à' p", { locale: fr })} → ${format(
                  endD,
                  "PPPP 'à' p",
                  { locale: fr }
                )}`
              : "—"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canWrite && !isClosedOrCancelled ? (
            <AssignAgentsDialog
              canWrite={canWrite}
              disabled={isClosedOrCancelled}
              siteId={vacation.siteId ?? null}
              allowedAgentIds={allowedAgentIds}
              selectedAgentIds={selectedAgentIds}
              setSelectedAgentIds={setSelectedAgentIds}
              onSave={async (nextAssigned) => {
                if (!id) return;

                const res = await apiFetch<{
                  ok: boolean;
                  vacation?: VacationApi;
                  warnings?: any[];
                  error?: string;
                }>(`/api/vacations/${id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ assignedAgentIds: nextAssigned }),
                });

                if (!res.ok || !res.vacation) {
                  // IMPORTANT: on throw pour que le Dialog affiche l'erreur inline
                  const msg =
                    res.error ?? "Impossible d’enregistrer les affectations.";
                  toast({
                    title: "Erreur",
                    description: msg,
                    variant: "destructive",
                  });
                  throw new Error(msg);
                }

                setVacation(res.vacation);

                toast({
                  title: "Affectations enregistrées",
                  description: res.warnings?.length
                    ? "Certaines affectations ont été rejetées automatiquement."
                    : "Agents affectés à la vacation.",
                });
              }}
            />
          ) : null}

          {canWrite && !isClosedOrCancelled ? (
            <Button
              variant="outline"
              onClick={closeVacation}
              disabled={closing}
              className="gap-2"
            >
              {closing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Clôturer
            </Button>
          ) : null}

          {canWrite && vacation.status !== "cancelled" ? (
            <Button
              variant="destructive"
              onClick={cancelVacation}
              disabled={deleting}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {deleting ? "Annulation..." : "Annuler"}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Agents affectés */}
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>Agents affectés</CardTitle>
          <CardDescription>
            {assignedCount === 0
              ? "Aucun agent affecté."
              : `${assignedCount} agent(s) affecté(s) à cette vacation.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
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

      {/* Modifier */}
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>Modifier la vacation</CardTitle>
          <CardDescription>
            Mise à jour des dates, besoins et notes. (Statut calculé
            automatiquement)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">Début</div>
              <Input
                type="datetime-local"
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
                disabled={!canWrite || isClosedOrCancelled}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Fin</div>
              <Input
                type="datetime-local"
                value={endLocal}
                onChange={(e) => setEndLocal(e.target.value)}
                disabled={!canWrite || isClosedOrCancelled}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Agents requis</div>
              <Input
                type="number"
                min={1}
                value={requiredAgents}
                onChange={(e) => setRequiredAgents(Number(e.target.value))}
                disabled={!canWrite || isClosedOrCancelled}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Statut</div>
              <div className="h-10 w-full rounded-md border bg-muted/30 px-3 text-sm flex items-center gap-2">
                <Badge variant={statusVariant(vacation.status)}>
                  {statusLabel(vacation.status)}
                </Badge>
                <span className="text-muted-foreground">
                  (calculé automatiquement)
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Notes</div>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Informations utiles (consignes, matériel, contact, etc.)"
              disabled={!canWrite || isClosedOrCancelled}
            />
          </div>

          {canWrite ? (
            <Button
              onClick={save}
              disabled={saving || isClosedOrCancelled}
              className="gap-2"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Enregistrer
            </Button>
          ) : (
            <div className="text-sm text-muted-foreground">
              Lecture seule (droits insuffisants).
            </div>
          )}

          {isClosedOrCancelled ? (
            <div className="text-xs text-muted-foreground">
              Cette vacation est{" "}
              {vacation.status === "closed" ? "clôturée" : "annulée"} :
              modification désactivée.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
