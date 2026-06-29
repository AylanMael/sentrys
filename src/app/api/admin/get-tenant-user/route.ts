import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-auth";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;
type TimestampLike = { toDate?: () => Date };

function bad(msg: string, extra?: JsonRecord) {
  return NextResponse.json({ ok: false, error: msg, ...extra }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req, { allowedRoles: ["global_admin", "support"] });
  if (error) return error;

  const uid = req.nextUrl.searchParams.get("uid")?.trim();
  if (!uid) return bad("uid is required");

  try {
    const snap = await adminDb.collection("tenantUsers").doc(uid).get();

    if (!snap.exists) {
      return NextResponse.json({ ok: true, exists: false, uid });
    }

    const data = (snap.data() ?? {}) as JsonRecord;

    const createdAtIso =
      data.createdAt && typeof (data.createdAt as TimestampLike).toDate === "function"
        ? (data.createdAt as TimestampLike).toDate?.()?.toISOString() ?? null
        : null;

    const updatedAtIso =
      data.updatedAt && typeof (data.updatedAt as TimestampLike).toDate === "function"
        ? (data.updatedAt as TimestampLike).toDate?.()?.toISOString() ?? null
        : null;

    return NextResponse.json({
      ok: true,
      exists: true,
      uid,
      tenantUser: { id: snap.id, ...data, createdAtIso, updatedAtIso },
    });
  } catch (e: unknown) {
    console.error("[get-tenant-user] error", e);
    const details = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: "Internal error", details },
      { status: 500 }
    );
  }
}
