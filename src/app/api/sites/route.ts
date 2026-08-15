import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldPath, FieldValue } from "firebase-admin/firestore";

import { requireTenantUser } from "@/app/api/_utils/withTenant";
import { assertWithinLimitsTx } from "@/lib/billing/limits";
import { logActivity } from "@/lib/activity/logger";
import { SiteCreateSchema } from "@/lib/api/schemas";

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

function forbidden(msg = "Forbidden", extra?: any) {
  return json(403, { ok: false, error: msg, ...extra });
}

function serverError(e: any, tag: string) {
  console.error(`[${tag}]`, e);
  return json(500, {
    ok: false,
    error: "Internal error",
  });
}

function toIso(ts: any) {
  return ts && typeof ts.toDate === "function" ? ts.toDate().toISOString() : null;
}

function normalizeText(v: any) {
  return String(v ?? "").trim();
}

function normalizeRole(v: any) {
  return String(v ?? "").trim().toLowerCase();
}

function canReadBackoffice(role: any) {
  const r = normalizeRole(role);
  return ["super_admin", "owner", "admin", "manager", "viewer"].includes(r);
}

function canManagePlanning(role: any) {
  const r = normalizeRole(role);
  return ["super_admin", "owner", "admin", "manager"].includes(r);
}

function isAgentRole(role: any) {
  return normalizeRole(role) === "agent";
}

function safeArr(v: unknown): string[] {
  return Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : [];
}


function normalizeEmergencyContacts(v: unknown) {
  if (!Array.isArray(v)) return [];

  return v
    .map((item, index) => {
      const raw = (item ?? {}) as Record<string, unknown>;
      const name = normalizeText(raw.name);
      const role = normalizeText(raw.role) || null;
      const phone = normalizeText(raw.phone) || null;
      const email = normalizeText(raw.email) || null;
      const rawPriority = Number(raw.priority ?? index + 1);
      const priority = Number.isFinite(rawPriority)
        ? Math.min(Math.max(Math.floor(rawPriority), 1), 20)
        : index + 1;

      return { name, role, phone, email, priority };
    })
    .filter((contact) => contact.name && (contact.phone || contact.email))
    .slice(0, 10);
}
function uniq(arr: string[]) {
  return Array.from(new Set(arr.map((x) => String(x)).filter(Boolean)));
}

function parsePageSize(v: string | null, def = 50) {
  const n = Number(v ?? "");
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), 50);
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

    clientId: d.clientId ?? null,
    clientName: d.clientName ?? null,

    siteType: d.siteType ?? "bureaux",
    riskLevel: d.riskLevel ?? 3,
    address: d.address ?? null,
    city: d.city ?? null,
    postalCode: d.postalCode ?? null,
    latitude: d.latitude ?? null,
    longitude: d.longitude ?? null,
    instructions: d.instructions ?? null,
    isActive: typeof d.isActive === "boolean" ? d.isActive : true,

    agentIds: safeArr(d.agentIds),
    managerIds: safeArr(d.managerIds),
    accessUids: safeArr(d.accessUids),
    emergencyContacts: normalizeEmergencyContacts(d.emergencyContacts),

    search: d.search ?? null,

    createdBy: d.createdBy ?? null,
    updatedBy: d.updatedBy ?? null,
    createdAtIso: toIso(d.createdAt),
    updatedAtIso: toIso(d.updatedAt),
  };
}

function canUserAccessSiteDoc(input: {
  uid: string;
  role: string | null | undefined;
  site: any;
}) {
  const { uid, role, site } = input;

  if (canReadBackoffice(role)) return true;
  if (!isAgentRole(role)) return false;

  const accessUids = safeArr(site?.accessUids);
  const managerIds = safeArr(site?.managerIds);
  const agentIds = safeArr(site?.agentIds);

  return accessUids.includes(uid) || managerIds.includes(uid) || agentIds.includes(uid);
}

async function assertClientBelongsToTenant(clientId: string, tenantId: string) {
  const snap = await adminDb.collection("clients").doc(clientId).get();
  if (!snap.exists) return { ok: false as const, error: "Client not found" };

  const data = snap.data() as any;
  if (data?.tenantId !== tenantId) return { ok: false as const, error: "Client not found" };

  return { ok: true as const, client: data };
}

/* ================= GET ================= */
function encodeSiteCursor(id: string) {
  return Buffer.from(JSON.stringify({ id }), "utf8").toString("base64url");
}

function decodeSiteCursor(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { id?: unknown };
    const id = typeof parsed.id === "string" ? parsed.id.trim() : "";
    return id && id.length <= 200 ? id : null;
  } catch {
    return null;
  }
}

/**
 * GET /api/sites?pageSize=50&cursor=...&search=paris
 *
 * Sites are traversed by document id. This keeps ordering deterministic for
 * legacy documents that do not have createdAt or a normalized search field.
 * Search and optional filters apply to the current bounded server page; the
 * cursor lets callers continue scanning without downloading the whole tenant.
 */
export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  const role = normalizeRole(auth.role);
  const canReadAll = canReadBackoffice(role);
  const isAgent = isAgentRole(role);

  if (!canReadAll && !isAgent) {
    return forbidden("Insufficient rights");
  }

  const url = new URL(req.url);
  const pageSize = parsePageSize(
    url.searchParams.get("pageSize") ??
      url.searchParams.get("limit") ??
      url.searchParams.get("max"),
    50
  );
  const rawCursor = url.searchParams.get("cursor");
  const cursorId = decodeSiteCursor(rawCursor);
  if (rawCursor && !cursorId) return bad("Invalid cursor");

  const fetchLimit = pageSize + 1;
  const isActive = parseBool(url.searchParams.get("isActive"));
  const q = normalizeText(url.searchParams.get("search") ?? url.searchParams.get("q")).toLowerCase();
  const clientId = normalizeText(url.searchParams.get("clientId"));
  const siteType = normalizeText(url.searchParams.get("siteType"));
  const risk = normalizeText(url.searchParams.get("riskLevel") ?? url.searchParams.get("risk"));
  const riskLevel = /^[1-5]$/.test(risk) ? Number(risk) : null;

  try {
    let ref: FirebaseFirestore.Query = adminDb
      .collection("sites")
      .where("tenantId", "==", auth.tenantId)
      .orderBy(FieldPath.documentId(), "asc");

    if (cursorId) {
      const cursorSnap = await adminDb.collection("sites").doc(cursorId).get();
      if (!cursorSnap.exists || cursorSnap.data()?.tenantId !== auth.tenantId) {
        return bad("Invalid cursor");
      }
      ref = ref.startAfter(cursorSnap);
    }

    const snap = await ref.limit(fetchLimit).get();
    const hasMore = snap.size > pageSize;
    const scannedDocs = snap.docs.slice(0, pageSize);
    const sites = scannedDocs
      .map((doc) => pickSite(doc.data(), doc.id))
      .filter((site) => canReadAll || canUserAccessSiteDoc({ uid: auth.uid, role: auth.role, site }))
      .filter((site) => {
        if (isActive !== null && site.isActive !== isActive) return false;
        if (clientId === "__no_client__" && site.clientId) return false;
        if (clientId && clientId !== "__no_client__" && site.clientId !== clientId) return false;
        if (siteType && site.siteType !== siteType) return false;
        const level = Number(site.riskLevel ?? 3);
        if (riskLevel !== null && level !== riskLevel) return false;
        if (risk === "high" && level < 4) return false;
        if (!q) return true;
        const hay = String(
          site.search ||
            `${site.name ?? ""} ${site.clientName ?? ""} ${site.city ?? ""} ${site.address ?? ""}`
        ).toLowerCase();
        return hay.includes(q);
      });
    const cursorDoc = hasMore ? scannedDocs.at(-1) ?? null : null;
    const nextCursor = cursorDoc ? encodeSiteCursor(cursorDoc.id) : null;

    return json(200, {
      ok: true,
      tenantId: auth.tenantId,
      count: sites.length,
      sites,
      items: sites,
      nextCursor,
      hasMore,
    });
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

  if (!canManagePlanning(auth.role)) return forbidden("Insufficient rights");

  let rawBody: any;
  try {
    rawBody = await req.json();
  } catch {
    return bad("Invalid JSON body");
  }

  // VALIDATION ZOD
  const validation = SiteCreateSchema.safeParse(rawBody);
  if (!validation.success) {
    return bad("Données invalidés", { detail: validation.error.format() });
  }

  const values = validation.data;

  const clientId = values.clientId || null;
  let clientName = values.clientName || null;

  if (clientId) {
    const clientCheck = await assertClientBelongsToTenant(clientId, auth.tenantId);
    if (!clientCheck.ok) return bad("Invalid clientId", { details: clientCheck.error });
    clientName = clientName ?? (normalizeText(clientCheck.client?.name) || null);
  }

  const emergencyContacts = normalizeEmergencyContacts(values.emergencyContacts);
  const agentIds = uniq(values.agentIds).slice(0, 200);
  const managerIds = uniq([...values.managerIds, auth.uid]).slice(0, 200);
  const accessUids = uniq([
    ...values.accessUids,
    ...managerIds,
    ...agentIds,
  ]).slice(0, 200);

  const search = buildSearch({
    name: values.name,
    clientName,
    city: values.city,
    address: values.address,
    postalCode: values.postalCode
  });

  try {
    if (values.isActive) {
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
          meta: {
            kind: "sites",
            name: values.name,
            code: quota.code,
            limits: quota.limits,
            usage: quota.usage,
          },
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
      name: values.name,
      clientId,
      clientName,
      siteType: values.siteType,
      riskLevel: values.riskLevel,
      address: values.address || null,
      city: values.city || null,
      postalCode: values.postalCode || null,
      latitude: values.latitude ?? null,
      longitude: values.longitude ?? null,
      instructions: values.instructions || null,
      isActive: values.isActive,
      emergencyContacts,
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
        message: `Site créé : ${values.name}`,
      meta: {
        siteId: ref.id,
        name: values.name,
        clientId,
        clientName,
        city: values.city,
        isActive: values.isActive,
        riskLevel: values.riskLevel,
        managerIdsCount: managerIds.length,
        agentIdsCount: agentIds.length,
        emergencyContactsCount: emergencyContacts.length,
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
