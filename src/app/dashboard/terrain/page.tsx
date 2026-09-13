"use client";
import { useAuth } from "@/lib/auth-provider";
import { AgentMissions } from "@/components/dashboard/agent-missions";
export default function TerrainPage() {
  const { user, loading } = useAuth();
  if (loading) return <p>Chargement…</p>;
  if (user?.role !== "agent") return <p>Ces actions sont réservées aux agents affectés.</p>;
  return <section className="mx-auto max-w-3xl space-y-6"><h1 className="text-2xl font-semibold">Mes actions terrain</h1><AgentMissions /></section>;
}
