"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Eye,
  Loader2,
  LockKeyhole,
  Send,
  ShieldCheck,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAppFeedback } from "@/hooks/use-app-feedback";
import { useAuth } from "@/lib/auth-provider";
import {
  canManageUsers,
  getRoleLabel,
  normalizeRole,
  type AppRole,
} from "@/lib/auth/role";
import { apiFetch, getApiErrorMessage } from "@/lib/api/client-fetch";
import { cn } from "@/lib/utils";

type TenantRole = Exclude<AppRole, "super_admin">;
type TenantStatus = "active" | "disabled";

type TenantUserRow = {
  id: string;
  uid: string;
  name: string | null;
  email: string | null;
  role: AppRole | null;
  roleLabel: string;
  status: string;
  statusLabel: string;
  createdAtIso: string | null;
  updatedAtIso: string | null;
  isSelf: boolean;
  canEdit: boolean;
};

type UsersResponse = {
  ok: boolean;
  tenantId: string;
  actor: {
    uid: string;
    role: AppRole;
    roleLabel: string;
    editableRoles: TenantRole[];
  };
  count: number;
  users: TenantUserRow[];
};

type InviteResponse = {
  ok: boolean;
  uid: string;
  email: string;
  name: string;
  role: TenantRole;
  roleLabel: string;
  createdAuthUser: boolean;
  resetLink: string | null;
  resetLinkError: string | null;
  message: string;
};

const STATUS_OPTIONS: Array<{ value: TenantStatus | "all"; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "active", label: "Actifs" },
  { value: "disabled", label: "Desactives" },
];

const ROLE_RESTRICTIONS: Array<{
  role: TenantRole;
  title: string;
  detail: string;
  permissions: string[];
}> = [
  {
    role: "owner",
    title: "Proprietaire",
    detail: "Pilotage complet de l'agence et des droits sensibles.",
    permissions: ["Tout administrer", "Gerer utilisateurs", "Facturation", "Exports"],
  },
  {
    role: "admin",
    title: "Administrateur",
    detail: "Gestion operationnelle complete hors transfert proprietaire.",
    permissions: ["Planning", "Agents/sites", "Utilisateurs", "Parametres"],
  },
  {
    role: "manager",
    title: "Manager exploitation",
    detail: "Pilote le terrain sans toucher aux droits sensibles.",
    permissions: ["Planning", "Conduite", "Incidents", "Pre-paie lecture"],
  },
  {
    role: "agent",
    title: "Agent",
    detail: "Acces limite a ses missions et declarations terrain.",
    permissions: ["Planning agent", "Incidents terrain", "Diffusions"],
  },
  {
    role: "client",
    title: "Client",
    detail: "Acces restreint aux informations de son perimetre client.",
    permissions: ["Vue client", "PDF site", "Suivi prestation"],
  },
  {
    role: "viewer",
    title: "Observateur",
    detail: "Lecture seule pour controle ou supervision.",
    permissions: ["Lecture", "Rapports", "Aucun changement"],
  },
];

function initials(name: string | null, email: string | null) {
  const source = name || email || "?";
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

function formatDate(value: string | null) {
  if (!value) return "Jamais";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Jamais";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function roleTone(role: unknown) {
  const normalized = normalizeRole(role);
  if (normalized === "owner") return "border-slate-900 bg-slate-950 text-white";
  if (normalized === "admin") return "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300";
  if (normalized === "manager") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (normalized === "agent") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (normalized === "client") return "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300";
  if (normalized === "viewer") return "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300";
  return "border-border bg-muted text-muted-foreground";
}

function statusTone(status: string) {
  if (status === "active") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }

  return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
}

function UsersSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-40 rounded-[2rem]" />
      <Skeleton className="h-96 rounded-[2rem]" />
    </div>
  );
}

export default function UsersPage() {
  const { user, loading: authLoading } = useAuth();
  const feedback = useAppFeedback();
  const [statusFilter, setStatusFilter] = useState<TenantStatus | "all">("all");
  const [response, setResponse] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<TenantRole>("agent");
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteResult, setInviteResult] = useState<InviteResponse | null>(null);

  const currentRole = normalizeRole(user?.role);
  const canManage = canManageUsers(currentRole);

  const users = response?.users ?? [];
  const activeCount = users.filter((item) => item.status === "active").length;
  const adminCount = users.filter((item) => {
    const role = normalizeRole(item.role);
    return item.status === "active" && (role === "owner" || role === "admin");
  }).length;

  const editableRoles = useMemo(
    () => response?.actor.editableRoles ?? [],
    [response?.actor.editableRoles]
  );

  useEffect(() => {
    if (editableRoles.length === 0) return;

    if (!editableRoles.includes(inviteRole)) {
      setInviteRole(editableRoles.includes("agent") ? "agent" : editableRoles[0]);
    }
  }, [editableRoles, inviteRole]);

  const loadUsers = useCallback(
    async (quiet = false) => {
      if (!canManage) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ status: statusFilter });
        const data = await apiFetch<UsersResponse>(`/api/users?${params.toString()}`);
        setResponse(data);

        if (!quiet) {
          feedback.info(
            "Utilisateurs synchronises",
            `${data.count} compte(s) charge(s) depuis tenantUsers.`
          );
        }
      } catch (err) {
        const message = getApiErrorMessage(
          err,
          "Impossible de charger les utilisateurs reels."
        );
        setError(message);
        feedback.error(err, {
          title: "Chargement utilisateurs impossible",
          fallback: message,
        });
      } finally {
        setLoading(false);
      }
    },
    [canManage, feedback, statusFilter]
  );

  useEffect(() => {
    if (authLoading) return;
    void loadUsers(true);
  }, [authLoading, loadUsers]);

  async function updateUserAccess(
    target: TenantUserRow,
    patch: { role?: TenantRole; status?: TenantStatus }
  ) {
    if (!target.canEdit || target.isSelf) {
      feedback.warning(
        "Action protegee",
        "Vous ne pouvez pas modifier votre propre acces ou un compte protege."
      );
      return;
    }

    setUpdatingUid(target.uid);

    try {
      await apiFetch("/api/users", {
        method: "PATCH",
        body: {
          uid: target.uid,
          ...patch,
          reason: "Modification depuis le module Utilisateurs",
        },
      });

      feedback.success(
        "Acces mis a jour",
        `${target.name ?? target.email ?? target.uid} a ete modifie.`
      );
      await loadUsers(true);
    } catch (err) {
      feedback.error(err, {
        title: "Modification refusee",
        fallback: "Impossible de modifier cet utilisateur.",
      });
    } finally {
      setUpdatingUid(null);
    }
  }

  function resetInviteForm() {
    setInviteEmail("");
    setInviteName("");
    setInviteRole(editableRoles.includes("agent") ? "agent" : editableRoles[0] ?? "agent");
    setInviteResult(null);
  }

  function handleInviteOpenChange(open: boolean) {
    setInviteOpen(open);
    if (!open) resetInviteForm();
  }

  async function inviteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!inviteEmail.trim()) {
      feedback.warning("Email requis", "Renseignez l'email de l'utilisateur a inviter.");
      return;
    }

    if (!editableRoles.includes(inviteRole)) {
      feedback.warning(
        "Role non autorise",
        "Votre niveau d'acces ne permet pas d'attribuer ce role."
      );
      return;
    }

    setInviteSaving(true);
    setInviteResult(null);

    try {
      const result = await apiFetch<InviteResponse>("/api/users", {
        method: "POST",
        body: {
          email: inviteEmail,
          name: inviteName,
          role: inviteRole,
        },
      });

      setInviteResult(result);
      setInviteEmail("");
      setInviteName("");
      feedback.success(
        "Invitation preparee",
        `${result.name} est rattache a l'agence avec le role ${result.roleLabel}.`
      );
      await loadUsers(true);
    } catch (err) {
      feedback.error(err, {
        title: "Invitation impossible",
        fallback: "Impossible d'inviter cet utilisateur.",
      });
    } finally {
      setInviteSaving(false);
    }
  }

  async function copyInviteLink() {
    if (!inviteResult?.resetLink) return;

    try {
      await navigator.clipboard.writeText(inviteResult.resetLink);
      feedback.success("Lien copie", "Le lien d'activation est dans le presse-papiers.");
    } catch {
      feedback.warning(
        "Copie impossible",
        "Selectionnez le lien manuellement puis copiez-le."
      );
    }
  }

  if (authLoading || (loading && !response && !error && canManage)) {
    return <UsersSkeleton />;
  }

  if (!canManage) {
    return (
      <EmptyState
        icon={LockKeyhole}
        tone="danger"
        title="Acces reserve aux administrateurs"
        description="La gestion des utilisateurs permet de modifier les roles et restrictions de l'agence. Elle est reservee aux proprietaires et administrateurs."
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-10">
      <section className="overflow-hidden rounded-[2rem] border bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100">
              Donnees reelles tenantUsers
            </Badge>
            <h1 className="mt-4 flex items-center gap-3 text-3xl font-black tracking-tight md:text-4xl">
              <Users className="h-8 w-8 text-cyan-200" />
              Utilisateurs, roles et restrictions
            </h1>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-300">
              Cet ecran pilote les acces reels de l'agence. Chaque changement
              est enregistre dans l'audit log et les roles definissent les
              modules accessibles.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:w-[560px]">
            <AccessKpi label="Comptes" value={users.length} />
            <AccessKpi label="Actifs" value={activeCount} />
            <AccessKpi label="Admins actifs" value={adminCount} />
          </div>
        </div>
      </section>

      <Dialog open={inviteOpen} onOpenChange={handleInviteOpenChange}>
        <DialogContent className="max-w-2xl rounded-[2rem] p-0">
          <form onSubmit={inviteUser}>
            <DialogHeader className="border-b bg-muted/30 p-6 pr-12">
              <DialogTitle className="flex items-center gap-2 text-2xl font-black">
                <UserPlus className="h-6 w-6 text-primary" />
                Inviter un utilisateur
              </DialogTitle>
              <DialogDescription className="font-semibold leading-6">
                Provisionne un compte Firebase Auth, rattache l'utilisateur a
                cette agence, puis prepare un lien d'activation testable.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="invite-name" className="font-black">
                    Nom complet
                  </Label>
                  <Input
                    id="invite-name"
                    value={inviteName}
                    onChange={(event) => setInviteName(event.target.value)}
                    placeholder="Ex. Nadia Benali"
                    disabled={inviteSaving}
                    className="h-12 rounded-2xl font-semibold"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invite-email" className="font-black">
                    Email
                  </Label>
                  <Input
                    id="invite-email"
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="nom@agence.fr"
                    disabled={inviteSaving}
                    className="h-12 rounded-2xl font-semibold"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="font-black">Role a attribuer</Label>
                <Select
                  value={inviteRole}
                  onValueChange={(value) => setInviteRole(value as TenantRole)}
                  disabled={inviteSaving || editableRoles.length === 0}
                >
                  <SelectTrigger className="h-12 rounded-2xl font-bold">
                    <SelectValue placeholder="Choisir un role" />
                  </SelectTrigger>
                  <SelectContent>
                    {editableRoles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {getRoleLabel(role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs font-semibold leading-5 text-muted-foreground">
                  Le role determine les modules visibles. Par prudence, evitez
                  les droits administrateur si l'utilisateur n'en a pas besoin.
                </p>
              </div>

              {inviteResult ? (
                <div className="rounded-3xl border border-emerald-500/25 bg-emerald-500/10 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-700 dark:text-emerald-300" />
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-foreground">
                        Invitation prete pour {inviteResult.name}
                      </p>
                      <p className="mt-1 text-sm font-semibold leading-6 text-muted-foreground">
                        {inviteResult.createdAuthUser
                          ? "Un nouveau compte Firebase a ete cree."
                          : "Un compte existant a ete rattache ou reactive."}
                      </p>

                      {inviteResult.resetLink ? (
                        <div className="mt-4 flex gap-2">
                          <Input
                            readOnly
                            value={inviteResult.resetLink}
                            className="h-11 rounded-2xl font-mono text-xs"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void copyInviteLink()}
                            className="h-11 shrink-0 rounded-2xl font-black"
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Copier
                          </Button>
                        </div>
                      ) : (
                        <p className="mt-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs font-bold text-amber-800 dark:text-amber-200">
                          Le lien d'activation n'a pas pu etre genere. Le compte
                          est cree, mais il faudra renvoyer un lien apres
                          configuration Firebase Auth.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <DialogFooter className="border-t bg-muted/20 p-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleInviteOpenChange(false)}
                disabled={inviteSaving}
                className="rounded-2xl font-black"
              >
                Fermer
              </Button>
              <Button
                type="submit"
                disabled={inviteSaving || editableRoles.length === 0}
                className="rounded-2xl font-black"
              >
                {inviteSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Preparer l'invitation
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {error ? (
        <EmptyState
          icon={AlertTriangle}
          tone="danger"
          title="Utilisateurs indisponibles"
          description={error}
          action={
            <Button onClick={() => void loadUsers()} className="rounded-2xl font-black">
              Reessayer
            </Button>
          }
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="overflow-hidden rounded-[2rem] border-border/60 shadow-sm">
          <CardHeader className="border-b bg-muted/20">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl font-black">
                  <UserCog className="h-5 w-5 text-primary" />
                  Comptes de l'agence
                </CardTitle>
                <CardDescription>
                  Source : collection Firebase <strong>tenantUsers</strong>.
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Select
                  value={statusFilter}
                  onValueChange={(value) => setStatusFilter(value as TenantStatus | "all")}
                >
                  <SelectTrigger className="h-11 w-[170px] rounded-2xl font-bold">
                    <SelectValue placeholder="Statut" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  type="button"
                  onClick={() => setInviteOpen(true)}
                  disabled={editableRoles.length === 0}
                  className="h-11 rounded-2xl font-black"
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  Inviter
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void loadUsers()}
                  disabled={loading}
                  className="h-11 rounded-2xl font-black"
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  Actualiser
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {users.length === 0 ? (
              <EmptyState
                icon={Users}
                tone="warning"
                title="Aucun utilisateur dans ce filtre"
                description="Changez le filtre ou verifiez le provisioning tenantUsers."
                className="m-6"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Utilisateur</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Restrictions</TableHead>
                    <TableHead>Derniere mise a jour</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((item) => {
                    const normalizedRole = normalizeRole(item.role);
                    const selectableRole = editableRoles.includes(
                      normalizedRole as TenantRole
                    )
                      ? (normalizedRole as TenantRole)
                      : "viewer";
                    const selectableStatus =
                      item.status === "disabled" ? "disabled" : "active";
                    const canEditRow = item.canEdit && !item.isSelf;
                    const updating = updatingUid === item.uid;

                    return (
                      <TableRow key={item.uid} className="align-top">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10 border">
                              <AvatarFallback className="bg-primary/10 text-xs font-black text-primary">
                                {initials(item.name, item.email)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-black text-foreground">
                                  {item.name ?? item.email ?? item.uid}
                                </p>
                                {item.isSelf ? (
                                  <Badge variant="outline" className="rounded-full text-[10px] font-black">
                                    Vous
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="mt-1 text-xs font-semibold text-muted-foreground">
                                {item.email ?? "Email non renseigne"}
                              </p>
                              <p className="mt-1 font-mono text-[10px] text-muted-foreground/70">
                                {item.uid}
                              </p>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="min-w-[210px]">
                          {canEditRow ? (
                            <Select
                              value={selectableRole}
                              disabled={updating}
                              onValueChange={(value) =>
                                void updateUserAccess(item, {
                                  role: value as TenantRole,
                                })
                              }
                            >
                              <SelectTrigger className="h-10 rounded-2xl font-bold">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {editableRoles.map((role) => (
                                  <SelectItem key={role} value={role}>
                                    {getRoleLabel(role)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge
                              variant="outline"
                              className={cn("rounded-full px-3 py-1 font-black", roleTone(item.role))}
                            >
                              {item.roleLabel}
                            </Badge>
                          )}
                        </TableCell>

                        <TableCell className="min-w-[170px]">
                          {canEditRow ? (
                            <Select
                              value={selectableStatus}
                              disabled={updating}
                              onValueChange={(value) =>
                                void updateUserAccess(item, {
                                  status: value as TenantStatus,
                                })
                              }
                            >
                              <SelectTrigger className="h-10 rounded-2xl font-bold">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="active">Actif</SelectItem>
                                <SelectItem value="disabled">Desactive</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge
                              variant="outline"
                              className={cn("rounded-full px-3 py-1 font-black", statusTone(item.status))}
                            >
                              {item.statusLabel}
                            </Badge>
                          )}
                        </TableCell>

                        <TableCell className="max-w-[320px]">
                          <RestrictionSummary role={normalizedRole} />
                          {!canEditRow ? (
                            <p className="mt-2 text-xs font-semibold text-muted-foreground">
                              {item.isSelf
                                ? "Votre propre acces est protege."
                                : "Compte protege ou role non modifiable par votre niveau."}
                            </p>
                          ) : null}
                        </TableCell>

                        <TableCell className="text-sm font-semibold text-muted-foreground">
                          {formatDate(item.updatedAtIso ?? item.createdAtIso)}
                          {updating ? (
                            <div className="mt-2 flex items-center gap-2 text-xs text-primary">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Mise a jour...
                            </div>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-[2rem] border-border/60 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-black">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Restrictions par role
              </CardTitle>
              <CardDescription>
                Lecture rapide des droits pour eviter les erreurs d'affectation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {ROLE_RESTRICTIONS.map((item) => (
                <div key={item.role} className="rounded-2xl border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Badge
                        variant="outline"
                        className={cn("rounded-full px-2.5 py-1 text-[10px] font-black", roleTone(item.role))}
                      >
                        {getRoleLabel(item.role)}
                      </Badge>
                      <p className="mt-3 font-black text-foreground">{item.title}</p>
                      <p className="mt-1 text-xs font-semibold leading-5 text-muted-foreground">
                        {item.detail}
                      </p>
                    </div>
                    {item.role === "viewer" ? (
                      <Eye className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <LockKeyhole className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.permissions.map((permission) => (
                      <span
                        key={permission}
                        className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground"
                      >
                        {permission}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border-amber-500/25 bg-amber-500/10 shadow-sm">
            <CardContent className="flex items-start gap-3 p-5">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700 dark:text-amber-300" />
              <div>
                <p className="font-black text-foreground">Regles de securite</p>
                <p className="mt-1 text-sm font-medium leading-6 text-muted-foreground">
                  Le dernier administrateur actif ne peut pas etre retire. Votre
                  propre acces ne peut pas etre modifie depuis cet ecran. Les
                  changements sont traces dans l'audit log.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function AccessKpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-white/10 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-300">
        {label}
      </p>
      <p className="mt-1 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function RestrictionSummary({ role }: { role: AppRole | null }) {
  const normalized = normalizeRole(role);
  const restriction = ROLE_RESTRICTIONS.find((item) => item.role === normalized);

  if (!restriction) {
    return (
      <p className="text-sm font-semibold text-muted-foreground">
        Restrictions inconnues.
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm font-black text-foreground">{restriction.title}</p>
      <p className="mt-1 text-xs font-semibold leading-5 text-muted-foreground">
        {restriction.detail}
      </p>
    </div>
  );
}
