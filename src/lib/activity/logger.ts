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

export type ActivitySeverity = "info" | "warning" | "critical";

export type LogActivityInput = {
  tenantId: string;

  actorUid: string;
  actorEmail?: string | null;
  actorRole?: string | null;

  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId?: string | null;

  message: string;
  meta?: Record<string, any>;

  severity?: ActivitySeverity;
};

function safeTrim(v: any): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function safeString(v: any): string {
  return String(v ?? "").trim();
}

function safeObj(v: any): Record<string, any> {
  if (!v || typeof v !== "object") return {};
  try {
    // enlève fonctions, dates non serializables, prototypes bizarres, etc.
    return JSON.parse(JSON.stringify(v));
  } catch {
    return {};
  }
}

function approxJsonBytes(obj: any): number {
  try {
    // approximation suffisante (UTF-16 => sous-estime un peu parfois, ok)
    return JSON.stringify(obj).length;
  } catch {
    return 0;
  }
}

/**
 * Firestore doc limit ~ 1MiB.
 * On limite volontairement meta à une taille raisonnable.
 */
function clampMeta(meta: Record<string, any>, maxBytes = 30_000) {
  if (!meta || typeof meta !== "object") return {};
  let m = meta;
  let size = approxJsonBytes(m);
  if (size <= maxBytes) return m;

  // fallback simple: on garde une version réduite + une note
  const reduced: Record<string, any> = {
    _truncated: true,
    _originalApproxBytes: size,
  };

  // On copie quelques clés “safe”
  const entries = Object.entries(m);
  for (const [k, v] of entries.slice(0, 25)) {
    // éviter sous-objets gigantesques
    if (typeof v === "string" && v.length > 500) reduced[k] = v.slice(0, 500) + "…";
    else if (typeof v === "number" || typeof v === "boolean" || v === null) reduced[k] = v;
    else if (Array.isArray(v)) reduced[k] = v.slice(0, 20);
    else if (typeof v === "object") reduced[k] = "[object]";
    else reduced[k] = String(v);
  }

  // si encore trop gros, on coupe davantage
  if (approxJsonBytes(reduced) > maxBytes) {
    return {
      _truncated: true,
      _originalApproxBytes: size,
      _note: "meta too large",
    };
  }

  return reduced;
}

function assertRequired(label: string, v: any) {
  const s = safeString(v);
  if (!s) throw new Error(`[logActivity] missing ${label}`);
  return s;
}

/**
 * Écrit 1 entrée d’activité dans Firestore.
 * Collection: activity
 * Requêtes: where(tenantId==) + orderBy(createdAt desc)
 *
 * ⚠️ Non-bloquant: ne doit jamais casser l’API métier.
 */
export async function logActivity(input: LogActivityInput) {
  // validations “hard” (mais catch plus bas => non bloquant)
  const tenantId = assertRequired("tenantId", input.tenantId);
  const actorUid = assertRequired("actorUid", input.actorUid);
  const message = assertRequired("message", input.message);

  const payload = {
    tenantId,

    actorUid,
    actorEmail: safeTrim(input.actorEmail),
    actorRole: safeTrim(input.actorRole),

    action: input.action,
    entityType: input.entityType,
    entityId: safeTrim(input.entityId),

    message,
    meta: clampMeta(safeObj(input.meta), 30_000),

    severity: (input.severity ?? "info") as ActivitySeverity,

    createdAt: FieldValue.serverTimestamp(),
  };

  try {
    const ref = await adminDb.collection("activity").add(payload);
    return { ok: true as const, id: ref.id };
  } catch (e: any) {
    console.error("[logActivity] failed", e?.message ?? e);
    return { ok: false as const, error: e?.message ?? String(e) };
  }
}
