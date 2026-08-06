import { Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatTime } from "../format";
import type { OwnerInvitationRow, TenantUserRow } from "../types";

export function TenantUsersTable({ users }: { users: TenantUserRow[] }) {
  return (
    <Card className="overflow-hidden rounded-[2rem] border-border/60 bg-background/90 shadow-sm">
      <CardHeader className="border-b bg-muted/20">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="text-xl font-black">
              Comptes rattachés
            </CardTitle>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Lecture plateforme limitee aux comptes, rôles et statuts.
            </p>
          </div>
          <Badge variant="outline" className="w-fit rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]">
            {users.length} visible(s)
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Rôle</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Dernière maj</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="min-w-[220px]">
                    <p className="font-black">{item.name ?? item.email ?? item.id}</p>
                    <p className="mt-1 text-xs font-semibold text-muted-foreground">
                      {item.email ?? item.uid ?? item.id}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="rounded-full">
                    {item.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="rounded-full capitalize">
                    {item.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm font-semibold text-muted-foreground">
                  {formatDate(item.updatedAtIso ?? item.createdAtIso)}
                </TableCell>
              </TableRow>
            ))}

            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center">
                  <p className="font-black">Aucun utilisateur trouve</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Vérifiez le tenantId ou le provisioning de cette agence.
                  </p>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function OwnerInvitationsPanel({ invitations }: { invitations: OwnerInvitationRow[] }) {
  return (
    <Card className="overflow-hidden rounded-[2rem] border-border/60">
      <CardHeader className="border-b bg-muted/25">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl font-black">
              <Users className="h-5 w-5 text-primary" />
              Invitations propriétaire
            </CardTitle>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Derniers liens d'activation préparés pour le compte owner de l'agence.
            </p>
          </div>
          <Badge variant="outline" className="w-fit rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]">
            {invitations.length} invitation(s)
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 md:grid-cols-2">
        {invitations.length > 0 ? (
          invitations.map((invitation) => (
            <div key={invitation.id} className="rounded-2xl border bg-background/80 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 font-black text-emerald-800 hover:bg-emerald-500/10 dark:text-emerald-100">
                  {invitation.status}
                </Badge>
                <Badge variant="outline" className="rounded-full">
                  {invitation.resetLinkCreated ? "Lien créé" : "Lien absent"}
                </Badge>
              </div>
              <p className="mt-3 font-black">{invitation.name ?? invitation.email ?? "Propriétaire"}</p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">{invitation.email ?? "Email non renseigné"}</p>
              <p className="mt-2 text-xs font-semibold text-muted-foreground">
                {invitation.createdAuthUser ? "Compte créé" : "Compte reutilisé"} - {formatDate(invitation.createdAtIso)} a {formatTime(invitation.createdAtIso)}
              </p>
              {invitation.resetLinkError ? (
                <p className="mt-2 text-xs font-bold text-amber-800 dark:text-amber-100">
                  {invitation.resetLinkError}
                </p>
              ) : null}
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed bg-muted/20 p-5 md:col-span-2">
            <p className="font-black">Aucune invitation propriétaire</p>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Preparez l'invitation depuis les actions support encadrees.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
