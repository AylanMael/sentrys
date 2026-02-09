import { NextRequest, NextResponse } from "next/server";
import { requireAdminKey } from "@/lib/api/admin-auth";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

function bad(msg: string, extra?: any) {
  return NextResponse.json({ ok: false, error: msg, ...extra }, { status: 400 });
}

function toIso(v: any) {
  return v && typeof v.toDate === "function" ? v.toDate().toISOString() : null;
}

export async function GET(req: NextRequest) {
  const denied = requireAdminKey(req);
  if (denied) return denied;

  const tenantId = req.nextUrl.searchParams.get("tenantId")?.trim();
  if (!tenantId) return bad("tenantId is required");

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
      const data = d.data() as any;
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
  } catch (e: any) {
    console.error("[list-tenant-users] error", e);
    return NextResponse.json(
      { ok: false, error: "Internal error", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}