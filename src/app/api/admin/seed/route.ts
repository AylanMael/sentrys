import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-auth";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

function bad(msg: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: msg, ...extra }, { status: 400 });
}

export async function POST(req: NextRequest) {
  let body: { tenantId?: string } = {};
  try {
    body = (await req.json()) as { tenantId?: string };
  } catch {}

  const tenantId = (body.tenantId ?? req.nextUrl.searchParams.get("tenantId") ?? "").trim();
  if (!tenantId) return bad("tenantId is required");

  const { error } = await requireAdmin(req, { targetTenantId: tenantId });
  if (error) return error;

  try {
    const now = FieldValue.serverTimestamp();

    const batch = adminDb.batch();

    // --- SITES ---
    const site1 = adminDb.collection("sites").doc(`${tenantId}_site_1`);
    const site2 = adminDb.collection("sites").doc(`${tenantId}_site_2`);

    batch.set(site1, {
      tenantId,
      name: "Site Concorde",
      city: "Paris",
      address: "Place de la Concorde",
      status: "active",
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    batch.set(site2, {
      tenantId,
      name: "Site La Défense",
      city: "Puteaux",
      address: "Parvis de La Défense",
      status: "active",
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    // --- AGENTS ---
    const agent1 = adminDb.collection("agents").doc(`${tenantId}_agent_1`);
    const agent2 = adminDb.collection("agents").doc(`${tenantId}_agent_2`);

    batch.set(agent1, {
      tenantId,
      firstName: "Karim",
      lastName: "B.",
      status: "active",
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    batch.set(agent2, {
      tenantId,
      firstName: "Nadia",
      lastName: "S.",
      status: "active",
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    // --- INCIDENTS ---
    const inc1 = adminDb.collection("incidents").doc(`${tenantId}_inc_1`);
    const inc2 = adminDb.collection("incidents").doc(`${tenantId}_inc_2`);
    const inc3 = adminDb.collection("incidents").doc(`${tenantId}_inc_3`);

    batch.set(inc1, {
      tenantId,
      title: "Accès non autorisé",
      status: "open",
      severity: "high",
      siteId: site1.id,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    batch.set(inc2, {
      tenantId,
      title: "Alarme intrusion déclenchée",
      status: "open",
      severity: "medium",
      siteId: site2.id,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    batch.set(inc3, {
      tenantId,
      title: "Ronde effectuée (RAS)",
      status: "closed",
      severity: "low",
      siteId: site1.id,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    await batch.commit();

    return NextResponse.json({
      ok: true,
      tenantId,
      created: {
        sites: [site1.id, site2.id],
        agents: [agent1.id, agent2.id],
        incidents: [inc1.id, inc2.id, inc3.id],
      },
      note: "Seed OK (docs upsert via merge:true)",
    });
  } catch (e: unknown) {
    console.error("[seed] error", e);
    return NextResponse.json(
      { ok: false, error: "Internal error", details: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
