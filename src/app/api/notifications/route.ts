import { NextRequest, NextResponse } from "next/server";
import { FieldPath, FieldValue } from "firebase-admin/firestore";

import {
  canReadBackoffice,
  requireTenantUser,
} from "@/app/api/_utils/withTenant";
import { adminDb } from "@/lib/firebase/admin";
import { ensureComplianceReminderNotifications } from "@/lib/notifications/compliance-reminders";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function safeArr(value: unknown) {
  return Array.isArray(value)
    ? value.map((entry) => clean(entry)).filter(Boolean)
    : [];
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value || null;
  if (value instanceof Date) return value.toISOString();

  const timestamp = value as { toDate?: () => Date };
  if (typeof timestamp.toDate === "function") {
    return timestamp.toDate().toISOString();
  }

  return null;
}

function pickNotification(
  doc: FirebaseFirestore.QueryDocumentSnapshot,
  uid: string
) {
  const data = doc.data() as Record<string, unknown>;
  const readBy =
    data.readBy && typeof data.readBy === "object"
      ? (data.readBy as Record<string, unknown>)
      : {};

  return {
    id: doc.id,
    type: clean(data.type) || "info",
    severity: clean(data.severity) || "info",
    title: clean(data.title) || "Notification",
    message: clean(data.message) || null,
    href: clean(data.href) || null,
    sourceId: clean(data.sourceId) || null,
    createdAtIso: toIso(data.createdAt) ?? clean(data.createdAtIso) ?? null,
    read: readBy[uid] === true,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;
  if (!canReadBackoffice(auth.role)) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  await ensureComplianceReminderNotifications(auth.tenantId).catch((error) => {
    console.error("[notifications.reminders]", error);
  });

  const snap = await adminDb
    .collection("notifications")
    .where("tenantId", "==", auth.tenantId)
    .limit(120)
    .get();

  const items = snap.docs
    .map((doc) => pickNotification(doc, auth.uid))
    .sort((left, right) => {
      const l = left.createdAtIso ? new Date(left.createdAtIso).getTime() : 0;
      const r = right.createdAtIso ? new Date(right.createdAtIso).getTime() : 0;
      return r - l;
    })
    .slice(0, 25);

  return json(200, {
    ok: true,
    unreadCount: items.filter((item) => !item.read).length,
    items,
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;
  if (!canReadBackoffice(auth.role)) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  const markAll = body.markAll === true;
  const ids = safeArr(body.ids);

  if (!markAll && ids.length === 0) {
    return json(400, { ok: false, error: "ids or markAll are required" });
  }

  let targetIds = ids;
  if (markAll) {
    const snap = await adminDb
      .collection("notifications")
      .where("tenantId", "==", auth.tenantId)
      .limit(120)
      .get();
    targetIds = snap.docs.map((doc) => doc.id);
  } else {
    const refs = targetIds
      .slice(0, 120)
      .map((id) => adminDb.collection("notifications").doc(id));
    const snaps = refs.length > 0 ? await adminDb.getAll(...refs) : [];
    targetIds = snaps
      .filter((snap) => {
        const data = snap.data() as Record<string, unknown> | undefined;
        return snap.exists && data?.tenantId === auth.tenantId;
      })
      .map((snap) => snap.id);
  }

  if (targetIds.length === 0) {
    return json(200, { ok: true, updated: 0 });
  }

  const batch = adminDb.batch();
  targetIds.slice(0, 120).forEach((id) => {
    const ref = adminDb.collection("notifications").doc(id);
    batch.update(
      ref,
      new FieldPath("readBy", auth.uid),
      true,
      new FieldPath("readAtBy", auth.uid),
      FieldValue.serverTimestamp()
    );
  });

  await batch.commit();

  return json(200, {
    ok: true,
    updated: targetIds.length,
  });
}
