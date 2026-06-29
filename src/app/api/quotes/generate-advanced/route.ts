import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";
import {
  Timestamp,
  FieldValue,
  type Timestamp as AdminTimestamp,
} from "firebase-admin/firestore";

import { segmentShift, minutesToHours } from "@/lib/billing/segmentation";
import { nextCounter } from "@/lib/billing/counters";
import { quoteNumber, yearNow } from "@/lib/billing/helpers";

export const runtime = "nodejs";

/* ================= helpers ================= */

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function bad(msg: string, extra?: any) {
  return json(400, { ok: false, error: msg, ...extra });
}

async function getTenantUser(uid: string) {
  const snap = await adminDb.collection("tenantUsers").doc(uid).get();
  return snap.exists ? snap.data() : null;
}

function nowAdmin() {
  return FieldValue.serverTimestamp();
}

type RateRule = {
  code: string;
  label: string;
  hourlyRateHT: number;
};

function buildRateMap(rules: RateRule[]) {
  const map = new Map<string, RateRule>();
  for (const r of rules) map.set(r.code, r);
  return map;
}

type VacationDoc = {
  id: string;
  startAt?: AdminTimestamp;
  endAt?: AdminTimestamp;
  siteId?: string;
  tenantId?: string;
  status?: string;
  title?: string;
};

/* ================= route ================= */

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return json(401, { ok: false, error: "Unauthorized" });

    const decoded = await getAuth().verifyIdToken(token);
    const uid = decoded.uid;

    const tu = await getTenantUser(uid);
    if (!tu) return json(401, { ok: false, error: "No tenant user profile" });

    const role = tu.role;
    const tenantId = tu.tenantId;

    if (!["admin", "manager"].includes(role)) {
      return json(403, { ok: false, error: "Forbidden" });
    }

    const body = await req.json().catch(() => null);
    if (!body) return bad("Invalid JSON");

    const { siteId, clientId, from, to } = body;
    if (!siteId || !clientId || !from || !to) {
      return bad("Missing fields", {
        required: ["siteId", "clientId", "from", "to"],
      });
    }

    const fromTs = Timestamp.fromDate(new Date(from));
    const toTs = Timestamp.fromDate(new Date(to));
    if (toTs.toMillis() <= fromTs.toMillis()) return bad("Invalid period");

    // 1) Validate site + tenant
    const siteSnap = await adminDb.collection("sites").doc(siteId).get();
    if (!siteSnap.exists) return bad("Site not found");
    const site = siteSnap.data()!;
    if (site.tenantId !== tenantId)
      return json(403, { ok: false, error: "Cross-tenant site" });

    // 2) Validate client + tenant
    const clientSnap = await adminDb.collection("clients").doc(clientId).get();
    if (!clientSnap.exists) return bad("Client not found");
    const client = clientSnap.data()!;
    if (client.tenantId !== tenantId)
      return json(403, { ok: false, error: "Cross-tenant client" });

    // 3) Find siteContract (billing enabled)
    const scQ = await adminDb
      .collection("siteContracts")
      .where("tenantId", "==", tenantId)
      .where("siteId", "==", siteId)
      .where("billingEnabled", "==", true)
      .limit(1)
      .get();

    if (scQ.empty) {
      return bad("No siteContract with billingEnabled=true for this site", {
        hint: "Create siteContracts doc linking siteId to contractId/ratePlanId",
      });
    }

    const siteContract = scQ.docs[0].data() as any;
    const ratePlanId = siteContract.ratePlanId as string | undefined;
    if (!ratePlanId) return bad("siteContract.ratePlanId missing");

    // 4) Load ratePlan
    const rpSnap = await adminDb.collection("ratePlans").doc(ratePlanId).get();
    if (!rpSnap.exists) return bad("RatePlan not found");
    const ratePlan = rpSnap.data()!;
    if (ratePlan.tenantId !== tenantId)
      return json(403, { ok: false, error: "Cross-tenant ratePlan" });

    const dayStart = String(ratePlan.dayStart ?? "06:00");
    const nightStart = String(ratePlan.nightStart ?? "21:00");
    const rounding = ratePlan.rounding ?? { mode: "quarter_hour", stepMinutes: 15 };
    const stepMinutes = Number(rounding.stepMinutes ?? 15);

    const vatRate = Number(ratePlan.vatRate ?? 0.2);
    const rules = (ratePlan.rules ?? []) as RateRule[];
    const rateMap = buildRateMap(rules);

    // 5) Load vacations for site in period
    // Note: MVP uses startAt filter (fast). Later we will include overlaps.
    const vacSnap = await adminDb
      .collection("vacations")
      .where("tenantId", "==", tenantId)
      .where("siteId", "==", siteId)
      .where("startAt", ">=", fromTs)
      .where("startAt", "<=", toTs)
      .get();

    const vacations: VacationDoc[] = vacSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    }));

    if (vacations.length === 0) return bad("No vacations found for this period/site");

    // 6) Segment & aggregate minutes by code
    const minutesByCode = new Map<string, number>();
    const vacationIds: string[] = [];

    for (const v of vacations) {
      if (!v.startAt || !v.endAt) continue;
      vacationIds.push(v.id);

      const segs = segmentShift(v.startAt, v.endAt, { dayStart, nightStart });
      for (const s of segs) {
        minutesByCode.set(s.code, (minutesByCode.get(s.code) ?? 0) + s.minutes);
      }
    }

    if (minutesByCode.size === 0)
      return bad("No segment minutes computed (check startAt/endAt)");

    // 7) Build quote lines
    const lines: any[] = [];
    let subtotalHT = 0;
    let totalTTC = 0;

    // stable order
    const order = ["WD_DAY", "WD_NIGHT", "WE_DAY", "WE_NIGHT", "HOL_DAY", "HOL_NIGHT"];

    for (const code of order) {
      const minutes = minutesByCode.get(code);
      if (!minutes || minutes <= 0) continue;

      const rule = rateMap.get(code);
      if (!rule) {
        return bad(`RatePlan missing rule for code ${code}`, {
          hint: "Add rule in ratePlans.rules with hourlyRateHT",
        });
      }

      const qtyHours = minutesToHours(minutes, stepMinutes);
      if (qtyHours <= 0) continue;

      const unitPriceHT = Number(rule.hourlyRateHT);
      const lineTotalHT = Number((qtyHours * unitPriceHT).toFixed(2));
      const lineTotalTTC = Number((lineTotalHT * (1 + vatRate)).toFixed(2));

      subtotalHT += lineTotalHT;
      totalTTC += lineTotalTTC;

      lines.push({
        code,
        label: rule.label ?? code,
        qtyHours,
        unitPriceHT,
        vatRate,
        totalHT: lineTotalHT,
        totalTTC: lineTotalTTC,
        vacationIds, // MVP: attach all (later: attach per code)
      });
    }

    subtotalHT = Number(subtotalHT.toFixed(2));
    totalTTC = Number(totalTTC.toFixed(2));
    const totalVAT = Number((totalTTC - subtotalHT).toFixed(2));

    // 8) Numbering (server transaction counter)
    const year = yearNow();
    const seq = await nextCounter(tenantId, "quote", year);
    const number = quoteNumber(year, seq);

    // 9) Create quote doc
    const quoteRef = adminDb.collection("quotes").doc();
    await quoteRef.set({
      tenantId,
      number,
      status: "draft",
      clientId,
      clientName: client.name ?? null,
      siteId,
      siteName: site.name ?? null,
      contractId: siteContract.contractId ?? null,
      ratePlanId,
      period: { from: fromTs, to: toTs },
      currency: ratePlan.currency ?? "EUR",
      dayStart,
      nightStart,
      rounding: { mode: rounding.mode ?? "quarter_hour", stepMinutes },
      lines,
      subtotalHT,
      totalVAT,
      totalTTC,
      discount: null,
      notes: null,
      terms: null,
      createdAt: nowAdmin(),
      createdBy: uid,
      updatedAt: nowAdmin(),
      updatedBy: uid,
    });

    return json(200, {
      ok: true,
      quoteId: quoteRef.id,
      number,
      siteId,
      clientId,
      totals: { subtotalHT, totalVAT, totalTTC },
      vacationsCount: vacations.length,
      linesCount: lines.length,
    });
  } catch (e: any) {
    console.error("[quotes.generate-advanced]", e);
    return json(500, {
      ok: false,
      error: "Internal error",
      details: e?.message ?? String(e),
    });
  }
}
