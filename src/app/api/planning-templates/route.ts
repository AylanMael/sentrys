import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireTenantUser, canWrite } from "@/app/api/_utils/withTenant";
import {
  normalizeTemplateText,
  normalizeSitePlanningTemplateEntry,
} from "@/lib/planning/site-templates";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function bad(error: string, extra?: Record<string, unknown>) {
  return json(400, { ok: false, error, ...extra });
}

function timestampToIso(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }

  return null;
}

function mapTemplate(
  data: Record<string, unknown>,
  id: string
) {
  const entries = Array.isArray(data.entries)
    ? data.entries
        .map((entry) =>
          normalizeSitePlanningTemplateEntry(
            entry as Record<string, unknown>
          )
        )
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    : [];

  return {
    id,
    siteId: String(data.siteId ?? ""),
    siteName: normalizeTemplateText(data.siteName),
    name: normalizeTemplateText(data.name) ?? "Planning type",
    entries,
    updatedAtIso: timestampToIso(data.updatedAt),
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  try {
    const snap = await adminDb
      .collection("planningTemplates")
      .where("tenantId", "==", auth.tenantId)
      .get();

    const templates = snap.docs
      .map((doc) => mapTemplate(doc.data() as Record<string, unknown>, doc.id))
      .sort((a, b) => {
        const siteCompare = (a.siteName ?? "").localeCompare(b.siteName ?? "", "fr");
        if (siteCompare !== 0) return siteCompare;
        return a.name.localeCompare(b.name, "fr");
      });

    return json(200, { ok: true, templates });
  } catch (error) {
    return bad(
      error instanceof Error ? error.message : "Impossible de charger les templates."
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body");
  }

  const siteId = normalizeTemplateText(body.siteId);
  if (!siteId) {
    return bad("siteId is required");
  }

  const entries = Array.isArray(body.entries)
    ? body.entries
        .map((entry) =>
          normalizeSitePlanningTemplateEntry(entry as Record<string, unknown>)
        )
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    : [];

  if (entries.length === 0) {
    return bad("entries must contain at least one valid row");
  }

  const siteName = normalizeTemplateText(body.siteName);
  const name = normalizeTemplateText(body.name) ?? siteName ?? "Planning type";
  const requestedId = normalizeTemplateText(body.id);

  try {
    let ref = requestedId
      ? adminDb.collection("planningTemplates").doc(requestedId)
      : null;

    let existingId: string | null = null;

    if (ref) {
      const existing = await ref.get();
      if (existing.exists) {
        const data = existing.data() as Record<string, unknown>;
        if (String(data.tenantId ?? "") !== auth.tenantId) {
          return json(403, { ok: false, error: "Forbidden" });
        }
        existingId = existing.id;
      } else {
        ref = null;
      }
    }

    if (!ref) {
      const existingBySite = await adminDb
        .collection("planningTemplates")
        .where("tenantId", "==", auth.tenantId)
        .where("siteId", "==", siteId)
        .limit(1)
        .get();

      if (!existingBySite.empty) {
        ref = existingBySite.docs[0].ref;
        existingId = existingBySite.docs[0].id;
      } else {
        ref = adminDb.collection("planningTemplates").doc();
      }
    }

    const payload = {
      tenantId: auth.tenantId,
      siteId,
      siteName: siteName ?? null,
      name,
      entries,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: auth.uid,
      ...(existingId
        ? {}
        : {
            createdAt: FieldValue.serverTimestamp(),
            createdBy: auth.uid,
          }),
    };

    await ref.set(payload, { merge: true });
    const saved = await ref.get();

    return json(200, {
      ok: true,
      template: mapTemplate(
        saved.data() as Record<string, unknown>,
        saved.id
      ),
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Impossible d'enregistrer le planning type.",
    });
  }
}
