import { adminDb } from "@/lib/firebase/admin";
import { FieldPath, FieldValue, Timestamp } from "firebase-admin/firestore";
import { canReadBackoffice, isAgentRole } from "@/lib/auth/role";
import { computeAgentCompliance } from "@/lib/agents/compliance";

/* ================= types ================= */

export type VacationStatus =
  | "planned"
  | "partially_filled"
  | "filled"
  | "closed"
  | "cancelled";

export type AssignmentStatus =
  | "assigned"
  | "cancelled"
  | "present"
  | "absent"
  | "replaced";

/* ================= generic helpers ================= */

export function toIso(ts: unknown): string | null {
  const t = ts as { toDate?: () => Date } | null | undefined;
  return t && typeof t.toDate === "function"
    ? t.toDate().toISOString()
    : null;
}

export function toTs(date: Date) {
  return Timestamp.fromDate(date);
}

export function normalizeText(v: unknown) {
  return String(v ?? "").trim();
}

export function parseDateTimeIso(v: unknown): Date | null {
  const s = normalizeText(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function safeArr(v: unknown): string[] {
  return Array.isArray(v)
    ? (v.filter((x) => typeof x === "string") as string[])
    : [];
}

export function uniq(arr: string[]) {
  return Array.from(new Set(arr.map((x) => String(x)).filter(Boolean)));
}

export function parseIntSafe(v: unknown, def: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.floor(n);
}

export function parseMax(v: string | null, def = 50) {
  const n = Number(v ?? "");
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), 200);
}

export function chunk<T>(arr: T[], size = 10): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function tsToDate(ts: unknown): Date | null {
  const d = (ts as { toDate?: () => Date })?.toDate?.();
  return d && typeof d.getTime === "function" && Number.isFinite(d.getTime())
    ? d
    : null;
}

export function displayNameFromVacation(v: Record<string, unknown> | null) {
  return v?.siteName ?? v?.title ?? "—";
}

/* ================= status helpers ================= */

export function asVacationStatus(v: unknown): VacationStatus {
  const s = String(v ?? "").toLowerCase().trim();
  if (
    s === "planned" ||
    s === "partially_filled" ||
    s === "filled" ||
    s === "closed" ||
    s === "cancelled"
  ) {
    return s;
  }
  return "planned";
}

export function computeStatus(
  requiredAgents: number,
  assignedCount: number
): VacationStatus {
  if (requiredAgents <= 0 || assignedCount <= 0) return "planned";
  if (assignedCount >= requiredAgents) return "filled";
  return "partially_filled";
}

export function isFinalStatusStr(s: string) {
  return s === "closed" || s === "cancelled";
}

/* ================= firestore/index helpers ================= */

export function isMissingIndexError(e: unknown) {
  const err = e as { message?: string; details?: string; code?: number };
  const msg = String(err?.message ?? "");
  const details = String(err?.details ?? "");
  const code = err?.code;

  return (
    code === 9 ||
    msg.includes("FAILED_PRECONDITION") ||
    details.includes("FAILED_PRECONDITION") ||
    msg.toLowerCase().includes("requires an index") ||
    details.toLowerCase().includes("requires an index")
  );
}

export function extractIndexUrl(e: unknown): string | null {
  const err = e as { message?: string; details?: string };
  const blob = `${String(err?.message ?? "")}\n${String(err?.details ?? "")}`;
  const m = blob.match(/https:\/\/console\.firebase\.google\.com\/[^\s]+/);
  return m?.[0] ?? null;
}

/* ================= site / agent validation ================= */

export async function assertSiteBelongsToTenant(
  siteId: string,
  tenantId: string
) {
  const snap = await adminDb.collection("sites").doc(siteId).get();
  if (!snap.exists) return { ok: false as const, error: "Site not found" };

  const data = snap.data() as Record<string, unknown>;
  if (data?.tenantId !== tenantId) {
    return { ok: false as const, error: "Site not found" };
  }

  return { ok: true as const, site: data };
}

export async function validateAssignedAgentsForSite(input: {
  tenantId: string;
  siteId: string;
  assignedAgentIds: string[];
  requiredQualification?: string | null;
}) {
  const { tenantId, siteId } = input;
  const ids = uniq(input.assignedAgentIds).slice(0, 200);

  const siteCheck = await assertSiteBelongsToTenant(siteId, tenantId);
  if (!siteCheck.ok) {
    return {
      ok: false as const,
      error: siteCheck.error,
      rejected: ids.map((id) => ({ id, reason: "site_not_found" })),
    };
  }

  if (ids.length === 0) {
    return {
      ok: true as const,
      site: siteCheck.site,
      validIds: [],
      rejected: [] as Array<{ id: string; reason: string }>,
      warnings: [] as Array<{ id: string; reason: string; message: string }>,
    };
  }

  const allowedOnSite = new Set<string>(safeArr(siteCheck.site?.agentIds));
  const rejected: Array<{ id: string; reason: string }> = [];

  const idsAllowed = ids.filter((id) => {
    if (!allowedOnSite.has(id)) {
      rejected.push({ id, reason: "agent_not_allowed_on_site" });
      return false;
    }
    return true;
  });

  if (idsAllowed.length === 0) {
    return {
      ok: true as const,
      site: siteCheck.site,
      validIds: [],
      rejected,
      warnings: [] as Array<{ id: string; reason: string; message: string }>,
    };
  }

  const valid: string[] = [];
  const warnings: Array<{ id: string; reason: string; message: string }> = [];

  for (const part of chunk(idsAllowed, 10)) {
    const snap = await adminDb
      .collection("agents")
      .where("tenantId", "==", tenantId)
      .where(FieldPath.documentId(), "in", part)
      .get();

    const found = new Map<string, Record<string, unknown>>();
    snap.forEach((d) => found.set(d.id, d.data()));

    for (const id of part) {
      const a = found.get(id);

      if (!a) {
        rejected.push({ id, reason: "agent_not_found" });
        continue;
      }

      const st = String(a?.status ?? "active").toLowerCase();
      if (st !== "active") {
        rejected.push({ id, reason: "agent_inactive" });
        continue;
      }

      const compliance = computeAgentCompliance(a, {
        requiredQualification: input.requiredQualification,
      });

      if (compliance.status === "blocking") {
        const alert = compliance.blockingAlerts[0];
        rejected.push({
          id,
          reason: alert?.code ?? "agent_compliance_blocking",
        });
        continue;
      }

      compliance.alerts
        .filter((alert) => alert.severity !== "info")
        .forEach((alert) => {
          warnings.push({
            id,
            reason: alert.code,
            message: alert.title,
          });
        });

      valid.push(id);
    }
  }

  return {
    ok: true as const,
    site: siteCheck.site,
    validIds: uniq(valid),
    rejected,
    warnings,
  };
}

/* ================= access helpers ================= */

export async function canUserAccessSite(input: {
  tenantId: string;
  uid: string;
  role: string | null | undefined;
  siteId: string | null | undefined;
}) {
  const { tenantId, uid, role, siteId } = input;

  if (canReadBackoffice(role)) return true;
  if (!isAgentRole(role)) return false;
  if (!siteId) return false;

  const snap = await adminDb.collection("sites").doc(siteId).get();
  if (!snap.exists) return false;

  const data = snap.data() as Record<string, unknown>;
  if (data?.tenantId !== tenantId) return false;

  const accessUids = safeArr(data?.accessUids);
  const managerIds = safeArr(data?.managerIds);
  const agentIds = safeArr(data?.agentIds);

  return (
    accessUids.includes(uid) ||
    managerIds.includes(uid) ||
    agentIds.includes(uid)
  );
}

/* ================= vacation loader ================= */

export async function loadVacationOr404(vacationId: string, tenantId: string) {
  const ref = adminDb.collection("vacations").doc(vacationId);
  const snap = await ref.get();

  if (!snap.exists) {
    return {
      ok: false as const,
      error: "Vacation not found",
    };
  }

  const data = snap.data() as Record<string, unknown>;
  if (data?.tenantId !== tenantId) {
    return {
      ok: false as const,
      error: "Vacation not found",
    };
  }

  return {
    ok: true as const,
    ref,
    snap,
    data,
  };
}

/* ================= assignment helpers ================= */

export function assignmentDocId(vacationId: string, agentId: string) {
  return `${vacationId}_${agentId}`;
}

export async function syncAssignmentsForVacation(input: {
  tenantId: string;
  uid: string;
  vacationId: string;
  siteId: string;
  prevAssigned: string[];
  nextAssigned: string[];
}) {
  const { tenantId, uid, vacationId, siteId } = input;

  const prev = new Set(uniq(input.prevAssigned));
  const next = new Set(uniq(input.nextAssigned));

  const toAdd = [...next].filter((x) => !prev.has(x));
  const toCancel = [...prev].filter((x) => !next.has(x));

  if (!toAdd.length && !toCancel.length) return { toAdd: 0, toCancel: 0 };

  const now = FieldValue.serverTimestamp();
  const batch = adminDb.batch();

  toAdd.forEach((agentId) => {
    const ref = adminDb
      .collection("assignments")
      .doc(assignmentDocId(vacationId, agentId));

    batch.set(
      ref,
      {
        tenantId,
        vacationId,
        siteId,
        agentId,
        status: "assigned" as AssignmentStatus,
        createdAt: now,
        createdBy: uid,
        updatedAt: now,
        updatedBy: uid,
      },
      { merge: true }
    );
  });

  toCancel.forEach((agentId) => {
    const ref = adminDb
      .collection("assignments")
      .doc(assignmentDocId(vacationId, agentId));

    batch.set(
      ref,
      {
        status: "cancelled" as AssignmentStatus,
        updatedAt: now,
        updatedBy: uid,
      },
      { merge: true }
    );
  });

  await batch.commit();
  return { toAdd: toAdd.length, toCancel: toCancel.length };
}

/* ================= overlaps ================= */

export async function detectOverlapsForAgents(input: {
  tenantId: string;
  vacationId: string;
  agentIds: string[];
  startAt: Date;
  endAt: Date;
}) {
  const { tenantId, vacationId, startAt, endAt } = input;
  const agentIds = uniq(input.agentIds).slice(0, 200);
  if (!agentIds.length) return [];

  const byAgent = new Map<string, Set<string>>();
  agentIds.forEach((a) => byAgent.set(a, new Set()));

  const snaps = await Promise.all(
    agentIds.map((agentId) =>
      adminDb
        .collection("assignments")
        .where("tenantId", "==", tenantId)
        .where("agentId", "==", agentId)
        .get()
    )
  );

  snaps.forEach((snap, idx) => {
    const agentId = agentIds[idx];
    const set = byAgent.get(agentId)!;

    snap.docs.forEach((d) => {
      const a = d.data() as Record<string, unknown>;
      const vid = String(a?.vacationId ?? "").trim();
      if (!vid || vid === vacationId) return;

      const st = String(a?.status ?? "assigned").toLowerCase();
      if (st === "cancelled") return;

      set.add(vid);
    });
  });

  const allVacationIds = uniq(
    Array.from(byAgent.values()).flatMap((s) => Array.from(s))
  );
  if (!allVacationIds.length) return [];

  const vacData = new Map<string, Record<string, unknown>>();

  for (const part of chunk(allVacationIds, 200)) {
    const refs = part.map((id) => adminDb.collection("vacations").doc(id));
    const vs = await adminDb.getAll(...refs);

    vs.forEach((s, i) => {
      if (s.exists) vacData.set(part[i], s.data() as Record<string, unknown>);
    });
  }

  const overlaps: Array<{
    agentId: string;
    withVacationId: string;
    withSiteId?: string | null;
    withSiteName?: string | null;
    withStatus?: string;
    withStartAtIso?: string | null;
    withEndAtIso?: string | null;
  }> = [];

  const startMs = startAt.getTime();
  const endMs = endAt.getTime();

  for (const agentId of agentIds) {
    const vids = Array.from(byAgent.get(agentId) ?? []);

    for (const vid of vids) {
      const v = vacData.get(vid);
      if (!v) continue;

      const st = String(asVacationStatus(v?.status));
      if (st === "cancelled") continue;

      const s = tsToDate(v?.startAt);
      const e = tsToDate(v?.endAt);
      if (!s || !e) continue;

      if (s.getTime() < endMs && e.getTime() > startMs) {
        overlaps.push({
          agentId,
          withVacationId: vid,
          withSiteId: (v?.siteId as string | undefined) ?? null,
          withSiteName: (v?.siteName as string | undefined) ?? (v?.title as string | undefined) ?? null,
          withStatus: st,
          withStartAtIso: toIso(v?.startAt),
          withEndAtIso: toIso(v?.endAt),
        });
      }
    }
  }

  return overlaps;
}

/* ================= pickers ================= */

export function pickVacationApi(d: Record<string, unknown>, id: string) {
  const siteName = (d.siteName as string | undefined) ?? (d.title as string | undefined) ?? null;

  return {
    id,
    tenantId: d.tenantId as string,
    siteId: (d.siteId as string | undefined) ?? null,
    siteName,
    title: (d.title as string | undefined) ?? null,
    missionType: (d.missionType as string | undefined) ?? null,
    status: asVacationStatus(d.status),
    requiredAgents: Number.isFinite(Number(d.requiredAgents))
      ? Number(d.requiredAgents)
      : 1,
    assignedAgentIds: safeArr(d.assignedAgentIds),
    startAtIso: toIso(d.startAt) as string | null,
    endAtIso: toIso(d.endAt) as string | null,
    createdAtIso: toIso(d.createdAt) as string | null,
    updatedAtIso: toIso(d.updatedAt) as string | null,
    publishedAtIso: toIso(d.publishedAt) as string | null,
    notes: (d.notes as string | undefined) ?? null,
    requiredQualification: (d.requiredQualification as string | undefined) ?? null,
    isPublished: !!d.isPublished,
  };
}
