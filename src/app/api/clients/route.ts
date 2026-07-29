// src/app/api/clients/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { decodeCursor, encodeCursor } from "@/lib/api/cursor";
import { normLower, norm } from "@/lib/api/text";

export const runtime = "nodejs";

type ApiOk = {
  ok: true;
  items?: unknown[];
  item?: unknown;
  nextCursor?: string | null;
};

type ApiErr = {
  ok: false;
  error: string;
  details?: unknown;
};

function json(status: number, body: ApiOk | ApiErr) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function errorDétails(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function canReadClients(role: string) {
  return ["super_admin", "owner", "admin", "manager"].includes(role);
}

function canWriteClients(role: string) {
  return ["super_admin", "owner", "admin", "manager"].includes(role);
}

function getToken(req: NextRequest) {
  const h =
    req.headers.get("authorization") ||
    req.headers.get("Authorization") ||
    req.headers.get("x-auth-token") ||
    "";
  if (!h) return null;
  const s = h.trim();
  if (s.toLowerCase().startsWith("bearer ")) return s.slice(7).trim();
  return s;
}

async function getContext(req: NextRequest) {
  const token = getToken(req);
  if (!token) return { ok: false as const, error: "Missing token" };

  const decoded = await getAuth().verifyIdToken(token, true);
  const uid = decoded.uid;

  const tuSnap = await adminDb.collection("tenantUsers").doc(uid).get();
  if (!tuSnap.exists) return { ok: false as const, error: "No tenant profile" };

  const tu = tuSnap.data() as Record<string, unknown>;
  const status = normLower(tu?.status);
  if (status !== "active") return { ok: false as const, error: "User not active" };

  const tenantId = norm(tu?.tenantId);
  const role = normLower(tu?.role);

  if (!tenantId) return { ok: false as const, error: "Missing tenantId" };

  if (!canReadClients(role)) return { ok: false as const, error: "Forbidden" };

  return {
    ok: true as const,
    uid,
    tenantId,
    role,
    email: norm(decoded.email),
  };
}

function parseLimit(v: string | null) {
  const n = Number(v ?? 20);
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(200, Math.floor(n)));
}

// filtre local fallback
function matchQ(doc: Record<string, unknown>, q: string) {
  if (!q) return true;
  const qq = normLower(q);

  const hay = [
    doc?.name,
    doc?.legalName,
    doc?.email,
    doc?.billingEmail,
    doc?.phone,
    doc?.contactName,
    doc?.siret,
  ]
    .map((x) => normLower(x))
    .filter(Boolean)
    .join(" | ");

  return hay.includes(qq);
}

function optionalText(value: unknown) {
  const text = norm(value);
  return text || null;
}

function optionalLower(value: unknown) {
  const text = normLower(value);
  return text || null;
}

function normalizeStatus(value: unknown) {
  const status = normLower(value || "active");
  return status === "inactive" ? "inactive" : "active";
}

function buildSearch(input: Record<string, unknown>) {
  const address =
    input.address && typeof input.address === "object"
      ? (input.address as Record<string, unknown>)
      : {};

  return [
    input.name,
    input.legalName,
    input.email,
    input.billingEmail,
    input.phone,
    input.contactName,
    input.siret,
    address.line1,
    address.line2,
    address.postalCode,
    address.city,
    address.country,
  ]
    .map((value) => normLower(value))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ");
}

function timestampMs(value: unknown) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const timestamp = value as { toDate?: () => Date };
  if (typeof timestamp.toDate === "function") {
    return timestamp.toDate().getTime();
  }

  return 0;
}

function clientSortMs(client: Record<string, unknown>) {
  return timestampMs(client.updatedAt) || timestampMs(client.createdAt);
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await getContext(req);
    if (!ctx.ok) return json(401, { ok: false, error: ctx.error });

    const { tenantId } = ctx;

    const { searchParams } = new URL(req.url);
    const q = norm(searchParams.get("q"));
    const status = normLower(searchParams.get("status") ?? "all");
    const limit = parseLimit(searchParams.get("limit"));
    const cursor = decodeCursor(searchParams.get("cursor"));

    // Index-safe and legacy-safe: some historical clients do not have createdAt.
    // Firestore orderBy would hide those documents, so we filter and sort locally.
    const snap = await adminDb
      .collection("clients")
      .where("tenantId", "==", tenantId)
      .limit(500)
      .get();

    const all = snap.docs.map((d): Record<string, unknown> => ({ id: d.id, ...d.data() }));
    const filtered = all
      .filter((client) => {
        if (status && status !== "all" && normalizeStatus(client.status) !== status) {
          return false;
        }
        return matchQ(client, q);
      })
      .sort((a, b) => {
        const au = clientSortMs(a);
        const bu = clientSortMs(b);
        if (bu !== au) return bu - au;
        return String(a.name ?? a.legalName ?? a.email ?? a.id ?? "").localeCompare(
          String(b.name ?? b.legalName ?? b.email ?? b.id ?? ""),
          "fr"
        );
      });

    const startIndex = cursor?.id
      ? Math.max(0, filtered.findIndex((client) => String(client.id ?? "") === cursor.id) + 1)
      : 0;
    const items = filtered.slice(startIndex, startIndex + limit);

    let nextCursor: string | null = null;
    if (startIndex + limit < filtered.length && items.length > 0) {
      const last = items[items.length - 1] as Record<string, unknown>;
      nextCursor = encodeCursor({
        createdAtMs: clientSortMs(last),
        id: String(last.id ?? ""),
      });
    }

    return json(200, { ok: true, items, nextCursor });
  } catch (e: unknown) {
    console.error("[api/clients] GET error", e);
    return json(500, {
      ok: false,
      error: "Internal error",
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getContext(req);
    if (!ctx.ok) return json(401, { ok: false, error: ctx.error });
    if (!canWriteClients(ctx.role)) {
      return json(403, { ok: false, error: "Forbidden" });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json(400, { ok: false, error: "Invalid JSON body" });
    }

    const name = norm(body.name);
    if (name.length < 2) {
      return json(400, {
        ok: false,
        error: "Le nom du client est requis.",
      });
    }

    const rawAddress =
      body.address && typeof body.address === "object"
        ? (body.address as Record<string, unknown>)
        : {};
    const address = {
      line1: optionalText(rawAddress.line1),
      line2: optionalText(rawAddress.line2),
      postalCode: optionalText(rawAddress.postalCode),
      city: optionalText(rawAddress.city),
      country: optionalText(rawAddress.country) || "France",
    };

    const payload = {
      tenantId: ctx.tenantId,
      name,
      legalName: optionalText(body.legalName),
      siret: optionalText(body.siret),
      contactName: optionalText(body.contactName),
      email: optionalLower(body.email),
      phone: optionalText(body.phone),
      billingEmail: optionalLower(body.billingEmail),
      address,
      status: normalizeStatus(body.status),
      notes: optionalText(body.notes),
      search: buildSearch({
        ...body,
        name,
        address,
      }),
      createdBy: ctx.uid,
      updatedBy: ctx.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const ref = await adminDb.collection("clients").add(payload);
    const nowIso = new Date().toISOString();

    return json(201, {
      ok: true,
      item: {
        id: ref.id,
        ...payload,
        createdAt: undefined,
        updatedAt: undefined,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      },
    });
  } catch (e: unknown) {
    console.error("[api/clients] POST error", e);
    return json(500, {
      ok: false,
      error: "Internal error",
    });
  }
}
