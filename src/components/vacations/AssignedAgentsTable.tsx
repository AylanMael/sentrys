"use client";

import { AlertCircle, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AgentApi = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: "active" | "inactive";
};

function agentLabel(a: AgentApi) {
  const name = `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim();
  return name || a.email || a.id;
}

export function AssignedAgentsTable({
  canWrite,
  isClosedOrCancelled,
  assignedCount,
  assignedLoading,
  assignedError,
  assignedAgents,
}: {
  canWrite: boolean;
  isClosedOrCancelled: boolean;
  assignedCount: number;
  assignedLoading: boolean;
  assignedError: string | null;
  assignedAgents: AgentApi[];
}) {
  if (assignedCount === 0) {
    return (
      <div className="rounded-lg border p-6 text-sm text-muted-foreground">
        {canWrite && !isClosedOrCancelled
          ? "Utilise “Affecter des agents”."
          : "Aucun agent affecté."}
      </div>
    );
  }

  if (assignedLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement…
      </div>
    );
  }

  if (assignedError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
          <div className="space-y-1">
            <p className="font-medium text-destructive">Erreur</p>
            <p className="text-muted-foreground">{assignedError}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Agent</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Téléphone</TableHead>
            <TableHead>Statut</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assignedAgents.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-medium">{agentLabel(a)}</TableCell>
              <TableCell className="text-muted-foreground">
                {a.email ?? "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {a.phone ?? "—"}
              </TableCell>
              <TableCell>
                <Badge variant={a.status === "inactive" ? "secondary" : "outline"}>
                  {a.status === "inactive" ? "Inactif" : "Actif"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
