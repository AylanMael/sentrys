import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireTenantUser } from "@/app/api/_utils/withTenant";
import { subDays, startOfDay, format, eachDayOfInterval } from "date-fns";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") || "7");
  const endDate = new Date();
  const startDate = subDays(startOfDay(endDate), days - 1);

  try {
    // 1. Fetch Incidents for the period
    const incidentsSnap = await adminDb
      .collection("incidents")
      .where("tenantId", "==", auth.tenantId)
      .where("createdAt", ">=", startDate)
      .get();

    // 2. Fetch Assignments for the period
    const assignmentsSnap = await adminDb
      .collection("assignments")
      .where("tenantId", "==", auth.tenantId)
      .where("createdAt", ">=", startDate)
      .get();

    // 3. Initialize trend data
    const interval = eachDayOfInterval({ start: startDate, end: endDate });
    const trendMap: Record<string, { date: string, incidents: number, checkins: number }> = {};

    interval.forEach(day => {
      const key = format(day, "yyyy-MM-dd");
      trendMap[key] = { date: key, incidents: 0, checkins: 0 };
    });

    // 4. Aggregate Incidents
    incidentsSnap.docs.forEach(doc => {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate();
      if (createdAt) {
        const key = format(createdAt, "yyyy-MM-dd");
        if (trendMap[key]) trendMap[key].incidents++;
      }
    });

    // 5. Aggregate Check-ins
    assignmentsSnap.docs.forEach(doc => {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate();
      if (createdAt && data.status === "present") {
        const key = format(createdAt, "yyyy-MM-dd");
        if (trendMap[key]) trendMap[key].checkins++;
      }
    });

    const trends = Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      ok: true,
      trends,
      summary: {
        totalIncidents: incidentsSnap.size,
        totalCheckins: trends.reduce((acc, curr) => acc + curr.checkins, 0),
      }
    });

  } catch (e: any) {
    console.error("[api/analytics/trends] failed", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
