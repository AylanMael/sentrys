import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";

export type PlatformAuditTone = "info" | "warning" | "critical";

export type PlatformAuditEvent = {
  id: string;
  action: string;
  actionLabel: string;
  tenantId: string | null;
  tenantName: string | null;
  actorUid: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  reason: string | null;
  status: string;
  tone: PlatformAuditTone;
  createdAtIso: string | null;
  metadata: Record<string, unknown>;
};

export type WritePlatformAuditEventInput = {
  action: string;
  actionLabel: string;
  tenantId?: string | null;
  tenantName?: string | null;
  actorUid?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  reason: string;
  status?: string;
  tone?: PlatformAuditTone;
  metadata?: Record<string, unknown>;
};

const AUDIT_COLLECTION = "platformAuditLog";

function text(value: unknown, fallback = "") {
  const str = String(value ?? "").trim();
  return str || fallback;
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

function toMillis(value: unknown): number {
  const iso = toIso(value);
  if (!iso) return 0;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.getTime() : 0;
}

function safeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  try {
    const json = JSON.stringify(value);
    if (json.length > 20_000) {
      return {
        truncated: true,
        originalApproxBytes: json.length,
      };
    }

    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function toAuditEvent(
  doc: FirebaseFirestore.QueryDocumentSnapshot
): PlatformAuditEvent {
  const data = doc.data() as Record<string, unknown>;
  const actor = data.actor as Record<string, unknown> | undefined;

  return {
    id: doc.id,
    action: text(data.action, "unknown"),
    actionLabel: text(data.actionLabel, "Action plateforme"),
    tenantId: text(data.tenantId) || null,
    tenantName: text(data.tenantName) || null,
    actorUid: text(actor?.uid) || text(data.actorUid) || null,
    actorEmail: text(actor?.email) || text(data.actorEmail) || null,
    actorRole: text(actor?.role) || text(data.actorRole) || null,
    reason: text(data.reason) || null,
    status: text(data.status, "recorded"),
    tone: (text(data.tone, "info") as PlatformAuditTone) || "info",
    createdAtIso: toIso(data.createdAt),
    metadata: safeMetadata(data.metadata),
  };
}

export async function listPlatformAuditEvents(input: {
  tenantId?: string | null;
  limit?: number;
} = {}) {
  const limit = Math.min(Math.max(input.limit ?? 8, 1), 50);
  const tenantId = text(input.tenantId);
  const collection = adminDb.collection(AUDIT_COLLECTION);

  if (tenantId) {
    const snapshot = await collection
      .where("tenantId", "==", tenantId)
      .limit(Math.max(limit * 4, limit))
      .get();

    return snapshot.docs
      .sort((left, right) => {
        return toMillis(right.data().createdAt) - toMillis(left.data().createdAt);
      })
      .slice(0, limit)
      .map(toAuditEvent);
  }

  try {
    const snapshot = await collection
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    return snapshot.docs.map(toAuditEvent);
  } catch {
    const snapshot = await collection.limit(Math.max(limit * 4, limit)).get();

    return snapshot.docs
      .sort((left, right) => {
        return toMillis(right.data().createdAt) - toMillis(left.data().createdAt);
      })
      .slice(0, limit)
      .map(toAuditEvent);
  }
}

export async function writePlatformAuditEvent(
  input: WritePlatformAuditEventInput
) {
  const reason = text(input.reason);
  if (reason.length < 8) {
    throw new Error("Motif obligatoire de 8 caracteres minimum.");
  }

  const payload = {
    action: text(input.action, "platform.note"),
    actionLabel: text(input.actionLabel, "Note support plateforme"),
    tenantId: text(input.tenantId) || null,
    tenantName: text(input.tenantName) || null,
    actor: {
      uid: text(input.actorUid) || null,
      email: text(input.actorEmail) || null,
      role: text(input.actorRole) || null,
    },
    reason,
    status: text(input.status, "recorded"),
    tone: text(input.tone, "info"),
    metadata: safeMetadata(input.metadata),
    createdAt: FieldValue.serverTimestamp(),
  };

  const ref = await adminDb.collection(AUDIT_COLLECTION).add(payload);
  const snap = await ref.get();

  return toAuditEvent(snap as FirebaseFirestore.QueryDocumentSnapshot);
}
