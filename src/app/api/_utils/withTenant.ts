// src/app/api/_utils/withTenant.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";

export type TenantAuth =
  | { ok: true; uid: string; tenantId: string; role?: string }
  | { ok: false; res: NextResponse };

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

export function unauthorized(msg = "Unauthorized", extra?: any) {
  return json(401, { ok: false, error: msg, ...extra });
}

export async function requireTenantUser(req: NextRequest): Promise<TenantAuth> {
  const authHeader =
    req.headers.get("authorization") ||
    req.headers.get("Authorization") ||
    req.headers.get("x-auth-token") ||
    "";

  if (!authHeader) return { ok: false, res: unauthorized("Missing token") };

  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : authHeader.trim();

  if (!token) return { ok: false, res: unauthorized("Missing token") };

  try {
    const decoded = await getAuth().verifyIdToken(token);
    const uid = decoded.uid;

    const tuSnap = await adminDb.collection("tenantUsers").doc(uid).get();
    if (!tuSnap.exists) return { ok: false, res: unauthorized("No tenant user") };

    const tu = tuSnap.data() as any;

    if (!tu?.tenantId) return { ok: false, res: unauthorized("No tenant assigned") };
    if (String(tu.status ?? "active") !== "active")
      return { ok: false, res: unauthorized("User disabled") };

    return { ok: true, uid, tenantId: String(tu.tenantId), role: String(tu.role ?? "") };
  } catch (e: any) {
    return { ok: false, res: unauthorized("Invalid token", { details: e?.message }) };
  }
}

export function canWrite(role?: string) {
  const r = String(role ?? "");
  return r === "admin" || r === "manager";
}
