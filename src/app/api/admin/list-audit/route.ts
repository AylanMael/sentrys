import { NextRequest, NextResponse } from "next/server";
import { requireAdminKey } from "@/lib/api/admin-auth";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const denied = requireAdminKey(req);
  if (denied) return denied;

  const tenantId = req.nextUrl.searchParams.get("tenantId")?.trim();
  const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 20)));

  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "tenantId is required" }, { status: 400 });
  }

  const snap = await adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("auditLogs")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  const logs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ ok: true, tenantId, count: logs.length, logs });
}