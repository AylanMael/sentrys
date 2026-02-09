"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api/client-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Agent = any;

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agent, setAgent] = useState<Agent | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const data = await apiFetch<{ ok: boolean; agent?: Agent; error?: string }>(`/api/agents/${id}`);
        if (mounted) setAgent(data.ok ? (data.agent ?? null) : null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  async function savePatch(patch: any) {
    setSaving(true);
    try {
      const res = await apiFetch<{ ok: boolean; error?: string }>(`/api/agents/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (!res.ok) alert(res.error ?? "Erreur");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-sm text-muted-foreground">Chargement…</div>;
  if (!agent) return <div className="text-sm text-muted-foreground">Agent introuvable.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {agent.firstName} {agent.lastName}
          </h1>
          <div className="mt-1">
            <Badge variant={agent.status === "active" ? "default" : "secondary"}>
              {agent.status}
            </Badge>
          </div>
        </div>
        <Button variant="outline" onClick={() => router.back()}>
          Retour
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              placeholder="Prénom"
              value={agent.firstName ?? ""}
              onChange={(e) => setAgent({ ...agent, firstName: e.target.value })}
            />
            <Input
              placeholder="Nom"
              value={agent.lastName ?? ""}
              onChange={(e) => setAgent({ ...agent, lastName: e.target.value })}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Input
              placeholder="Email"
              value={agent.email ?? ""}
              onChange={(e) => setAgent({ ...agent, email: e.target.value })}
            />
            <Input
              placeholder="Téléphone"
              value={agent.phone ?? ""}
              onChange={(e) => setAgent({ ...agent, phone: e.target.value })}
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() =>
                savePatch({
                  firstName: agent.firstName,
                  lastName: agent.lastName,
                  email: agent.email,
                  phone: agent.phone,
                })
              }
              disabled={saving}
            >
              {saving ? "Sauvegarde…" : "Enregistrer"}
            </Button>

            <Button
              variant="outline"
              onClick={() => savePatch({ status: agent.status === "active" ? "inactive" : "active" })}
              disabled={saving}
            >
              Basculer statut
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}