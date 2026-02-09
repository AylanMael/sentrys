import { NextRequest, NextResponse } from "next/server";
import { requireAdminKey } from "@/lib/api/admin-auth";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

function bad(msg: string, extra?: any) {
  return NextResponse.json({ ok: false, error: msg, ...extra }, { status: 400 });
}

function toIso(x: any) {
  return x && typeof x.toDate === "function" ? x.toDate().toISOString() : null;
}

export async function GET(req: NextRequest) {
  const denied = requireAdminKey(req);
  if (denied) return denied;

  const maxRaw = req.nextUrl.searchParams.get("max");
  const max = Math.min(Math.max(Number(maxRaw ?? 50) || 50, 1), 200);

  try {
    const snap = await adminDb.collection("tenants").limit(max).get();

    const tenants = snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        ...data,
        createdAtIso: toIso(data?.createdAt),
        updatedAtIso: toIso(data?.updatedAt),
      };
    });

    return NextResponse.json({
      ok: true,
      count: tenants.length,
      tenants,
    });
  } catch (e: any) {
    console.error("[list-tenants] error", e);
    return NextResponse.json(
      { ok: false, error: "Internal error", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}