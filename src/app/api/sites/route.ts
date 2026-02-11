// src/app/api/sites/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

import { requireTenantUser, canWrite } from "@/app/api/_utils/withTenant";
import { assertWithinLimitsTx } from "@/lib/billing/limits";
import { logActivity } from "@/lib/activity/logger";

export const runtime = "nodejs";

/* ================= helpers ================= */

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function bad(msg: string, extra?: any) {
  return json(400, { ok: false, error: msg, ...extra });
}

function forbidden(msg = "Forbidden", extra?: any) {
  return json(403, { ok: false, error: msg, ...extra });
}

function serverError(e: any, tag: string) {
  console.error(`[${tag}]`, e);
  return json(500, {
    ok: false,
    error: "Internal error",
    details: e?.message ?? String(e),
  });
}

function toIso(ts: any) {
  return ts && typeof ts.toDate === "function" ? ts.toDate().toISOString() : null;
}

function normalizeText(v: any) {
  return String(v ?? "").trim();
}

function safeArr(v: unknown): string[] {
  return Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : [];
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.map((x) => String(x)).filter(Boolean)));
}

function parseMax(v: string | null, def = 50) {
  const n = Number(v ?? "");
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), 200);
}

function parseBool(v: string | null): boolean | null {
  if (v == null) return null;
  const x = v.toLowerCase().trim();
  if (["1", "true", "yes", "y"].includes(x)) return true;
  if (["0", "false", "no", "n"].includes(x)) return false;
  return null;
}

function buildSearch(input: {
  name: string;
  clientName?: string | null;
  city?: string | null;
  address?: string | null;
  postalCode?: string | null;
}) {
  const { name, clientName, city, address, postalCode } = input;
  return `${name} ${clientName ?? ""} ${city ?? ""} ${address ?? ""} ${postalCode ?? ""}`
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function pickSite(d: any, id: string) {
  return {
    id,
    tenantId: d.tenantId,
    name: d.name ?? null,
    clientName: d.clientName ?? null,
    siteType: d.siteType ?? "bureaux",
    riskLevel: d.riskLevel ?? 3,
    address: d.address ?? null,
    city: d.city ?? null,
    postalCode: d.postalCode ?? null,
    instructions: d.instructions ?? null,
    isActive: typeof d.isActive === "boolean" ? d.isActive : true,

    agentIds: safeArr(d.agentIds),
    managerIds: safeArr(d.managerIds),
    accessUids: safeArr(d.accessUids),

    search: d.search ?? null,

    createdBy: d.createdBy ?? null,
    updatedBy: d.updatedBy ?? null,
    createdAtIso: toIso(d.createdAt),
    updatedAtIso: toIso(d.updatedAt),
  };
}

/* ================= GET ================= */
/**
 * GET /api/sites?max=50&isActive=true&q=paris
 */
export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  const url = new URL(req.url);
  const max = parseMax(url.searchParams.get("max"), 50);
  const isActive = parseBool(url.searchParams.get("isActive"));
  const q = normalizeText(url.searchParams.get("q")).toLowerCase();

  try {
    let ref: FirebaseFirestore.Query = adminDb
      .collection("sites")
      .where("tenantId", "==", auth.tenantId);

    if (isActive !== null) ref = ref.where("isActive", "==", isActive);

    const snap = await ref.limit(max).get();
    let sites = snap.docs.map((doc) => pickSite(doc.data(), doc.id));

    // ✅ tri robuste (ISO string)
    sites.sort((a: any, b: any) => {
      const au = a.updatedAtIso ? Date.parse(a.updatedAtIso) : 0;
      const bu = b.updatedAtIso ? Date.parse(b.updatedAtIso) : 0;
      if (bu !== au) return bu - au;

      const ac = a.createdAtIso ? Date.parse(a.createdAtIso) : 0;
      const bc = b.createdAtIso ? Date.parse(b.createdAtIso) : 0;
      return bc - ac;
    });

    if (q) {
      sites = sites.filter((s: any) => {
        const hay =
          String(s.search ?? "").toLowerCase() ||
          `${s.name ?? ""} ${s.clientName ?? ""} ${s.city ?? ""} ${s.address ?? ""}`.toLowerCase();
        return hay.includes(q);
      });
    }

    return json(200, { ok: true, tenantId: auth.tenantId, count: sites.length, sites });
  } catch (e: any) {
    return serverError(e, "sites.GET");
  }
}

/* ================= POST ================= */
/**
 * POST /api/sites
 */
export async function POST(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!canWrite(auth.role)) return forbidden("Insufficient rights");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body");
  }

  const name = normalizeText(body.name);
  if (!name) return bad("name is required");

  const clientName = normalizeText(body.clientName) || null;
  const siteType = normalizeText(body.siteType) || "bureaux";

  const riskRaw = Number(body.riskLevel ?? 3);
  const riskLevel = Number.isFinite(riskRaw)
    ? Math.min(Math.max(Math.floor(riskRaw), 1), 5)
    : 3;

  const address = normalizeText(body.address) || null;
  const city = normalizeText(body.city) || null;
  const postalCode = normalizeText(body.postalCode) || null;
  const instructions = normalizeText(body.instructions) || null;

  const isActive = typeof body.isActive === "boolean" ? body.isActive : true;

  const agentIds = uniq(safeArr(body.agentIds)).slice(0, 200);
  const managerIds = uniq(safeArr(body.managerIds)).slice(0, 200);
  const accessUids = uniq(safeArr(body.accessUids)).slice(0, 200);

  const search = buildSearch({ name, clientName, city, address, postalCode });

  try {
    if (isActive) {
      const quota = await assertWithinLimitsTx({
        tenantId: auth.tenantId,
        kind: "sites",
        delta: 1,
      });

      if (!quota.ok) {
        await logActivity({
          tenantId: auth.tenantId,
          actorUid: auth.uid,
          actorEmail: auth.email ?? null,
          actorRole: auth.role ?? null,
          action: "billing.limit_reached",
          entityType: "billing",
          entityId: "sites",
          message: `Limite atteinte : création de site bloquée`,
          meta: { kind: "sites", name, code: quota.code, limits: quota.limits, usage: quota.usage },
          severity: "warning",
        });

        return forbidden(quota.message, {
          code: quota.code,
          limits: quota.limits,
          usage: quota.usage,
          kind: "sites",
        });
      }
    }

    const payload: any = {
      tenantId: auth.tenantId,
      name,
      clientName,
      siteType,
      riskLevel,
      address,
      city,
      postalCode,
      instructions,
      isActive,

      agentIds,
      managerIds,
      accessUids,

      search,

      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: auth.uid,
      updatedBy: auth.uid,
    };

    const ref = await adminDb.collection("sites").add(payload);
    const created = await ref.get();

    await logActivity({
      tenantId: auth.tenantId,
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      actorRole: auth.role ?? null,
      action: "site.created",
      entityType: "site",
      entityId: ref.id,
      message: `Site créé : ${name}`,
      meta: {
        siteId: ref.id,
        name,
        clientName,
        city,
        isActive,
        riskLevel,
      },
      severity: "info",
    });

    return json(201, {
      ok: true,
      tenantId: auth.tenantId,
      id: ref.id,
      site: pickSite(created.data(), ref.id),
    });
  } catch (e: any) {
    return serverError(e, "sites.POST");
  }
}
