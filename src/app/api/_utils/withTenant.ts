import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";
import {
  normalizeRole,
  type AppRole,
  isAdminRole,
  isAgentRole,
  isClientRole,
  isViewerRole,
  canReadBackoffice as canReadBackofficeRole,
  canManagePlanning,
  canViewBilling,
  canManageUsers,
} from "@/lib/auth/role";

export type TenantRole = AppRole | "unknown";

export type TenantAuth =
  | {
      ok: true;
      uid: string;
      tenantId: string;
      role: TenantRole;
      email: string | null;
      name: string | null;
    }
  | { ok: false; res: NextResponse };

/* ================= helpers ================= */

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export function unauthorized(msg = "Unauthorized", extra?: Record<string, unknown>) {
  return json(401, { ok: false, error: msg, ...extra });
}

export function forbidden(msg = "Forbidden", extra?: Record<string, unknown>) {
  return json(403, { ok: false, error: msg, ...extra });
}

function normalizeText(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function normalizeEmail(v: unknown): string | null {
  const s = normalizeText(v);
  if (!s) return null;
  return s.toLowerCase();
}

function readAuthHeader(req: NextRequest): string | null {
  const authHeader =
    req.headers.get("authorization") ||
    req.headers.get("Authorization") ||
    req.headers.get("x-auth-token") ||
    "";

  const raw = String(authHeader ?? "").trim();
  if (!raw) return null;

  const token = raw.toLowerCase().startsWith("bearer ")
    ? raw.slice(7).trim()
    : raw.trim();

  if (!token) return null;
  if (token === "null" || token === "undefined") return null;

  return token;
}

/* ================= role helpers exposés ================= */

export function isSuperAdmin(role?: string | null) {
  return normalizeRole(role) === "super_admin";
}

export function isOwner(role?: string | null) {
  return normalizeRole(role) === "owner";
}

export function isAdmin(role?: string | null) {
  return normalizeRole(role) === "admin";
}

export function isManager(role?: string | null) {
  return normalizeRole(role) === "manager";
}

export function isViewer(role?: string | null) {
  return isViewerRole(role);
}

export function isAgent(role?: string | null) {
  return isAgentRole(role);
}

export function isClient(role?: string | null) {
  return isClientRole(role);
}

export function isAdminLike(role?: string | null) {
  const r = normalizeRole(role);
  return r === "super_admin" || r === "owner" || r === "admin";
}

export function canReadBackoffice(role?: string | null) {
  return canReadBackofficeRole(role);
}

export function canWrite(role?: string | null) {
  return canManagePlanning(role);
}

export function canManageBillingRole(role?: string | null) {
  return canViewBilling(role);
}

export function canManageUsersRole(role?: string | null) {
  return canManageUsers(role);
}

/* ================= main ================= */

export async function requireTenantUser(req: NextRequest): Promise<TenantAuth> {
  const token = readAuthHeader(req);
  if (!token) return { ok: false, res: unauthorized("Missing token") };

  try {
    const decoded = await getAuth().verifyIdToken(token);
    const uid = decoded.uid;

    let email: string | null =
      normalizeEmail(decoded.email) ??
      normalizeEmail(
        (decoded as unknown as { firebase?: { identities?: { email?: string[] } } }).firebase?.identities?.email?.[0]
      ) ??
      null;

    let name: string | null =
      normalizeText((decoded as Record<string, unknown>).name) ??
      normalizeText(
        (decoded as unknown as { firebase?: { identities?: { name?: string[] } } }).firebase?.identities?.name?.[0]
      ) ??
      null;

    const tuSnap = await adminDb.collection("tenantUsers").doc(uid).get();
    if (!tuSnap.exists) {
      return { ok: false, res: unauthorized("No tenant user") };
    }

    const tu = tuSnap.data() as Record<string, unknown> | undefined;

    const tenantId = normalizeText(tu?.tenantId);
    if (!tenantId) {
      return { ok: false, res: unauthorized("No tenant assigned") };
    }

    const status = String(tu?.status ?? "active").trim().toLowerCase();
    if (status !== "active") {
      return { ok: false, res: unauthorized("User disabled", { status }) };
    }

    const normalized = normalizeRole(tu?.role);
    const role: TenantRole = normalized ?? "unknown";

    if (role === "unknown") {
      return { ok: false, res: forbidden("Unknown role") };
    }

    const emailFromTu = normalizeEmail(tu?.email);
    if (emailFromTu) email = emailFromTu;

    const nameFromTu = normalizeText(tu?.name);
    if (nameFromTu) name = nameFromTu;

    return {
      ok: true,
      uid,
      tenantId,
      role,
      email,
      name,
    };
  } catch (e: unknown) {
    return {
      ok: false,
      res: unauthorized("Invalid token", { details: e instanceof Error ? e.message : String(e) }),
    };
  }
}
