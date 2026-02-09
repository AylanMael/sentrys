import { NextRequest, NextResponse } from "next/server";
import { requireAdminKey } from "@/lib/api/admin-auth";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

function bad(msg: string, extra?: any) {
  return NextResponse.json({ ok: false, error: msg, ...extra }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const denied = requireAdminKey(req);
  if (denied) return denied;

  const uid = req.nextUrl.searchParams.get("uid")?.trim();
  if (!uid) return bad("uid is required");

  try {
    const snap = await adminDb.collection("tenantUsers").doc(uid).get();

    if (!snap.exists) {
      return NextResponse.json({ ok: true, exists: false, uid });
    }

    const data = snap.data() as any;

    const createdAtIso =
      data?.createdAt && typeof data.createdAt.toDate === "function"
        ? data.createdAt.toDate().toISOString()
        : null;

    const updatedAtIso =
      data?.updatedAt && typeof data.updatedAt.toDate === "function"
        ? data.updatedAt.toDate().toISOString()
        : null;

    return NextResponse.json({
      ok: true,
      exists: true,
      uid,
      tenantUser: { id: snap.id, ...data, createdAtIso, updatedAtIso },
    });
  } catch (e: any) {
    console.error("[get-tenant-user] error", e);
    return NextResponse.json(
      { ok: false, error: "Internal error", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}