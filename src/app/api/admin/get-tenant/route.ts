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
  const tenantId = req.nextUrl.searchParams.get("tenantId")?.trim();
  if (!tenantId) return bad("tenantId is required");

  const { error } = await requireAdmin(req, { targetTenantId: tenantId });
  if (error) return error;

  try {
    const snap = await adminDb.collection("tenants").doc(tenantId).get();

    if (!snap.exists) {
      return NextResponse.json({ ok: true, exists: false, tenantId });
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
      tenantId,
      tenant: {
        id: snap.id,
        ...data,
        createdAtIso,
        updatedAtIso,
      },
    });
  } catch (e: unknown) {
    console.error("[get-tenant] error", e);
    const details = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: "Internal error", details },
      { status: 500 }
    );
  }
}
