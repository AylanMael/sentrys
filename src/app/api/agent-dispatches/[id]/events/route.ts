import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import {
  canReadBackoffice,
  isAgent,
  requireTenantUser,
} from "@/app/api/_utils/withTenant";
import { normalizeText, toIso } from "@/app/api/vacations/_shared";
import { adminDb } from "@/lib/firebase/admin";
import { logActivity } from "@/lib/activity/logger";

export const runtime = "nodejs";

type DispatchEvent = "viewed" | "printed";

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function bad(message: string) {
  return json(400, { ok: false, error: message });
}

function normalizeEvent(value: unknown): DispatchEvent | null {
  const normalized = normalizeText(value)?.toLowerCase();
  if (normalized === "viewed" || normalized === "printed") return normalized;
  return null;
}

async function resolveAllowedAgentIds(
  tenantId: string,
  uid: string,
  email: string | null
) {
  const authEmail = normalizeText(email)?.toLowerCase() ?? null;
  const agentsSnap = await adminDb
    .collection("agents")
    .where("tenantId", "==", tenantId)
    .limit(500)
    .get();

  return agentsSnap.docs
    .filter((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const agentEmail = normalizeText(data.email)?.toLowerCase() ?? null;
      return doc.id === uid || (authEmail !== null && agentEmail === authEmail);
    })
    .map((doc) => doc.id);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  const canInspect = canReadBackoffice(auth.role);
  const isFieldAgent = isAgent(auth.role);
  if (!canInspect && !isFieldAgent) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  const { id } = await params;
  const dispatchId = normalizeText(id);
  if (!dispatchId) return bad("Missing dispatch id");

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const event = normalizeEvent(body.event);
  if (!event) return bad("event must be viewed or printed");

  const ref = adminDb.collection("planningDispatches").doc(dispatchId);
  const snap = await ref.get();
  if (!snap.exists) {
    return json(404, { ok: false, error: "Dispatch not found" });
  }

  const data = snap.data() as Record<string, unknown>;
  if (normalizeText(data.tenantId) !== auth.tenantId) {
    return json(404, { ok: false, error: "Dispatch not found" });
  }

  if (!canInspect) {
    const allowedAgentIds = await resolveAllowedAgentIds(
      auth.tenantId,
      auth.uid,
      auth.email
    );

    if (!allowedAgentIds.includes(String(data.agentId ?? ""))) {
      return json(403, { ok: false, error: "Forbidden" });
    }
  }

  const actorName =
    auth.name ??
    normalizeText(auth.email) ??
    normalizeText(data.agentName) ??
    "Utilisateur";
  const actorEmail = normalizeText(auth.email);
  const update: Record<string, unknown> = {};

  if (event === "viewed") {
    update.lastViewedAt = FieldValue.serverTimestamp();
    update.viewedCount = FieldValue.increment(1);
    update.viewedByUid = auth.uid;
    update.viewedByName = actorName;
    update.viewedByEmail = actorEmail;

    if (!toIso(data.viewedAt)) {
      update.viewedAt = FieldValue.serverTimestamp();
    }
  }

  if (event === "printed") {
    if (!toIso(data.viewedAt)) {
      update.viewedAt = FieldValue.serverTimestamp();
      update.lastViewedAt = FieldValue.serverTimestamp();
      update.viewedByUid = auth.uid;
      update.viewedByName = actorName;
      update.viewedByEmail = actorEmail;
    }

    update.lastPrintedAt = FieldValue.serverTimestamp();
    update.printedCount = FieldValue.increment(1);
    update.printedByUid = auth.uid;
    update.printedByName = actorName;
    update.printedByEmail = actorEmail;

    if (!toIso(data.printedAt)) {
      update.printedAt = FieldValue.serverTimestamp();
    }
  }

  await ref.set(update, { merge: true });

  if (event === "printed") {
    await logActivity({
      tenantId: auth.tenantId,
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      actorRole: auth.role ?? null,
      action: "planning.dispatch.printed",
      entityType: "assignment",
      entityId: dispatchId,
      message: `PDF planning agent ouvert/imprime par ${actorName}`,
      severity: "info",
      meta: {
        dispatchId,
        agentId: normalizeText(data.agentId),
        agentName: normalizeText(data.agentName),
        fromIso: normalizeText(data.fromIso),
        toIso: normalizeText(data.toIso),
      },
    });
  }

  const updatedSnap = await ref.get();
  const updated = updatedSnap.data() as Record<string, unknown>;

  return json(200, {
    ok: true,
    event,
    telemetry: {
      viewedAtIso: toIso(updated.viewedAt),
      lastViewedAtIso: toIso(updated.lastViewedAt),
      viewedCount: Number(updated.viewedCount ?? 0),
      printedAtIso: toIso(updated.printedAt),
      lastPrintedAtIso: toIso(updated.lastPrintedAt),
      printedCount: Number(updated.printedCount ?? 0),
    },
  });
}
