import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireTenantUser, canWrite } from "@/app/api/_utils/withTenant";
import { logActivity } from "@/lib/activity/logger";
import {
  computeStatus,
  parseDateTimeIso,
  safeArr,
  toTs,
  tsToDate,
  uniq,
} from "@/app/api/vacations/_shared";
import {
  validateAssignedAgentsForSite,
  createAssignmentsForVacation,
  syncAssignmentsForVacation,
  detectOverlapsForAgents,
} from "@/app/api/vacations/_service";

export const runtime = "nodejs";

function hasOwn(data: unknown, key: string) {
  return !!data && Object.prototype.hasOwnProperty.call(data, key);
}

function isPositiveDateRange(start: Date | null, end: Date | null) {
  return !!start && !!end && end.getTime() > start.getTime();
}

export async function POST(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  let body: { operations: any[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { operations } = body;
  if (!Array.isArray(operations)) return NextResponse.json({ ok: false, error: "operations must be an array" }, { status: 400 });

  const results = [];
  const plannedByAgent = new Map<
    string,
    Array<{ vacationId: string; startAt: Date; endAt: Date }>
  >();

  const detectPlannedOverlaps = (
    vacationId: string,
    agentIds: string[],
    startAt: Date,
    endAt: Date
  ) => {
    const overlaps: Array<{
      agentId: string;
      withVacationId: string;
      withStartAtIso: string;
      withEndAtIso: string;
      source: "bulk_pending";
    }> = [];

    uniq(agentIds).forEach((agentId) => {
      const planned = plannedByAgent.get(agentId) ?? [];
      planned.forEach((item) => {
        if (item.vacationId === vacationId) return;
        if (item.startAt.getTime() < endAt.getTime() && item.endAt.getTime() > startAt.getTime()) {
          overlaps.push({
            agentId,
            withVacationId: item.vacationId,
            withStartAtIso: item.startAt.toISOString(),
            withEndAtIso: item.endAt.toISOString(),
            source: "bulk_pending",
          });
        }
      });
    });

    return overlaps;
  };

  const registerPlannedInterval = (
    vacationId: string,
    agentIds: string[],
    startAt: Date,
    endAt: Date
  ) => {
    uniq(agentIds).forEach((agentId) => {
      const current = plannedByAgent.get(agentId) ?? [];
      current.push({ vacationId, startAt, endAt });
      plannedByAgent.set(agentId, current);
    });
  };

  // -- BATCHING ENGINE --
  let currentBatch = adminDb.batch();
  let batches = [currentBatch];
  let opCount = 0;

  const getBatch = (reserve: number) => {
    if (opCount + reserve >= 490) {
      currentBatch = adminDb.batch();
      batches.push(currentBatch);
      opCount = 0;
    }
    opCount += reserve;
    return currentBatch;
  };

  for (const op of operations) {
    try {
      if (op.type === "update") {
        const { id, data } = op;
        const ref = adminDb.collection("vacations").doc(id);
        const snap = await ref.get();
        if (!snap.exists) {
          results.push({ id, ok: false, error: "Not found" });
          continue;
        }
        const currentData = snap.data() as any;
        if (currentData.tenantId !== auth.tenantId) {
          results.push({ id, ok: false, error: "Forbidden" });
          continue;
        }

        const updates: any = { updatedAt: FieldValue.serverTimestamp(), updatedBy: auth.uid };
        let nextAssigned = (currentData.assignedAgentIds || []).slice(0, 1);
        const assignedProvided = hasOwn(data, "assignedAgentIds");
        const startProvided = hasOwn(data, "startAt");
        const endProvided = hasOwn(data, "endAt");
        const nextStart = startProvided
          ? parseDateTimeIso(data.startAt)
          : tsToDate(currentData.startAt);
        const nextEnd = endProvided
          ? parseDateTimeIso(data.endAt)
          : tsToDate(currentData.endAt);

        if ((startProvided || endProvided) && !isPositiveDateRange(nextStart, nextEnd)) {
          results.push({ id, ok: false, error: "Invalid date range", code: "invalid_date_range" });
          continue;
        }

        if (startProvided) updates.startAt = toTs(nextStart as Date);
        if (endProvided) updates.endAt = toTs(nextEnd as Date);

        if (assignedProvided) {
           const singleAssigned = safeArr(data.assignedAgentIds).slice(0, 1);
           const val = await validateAssignedAgentsForSite({
             tenantId: auth.tenantId,
             siteId: currentData.siteId,
             assignedAgentIds: singleAssigned,
             requiredQualification:
               data.requiredQualification !== undefined
                 ? data.requiredQualification
                 : currentData.requiredQualification,
           });
           if (!val.ok) {
              results.push({
                id,
                ok: false,
                error: val.error || "Validation failed",
                code: "validation_failed",
                rejected: val.rejected ?? [],
              });
              continue;
           }
           if (singleAssigned.length > 0 && val.validIds.length === 0) {
              results.push({
                id,
                ok: false,
                error: "Agent non eligible pour cette vacation",
                code: "agent_not_eligible",
                rejected: val.rejected ?? [],
              });
              continue;
           }
           nextAssigned = val.validIds.slice(0, 1);
           updates.assignedAgentIds = nextAssigned;
           updates.requiredAgents = 1;
           updates.status = computeStatus(1, nextAssigned.length);
        }

        if ((assignedProvided || startProvided || endProvided) && nextAssigned.length > 0) {
          if (!isPositiveDateRange(nextStart, nextEnd)) {
            results.push({ id, ok: false, error: "Invalid date range", code: "invalid_date_range" });
            continue;
          }

          const persistedOverlaps = await detectOverlapsForAgents({
            tenantId: auth.tenantId,
            vacationId: id,
            agentIds: nextAssigned,
            startAt: nextStart as Date,
            endAt: nextEnd as Date,
          });
          const pendingOverlaps = detectPlannedOverlaps(
            id,
            nextAssigned,
            nextStart as Date,
            nextEnd as Date
          );
          const overlaps = [...persistedOverlaps, ...pendingOverlaps];

          if (overlaps.length > 0) {
            results.push({
              id,
              ok: false,
              error: "Chevauchement detecte pour l'agent",
              code: "overlap_detected",
              overlaps,
            });
            continue;
          }
        }

        if (data.status) updates.status = data.status;
        if (data.isPublished !== undefined) {
          updates.isPublished = data.isPublished === true;
          if (updates.isPublished) {
            updates.publishedAt = FieldValue.serverTimestamp();
            updates.publishedBy = auth.uid;
          }
        }

        const b = getBatch(1);
        b.update(ref, updates);

        if (assignedProvided) {
           const diffReserve = Math.max(nextAssigned.length, currentData.assignedAgentIds?.length || 0) * 2;
           const subBatch = getBatch(diffReserve);
           await syncAssignmentsForVacation({
             tenantId: auth.tenantId,
             uid: auth.uid,
             vacationId: id,
             siteId: currentData.siteId,
             prevAssigned: currentData.assignedAgentIds || [],
             nextAssigned,
             batch: subBatch
           });
        }
        if ((assignedProvided || startProvided || endProvided) && nextAssigned.length > 0) {
          registerPlannedInterval(id, nextAssigned, nextStart as Date, nextEnd as Date);
        }
        results.push({ id, ok: true });

      } else if (op.type === "delete") {
        const { id } = op;
        const ref = adminDb.collection("vacations").doc(id);
        const snap = await ref.get();
        if (!snap.exists || snap.data()?.tenantId !== auth.tenantId) {
          results.push({ id, ok: false });
          continue;
        }

        const b = getBatch(1);
        b.delete(ref);

        const delReserve = (snap.data()?.assignedAgentIds?.length || 0) + 1;
        const subBatch = getBatch(delReserve);
        await syncAssignmentsForVacation({
            tenantId: auth.tenantId,
            uid: auth.uid,
            vacationId: id,
            siteId: snap.data()?.siteId,
            prevAssigned: snap.data()?.assignedAgentIds || [],
            nextAssigned: [],
            batch: subBatch
        });

        results.push({ id, ok: true });

      } else if (op.type === "create") {
         const { data } = op;
         const start = parseDateTimeIso(data.startAt);
         const end = parseDateTimeIso(data.endAt);
         if (!isPositiveDateRange(start, end)) {
           results.push({ ok: false, error: "Invalid date range", code: "invalid_date_range" });
           continue;
         }
         const startDate = start as Date;
         const endDate = end as Date;

         const singleAssigned = safeArr(data.assignedAgentIds).slice(0, 1);
         const val = await validateAssignedAgentsForSite({
           tenantId: auth.tenantId,
           siteId: data.siteId,
           assignedAgentIds: singleAssigned,
           requiredQualification: data.requiredQualification,
         });
         if (!val.ok) {
           results.push({
             ok: false,
             error: val.error || "Validation failed",
             code: "validation_failed",
             rejected: val.rejected ?? [],
           });
           continue;
         }
         if (singleAssigned.length > 0 && val.validIds.length === 0) {
           results.push({
             ok: false,
             error: "Agent non eligible pour cette vacation",
             code: "agent_not_eligible",
             rejected: val.rejected ?? [],
           });
           continue;
         }
         const assignedAgentIds = val.validIds.slice(0, 1);
         const ref = adminDb.collection("vacations").doc();

         if (assignedAgentIds.length > 0) {
           const persistedOverlaps = await detectOverlapsForAgents({
             tenantId: auth.tenantId,
             vacationId: ref.id,
             agentIds: assignedAgentIds,
             startAt: startDate,
             endAt: endDate,
           });
           const pendingOverlaps = detectPlannedOverlaps(
             ref.id,
             assignedAgentIds,
             startDate,
             endDate
           );
           const overlaps = [...persistedOverlaps, ...pendingOverlaps];

           if (overlaps.length > 0) {
             results.push({
               ok: false,
               error: "Chevauchement detecte pour l'agent",
               code: "overlap_detected",
               overlaps,
             });
             continue;
           }
         }
         const status = computeStatus(1, assignedAgentIds.length);

         const payload = {
           tenantId: auth.tenantId,
           siteId: data.siteId,
           siteName: data.siteName || null,
           title: data.title || null,
           missionType: data.missionType || null,
           requiredQualification: data.requiredQualification || null,
           notes: data.notes || null,
           startAt: toTs(startDate),
           endAt: toTs(endDate),
           requiredAgents: 1,
           assignedAgentIds,
           status,
           createdAt: FieldValue.serverTimestamp(),
           updatedAt: FieldValue.serverTimestamp(),
           createdBy: auth.uid,
           updatedBy: auth.uid,
           isPublished: false,
         };

         const b = getBatch(1);
         b.set(ref, payload);

         if (assignedAgentIds.length > 0) {
            const subBatch = getBatch(assignedAgentIds.length + 1);
            await createAssignmentsForVacation({
              tenantId: auth.tenantId,
              uid: auth.uid,
              vacationId: ref.id,
              siteId: data.siteId,
              assignedAgentIds,
              batch: subBatch
            });
         }
         if (assignedAgentIds.length > 0) {
           registerPlannedInterval(ref.id, assignedAgentIds, startDate, endDate);
         }
         results.push({ ok: true, id: ref.id });
      }
    } catch (e: any) {
      results.push({ ok: false, error: e.message });
    }
  }

  // Atomically commit all accumulated batches
  try {
    await Promise.all(batches.map(b => b.commit()));
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: "Batch commit failed: " + err.message }, { status: 500 });
  }

  logActivity({
    tenantId: auth.tenantId,
    actorUid: auth.uid,
    actorEmail: auth.email ?? null,
    actorRole: auth.role ?? null,
    action: "vacation.bulk_operation",
    entityType: "vacation",
    severity: "info",
    message: `Opération par lot: ${operations.length} actions exécutées avec intégrité transactionnelle (${batches.length} batchs)`,
    meta: { operationsCount: operations.length, batchCount: batches.length }
  }).catch(() => {});

  return NextResponse.json({ ok: true, results }, { status: 200 });
}
