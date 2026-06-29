import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { IncidentCreateSchema, SiteCreateSchema, PatrolSessionSchema } from "@/lib/api/schemas";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    // Identifer le tenant
    const tenantUserDoc = await adminDb.collection("tenantUsers").doc(uid).get();
    if (!tenantUserDoc.exists) {
      return NextResponse.json({ ok: false, error: "No tenant linked" }, { status: 403 });
    }

    const tenantId = tenantUserDoc.data()?.tenantId;
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "No tenantId" }, { status: 403 });
    }

    // Récupérer les stats en parallèle
    const [sitesSnap, activePatrolsSnap, incidentsSnap] = await Promise.all([
      adminDb.collection("sites").where("tenantId", "==", tenantId).get(),
      adminDb.collection("patrolSessions")
        .where("tenantId", "==", tenantId)
        .where("status", "==", "active")
        .get(),
      adminDb.collection("incidents")
        .where("tenantId", "==", tenantId)
        .orderBy("createdAt", "desc")
        .limit(10)
        .get()
    ]);

    const sites = sitesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const activePatrols = activePatrolsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const incidents = incidentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json({
      ok: true,
      stats: {
        totalSites: sites.length,
        activePatrols: activePatrols.length,
        recentIncidentsCount: incidents.length,
      },
      sites,
      activePatrols,
      incidents
    });
  } catch (error: any) {
    console.error("Command Stats Error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
