export type PrepayPeriodStatus =
  | "draft"
  | "checked"
  | "validated"
  | "locked"
  | "exported";

export type PrepayPeriodAction =
  | "check"
  | "validate"
  | "lock"
  | "mark_exported"
  | "reopen";

export type PrepayPeriodSummarySnapshot = {
  agentCount: number;
  vacationCount: number;
  payableHours: number;
  anomalyCount: number;
  unassignedVacationCount: number;
  draftVacationCount: number;
  estimatedGrossAmount: number;
};

export type PrepayPeriodEvent = {
  action: PrepayPeriodAction;
  status: PrepayPeriodStatus;
  atIso: string;
  actorUid: string;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: string | null;
  note: string | null;
  summarySnapshot: PrepayPeriodSummarySnapshot;
};

export type PrepayPeriod = {
  id: string;
  tenantId: string;
  fromIso: string;
  toIso: string;
  status: PrepayPeriodStatus;
  summarySnapshot: PrepayPeriodSummarySnapshot;
  events: PrepayPeriodEvent[];
  createdAtIso: string | null;
  updatedAtIso: string | null;
  updatedByUid: string | null;
  updatedByEmail: string | null;
  updatedByRole: string | null;
  exportedAtIso: string | null;
};

const EMPTY_SUMMARY: PrepayPeriodSummarySnapshot = {
  agentCount: 0,
  vacationCount: 0,
  payableHours: 0,
  anomalyCount: 0,
  unassignedVacationCount: 0,
  draftVacationCount: 0,
  estimatedGrossAmount: 0,
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function finiteNumber(value: unknown, min = 0, max = 100000000) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(min, Math.min(max, Math.round(number * 100) / 100));
}

function cleanDocPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}

export function prepayPeriodDocId(
  tenantId: string,
  fromIso: string,
  toIso: string
) {
  const from = fromIso.slice(0, 10);
  const to = toIso.slice(0, 10);
  return cleanDocPart(`${tenantId}_${from}_${to}`);
}

export function normalizePrepayPeriodStatus(
  value: unknown
): PrepayPeriodStatus {
  const status = text(value).toLowerCase();
  if (
    status === "draft" ||
    status === "checked" ||
    status === "validated" ||
    status === "locked" ||
    status === "exported"
  ) {
    return status;
  }
  return "draft";
}

export function normalizePrepayPeriodAction(
  value: unknown
): PrepayPeriodAction {
  const action = text(value).toLowerCase();
  if (
    action === "check" ||
    action === "validate" ||
    action === "lock" ||
    action === "mark_exported" ||
    action === "reopen"
  ) {
    return action;
  }
  return "check";
}

export function normalizePrepaySummarySnapshot(
  value: unknown
): PrepayPeriodSummarySnapshot {
  const source =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    agentCount: finiteNumber(source.agentCount),
    vacationCount: finiteNumber(source.vacationCount),
    payableHours: finiteNumber(source.payableHours),
    anomalyCount: finiteNumber(source.anomalyCount),
    unassignedVacationCount: finiteNumber(source.unassignedVacationCount),
    draftVacationCount: finiteNumber(source.draftVacationCount),
    estimatedGrossAmount: finiteNumber(source.estimatedGrossAmount),
  };
}

export function nextPrepayPeriodStatus(
  current: PrepayPeriodStatus,
  action: PrepayPeriodAction
):
  | { ok: true; status: PrepayPeriodStatus }
  | { ok: false; error: string } {
  if (action === "reopen") {
    if (current === "draft") {
      return { ok: false, error: "La période est deja en brouillon." };
    }
    return { ok: true, status: "draft" };
  }

  if (current === "exported") {
    return {
      ok: false,
      error: "La période est exportée. Rouvrez-la avant modification.",
    };
  }

  if (action === "check") {
    if (current === "locked") {
      return {
        ok: false,
        error: "La période est verrouillée. Rouvrez-la avant controle.",
      };
    }
    return { ok: true, status: "checked" };
  }

  if (action === "validate") {
    if (current !== "checked" && current !== "validated") {
      return {
        ok: false,
        error: "Contrôle requis avant validation de la pré-paie.",
      };
    }
    return { ok: true, status: "validated" };
  }

  if (action === "lock") {
    if (current !== "validated" && current !== "locked") {
      return {
        ok: false,
        error: "Validation requise avant verrouillage de la pré-paie.",
      };
    }
    return { ok: true, status: "locked" };
  }

  if (action === "mark_exported") {
    if (current !== "locked") {
      return {
        ok: false,
        error: "Verrouillage requis avant marquage exporte.",
      };
    }
    return { ok: true, status: "exported" };
  }

  return { ok: true, status: current };
}

export function pickPrepayPeriod(
  data: Record<string, unknown>,
  id: string
): PrepayPeriod {
  const events = Array.isArray(data.events)
    ? data.events
        .filter((event): event is Record<string, unknown> => {
          return !!event && typeof event === "object";
        })
        .map((event) => ({
          action: normalizePrepayPeriodAction(event.action),
          status: normalizePrepayPeriodStatus(event.status),
          atIso: text(event.atIso),
          actorUid: text(event.actorUid),
          actorEmail: text(event.actorEmail) || null,
          actorName: text(event.actorName) || null,
          actorRole: text(event.actorRole) || null,
          note: text(event.note) || null,
          summarySnapshot: normalizePrepaySummarySnapshot(
            event.summarySnapshot
          ),
        }))
        .filter((event) => event.atIso)
    : [];

  events.sort((left, right) => {
    return new Date(right.atIso).getTime() - new Date(left.atIso).getTime();
  });

  return {
    id,
    tenantId: text(data.tenantId),
    fromIso: text(data.fromIso),
    toIso: text(data.toIso),
    status: normalizePrepayPeriodStatus(data.status),
    summarySnapshot: normalizePrepaySummarySnapshot(data.summarySnapshot),
    events,
    createdAtIso: text(data.createdAtIso) || null,
    updatedAtIso: text(data.updatedAtIso) || null,
    updatedByUid: text(data.updatedByUid) || null,
    updatedByEmail: text(data.updatedByEmail) || null,
    updatedByRole: text(data.updatedByRole) || null,
    exportedAtIso: text(data.exportedAtIso) || null,
  };
}

export function emptyPrepayPeriod(input: {
  id: string;
  tenantId: string;
  fromIso: string;
  toIso: string;
}): PrepayPeriod {
  return {
    id: input.id,
    tenantId: input.tenantId,
    fromIso: input.fromIso,
    toIso: input.toIso,
    status: "draft",
    summarySnapshot: EMPTY_SUMMARY,
    events: [],
    createdAtIso: null,
    updatedAtIso: null,
    updatedByUid: null,
    updatedByEmail: null,
    updatedByRole: null,
    exportedAtIso: null,
  };
}
