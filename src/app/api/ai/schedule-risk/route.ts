import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";

import { adminDb } from "@/lib/firebase/admin";
import { canReadBackoffice, requireTenantUser } from "@/app/api/_utils/withTenant";
import {
  ScheduleAnalysisResultSchema,
  scheduleAnalysisFlow,
} from "@/ai/flows/schedule-analysis";

export const runtime = "nodejs";

const MAX_BODY_CHARS = 2_000;
const MAX_RANGE_DAYS = 31;
const MAX_VACATIONS = 100;
const MAX_SITES = 100;
const MAX_AGENTS = 200;
const MAX_FREE_TEXT_CHARS = 160;
const MAX_CONTEXT_CHARS = 100_000;
const MAX_RISKS = 20;
const MAX_OUTPUT_TEXT_CHARS = 1_000;
const AI_TIMEOUT_MS = 30_000;

const RequestSchema = z
  .object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
  })
  .strict();

type VacationContext = {
  id: string;
  siteId: string | null;
  assignedAgentIds: string[];
  requiredAgents: number;
  status: string;
  startTime: string;
  endTime: string;
  requiredQualification: string | null;
};

function json(status: number, body: unknown) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function businessLimit(error: string) {
  return json(422, { ok: false, error });
}

function boundedText(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, MAX_FREE_TEXT_CHARS) : null;
}

function safeIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0 && item.length <= 200 && !item.includes("/"))
    )
  );
}

function referenceId(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 200 && !normalized.includes("/")
    ? normalized
    : null;
}

function toIso(value: unknown) {
  const timestamp = value as { toDate?: () => Date } | null | undefined;
  return typeof timestamp?.toDate === "function"
    ? timestamp.toDate().toISOString()
    : null;
}

function hasOversizedOutput(value: z.infer<typeof ScheduleAnalysisResultSchema>) {
  if (value.risks.length > MAX_RISKS || value.summary.length > MAX_OUTPUT_TEXT_CHARS) {
    return true;
  }
  return value.risks.some(
    (risk) =>
      risk.message.length > MAX_OUTPUT_TEXT_CHARS ||
      risk.recommendation.length > MAX_OUTPUT_TEXT_CHARS ||
      (risk.agentName?.length ?? 0) > MAX_FREE_TEXT_CHARS ||
      (risk.affectedAssignments?.length ?? 0) > MAX_VACATIONS
  );
}

async function withTimeout<T>(operation: Promise<T>) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("AI_TIMEOUT")), AI_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;
  if (!canReadBackoffice(auth.role)) {
    return json(403, { ok: false, error: "Insufficient rights" });
  }

  const rawBody = await req.text().catch(() => null);
  if (rawBody == null || rawBody.length === 0 || rawBody.length > MAX_BODY_CHARS) {
    return json(400, { ok: false, error: "Invalid analysis period" });
  }

  let input: z.infer<typeof RequestSchema>;
  try {
    const parsed = RequestSchema.safeParse(JSON.parse(rawBody));
    if (!parsed.success) {
      return json(400, { ok: false, error: "Invalid analysis period" });
    }
    input = parsed.data;
  } catch {
    return json(400, { ok: false, error: "Invalid analysis period" });
  }

  const from = new Date(input.from);
  const to = new Date(input.to);
  const rangeMs = to.getTime() - from.getTime();
  if (rangeMs <= 0 || rangeMs > MAX_RANGE_DAYS * 24 * 60 * 60 * 1_000) {
    return json(400, { ok: false, error: "Invalid analysis period" });
  }

  try {
    const vacationsSnap = await adminDb
      .collection("vacations")
      .where("tenantId", "==", auth.tenantId)
      .where("startAt", "<", Timestamp.fromDate(to))
      .where("endAt", ">", Timestamp.fromDate(from))
      .orderBy("startAt", "desc")
      .orderBy("endAt", "desc")
      .limit(MAX_VACATIONS + 1)
      .get();

    if (vacationsSnap.size > MAX_VACATIONS) {
      return businessLimit("Period too dense. Reduce the selected period.");
    }

    const vacations: VacationContext[] = [];
    for (const document of vacationsSnap.docs) {
      const data = document.data();
      const startTime = toIso(data.startAt);
      const endTime = toIso(data.endAt);
      if (!startTime || !endTime) {
        console.warn("[api/ai/schedule-risk] invalid vacation schedule");
        return businessLimit("Planning data cannot be analyzed safely.");
      }
      vacations.push({
        id: document.id,
        siteId: referenceId(data.siteId),
        assignedAgentIds: safeIds(data.assignedAgentIds),
        requiredAgents: Math.max(1, Math.min(200, Math.floor(Number(data.requiredAgents) || 1))),
        status: boundedText(data.status) ?? "planned",
        startTime,
        endTime,
        requiredQualification: boundedText(data.requiredQualification),
      });
    }

    const agentIds = Array.from(
      new Set(vacations.flatMap((vacation) => vacation.assignedAgentIds))
    ).sort();
    const siteIds = Array.from(
      new Set(
        vacations
          .map((vacation) => vacation.siteId)
          .filter((siteId): siteId is string => Boolean(siteId))
      )
    ).sort();

    if (agentIds.length > MAX_AGENTS || siteIds.length > MAX_SITES) {
      return businessLimit("Period too dense. Reduce the selected period.");
    }

    const [agentDocs, siteDocs] = await Promise.all([
      agentIds.length
        ? adminDb.getAll(...agentIds.map((id) => adminDb.collection("agents").doc(id)))
        : [],
      siteIds.length
        ? adminDb.getAll(...siteIds.map((id) => adminDb.collection("sites").doc(id)))
        : [],
    ]);

    const foreignReference = [...agentDocs, ...siteDocs].some(
      (document) => document.exists && document.data()?.tenantId !== auth.tenantId
    );
    if (foreignReference) {
      console.warn("[api/ai/schedule-risk] cross-tenant reference rejected");
      return businessLimit("Planning data cannot be analyzed safely.");
    }

    const agents = agentDocs
      .filter((document) => document.exists && document.data()?.tenantId === auth.tenantId)
      .map((document) => {
        const data = document.data()!;
        return {
          id: document.id,
          status: boundedText(data.status) ?? "active",
          qualifications: safeIds(data.qualifications)
            .slice(0, 30)
            .map((qualification) => qualification.slice(0, MAX_FREE_TEXT_CHARS)),
          monthlyContractHours: Math.max(0, Math.min(744, Number(data.monthlyContractHours) || 0)),
        };
      });
    const sites = siteDocs
      .filter((document) => document.exists && document.data()?.tenantId === auth.tenantId)
      .map((document) => {
        const data = document.data()!;
        return {
          id: document.id,
          name: boundedText(data.name),
          riskLevel: Math.max(1, Math.min(5, Number(data.riskLevel) || 3)),
        };
      });

    const context = { assignments: vacations, agents, sites };
    if (JSON.stringify(context).length > MAX_CONTEXT_CHARS) {
      return businessLimit("Period too dense. Reduce the selected period.");
    }

    if (vacations.length === 0) {
      return json(200, {
        ok: true,
        analysis: { risks: [], summary: "Aucune vacation sur la période analysée.", overallScore: 100 },
        context: {
          window: { from: from.toISOString(), to: to.toISOString() },
          vacations: 0,
          sites: 0,
          agents: 0,
        },
      });
    }

    const rawResult = await withTimeout(scheduleAnalysisFlow(context));
    const parsedResult = ScheduleAnalysisResultSchema.safeParse(rawResult);
    if (!parsedResult.success || hasOversizedOutput(parsedResult.data)) {
      throw new Error("INVALID_AI_OUTPUT");
    }

    const knownAgents = new Set(agentIds);
    const knownVacations = new Set(vacations.map((vacation) => vacation.id));
    const analysis = {
      ...parsedResult.data,
      risks: parsedResult.data.risks.map((risk) => ({
        ...risk,
        agentId: risk.agentId && knownAgents.has(risk.agentId) ? risk.agentId : undefined,
        agentName: undefined,
        affectedAssignments: risk.affectedAssignments?.filter((id) => knownVacations.has(id)),
      })),
    };

    return json(200, {
      ok: true,
      analysis,
      context: {
        window: { from: from.toISOString(), to: to.toISOString() },
        vacations: vacations.length,
        sites: sites.length,
        agents: agents.length,
      },
    });
  } catch (error: unknown) {
    console.error("[api/ai/schedule-risk] failed", error instanceof Error ? error.name : "unknown");
    return json(500, { ok: false, error: "Internal error" });
  }
}
