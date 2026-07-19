import { NextRequest, NextResponse } from "next/server";

import {
  forbidden,
  isSuperAdmin,
  requireTenantUser,
} from "@/app/api/_utils/withTenant";
import {
  listPlatformAuditEvents,
  writePlatformAuditEvent,
  type PlatformAuditTone,
} from "@/lib/platform/audit-log";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function text(value: unknown, fallback = "") {
  const str = String(value ?? "").trim();
  return str || fallback;
}

function readLimit(req: NextRequest) {
  const raw = Number(req.nextUrl.searchParams.get("limit") ?? 12);
  if (!Number.isFinite(raw)) return 12;

  return Math.min(Math.max(raw, 1), 50);
}

export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!isSuperAdmin(auth.role)) {
    return forbidden("Super admin SaaS required");
  }

  try {
    const tenantId = text(req.nextUrl.searchParams.get("tenantId")) || null;
    const events = await listPlatformAuditEvents({
      tenantId,
      limit: readLimit(req),
    });

    return json(200, {
      ok: true,
      events,
      generatedAtIso: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[platform.audit.GET] error", error);
    return json(500, {
      ok: false,
      error: "Impossible de charger le registre d'audit plateforme.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!isSuperAdmin(auth.role)) {
    return forbidden("Super admin SaaS required");
  }

  try {
    const body = (await req.json().catch(() => null)) as
      | Record<string, unknown>
      | null;

    if (!body) {
      return json(400, { ok: false, error: "Payload JSON requis." });
    }

    const reason = text(body.reason);
    if (reason.length < 8) {
      return json(400, {
        ok: false,
        error: "Motif obligatoire de 8 caracteres minimum.",
      });
    }

    const event = await writePlatformAuditEvent({
      action: text(body.action, "platform.support_note"),
      actionLabel: text(body.actionLabel, "Note support plateforme"),
      tenantId: text(body.tenantId) || null,
      tenantName: text(body.tenantName) || null,
      actorUid: auth.uid,
      actorEmail: auth.email,
      actorRole: auth.role,
      reason,
      status: text(body.status, "recorded"),
      tone: (text(body.tone, "info") as PlatformAuditTone) || "info",
      metadata:
        body.metadata && typeof body.metadata === "object"
          ? (body.metadata as Record<string, unknown>)
          : {},
    });

    return json(201, {
      ok: true,
      event,
    });
  } catch (error) {
    console.error("[platform.audit.POST] error", error);
    return json(500, {
      ok: false,
      error: "Impossible d'ecrire dans le registre d'audit plateforme.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
