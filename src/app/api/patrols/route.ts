import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireTenantUser } from "@/app/api/_utils/withTenant";
import { PatrolTemplateSchema } from "@/lib/api/schemas";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

/**
 * GET /api/patrols
 * Liste les modèles de rondes du tenant
 */
export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  try {
    const snap = await adminDb
      .collection("patrolTemplates")
      .where("tenantId", "==", auth.tenantId)
      .where("isActive", "==", true)
      .get();

    const patrols = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    return json(200, { ok: true, patrols });
  } catch (e: any) {
    return json(500, { ok: false, error: e.message });
  }
}

/**
 * POST /api/patrols
 * Crée un nouveau modèle de ronde
 */
export async function POST(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  try {
    const body = await req.json();
    const validation = PatrolTemplateSchema.safeParse(body);

    if (!validation.success) {
      return json(400, { ok: false, error: "Validation failed", details: validation.error.format() });
    }

    const data = validation.data;

    const payload = {
      ...data,
      tenantId: auth.tenantId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: auth.uid,
    };

    const ref = await adminDb.collection("patrolTemplates").add(payload);

    return json(201, { ok: true, id: ref.id });
  } catch (e: any) {
    return json(500, { ok: false, error: e.message });
  }
}
