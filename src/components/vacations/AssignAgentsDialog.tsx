"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckSquare,
  ExternalLink,
  Loader2,
  Save,
  Search,
  Square,
  Users,
} from "lucide-react";

import { apiFetch } from "@/lib/api/client-fetch";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription, // ✅ AJOUT
  DialogTrigger,
} from "@/components/ui/dialog";

type AgentApi = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: "active" | "inactive";
};

function uniq(arr: string[]) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function normalizeText(v: unknown) {
  return String(v ?? "").trim();
}

function agentLabel(a: AgentApi) {
  const name = `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim();
  return name || a.email || a.id;
}

function toggleInList(list: string[], value: string) {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

export type AssignAgentsDialogProps = {
  canWrite: boolean;
  disabled: boolean;
  siteId: string | null;
  allowedAgentIds: string[];
  selectedAgentIds: string[];
  setSelectedAgentIds: React.Dispatch<React.SetStateAction<string[]>>;
  onSave: (nextAssigned: string[]) => Promise<void>;
};

function AssignAgentsDialogImpl({
  canWrite,
  disabled,
  siteId,
  allowedAgentIds,
  selectedAgentIds,
  setSelectedAgentIds,
  onSave,
}: AssignAgentsDialogProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [allowedAgents, setAllowedAgents] = useState<AgentApi[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");

  const allowedAgentIdsKey = useMemo(() => allowedAgentIds.join(","), [allowedAgentIds]);

  useEffect(() => {
    if (!open) return;

    // resserrer la sélection : selected ⊆ allowed
    setSelectedAgentIds((prev) => {
      const allowedSet = new Set(allowedAgentIds);
      return uniq(prev).filter((x) => allowedSet.has(x));
    });

    if (!siteId) {
      setAllowedAgents([]);
      setError("Site non défini — impossible de filtrer les agents.");
      setLoading(false);
      return;
    }

    if (allowedAgentIds.length === 0) {
      setAllowedAgents([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const qs = new URLSearchParams();
        qs.set("ids", allowedAgentIds.join(","));

        const res = await apiFetch<{ ok: boolean; agents?: AgentApi[]; error?: string }>(
          `/api/agents?${qs.toString()}`
        );

        if (!res.ok) {
          setAllowedAgents([]);
          setError(res.error ?? "Impossible de charger les agents du site.");
          return;
        }

        const rows = (res.agents ?? [])
          .slice()
          .sort((a, b) =>
            agentLabel(a).toLowerCase().localeCompare(agentLabel(b).toLowerCase())
          );

        setAllowedAgents(rows);
      } catch (e: any) {
        setAllowedAgents([]);
        setError(e?.message ?? "Impossible de charger les agents du site.");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, siteId, allowedAgentIdsKey, setSelectedAgentIds, allowedAgentIds]);

  const filtered = useMemo(() => {
    const q = normalizeText(search).toLowerCase();
    if (!q) return allowedAgents;
    return allowedAgents.filter((a) => {
      const t = `${agentLabel(a)} ${a.email ?? ""} ${a.phone ?? ""}`.toLowerCase();
      return t.includes(q);
    });
  }, [allowedAgents, search]);

  const allFilteredSelected = useMemo(() => {
    if (filtered.length === 0) return false;
    const set = new Set(selectedAgentIds);
    return filtered.every((a) => set.has(a.id));
  }, [filtered, selectedAgentIds]);

  const toggleSelectAllFiltered = () => {
    const ids = filtered.map((a) => a.id);
    setSelectedAgentIds((prev) => {
      const set = new Set(prev);
      if (allFilteredSelected) ids.forEach((x) => set.delete(x));
      else ids.forEach((x) => set.add(x));
      return Array.from(set);
    });
  };

  async function handleSave() {
    const allowedSet = new Set(allowedAgentIds);
    const nextAssigned = uniq(selectedAgentIds).filter((x) => allowedSet.has(x));

    setSaving(true);
    setError(null);

    try {
      await onSave(nextAssigned);
      setOpen(false);
      setSearch("");
    } catch (e: any) {
      setError(e?.message ?? "Impossible d’enregistrer les affectations.");
    } finally {
      setSaving(false);
    }
  }

  if (!canWrite || disabled) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setSearch("");
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Users className="h-4 w-4" />
          Affecter des agents
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Affectations de la vacation</DialogTitle>

          {/* ✅ Fix warning + accessibilité */}
          <DialogDescription>
            Seuls les agents <span className="font-medium">affectés au site</span> peuvent être
            sélectionnés.
          </DialogDescription>
        </DialogHeader>

        <Separator />

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement des agents…
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
              <div className="space-y-1">
                <p className="font-medium text-destructive">Erreur</p>
                <p className="text-muted-foreground">{error}</p>
              </div>
            </div>
          </div>
        ) : allowedAgentIds.length === 0 ? (
          <div className="rounded-lg border p-6 text-sm text-muted-foreground">
            Aucun agent n’est affecté au site. Va sur le site pour gérer ses affectations.
            <div className="mt-3">
              {siteId ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/dashboard/sites/${siteId}`}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Ouvrir le site
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-md">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Rechercher un agent (nom, email, téléphone)…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={toggleSelectAllFiltered}
                className="gap-2"
              >
                {allFilteredSelected ? (
                  <CheckSquare className="h-4 w-4" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                {allFilteredSelected ? "Tout décocher" : "Tout cocher"}
              </Button>
            </div>

            <div className="max-h-[420px] space-y-2 overflow-auto rounded-lg border p-3">
              {filtered.length === 0 ? (
                <div className="text-sm text-muted-foreground">Aucun agent ne correspond.</div>
              ) : (
                filtered.map((a) => {
                  const checked = selectedAgentIds.includes(a.id);
                  return (
                    <label
                      key={a.id}
                      className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() =>
                          setSelectedAgentIds((prev) => toggleInList(prev, a.id))
                        }
                      />
                      <div className="text-sm">
                        <div className="font-medium">{agentLabel(a)}</div>
                        <div className="text-xs text-muted-foreground">
                          {a.email ?? "—"} • {a.phone ?? "—"} •{" "}
                          {a.status === "inactive" ? "Inactif" : "Actif"}
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

          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { AssignAgentsDialogImpl as AssignAgentsDialog };
export default AssignAgentsDialogImpl;
