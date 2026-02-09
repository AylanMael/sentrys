import { NextRequest, NextResponse } from "next/server";
import { requireAdminKey } from "@/lib/api/admin-auth";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const denied = requireAdminKey(req);
  if (denied) return denied;

  const [tenantsSnap, usersSnap] = await Promise.all([
    adminDb.collection("tenants").limit(50).get(),
    adminDb.collection("tenantUsers").where("status", "==", "active").limit(50).get(),
  ]);

  return NextResponse.json({
    ok: true,
    env: process.env.NODE_ENV ?? "unknown",
    firestore: "connected",
    tenants: tenantsSnap.size,
    activeUsers: usersSnap.size,
    timestamp: new Date().toISOString(),
  });
}