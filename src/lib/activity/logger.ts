// src/lib/activity/logger.ts
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

export type ActivityEntityType =
  | "agent"
  | "site"
  | "vacation"
  | "incident"
  | "user"
  | "billing"
  | "system";

export type ActivityAction =
  | "agent.created"
  | "agent.updated"
  | "agent.deactivated"
  | "agent.activated"
  | "site.created"
  | "site.updated"
  | "site.archived"
  | "vacation.created"
  | "vacation.updated"
  | "vacation.cancelled"
  | "assignment.synced"
  | "incident.created"
  | "incident.updated"
  | "incident.closed"
  | "incident.deleted"
  | "billing.limit_reached"
  | "system.info";

export type LogActivityInput = {
  tenantId: string;

  actorUid: string;
  actorEmail?: string | null;
  actorRole?: string | null;

  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId?: string | null;

  message: string; // texte lisible UI
  meta?: Record<string, any>;

  // optionnel : aide au tri UI
  severity?: "info" | "warning" | "critical";
};

function safeTrim(v: any) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function safeObj(v: any) {
  if (!v || typeof v !== "object") return {};
  // éviter fonctions / prototypes bizarres
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return {};
  }
}

/**
 * Ecrit 1 entrée d’activité dans Firestore
 * Collection: activity (top-level)
 * Requêtes: where(tenantId==) + orderBy(createdAt desc)
 */
export async function logActivity(input: LogActivityInput) {
  const payload = {
    tenantId: input.tenantId,

    actorUid: input.actorUid,
    actorEmail: safeTrim(input.actorEmail),
    actorRole: safeTrim(input.actorRole),

    action: input.action,
    entityType: input.entityType,
    entityId: safeTrim(input.entityId),

    message: input.message,
    meta: safeObj(input.meta),

    severity: input.severity ?? "info",

    createdAt: FieldValue.serverTimestamp(),
  };

  // ne jamais casser l’API métier si l’activity échoue
  try {
    await adminDb.collection("activity").add(payload);
    return { ok: true as const };
  } catch (e: any) {
    console.error("[logActivity] failed", e?.message ?? e);
    return { ok: false as const, error: e?.message ?? String(e) };
  }
}
