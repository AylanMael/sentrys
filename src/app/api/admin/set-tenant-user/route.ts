import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-auth";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

type Role = "owner" | "admin" | "manager" | "agent" | "client" | "viewer";
type Status = "active" | "disabled";

type Body = {
  uid: string;
  tenantId: string;
  role?: Role;
  status?: Status;
  reason?: string;
};

function bad(msg: string, extra?: any) {
  return NextResponse.json({ ok: false, error: msg, ...extra }, { status: 400 });
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return bad("Invalid JSON body");
  }

  const uid = (body.uid ?? "").trim();
  const tenantId = (body.tenantId ?? "").trim();
  const role = body.role;
  const status = body.status;
  const reason = (body.reason ?? "").trim() || undefined;

  if (!uid) return bad("uid is required");
  if (!tenantId) return bad("tenantId is required");
  if (!role && !status) return bad("role or status is required");

  const { error, decodedToken } = await requireAdmin(req, { targetTenantId: tenantId });
  if (error) return error;

  const allowedRoles = new Set<Role>([
    "owner",
    "admin",
    "manager",
    "agent",
    "client",
    "viewer",
  ]);
  const allowedStatus = new Set<Status>(["active", "disabled"]);
  if (role && !allowedRoles.has(role)) return bad("Invalid role");
  if (status && !allowedStatus.has(status)) return bad("Invalid status");

  const actor = {
    type: "admin-token",
    adminUid: decodedToken?.uid ?? "unknown",
    ip:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      null,
    userAgent: req.headers.get("user-agent") || null,
  };

  try {
    const userRef = adminDb.collection("tenantUsers").doc(uid);

    await adminDb.runTransaction(async (tx) => {
      // ✅ READS d'abord
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) {
        // pas d’écriture si inexistant
        throw Object.assign(new Error("tenantUser_not_found"), { code: "NOT_FOUND" });
      }

      const before = userSnap.data() as any;
      if ((before?.tenantId ?? null) !== tenantId) {
        throw Object.assign(new Error("tenantId_mismatch"), {
          code: "TENANT_MISMATCH",
          foundTenantId: before?.tenantId ?? null,
        });
      }

      // 🔒 Protection: ne pas désactiver / retirer admin s’il ne reste plus d’admin actif
      const willDisable = status === "disabled";
      const willRemoveAdmin = role && before?.role === "admin" && role !== "admin";

      if (willDisable || willRemoveAdmin) {
        const adminsQ = adminDb
          .collection("tenantUsers")
          .where("tenantId", "==", tenantId)
          .where("role", "==", "admin")
          .where("status", "==", "active");

        const adminsSnap = await tx.get(adminsQ);

        // Compte des admins actifs, en tenant compte du changement sur l’utilisateur ciblé
        let activeAdmins = adminsSnap.size;

        // Si l'utilisateur ciblé est un admin actif, et qu'on le désactive/retire admin => -1
        const targetIsActiveAdmin = before?.role === "admin" && before?.status === "active";
        if (targetIsActiveAdmin && (willDisable || willRemoveAdmin)) {
          activeAdmins = Math.max(0, activeAdmins - 1);
        }

        if (activeAdmins === 0) {
          throw Object.assign(new Error("cannot_remove_last_active_admin"), {
            code: "LAST_ADMIN",
          });
        }
      }

      // ✅ WRITES ensuite
      const patch: Record<string, any> = {
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (role) patch.role = role;
      if (status) patch.status = status;

      tx.update(userRef, patch);

      // Audit log (subcollection sur le tenant)
      const auditRef = adminDb
        .collection("tenants")
        .doc(tenantId)
        .collection("auditLogs")
        .doc();

      tx.set(auditRef, {
        type: "tenantUser.update",
        tenantId,
        targetUid: uid,
        before: {
          role: before?.role ?? null,
          status: before?.status ?? null,
          email: before?.email ?? null,
          name: before?.name ?? null,
        },
        after: {
          role: role ?? before?.role ?? null,
          status: status ?? before?.status ?? null,
        },
        reason: reason ?? null,
        actor,
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({
      ok: true,
      uid,
      tenantId,
      updated: { ...(role ? { role } : {}), ...(status ? { status } : {}) },
    });
  } catch (e: any) {
    if (e?.code === "NOT_FOUND") return NextResponse.json({ ok: true, exists: false, uid, tenantId });
    if (e?.code === "TENANT_MISMATCH") return bad("tenantId mismatch for this uid", { foundTenantId: e?.foundTenantId });
    if (e?.code === "LAST_ADMIN") return bad("Operation blocked: cannot remove/disable the last active admin of this tenant");

    console.error("[set-tenant-user] error", e);
    return NextResponse.json(
      { ok: false, error: "Internal error", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
