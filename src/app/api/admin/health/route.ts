import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-auth";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  // Support administrators require access to health telemetry to ensure platform stability
  const { error } = await requireAdmin(req, { allowedRoles: ["global_admin", "support"] });
  if (error) return error;

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
