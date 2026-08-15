import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";

import {
  canReadBackoffice,
  requireTenantUser,
} from "@/app/api/_utils/withTenant";
import { adminDb } from "@/lib/firebase/admin";

const MAP_SITE_LIMIT = 100;
const MAP_PATROL_LIMIT = 50;
const INCIDENT_LIMIT = 20;
const INCIDENT_WINDOW_HOURS = 24;

function coordinate(value: unknown, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function timestampIso(value: unknown) {
  const candidate = value as { toDate?: () => Date } | null;
  return typeof candidate?.toDate === "function"
    ? candidate.toDate().toISOString()
    : null;
}

export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;
  if (!canReadBackoffice(auth.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const to = new Date();
  const from = new Date(to.getTime() - INCIDENT_WINDOW_HOURS * 60 * 60 * 1000);

  try {
    const sitesQuery = adminDb
      .collection("sites")
      .where("tenantId", "==", auth.tenantId);
    const activePatrolsQuery = adminDb
      .collection("patrolSessions")
      .where("tenantId", "==", auth.tenantId)
      .where("status", "==", "active");
    const incidentsQuery = adminDb
      .collection("incidents")
      .where("tenantId", "==", auth.tenantId)
      .where("createdAt", ">=", Timestamp.fromDate(from))
      .where("createdAt", "<", Timestamp.fromDate(to));

    const [
      sitesCountSnap,
      activePatrolsCountSnap,
      incidentsCountSnap,
      sitesSnap,
      activePatrolsSnap,
      incidentsSnap,
    ] = await Promise.all([
      sitesQuery.count().get(),
      activePatrolsQuery.count().get(),
      incidentsQuery.count().get(),
      sitesQuery.select(
        "name", "address", "city", "latitude", "longitude", "location"
      ).limit(MAP_SITE_LIMIT).get(),
      activePatrolsQuery.select("status").limit(MAP_PATROL_LIMIT).get(),
      incidentsQuery.select(
        "type", "description", "priority", "status", "createdAt",
        "latitude", "longitude", "reportedLat", "reportedLng", "location"
      ).orderBy("createdAt", "desc").limit(INCIDENT_LIMIT).get(),
    ]);

    const totalSites = sitesCountSnap.data().count;
    const activePatrols = activePatrolsCountSnap.data().count;
    const recentIncidents = incidentsCountSnap.data().count;

    const sites = sitesSnap.docs.flatMap((doc) => {
      const data = doc.data();
      const latitude = coordinate(data.latitude ?? data.location?.latitude, -90, 90);
      const longitude = coordinate(data.longitude ?? data.location?.longitude, -180, 180);
      if (latitude === null || longitude === null) return [];
      return [{
        id: doc.id,
        name: typeof data.name === "string" ? data.name : null,
        address: typeof data.address === "string" ? data.address : null,
        city: typeof data.city === "string" ? data.city : null,
        latitude,
        longitude,
      }];
    });
    const patrols = activePatrolsSnap.docs.map((doc) => ({
      id: doc.id,
      status: "active",
    }));
    const incidents = incidentsSnap.docs.flatMap((doc) => {
      const data = doc.data();
      const latitude = coordinate(
        data.latitude ?? data.reportedLat ?? data.location?.latitude, -90, 90
      );
      const longitude = coordinate(
        data.longitude ?? data.reportedLng ?? data.location?.longitude, -180, 180
      );
      const item = {
        id: doc.id,
        type: typeof data.type === "string" ? data.type : null,
        description: typeof data.description === "string" ? data.description : null,
        priority: typeof data.priority === "string" ? data.priority : null,
        status: typeof data.status === "string" ? data.status : null,
        createdAtIso: timestampIso(data.createdAt),
      };
      return [{
        ...item,
        ...(latitude !== null && longitude !== null ? { latitude, longitude } : {}),
      }];
    });

    return NextResponse.json({
      ok: true,
      counts: {
        totalSites,
        activePatrols,
        recentIncidents,
      },
      mapPreview: {
        items: { sites, activePatrols: patrols, incidents },
        limits: {
          sites: MAP_SITE_LIMIT,
          activePatrols: MAP_PATROL_LIMIT,
          incidents: INCIDENT_LIMIT,
        },
        hasMore: {
          sites: totalSites > sitesSnap.size,
          activePatrols: activePatrols > activePatrolsSnap.size,
          incidents: recentIncidents > incidentsSnap.size,
        },
        truncated:
          totalSites > sitesSnap.size ||
          activePatrols > activePatrolsSnap.size ||
          recentIncidents > incidentsSnap.size,
      },
      incidentPreview: {
        items: incidents,
        limit: INCIDENT_LIMIT,
        hasMore: recentIncidents > incidentsSnap.size,
      },
      window: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
    });
  } catch (error: unknown) {
    console.error("[command.stats.GET]", error);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
