// src/app/api/vacations/_check-overlaps/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

import { requireTenantUser } from "@/app/api/_utils/withTenant";

export const runtime = "nodejs";

/* ================= helpers ================= */

function json(status: number, body: any) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function bad(msg: string, extra?: any) {
  return json(400, { ok: false, error: msg, ...extra });
}

function serverError(e: any, tag: string, extra?: any) {
  console.error(`[${tag}]`, e, extra ?? "");
  return json(500, {
    ok: false,
    error: "Internal error",
    details: e?.message ?? String(e),
  });
}

function normalizeText(v: any) {
  return String(v ?? "").trim();
}

function safeArr(v: unknown): string[] {
  return Array.isArray(v)
    ? (v.filter((x) => typeof x === "string") as string[])
    : [];
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.map((x) => String(x)).filter(Boolean)));
}

function parseDateTimeIso(v: any): Date | null {
  const s = normalizeText(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function toIso(ts: any) {
  return ts && typeof ts.toDate === "function"
    ? ts.toDate().toISOString()
    : null;
}

function tsToDate(ts: any): Date | null {
  const d = ts?.toDate?.();
  return d && typeof d.getTime === "function" && Number.isFinite(d.getTime())
    ? d
    : null;
}

function chunk<T>(arr: T[], size = 10): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type VacationStatusAll =
  | "planned"
  | "partially_filled"
  | "filled"
  | "closed"
  | "cancelled";

function asVacationStatus(v: any): VacationStatusAll {
  const s = String(v ?? "").toLowerCase().trim();
  if (
    s === "planned" ||
    s === "partially_filled" ||
    s === "filled" ||
    s === "closed" ||
    s === "cancelled"
  ) {
    return s;
  }
  return "planned";
}

/**
 * Reprend la logique de /api/vacations/[id]/check-overlaps
 * mais SANS vacationId (création) => pas d'exclusion "self".
 */
async function detectOverlapsForAgents(input: {
  tenantId: string;
  agentIds: string[];
  startAt: Date;
  endAt: Date;
}) {
  const { tenantId, startAt, endAt } = input;
  const agentIds = uniq(input.agentIds).slice(0, 200);
  if (!agentIds.length) return [];

  const byAgent = new Map<string, Set<string>>();
  agentIds.forEach((a) => byAgent.set(a, new Set()));

  const snaps = await Promise.all(
    agentIds.map((agentId) =>
      adminDb
        .collection("assignments")
        .where("tenantId", "==", tenantId)
        .where("agentId", "==", agentId)
        .get()
    )
  );

  snaps.forEach((snap, idx) => {
    const agentId = agentIds[idx];
    const set = byAgent.get(agentId)!;

    snap.docs.forEach((d) => {
      const a = d.data() as any;
      const vid = String(a?.vacationId ?? "").trim();
      if (!vid) return;

      const st = String(a?.status ?? "assigned").toLowerCase();
      if (st === "cancelled") return;

      set.add(vid);
    });
  });

  const allVacationIds = uniq(
    Array.from(byAgent.values()).flatMap((s) => Array.from(s))
  );
  if (!allVacationIds.length) return [];

  const vacData = new Map<string, any>();
  for (const part of chunk(allVacationIds, 200)) {
    const refs = part.map((id) => adminDb.collection("vacations").doc(id));
    const vs = await adminDb.getAll(...refs);
    vs.forEach((s, i) => {
      if (s.exists) vacData.set(part[i], s.data());
    });
  }

  const overlaps: Array<{
    agentId: string;
    withVacationId: string;
    withSiteId?: string | null;
    withSiteName?: string | null;
    withStatus?: string;
    withStartAtIso?: string | null;
    withEndAtIso?: string | null;
  }> = [];

  const startMs = startAt.getTime();
  const endMs = endAt.getTime();

  for (const agentId of agentIds) {
    const vids = Array.from(byAgent.get(agentId) ?? []);
    for (const vid of vids) {
      const v = vacData.get(vid);
      if (!v) continue;

      if (String(v?.tenantId ?? "") !== tenantId) continue;

      const st = String(asVacationStatus(v?.status));
      if (st === "cancelled") continue;

      const s = tsToDate(v?.startAt);
      const e = tsToDate(v?.endAt);
      if (!s || !e) continue;

      if (s.getTime() < endMs && e.getTime() > startMs) {
        overlaps.push({
          agentId,
          withVacationId: vid,
          withSiteId: v?.siteId ?? null,
          withSiteName: v?.siteName ?? v?.title ?? null,
          withStatus: st,
          withStartAtIso: toIso(v?.startAt),
          withEndAtIso: toIso(v?.endAt),
        });
      }
    }
  }

  return overlaps;
}

/* ================= POST ================= */

export async function POST(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body");
  }

  try {
    const agentIds = uniq(safeArr(body?.agentIds)).slice(0, 200);
    const startAt = parseDateTimeIso(body?.startAt);
    const endAt = parseDateTimeIso(body?.endAt);

    if (!agentIds.length) return bad("agentIds is required");
    if (!startAt || !endAt) return bad("Missing startAt/endAt");
    if (endAt.getTime() <= startAt.getTime()) {
      return bad("endAt must be > startAt");
    }

    const overlaps = await detectOverlapsForAgents({
      tenantId: auth.tenantId,
      agentIds,
      startAt,
      endAt,
    });

    return json(200, {
      ok: true,
      tenantId: auth.tenantId,
      input: {
        agentIds,
        startAtIso: startAt.toISOString(),
        endAtIso: endAt.toISOString(),
      },
      hasOverlaps: overlaps.length > 0,
      count: overlaps.length,
      overlaps,
    });
  } catch (e: any) {
    return serverError(e, "vacations._check-overlaps.POST", {
      tenantId: auth.tenantId,
    });
  }
}

/* ================= GET ================= */

export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  try {
    const url = new URL(req.url);

    const agentIdsParam = normalizeText(url.searchParams.get("agentIds"));
    const agentIds = agentIdsParam
      ? uniq(
          agentIdsParam
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)
        ).slice(0, 200)
      : [];

    const startAtParam = normalizeText(url.searchParams.get("startAt"));
    const endAtParam = normalizeText(url.searchParams.get("endAt"));

    const startAt = startAtParam ? parseDateTimeIso(startAtParam) : null;
    const endAt = endAtParam ? parseDateTimeIso(endAtParam) : null;

    if (!agentIds.length) return bad("agentIds is required");
    if (!startAt || !endAt) return bad("Missing startAt/endAt");
    if (endAt.getTime() <= startAt.getTime()) {
      return bad("endAt must be > startAt");
    }

    const overlaps = await detectOverlapsForAgents({
      tenantId: auth.tenantId,
      agentIds,
      startAt,
      endAt,
    });

    return json(200, {
      ok: true,
      tenantId: auth.tenantId,
      input: {
        agentIds,
        startAtIso: startAt.toISOString(),
        endAtIso: endAt.toISOString(),
      },
      hasOverlaps: overlaps.length > 0,
      count: overlaps.length,
      overlaps,
    });
  } catch (e: any) {
    return serverError(e, "vacations._check-overlaps.GET", {
      tenantId: auth.tenantId,
    });
  }
}
