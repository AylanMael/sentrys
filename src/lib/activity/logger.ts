import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { logActivityInputSchema, type LogActivityInput } from "@/lib/validators/activity";

export type { LogActivityInput };

function safeObj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object") return {};
  try {
    return JSON.parse(JSON.stringify(v)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function approxJsonBytes(obj: unknown): number {
  try {
    return JSON.stringify(obj).length;
  } catch {
    return 0;
  }
}

function clampMeta(meta: Record<string, unknown>, maxBytes = 30_000): Record<string, unknown> {
  if (!meta || typeof meta !== "object") return {};
  const size = approxJsonBytes(meta);
  if (size <= maxBytes) return meta;

  const reduced: Record<string, unknown> = {
    _truncated: true,
    _originalApproxBytes: size,
  };

  const entries = Object.entries(meta);
  for (const [k, v] of entries.slice(0, 25)) {
    if (typeof v === "string" && v.length > 500) {
      reduced[k] = v.slice(0, 500) + "…";
    } else if (typeof v === "number" || typeof v === "boolean" || v === null) {
      reduced[k] = v;
    } else if (Array.isArray(v)) {
      reduced[k] = v.slice(0, 20);
    } else if (typeof v === "object") {
      reduced[k] = "[object]";
    } else {
      reduced[k] = String(v);
    }
  }

  return reduced;
}

/**
 * Standardized logging utility for the SENTRYS platform.
 * Ensures data integrity and multi-tenant isolation.
 */
export async function logActivity(input: LogActivityInput) {
  try {
    const result = logActivityInputSchema.safeParse(input);

    if (!result.success) {
      console.error("[logActivity] validation failed", result.error.format());
      return { ok: false as const, error: "Validation failed" };
    }

    const data = result.data;

    const payload = {
      ...data,
      meta: clampMeta(safeObj(data.meta), 30_000),
      createdAt: FieldValue.serverTimestamp(),
    };

    const ref = await adminDb.collection("activity").add(payload);
    return { ok: true as const, id: ref.id };
  } catch (e: unknown) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error("[logActivity] internal error", errorMsg);
    return { ok: false as const, error: errorMsg };
  }
}
