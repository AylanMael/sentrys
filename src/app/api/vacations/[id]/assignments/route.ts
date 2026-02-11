// src/app/api/vacations/[id]/assignments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

import { requireTenantUser } from "@/app/api/_utils/withTenant";

export const runtime = "nodejs";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}
function bad(msg: string) {
  return json(400, { ok: false, error: msg });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
