import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

import {
  requireTenantUser,
  canReadBackoffice,
} from "@/app/api/_utils/withTenant";

export const runtime = "nodejs";

type AssignmentStatus =
  | "assigned"
  | "cancelled"
  | "present"
  | "absent"
  | "replaced"
  | "completed"
  | "late";

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function bad(msg: string, extra?: Record<string, unknown>) {
  return json(400, { ok: false, error: msg, ...extra });
}

function forbidden(msg = "Forbidden", extra?: Record<string, unknown>) {
  return json(403, { ok: false, error: msg, ...extra });
}

function serverError(error: unknown, tag: string) {
  console.error(`[${tag}]`, error);
  return json(500, {
    ok: false,
    error: "Internal error",
    details: error instanceof Error ? error.message : String(error),
  });
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function safeIdsParam(value: string | null): string[] {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => normalizeText(item))
        .filter(Boolean)
    )
  ).slice(0, 200);
}

function toIso(value: unknown) {
  const ts = value as { toDate?: () => Date } | null | undefined;
  return typeof ts?.toDate === "function" ? ts.toDate().toISOString() : null;
}

function pickAssignment(data: Record<string, unknown>, id: string) {
  return {
    id,
    tenantId: data.tenantId as string,
    vacationId: (data.vacationId as string | undefined) ?? null,
    siteId: (data.siteId as string | undefined) ?? null,
    agentId: (data.agentId as string | undefined) ?? null,
    status: ((data.status as string | undefined) ?? "assigned") as AssignmentStatus,
    checkedInAtIso: toIso(data.checkedInAt),
    updatedAtIso: toIso(data.updatedAt),
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!canReadBackoffice(auth.role)) {
    return forbidden("Insufficient rights");
  }

  const url = new URL(req.url);
  const vacationIds = safeIdsParam(url.searchParams.get("vacationIds"));

  if (vacationIds.length === 0) {
    return bad("vacationIds is required");
  }

  try {
    const assignments: ReturnType<typeof pickAssignment>[] = [];

    for (let index = 0; index < vacationIds.length; index += 10) {
      const chunk = vacationIds.slice(index, index + 10);
      const snap = await adminDb
        .collection("assignments")
        .where("tenantId", "==", auth.tenantId)
        .where("vacationId", "in", chunk)
        .get();

      snap.forEach((doc) => {
        assignments.push(
          pickAssignment(doc.data() as Record<string, unknown>, doc.id)
        );
      });
    }

    return json(200, {
      ok: true,
      tenantId: auth.tenantId,
      count: assignments.length,
      assignments,
    });
  } catch (error: unknown) {
    return serverError(error, "assignments.GET");
  }
}
