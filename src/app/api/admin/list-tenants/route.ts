import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-auth";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

function bad(msg: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: msg, ...extra }, { status: 400 });
}

function toIso(x: unknown) {
  const t = x as { toDate?: () => Date } | null | undefined;
  return t && typeof t.toDate === "function" ? t.toDate().toISOString() : null;
}

export async function GET(req: NextRequest) {
  // Support rôles must be able to list tenants to assist users with cross-tenant problems and view logs
  const { error } = await requireAdmin(req, { allowedRoles: ["global_admin", "support"] });
  if (error) return error;

  const maxRaw = req.nextUrl.searchParams.get("max");
  const max = Math.min(Math.max(Number(maxRaw ?? 50) || 50, 1), 200);

  try {
    const snap = await adminDb.collection("tenants").limit(max).get();

    const tenants = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
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
  } catch (e: unknown) {
    console.error("[list-tenants] error", e);
    return NextResponse.json(
      { ok: false, error: "Internal error", details: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
