"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Agent = any;

export default function AgentsPage() {
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams();

        // ✅ Toujours envoyer status, y compris "all"
        qs.set("status", status); // all|active|inactive
        if (q.trim()) qs.set("q", q.trim());

        const data = await apiFetch<{ ok: boolean; agents?: Agent[] }>(
          `/api/agents?${qs.toString()}`
        );

        if (mounted) setAgents(data.ok ? (data.agents ?? []) : []);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [q, status]);

  const countActive = useMemo(
    () => agents.filter((a) => a.status === "active").length,
    [agents]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Agents</h1>
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Chargement…"
              : `${agents.length} agents (${countActive} actifs)`}
          </p>
        </div>

        <Button asChild>
          <Link href="/dashboard/agents/new">Ajouter un agent</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-base">Liste</CardTitle>

          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
            <Input
              placeholder="Rechercher (nom, email, tel)…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="md:w-[280px]"
            />

            <div className="flex gap-2">
              <Button
                variant={status === "all" ? "default" : "outline"}
                onClick={() => setStatus("all")}
              >
                Tous
              </Button>
              <Button
                variant={status === "active" ? "default" : "outline"}
                onClick={() => setStatus("active")}
              >
                Actifs
              </Button>
              <Button
                variant={status === "inactive" ? "default" : "outline"}
                onClick={() => setStatus("inactive")}
              >
                Inactifs
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-2">
          {loading ? (
            <div className="text-sm text-muted-foreground">Chargement…</div>
          ) : agents.length === 0 ? (
            <div className="text-sm text-muted-foreground">Aucun agent.</div>
          ) : (
            <div className="divide-y rounded-md border">
              {agents.map((a) => (
                <Link
                  key={a.id}
                  href={`/dashboard/agents/${a.id}`}
                  className="flex items-center justify-between gap-3 p-3 hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {(a.firstName ?? "")} {(a.lastName ?? "")}
                    </div>
                    <div className="truncate text-sm text-muted-foreground">
                      {a.email ?? "—"} • {a.phone ?? "—"}
                    </div>
                  </div>

                  <Badge
                    variant={a.status === "active" ? "default" : "secondary"}
                  >
                    {a.status ?? "—"}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}