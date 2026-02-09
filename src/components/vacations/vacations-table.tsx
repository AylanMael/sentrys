"use client";

import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type VacationRow = {
  id: string;
  siteId: string;
  siteName?: string | null;
  startAtIso: string | null;
  endAtIso: string | null;
  requiredAgents: number;
  assignedAgentIds?: string[];
  status: string;
};

function statusLabel(s: string) {
  switch (s) {
    case "planned":
      return "Planifiée";
    case "partially_filled":
      return "Partielle";
    case "filled":
      return "Complète";
    case "closed":
      return "Clôturée";
    case "cancelled":
      return "Annulée";
    default:
      return s;
  }
}

function statusVariant(s: string) {
  if (s === "filled") return "default";
  if (s === "partially_filled") return "outline";
  if (s === "cancelled") return "destructive";
  if (s === "closed") return "secondary";
  return "outline";
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return format(d, "PPPP 'à' p", { locale: fr });
}

export function VacationsTable({ rows }: { rows: VacationRow[] }) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Site</TableHead>
            <TableHead>Début</TableHead>
            <TableHead>Fin</TableHead>
            <TableHead>Besoin</TableHead>
            <TableHead>Affectés</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((r) => {
            const assigned = r.assignedAgentIds?.length ?? 0;
            return (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  {r.siteName ?? "—"}
                  <div className="text-xs text-muted-foreground">{r.siteId}</div>
                </TableCell>

                <TableCell>{fmt(r.startAtIso)}</TableCell>
                <TableCell>{fmt(r.endAtIso)}</TableCell>

                <TableCell>{r.requiredAgents}</TableCell>
                <TableCell>
                  {assigned} / {r.requiredAgents}
                </TableCell>

                <TableCell>
                  <Badge variant={statusVariant(r.status)}>{statusLabel(r.status)}</Badge>
                </TableCell>

                <TableCell className="text-right">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/vacations/${r.id}`}>Voir</Link>
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
