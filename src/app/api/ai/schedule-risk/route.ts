import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireTenantUser } from "@/app/api/_utils/withTenant";
import { scheduleAnalysisFlow } from "@/ai/flows/schedule-analysis";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  try {
    // 1. Fetch data for analysis
    const [assignmentsSnap, agentsSnap, sitesSnap] = await Promise.all([
      adminDb.collection("assignments")
        .where("tenantId", "==", auth.tenantId)
        .where("status", "==", "assigned") // focus on scheduled
        .limit(100)
        .get(),
      adminDb.collection("agents")
        .where("tenantId", "==", auth.tenantId)
        .get(),
      adminDb.collection("sites")
        .where("tenantId", "==", auth.tenantId)
        .get(),
    ]);

    const assignments = assignmentsSnap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        startTime: d.data().startTime?.toDate?.()?.toISOString() ?? d.data().startTime,
        endTime: d.data().endTime?.toDate?.()?.toISOString() ?? d.data().endTime,
    }));
    const agents = agentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const sites = sitesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // 2. Run Genkit Flow
    const result = await scheduleAnalysisFlow({
      assignments,
      agents,
      sites
    });

    return NextResponse.json({
      ok: true,
      analysis: result
    });

  } catch (e: any) {
    console.error("[api/ai/schedule-risk] failed", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
