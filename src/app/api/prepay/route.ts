import { NextRequest, NextResponse } from "next/server";

import {
  canReadBackoffice,
  requireTenantUser,
} from "@/app/api/_utils/withTenant";
import {
  loadDispatchVacationWindow,
  VacationWindowError,
} from "@/app/api/planning-dispatches/_vacation-window";
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

const MAX_PREPAY_RANGE_DAYS = 32;
const MAX_PREPAY_AGENT_REFERENCES = 5000;
const ISO_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function bad(message: string) {
  return json(400, { ok: false, error: message });
}

function agentName(agent: Record<string, unknown> | undefined, fallback: string) {
  if (!agent) return fallback;
  const firstName = normalizeText(agent.firstName);
  const lastName = normalizeText(agent.lastName);
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  return fullName || fallback;
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
  const allowedParams = new Set(["from", "to"]);
  if ([...url.searchParams.keys()].some((key) => !allowedParams.has(key))) {
    return bad("Unexpected query parameter");
  }
  if (url.searchParams.getAll("from").length !== 1 || url.searchParams.getAll("to").length !== 1) {
    return bad("from and to are required once");
  }
  const fromParam = normalizeText(url.searchParams.get("from"));
  const toParam = normalizeText(url.searchParams.get("to"));
  if (!ISO_DATE_TIME.test(fromParam)) return bad("from must be an ISO date-time");
  if (!ISO_DATE_TIME.test(toParam)) return bad("to must be an ISO date-time");
  const from = parseDateTimeIso(fromParam);
  const to = parseDateTimeIso(toParam);

  if (!from) return bad("from must be an ISO date");
  if (!to) return bad("to must be an ISO date");
  if (to.getTime() <= from.getTime()) return bad("to must be after from");
  if (to.getTime() - from.getTime() > MAX_PREPAY_RANGE_DAYS * 24 * 60 * 60 * 1000) {
    return json(422, {
      ok: false,
      error: "Periode trop large pour garantir une prepaie exhaustive.",
    });
  }

  let vacationDocs: FirebaseFirestore.QueryDocumentSnapshot[];
  try {
    vacationDocs = await loadDispatchVacationWindow({ tenantId: auth.tenantId, from, to });
  } catch (error: unknown) {
    if (error instanceof VacationWindowError) {
      return json(422, {
        ok: false,
        error: "Periode trop large ou trop dense pour garantir une prepaie exhaustive.",
      });
    }
    console.error("[prepay.GET] vacation window failed", error);
    return json(500, { ok: false, error: "Internal error" });
  }

  if (
    vacationDocs.some(
      (doc) => (doc.data() as Record<string, unknown>).tenantId !== auth.tenantId
    )
  ) {
    return json(422, { ok: false, error: "Prepay data is incomplete" });
  }

  const tenantSnap = await adminDb.collection("tenants").doc(auth.tenantId).get();
  const tenant = tenantSnap.exists
    ? (tenantSnap.data() as Record<string, unknown>)
    : {};
  const settings = normalizePrepaySettings(tenant.prepaySettings);

  const agentIds = Array.from(
    new Set(
      vacationDocs.flatMap((doc) =>
        safeArr((doc.data() as Record<string, unknown>).assignedAgentIds).slice(0, 1)
      )
    )
  );
  if (agentIds.length > MAX_PREPAY_AGENT_REFERENCES) {
    return json(422, { ok: false, error: "Prepay data is too dense" });
  }
  const agentMap = new Map<string, Record<string, unknown>>();
  let invalidAgentReference = false;

  for (let index = 0; index < agentIds.length; index += 200) {
    const part = agentIds.slice(index, index + 200);
    const refs = part.map((agentId) => adminDb.collection("agents").doc(agentId));
    const snaps = await adminDb.getAll(...refs);
    snaps.forEach((snap, snapIndex) => {
      if (!snap.exists) {
        invalidAgentReference = true;
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      if (data.tenantId !== auth.tenantId) {
        invalidAgentReference = true;
        return;
      }
      agentMap.set(part[snapIndex], data);
    });
  }

  if (invalidAgentReference || agentMap.size !== agentIds.length) {
    return json(422, { ok: false, error: "Prepay data is incomplete" });
  }

  const vacations: PrepayVacationInput[] = vacationDocs.map((doc) => {
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
