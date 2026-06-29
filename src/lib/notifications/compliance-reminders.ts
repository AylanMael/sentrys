import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";

type ReminderRule = {
  key: string;
  minAgeDays: number;
  severity: "warning" | "critical";
  title: string;
};

const DAY_MS = 86_400_000;

const REMINDER_RULES: ReminderRule[] = [
  {
    key: "d3",
    minAgeDays: 3,
    severity: "warning",
    title: "Exception conformite ouverte depuis 3 jours",
  },
  {
    key: "d7",
    minAgeDays: 7,
    severity: "critical",
    title: "Relance forte conformite apres 7 jours",
  },
  {
    key: "d14",
    minAgeDays: 14,
    severity: "critical",
    title: "Escalade conformite apres 14 jours",
  },
];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  const timestamp = value as { toDate?: () => Date };
  if (typeof timestamp.toDate === "function") {
    const date = timestamp.toDate();
    return Number.isFinite(date.getTime()) ? date : null;
  }

  return null;
}

function resolutionStatus(value: unknown) {
  const status = clean(value);
  return status || "to_regularize";
}

function dueRules(ageDays: number) {
  return REMINDER_RULES.filter((rule) => ageDays >= rule.minAgeDays);
}

function chunk<T>(items: T[], size: number) {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

export async function ensureComplianceReminderNotifications(tenantId: string) {
  const snap = await adminDb
    .collection("planningDispatches")
    .where("tenantId", "==", tenantId)
    .limit(500)
    .get();

  const now = new Date();
  const candidates = snap.docs.flatMap((doc) => {
    const data = doc.data() as Record<string, unknown>;
    if (data.complianceOverride !== true) return [];
    if (resolutionStatus(data.complianceResolutionStatus) !== "to_regularize") {
      return [];
    }

    const createdAt =
      toDate(data.sentAt) ?? toDate(data.sentAtIso) ?? toDate(data.createdAt);
    if (!createdAt) return [];

    const ageDays = Math.floor((now.getTime() - createdAt.getTime()) / DAY_MS);
    if (ageDays < REMINDER_RULES[0].minAgeDays) return [];

    const agentId = clean(data.agentId);
    const agentName = clean(data.agentName) || "Agent";
    const detail =
      clean(data.complianceOverrideDetail) || "Dossier agent a regulariser.";
    const reason = clean(data.complianceOverrideReason);

    return dueRules(ageDays).map((rule) => {
      const notificationId = `compliance-reminder-${doc.id}-${rule.key}`;

      return {
        ref: adminDb.collection("notifications").doc(notificationId),
        payload: {
          tenantId,
          type: "compliance_reminder",
          severity: rule.severity,
          title: rule.title,
          message: `${agentName} - ${detail}${reason ? ` Motif initial: ${reason}` : ""}`,
          href: agentId
            ? `/dashboard/conformite?agentId=${agentId}`
            : "/dashboard/conformite",
          sourceId: doc.id,
          agentId: agentId || null,
          agentName,
          dispatchId: doc.id,
          reminderKey: rule.key,
          reminderAgeDays: ageDays,
          createdByUid: "system",
          createdByEmail: null,
          readBy: {},
          readAtBy: {},
          createdAt: FieldValue.serverTimestamp(),
        },
      };
    });
  });

  if (candidates.length === 0) {
    return { created: 0 };
  }

  const existingIds = new Set<string>();
  for (const part of chunk(candidates, 200)) {
    const snaps = await adminDb.getAll(...part.map((candidate) => candidate.ref));
    snaps.forEach((snap) => {
      if (snap.exists) existingIds.add(snap.id);
    });
  }

  const toCreate = candidates.filter(
    (candidate) => !existingIds.has(candidate.ref.id)
  );

  for (const part of chunk(toCreate, 450)) {
    const batch = adminDb.batch();
    part.forEach((candidate) => {
      batch.set(candidate.ref, candidate.payload);
    });
    await batch.commit();
  }

  return { created: toCreate.length };
}
