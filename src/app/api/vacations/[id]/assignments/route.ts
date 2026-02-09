import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}
function unauthorized(msg = "Unauthorized") {
  return json(401, { ok: false, error: msg });
}
function bad(msg: string) {
  return json(400, { ok: false, error: msg });
}

async function requireTenantUser(req: NextRequest) {
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (!h) return { ok: false as const, res: unauthorized("Missing token") };
  const token = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : h.trim();
  if (!token) return { ok: false as const, res: unauthorized("Missing token") };

  try {
    const decoded = await getAuth().verifyIdToken(token);
    const uid = decoded.uid;

    const tuSnap = await adminDb.collection("tenantUsers").doc(uid).get();
    if (!tuSnap.exists) return { ok: false as const, res: unauthorized("No tenant user") };

    const tu = tuSnap.data() as any;
    if (!tu?.tenantId) return { ok: false as const, res: unauthorized("No tenant assigned") };
    if (tu.status !== "active") return { ok: false as const, res: unauthorized("User disabled") };

    return { ok: true as const, uid, tenantId: tu.tenantId, role: tu.role };
  } catch {
    return { ok: false as const, res: unauthorized("Invalid token") };
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  const { id } = await params;
  const vacationId = String(id ?? "").trim();
  if (!vacationId) return bad("Missing vacation id");

  // sécurité : on vérifie que la vacation appartient au tenant
  const vac = await adminDb.collection("vacations").doc(vacationId).get();
  if (!vac.exists) return json(404, { ok: false, error: "Vacation not found" });
  const v = vac.data() as any;
  if (v?.tenantId !== auth.tenantId) return json(404, { ok: false, error: "Vacation not found" });

  const snap = await adminDb
    .collection("assignments")
    .where("tenantId", "==", auth.tenantId)
    .where("vacationId", "==", vacationId)
    .get();

  const assignments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return json(200, { ok: true, tenantId: auth.tenantId, assignments });
}
