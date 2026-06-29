import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-auth";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

function bad(msg: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: msg, ...extra }, { status: 400 });
}

function toIso(v: unknown) {
  const t = v as { toDate?: () => Date } | null | undefined;
  return t && typeof t.toDate === "function" ? t.toDate().toISOString() : null;
}

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get("tenantId")?.trim();
  if (!tenantId) return bad("tenantId is required");

  const { error } = await requireAdmin(req, { targetTenantId: tenantId });
  if (error) return error;

  const status = req.nextUrl.searchParams.get("status")?.trim() || "active";
  const maxRaw = req.nextUrl.searchParams.get("max");
  const max = Math.min(Math.max(parseInt(maxRaw || "50", 10) || 50, 1), 200);

  try {
    // IMPORTANT: index composite requis si tu combines where + orderBy
    // Si tu n'as pas l'index, Firestore te donnera un lien direct pour le créer.
    let q = adminDb
      .collection("tenantUsers")
      .where("tenantId", "==", tenantId);

    if (status !== "all") {
      q = q.where("status", "==", status);
    }

    const snap = await q.orderBy("createdAt", "desc").limit(max).get();

    const users = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        ...data,
        createdAtIso: toIso(data.createdAt),
        updatedAtIso: toIso(data.updatedAt),
      };
    });

    return NextResponse.json({
      ok: true,
      tenantId,
      status,
      count: users.length,
      users,
    });
  } catch (e: unknown) {
    console.error("[list-tenant-users] error", e);
    return NextResponse.json(
      { ok: false, error: "Internal error", details: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
