import { NextRequest, NextResponse } from "next/server";

import {
  canReadBackoffice,
  requireTenantUser,
} from "@/app/api/_utils/withTenant";
import {
  normalizeText,
  parseDateTimeIso,
  safeArr,
  toIso,
} from "@/app/api/vacations/_shared";
import { adminDb } from "@/lib/firebase/admin";
import {
  computePrepayReport,
  type PrepayVacationInput,
} from "@/lib/payroll/prepay";
import { normalizePrepaySettings } from "@/lib/payroll/settings";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function bad(message: string) {
  return json(400, { ok: false, error: message });
}

function defaultMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { from, to };
}

function agentName(agent: Record<string, unknown> | undefined, fallback: string) {
  if (!agent) return fallback;
  const firstName = normalizeText(agent.firstName);
  const lastName = normalizeText(agent.lastName);
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  return fullName || normalizeText(agent.email) || fallback;
}

function monthlyContractHours(agent: Record<string, unknown> | undefined) {
  const value = Number(agent?.monthlyContractHours);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function payrollId(agent: Record<string, unknown> | undefined, fallback: string) {
  if (!agent) return fallback;
  return (
    normalizeText(agent.employeeNumber) ||
    normalizeText(agent.payrollId) ||
    normalizeText(agent.matricule) ||
    fallback
  );
}

export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;
  if (!canReadBackoffice(auth.role)) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  const url = new URL(req.url);
  const defaults = defaultMonthRange();
  const fromParam = normalizeText(url.searchParams.get("from"));
  const toParam = normalizeText(url.searchParams.get("to"));
  const from = fromParam ? parseDateTimeIso(fromParam) : defaults.from;
  const to = toParam ? parseDateTimeIso(toParam) : defaults.to;

  if (!from) return bad("from must be an ISO date");
  if (!to) return bad("to must be an ISO date");
  if (to.getTime() <= from.getTime()) return bad("to must be after from");

  const vacationsSnap = await adminDb
    .collection("vacations")
    .where("tenantId", "==", auth.tenantId)
    .limit(5000)
    .get();
  const tenantSnap = await adminDb.collection("tenants").doc(auth.tenantId).get();
  const tenant = tenantSnap.exists
    ? (tenantSnap.data() as Record<string, unknown>)
    : {};
  const settings = normalizePrepaySettings(tenant.prepaySettings);

  const scopedVacationDocs = vacationsSnap.docs.filter((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const startAtIso = toIso(data.startAt);
    const endAtIso = toIso(data.endAt);
    if (!startAtIso || !endAtIso) return true;

    const startMs = new Date(startAtIso).getTime();
    const endMs = new Date(endAtIso).getTime();
    return startMs < to.getTime() && endMs > from.getTime();
  });

  const agentIds = Array.from(
    new Set(
      scopedVacationDocs.flatMap((doc) =>
        safeArr((doc.data() as Record<string, unknown>).assignedAgentIds).slice(0, 1)
      )
    )
  );
  const agentMap = new Map<string, Record<string, unknown>>();

  for (let index = 0; index < agentIds.length; index += 200) {
    const part = agentIds.slice(index, index + 200);
    const refs = part.map((agentId) => adminDb.collection("agents").doc(agentId));
    const snaps = await adminDb.getAll(...refs);
    snaps.forEach((snap, snapIndex) => {
      if (!snap.exists) return;
      const data = snap.data() as Record<string, unknown>;
      if (data.tenantId !== auth.tenantId) return;
      agentMap.set(part[snapIndex], data);
    });
  }

  const vacations: PrepayVacationInput[] = scopedVacationDocs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const agentId = safeArr(data.assignedAgentIds)[0] ?? null;
    const agent = agentId ? agentMap.get(agentId) : undefined;

    return {
      id: doc.id,
      agentId,
      agentName: agentId ? agentName(agent, agentId) : "Affectation manquante",
      payrollId: agentId ? payrollId(agent, agentId) : null,
      siteName: normalizeText(data.siteName) || normalizeText(data.title),
      title: normalizeText(data.title),
      notes: normalizeText(data.notes),
      startAtIso: toIso(data.startAt),
      endAtIso: toIso(data.endAt),
      status: normalizeText(data.status),
      isPublished: data.isPublished === true,
      monthlyContractHours: monthlyContractHours(agent),
    };
  });

  const report = computePrepayReport({ from, to, vacations, settings });

  return json(200, {
    ok: true,
    report,
  });
}
