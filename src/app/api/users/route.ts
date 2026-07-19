import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { requireTenantUser } from "@/app/api/_utils/withTenant";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import {
  canManageUsers,
  getRoleLabel,
  normalizeRole,
  type AppRole,
} from "@/lib/auth/role";

export const runtime = "nodejs";

const TENANT_MANAGED_ROLES = [
  "owner",
  "admin",
  "manager",
  "agent",
  "client",
  "viewer",
] as const satisfies readonly AppRole[];

const TENANT_MANAGED_STATUSES = ["active", "disabled"] as const;

type TenantManagedRole = (typeof TENANT_MANAGED_ROLES)[number];
type TenantManagedStatus = (typeof TENANT_MANAGED_STATUSES)[number];

type UpdateBody = {
  uid?: string;
  role?: TenantManagedRole;
  status?: TenantManagedStatus;
  reason?: string;
};

type InviteBody = {
  email?: string;
  name?: string;
  role?: TenantManagedRole;
};

function json(status: number, body: unknown) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function bad(message: string, extra?: Record<string, unknown>) {
  return json(400, { ok: false, error: message, ...extra });
}

function forbidden(message: string, extra?: Record<string, unknown>) {
  return json(403, { ok: false, error: message, ...extra });
}

function toIso(value: unknown) {
  const timestamp = value as { toDate?: () => Date } | null | undefined;
  return timestamp && typeof timestamp.toDate === "function"
    ? timestamp.toDate().toISOString()
    : null;
}

function normalizeText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function normalizeEmail(value: unknown) {
  const email = normalizeText(value)?.toLowerCase() ?? null;
  if (!email) return null;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function getAppBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:9002"
  ).replace(/\/+$/, "");
}

function isFirebaseUserNotFound(error: unknown) {
  return (
    (error as { code?: string } | null)?.code === "auth/user-not-found" ||
    String((error as { message?: string } | null)?.message ?? "").includes(
      "no user record"
    )
  );
}

function statusLabel(status: string | null) {
  if (status === "disabled") return "Desactive";
  return "Actif";
}

function isAdminLike(role: unknown) {
  const normalized = normalizeRole(role);
  return normalized === "super_admin" || normalized === "owner" || normalized === "admin";
}

function isManagedRole(role: unknown): role is TenantManagedRole {
  return TENANT_MANAGED_ROLES.includes(normalizeRole(role) as TenantManagedRole);
}

function isManagedStatus(status: unknown): status is TenantManagedStatus {
  return TENANT_MANAGED_STATUSES.includes(
    String(status ?? "").trim().toLowerCase() as TenantManagedStatus
  );
}

function editableRolesFor(actorRole: AppRole | "unknown") {
  if (actorRole === "super_admin" || actorRole === "owner") {
    return [...TENANT_MANAGED_ROLES];
  }

  if (actorRole === "admin") {
    return TENANT_MANAGED_ROLES.filter((role) => role !== "owner");
  }

  return [] as TenantManagedRole[];
}

export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!canManageUsers(auth.role)) {
    return forbidden("Action non autorisée avec votre role.");
  }

  const statusFilter =
    req.nextUrl.searchParams.get("status")?.trim().toLowerCase() || "all";
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 200);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 200, 1), 500);

  try {
    const snap = await adminDb
      .collection("tenantUsers")
      .where("tenantId", "==", auth.tenantId)
      .limit(limit)
      .get();

    const docs = snap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        const role = normalizeRole(data.role);
        const status = String(data.status ?? "active").trim().toLowerCase();

        return {
          id: doc.id,
          uid: String(data.uid ?? doc.id),
          tenantId: String(data.tenantId ?? auth.tenantId),
          name: normalizeText(data.name),
          email: normalizeText(data.email),
          role,
          roleLabel: getRoleLabel(role),
          status,
          statusLabel: statusLabel(status),
          createdAtIso: toIso(data.createdAt),
          updatedAtIso: toIso(data.updatedAt),
        };
      })
      .filter((item) => statusFilter === "all" || item.status === statusFilter);

    let authUsers = new Map<string, { email: string | null; name: string | null }>();

    if (docs.length > 0) {
      try {
        const authResults = await Promise.all(
          Array.from({ length: Math.ceil(docs.length / 100) }, (_, index) =>
            adminAuth.getUsers(
              docs
                .slice(index * 100, index * 100 + 100)
                .map((item) => ({ uid: item.uid }))
            )
          )
        );

        authUsers = new Map(
          authResults.flatMap((result) => result.users).map((user) => [
            user.uid,
            {
              email: user.email ?? null,
              name: user.displayName ?? null,
            },
          ])
        );
      } catch (error) {
        console.warn("[users.GET] auth enrichment skipped", error);
      }
    }

    const users = docs
      .map((item) => {
        const authUser = authUsers.get(item.uid);
        const email = item.email ?? authUser?.email ?? null;
        const name = item.name ?? authUser?.name ?? email ?? item.uid;

        return {
          ...item,
          email,
          name,
          isSelf: item.uid === auth.uid,
          canEdit:
            item.uid !== auth.uid &&
            editableRolesFor(auth.role).length > 0 &&
            (!isAdminLike(item.role) ||
              auth.role === "super_admin" ||
              auth.role === "owner"),
        };
      })
      .sort((left, right) => {
        const statusRank = (value: string) => (value === "active" ? 0 : 1);
        const byStatus = statusRank(left.status) - statusRank(right.status);
        if (byStatus !== 0) return byStatus;
        return String(left.name).localeCompare(String(right.name), "fr");
      });

    return json(200, {
      ok: true,
      tenantId: auth.tenantId,
      actor: {
        uid: auth.uid,
        role: auth.role,
        roleLabel: getRoleLabel(auth.role),
        editableRoles: editableRolesFor(auth.role),
      },
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("[users.GET]", error);
    return json(500, {
      ok: false,
      error: "Impossible de charger les utilisateurs.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!canManageUsers(auth.role)) {
    return forbidden("Action non autorisée avec votre role.");
  }

  let body: InviteBody;
  try {
    body = (await req.json()) as InviteBody;
  } catch {
    return bad("Corps JSON invalide.");
  }

  const email = normalizeEmail(body.email);
  const name = normalizeText(body.name);
  const role = normalizeRole(body.role);

  if (!email) return bad("Email valide requis.");
  if (!role || !isManagedRole(role)) return bad("Role invalide.");

  const allowedRoles = editableRolesFor(auth.role);
  if (!allowedRoles.includes(role)) {
    return forbidden("Votre role ne permet pas d'attribuer ce niveau d'accès.");
  }

  let createdAuthUser = false;
  let targetUid: string;
  let authDisplayName: string | null = null;

  try {
    try {
      const existingUser = await adminAuth.getUserByEmail(email);
      targetUid = existingUser.uid;
      authDisplayName = existingUser.displayName ?? null;
    } catch (error) {
      if (!isFirebaseUserNotFound(error)) throw error;

      const createdUser = await adminAuth.createUser({
        email,
        displayName: name ?? undefined,
        disabled: false,
        emailVerified: false,
      });

      createdAuthUser = true;
      targetUid = createdUser.uid;
      authDisplayName = createdUser.displayName ?? null;
    }

    if (targetUid === auth.uid) {
      return bad("Vous ne pouvez pas vous inviter vous-meme.");
    }

    const userRef = adminDb.collection("tenantUsers").doc(targetUid);
    const finalName = name ?? authDisplayName ?? email;

    try {
      await adminDb.runTransaction(async (tx) => {
        const existingSnap = await tx.get(userRef);
        const existing = existingSnap.exists
          ? (existingSnap.data() as Record<string, unknown>)
          : null;

        if (existing && String(existing.tenantId ?? "") !== auth.tenantId) {
          throw Object.assign(
            new Error("Cet email est deja rattaché à une autre agence."),
            { code: "TENANT_MISMATCH" }
          );
        }

        if (
          existing &&
          isAdminLike(existing.role) &&
          auth.role !== "super_admin" &&
          auth.role !== "owner"
        ) {
          throw Object.assign(
            new Error("Seul le propriétaire peut reinviter ou modifier un administrateur."),
            { code: "PROTECTED_ADMIN" }
          );
        }

        const now = FieldValue.serverTimestamp();
        const payload = {
          uid: targetUid,
          tenantId: auth.tenantId,
          email,
          name: finalName,
          role,
          status: "active",
          invitedByUid: auth.uid,
          invitedByEmail: auth.email ?? null,
          invitedByName: auth.name ?? null,
          invitedAt: now,
          updatedAt: now,
        };

        if (existingSnap.exists) {
          tx.update(userRef, payload);
        } else {
          tx.set(userRef, {
            ...payload,
            createdAt: now,
          });
        }

        const auditRef = adminDb
          .collection("tenants")
          .doc(auth.tenantId)
          .collection("auditLogs")
          .doc();

        tx.set(auditRef, {
          type: "tenantUser.invite",
          tenantId: auth.tenantId,
          targetUid,
          email,
          name: finalName,
          role,
          createdAuthUser,
          actor: {
            uid: auth.uid,
            role: auth.role,
            email: auth.email,
            name: auth.name,
          },
          createdAt: now,
        });
      });
    } catch (error) {
      if (createdAuthUser) {
        try {
          await adminAuth.deleteUser(targetUid);
        } catch (cleanupError) {
          console.warn("[users.POST] orphan auth cleanup skipped", cleanupError);
        }
      }

      throw error;
    }

    let resetLink: string | null = null;
    let resetLinkError: string | null = null;

    try {
      resetLink = await adminAuth.generatePasswordResetLink(email, {
        url: `${getAppBaseUrl()}/login`,
        handleCodeInApp: false,
      });
    } catch (error) {
      resetLinkError = error instanceof Error ? error.message : String(error);
      console.warn("[users.POST] reset link skipped", error);
    }

    try {
      await adminAuth.updateUser(targetUid, {
        displayName: finalName,
        disabled: false,
      });
    } catch (error) {
      console.warn("[users.POST] auth profile sync skipped", error);
    }

    return json(createdAuthUser ? 201 : 200, {
      ok: true,
      uid: targetUid,
      email,
      name: finalName,
      role,
      roleLabel: getRoleLabel(role),
      createdAuthUser,
      resetLink,
      resetLinkError,
      message: resetLink
        ? "Invitation préparée. Envoyez le lien d'activation à l'utilisateur."
        : "Invitation préparée. Lien d'activation indisponible pour le moment.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as { code?: string })?.code;

    if (code === "TENANT_MISMATCH" || code === "PROTECTED_ADMIN") {
      return bad(message);
    }

    if (code === "auth/email-already-exists") {
      return bad("Un compte Firebase existe deja avec cet email. Reessayez l'invitation.");
    }

    console.error("[users.POST]", error);
    return json(500, {
      ok: false,
      error: "Impossible d'inviter cet utilisateur.",
      details: message,
    });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!canManageUsers(auth.role)) {
    return forbidden("Action non autorisée avec votre role.");
  }

  let body: UpdateBody;
  try {
    body = (await req.json()) as UpdateBody;
  } catch {
    return bad("Corps JSON invalide.");
  }

  const uid = normalizeText(body.uid);
  const role = body.role ? normalizeRole(body.role) : null;
  const status = body.status
    ? String(body.status).trim().toLowerCase()
    : null;
  const reason = normalizeText(body.reason);

  if (!uid) return bad("uid requis.");
  if (uid === auth.uid) {
    return bad("Vous ne pouvez pas modifier votre propre accès depuis cet écran.");
  }

  if (!role && !status) return bad("role ou statut requis.");
  if (role && !isManagedRole(role)) return bad("Role invalide.");
  if (status && !isManagedStatus(status)) return bad("Statut invalide.");

  const allowedRoles = editableRolesFor(auth.role);
  if (role && !allowedRoles.includes(role)) {
    return forbidden("Votre role ne permet pas d'attribuer ce niveau d'accès.");
  }

  const targetRef = adminDb.collection("tenantUsers").doc(uid);

  try {
    await adminDb.runTransaction(async (tx) => {
      const targetSnap = await tx.get(targetRef);
      if (!targetSnap.exists) {
        throw Object.assign(new Error("Utilisateur introuvable."), {
          code: "NOT_FOUND",
        });
      }

      const before = targetSnap.data() as Record<string, unknown>;
      if (String(before.tenantId ?? "") !== auth.tenantId) {
        throw Object.assign(new Error("Utilisateur hors agence."), {
          code: "TENANT_MISMATCH",
        });
      }

      const beforeRole = normalizeRole(before.role);
      const beforeStatus = String(before.status ?? "active").trim().toLowerCase();

      if (
        isAdminLike(beforeRole) &&
        auth.role !== "super_admin" &&
        auth.role !== "owner"
      ) {
        throw Object.assign(new Error("Seul le propriétaire peut modifier un administrateur."), {
          code: "PROTECTED_ADMIN",
        });
      }

      const nextRole = role ?? beforeRole;
      const nextStatus = status ?? beforeStatus;
      const removesAdminLike =
        isAdminLike(beforeRole) &&
        (!isAdminLike(nextRole) || nextStatus === "disabled");

      if (removesAdminLike) {
        const adminsSnap = await tx.get(
          adminDb
            .collection("tenantUsers")
            .where("tenantId", "==", auth.tenantId)
            .where("status", "==", "active")
        );

        const activeAdminsAfter = adminsSnap.docs.filter((doc) => {
          if (doc.id === uid) return false;
          const data = doc.data() as Record<string, unknown>;
          return isAdminLike(data.role);
        }).length;

        if (activeAdminsAfter === 0) {
          throw Object.assign(
            new Error("Impossible de retirer le dernier administrateur actif."),
            { code: "LAST_ADMIN" }
          );
        }
      }

      const patch: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (role) patch.role = role;
      if (status) patch.status = status;

      tx.update(targetRef, patch);

      const auditRef = adminDb
        .collection("tenants")
        .doc(auth.tenantId)
        .collection("auditLogs")
        .doc();

      tx.set(auditRef, {
        type: "tenantUser.access.update",
        tenantId: auth.tenantId,
        targetUid: uid,
        before: {
          role: beforeRole,
          status: beforeStatus,
          email: before.email ?? null,
          name: before.name ?? null,
        },
        after: {
          role: role ?? beforeRole,
          status: status ?? beforeStatus,
        },
        reason,
        actor: {
          uid: auth.uid,
          role: auth.role,
          email: auth.email,
          name: auth.name,
        },
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    return json(200, {
      ok: true,
      uid,
      updated: {
        ...(role ? { role } : {}),
        ...(status ? { status } : {}),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as { code?: string })?.code;

    if (
      code === "NOT_FOUND" ||
      code === "TENANT_MISMATCH" ||
      code === "PROTECTED_ADMIN" ||
      code === "LAST_ADMIN"
    ) {
      return bad(message);
    }

    console.error("[users.PATCH]", error);
    return json(500, {
      ok: false,
      error: "Impossible de modifier l'utilisateur.",
      details: message,
    });
  }
}
