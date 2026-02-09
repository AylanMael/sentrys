// src/app/api/agents/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

import { requireTenantUser, canWrite } from "@/app/api/_utils/withTenant";
import { assertWithinLimitsTx, adjustUsage } from "@/lib/billing/limits";

export const runtime = "nodejs";

type AgentStatus = "active" | "inactive";

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

function notFound(msg = "Not found") {
  return json(404, { ok: false, error: msg });
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

function normalizeText(s: any) {
  return String(s ?? "").trim();
}

function buildSearch(
  firstName: string,
  lastName: string,
  email?: string | null,
  phone?: string | null
) {
  const parts = [firstName, lastName, email ?? "", phone ?? ""]
    .map((x) => normalizeText(x).toLowerCase())
    .filter(Boolean);
  return parts.join(" ");
}

function pickAgent(d: any, id: string) {
  return {
    id,
    tenantId: d.tenantId,
    firstName: d.firstName ?? null,
    lastName: d.lastName ?? null,
    email: d.email ?? null,
    phone: d.phone ?? null,
    status: (d.status ?? "active") as AgentStatus,
    search: d.search ?? null,

    createdBy: d.createdBy ?? null,
    updatedBy: d.updatedBy ?? null,

    createdAtIso: toIso(d.createdAt),
    updatedAtIso: toIso(d.updatedAt),
  };
}

/* ================= loader ================= */

async function loadAgentOr404(agentId: string, tenantId: string) {
  const ref = adminDb.collection("agents").doc(agentId);
  const snap = await ref.get();

  if (!snap.exists) return { ok: false as const, res: notFound("Agent not found") };

  const data = snap.data() as any;
  if (data?.tenantId !== tenantId) {
    return { ok: false as const, res: notFound("Agent not found") };
  }

  return { ok: true as const, ref, snap, data };
}

/* ================= GET ================= */
/**
 * GET /api/agents/:id
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  const { id } = await params;
  const agentId = normalizeText(id);
  if (!agentId) return bad("Missing agent id");

  try {
    const loaded = await loadAgentOr404(agentId, auth.tenantId);
    if (!loaded.ok) return loaded.res;

    return json(200, {
      ok: true,
      tenantId: auth.tenantId,
      agent: pickAgent(loaded.data, loaded.snap.id),
    });
  } catch (e: any) {
    return serverError(e, "agents.[id].GET");
  }
}

/* ================= PATCH ================= */
/**
 * PATCH /api/agents/:id
 * body: { firstName?, lastName?, email?, phone?, status? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!canWrite(auth.role)) return forbidden("Insufficient rights");

  const { id } = await params;
  const agentId = normalizeText(id);
  if (!agentId) return bad("Missing agent id");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body");
  }

  try {
    const loaded = await loadAgentOr404(agentId, auth.tenantId);
    if (!loaded.ok) return loaded.res;

    const prev = loaded.data as any;
    const prevStatus: AgentStatus = (String(prev?.status ?? "active") === "inactive"
      ? "inactive"
      : "active") as AgentStatus;

    const patch: any = {};

    if (body.firstName !== undefined) {
      const v = normalizeText(body.firstName);
      if (!v) return bad("firstName cannot be empty");
      patch.firstName = v;
    }

    if (body.lastName !== undefined) {
      const v = normalizeText(body.lastName);
      if (!v) return bad("lastName cannot be empty");
      patch.lastName = v;
    }

    if (body.email !== undefined) patch.email = normalizeText(body.email) || null;
    if (body.phone !== undefined) patch.phone = normalizeText(body.phone) || null;

    let nextStatus: AgentStatus = prevStatus;
    if (body.status !== undefined) {
      const s = normalizeText(body.status).toLowerCase();
      nextStatus = s === "inactive" ? "inactive" : "active";
      patch.status = nextStatus;
    }

    // ✅ Si on réactive un agent (inactive -> active), on re-check quota
    if (prevStatus === "inactive" && nextStatus === "active") {
      const quota = await assertWithinLimitsTx({ tenantId: auth.tenantId, kind: "agents", delta: 1 });
      if (!quota.ok) {
        return forbidden(quota.message, {
          code: quota.code,
          limits: quota.limits,
          usage: quota.usage,
          kind: "agents",
        });
      }
    }

    // ✅ search recalculé
    const nextFirst = patch.firstName ?? prev.firstName;
    const nextLast = patch.lastName ?? prev.lastName;
    const nextEmail = patch.email ?? prev.email ?? null;
    const nextPhone = patch.phone ?? prev.phone ?? null;
    patch.search = buildSearch(nextFirst, nextLast, nextEmail, nextPhone);

    patch.updatedAt = FieldValue.serverTimestamp();
    patch.updatedBy = auth.uid;

    await loaded.ref.set(patch, { merge: true });

    // ✅ Ajustement usage si changement de status (active<->inactive)
    if (body.status !== undefined && prevStatus !== nextStatus) {
      if (prevStatus === "active" && nextStatus === "inactive") {
        await adjustUsage(auth.tenantId, "agents", -1);
      }
      // inactive->active : déjà réservé dans assertWithinLimitsTx (tx a +1)
      // donc pas besoin de adjustUsage ici
    }

    const updatedSnap = await loaded.ref.get();
    const data = updatedSnap.data() as any;

    return json(200, {
      ok: true,
      tenantId: auth.tenantId,
      agent: pickAgent(data, updatedSnap.id),
    });
  } catch (e: any) {
    return serverError(e, "agents.[id].PATCH");
  }
}

/* ================= DELETE ================= */
/**
 * DELETE /api/agents/:id
 * => soft delete: status=inactive (+ décrémente usage si l'agent était actif)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!canWrite(auth.role)) return forbidden("Insufficient rights");

  const { id } = await params;
  const agentId = normalizeText(id);
  if (!agentId) return bad("Missing agent id");

  try {
    const loaded = await loadAgentOr404(agentId, auth.tenantId);
    if (!loaded.ok) return loaded.res;

    const prev = loaded.data as any;
    const prevStatus: AgentStatus =
      String(prev?.status ?? "active") === "inactive" ? "inactive" : "active";

    // déjà inactif => idempotent
    if (prevStatus === "inactive") {
      return json(200, { ok: true, id: agentId, updated: { status: "inactive" } });
    }

    await loaded.ref.set(
      {
        status: "inactive",
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: auth.uid,
      },
      { merge: true }
    );

    // décrémente l'usage (agents actifs)
    await adjustUsage(auth.tenantId, "agents", -1);

    return json(200, { ok: true, id: agentId, updated: { status: "inactive" } });
  } catch (e: any) {
    return serverError(e, "agents.[id].DELETE");
  }
}
