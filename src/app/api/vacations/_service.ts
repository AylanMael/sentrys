// src/app/api/vacations/_service.ts
import { adminDb } from "@/lib/firebase/admin";
import { FieldPath, FieldValue, WriteBatch } from "firebase-admin/firestore";
import { logActivity } from "@/lib/activity/logger";
import {
  safeArr,
  uniq,
  toIso,
  tsToDate,
  asVacationStatus,
} from "@/app/api/vacations/_shared";
import {
  canReadBackoffice,
  isAgentRole,
} from "@/lib/auth/role";
import { computeAgentCompliance } from "@/lib/agents/compliance";

type AssignmentStatus =
  | "assigned"
  | "cancelled"
  | "present"
  | "absent"
  | "replaced";

export function assignmentDocId(vacationId: string, agentId: string) {
  return `${vacationId}_${agentId}`;
}

export async function safeLogActivity(payload: any) {
  try {
    await logActivity(payload);
  } catch (e) {
    console.warn("[activity.log] failed (non-blocking)", e);
  }
}

export async function assertSiteBelongsToTenant(siteId: string, tenantId: string) {
  const snap = await adminDb.collection("sites").doc(siteId).get();
  if (!snap.exists) return { ok: false as const, error: "Site not found" };

  const data = snap.data() as any;
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
      rejected: [] as any[],
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

  for (let i = 0; i < idsAllowed.length; i += 10) {
    const part = idsAllowed.slice(i, i + 10);

    const snap = await adminDb
      .collection("agents")
      .where("tenantId", "==", tenantId)
      .where(FieldPath.documentId(), "in", part)
      .get();

    const found = new Map<string, any>();
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

export async function listAccessibleSiteIdsForUser(input: {
  tenantId: string;
  uid: string;
}) {
  const { tenantId, uid } = input;

  const snap = await adminDb
    .collection("sites")
    .where("tenantId", "==", tenantId)
    .limit(1000)
    .get();

  const allowed = new Set<string>();

  snap.docs.forEach((doc) => {
    const d = doc.data() as any;
    const accessUids = safeArr(d?.accessUids);
    const managerIds = safeArr(d?.managerIds);
    const agentIds = safeArr(d?.agentIds);

    if (
      accessUids.includes(uid) ||
      managerIds.includes(uid) ||
      agentIds.includes(uid)
    ) {
      allowed.add(doc.id);
    }
  });

  return allowed;
}

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

  const data = snap.data() as any;
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

export async function createAssignmentsForVacation(input: {
  tenantId: string;
  uid: string;
  vacationId: string;
  siteId: string;
  assignedAgentIds: string[];
  batch?: WriteBatch;
}) {
  const { tenantId, uid, vacationId, siteId, batch } = input;
  const ids = uniq(input.assignedAgentIds);

  if (!ids.length) return { created: 0 };

  const now = FieldValue.serverTimestamp();
  const activeBatch = batch ?? adminDb.batch();

  ids.forEach((agentId) => {
    const ref = adminDb
      .collection("assignments")
      .doc(assignmentDocId(vacationId, agentId));

    activeBatch.set(
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

  if (!batch) {
    await activeBatch.commit();
  }
  return { created: ids.length };
}

export async function syncAssignmentsForVacation(input: {
  tenantId: string;
  uid: string;
  vacationId: string;
  siteId: string;
  prevAssigned: string[];
  nextAssigned: string[];
  batch?: WriteBatch;
}) {
  const { tenantId, uid, vacationId, siteId, batch } = input;

  const prev = new Set(uniq(input.prevAssigned));
  const next = new Set(uniq(input.nextAssigned));

  const toAdd = [...next].filter((x) => !prev.has(x));
  const toCancel = [...prev].filter((x) => !next.has(x));

  if (!toAdd.length && !toCancel.length) return { toAdd: 0, toCancel: 0 };

  const now = FieldValue.serverTimestamp();
  const activeBatch = batch ?? adminDb.batch();

  toAdd.forEach((agentId) => {
    const ref = adminDb
      .collection("assignments")
      .doc(assignmentDocId(vacationId, agentId));

    activeBatch.set(
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

    activeBatch.set(
      ref,
      {
        status: "cancelled" as AssignmentStatus,
        updatedAt: now,
        updatedBy: uid,
      },
      { merge: true }
    );
  });

  if (!batch) {
    await activeBatch.commit();
  }
  return { toAdd: toAdd.length, toCancel: toCancel.length };
}

export async function loadVacationOr404(id: string, tenantId: string) {
  const ref = adminDb.collection("vacations").doc(id);
  const snap = await ref.get();

  if (!snap.exists) {
    return { ok: false as const, status: 404, error: "Not found" };
  }

  const data = snap.data() as any;
  if (data?.tenantId !== tenantId) {
    return { ok: false as const, status: 404, error: "Not found" };
  }

  return { ok: true as const, ref, snap, data };
}

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
      const a = d.data() as any;
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

  const vacData = new Map<string, any>();
  for (let i = 0; i < allVacationIds.length; i += 200) {
    const part = allVacationIds.slice(i, i + 200);
    const refs = part.map((id) => adminDb.collection("vacations").doc(id));
    const vs = await adminDb.getAll(...refs);

    vs.forEach((s, index) => {
      if (s.exists) vacData.set(part[index], s.data());
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
          withSiteId: v?.siteId ?? null,
          withSiteName: v?.siteName ?? v?.title ?? null,
          withStatus: st,
          withStartAtIso: toIso(v?.startAt),
          withEndAtIso: toIso(v?.endAt),
        });
      }
    }
  }

  return overlaps;
}
