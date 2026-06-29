import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireTenantUser } from "@/app/api/_utils/withTenant";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  try {
    console.log("🌱 Internal Seeding for tenant:", auth.tenantId);

    // 1. Create Site
    const siteId = "demo-site-paris";
    await adminDb.collection("sites").doc(siteId).set({
      name: "Grand Palais (Démo Officielle)",
      address: "3 Avenue du Général Eisenhower, 75008 Paris",
      latitude: 48.8661,
      longitude: 2.3125,
      tenantId: auth.tenantId,
      siteType: "monument",
      riskLevel: 4,
      createdAt: FieldValue.serverTimestamp(),
    });

    // 2. Create Patrol Template
    const templateId = "demo-patrol-paris";
    await adminDb.collection("patrolTemplates").doc(templateId).set({
      name: "Ronde de Nuit - Secteur Verrière",
      description: "Inspection des issues de secours et de la verrière principale.",
      siteId: siteId,
      tenantId: auth.tenantId,
      isActive: true,
      estimatedDuration: 45,
      checkpoints: [
        {
          id: "cp1",
          name: "Entrée Nord (Square Jean Perrin)",
          latitude: 48.8668,
          longitude: 2.3128,
          order: 1
        },
        {
          id: "cp2",
          name: "Sortie de secours - Rotonde",
          latitude: 48.8655,
          longitude: 2.3115,
          order: 2
        },
        {
          id: "cp3",
          name: "Poste de Sécurité - Nave",
          latitude: 48.8661,
          longitude: 2.3125,
          order: 3
        }
      ],
      createdAt: FieldValue.serverTimestamp(),
      createdBy: auth.uid
    });

    return NextResponse.json({ ok: true, message: "Seed successful", siteId, templateId });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
