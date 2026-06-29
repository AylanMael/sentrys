export type OperationSignalStatus = "new" | "seen" | "in_progress" | "done";

export type OperationSignalEvent = {
  status: OperationSignalStatus;
  previousStatus: OperationSignalStatus;
  atIso: string;
  actorUid: string;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: string | null;
  note: string | null;
};

export type OperationSignalState = {
  id: string;
  tenantId: string;
  signalId: string;
  status: OperationSignalStatus;
  note: string | null;
  titleSnapshot: string | null;
  detailSnapshot: string | null;
  href: string | null;
  kind: string | null;
  updatedAtIso: string | null;
  updatedByUid: string | null;
  updatedByEmail: string | null;
  updatedByName: string | null;
  updatedByRole: string | null;
  events: OperationSignalEvent[];
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function cleanDocPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 160);
}

export function operationSignalStateDocId(tenantId: string, signalId: string) {
  return cleanDocPart(`${tenantId}_${signalId}`);
}

export function normalizeOperationSignalStatus(
  value: unknown
): OperationSignalStatus {
  const status = text(value).toLowerCase();
  if (
    status === "seen" ||
    status === "in_progress" ||
    status === "done" ||
    status === "new"
  ) {
    return status;
  }
  return "new";
}

export function operationSignalStatusLabel(status: OperationSignalStatus) {
  if (status === "seen") return "Vu";
  if (status === "in_progress") return "En cours";
  if (status === "done") return "Traite";
  return "Nouveau";
}

export function pickOperationSignalState(
  data: Record<string, unknown>,
  id: string
): OperationSignalState {
  const events = Array.isArray(data.events)
    ? data.events
        .filter((event): event is Record<string, unknown> => {
          return !!event && typeof event === "object";
        })
        .map((event) => ({
          status: normalizeOperationSignalStatus(event.status),
          previousStatus: normalizeOperationSignalStatus(event.previousStatus),
          atIso: text(event.atIso),
          actorUid: text(event.actorUid),
          actorEmail: text(event.actorEmail) || null,
          actorName: text(event.actorName) || null,
          actorRole: text(event.actorRole) || null,
          note: text(event.note) || null,
        }))
        .filter((event) => event.atIso)
    : [];

  events.sort((left, right) => {
    return new Date(right.atIso).getTime() - new Date(left.atIso).getTime();
  });

  return {
    id,
    tenantId: text(data.tenantId),
    signalId: text(data.signalId),
    status: normalizeOperationSignalStatus(data.status),
    note: text(data.note) || null,
    titleSnapshot: text(data.titleSnapshot) || null,
    detailSnapshot: text(data.detailSnapshot) || null,
    href: text(data.href) || null,
    kind: text(data.kind) || null,
    updatedAtIso: text(data.updatedAtIso) || null,
    updatedByUid: text(data.updatedByUid) || null,
    updatedByEmail: text(data.updatedByEmail) || null,
    updatedByName: text(data.updatedByName) || null,
    updatedByRole: text(data.updatedByRole) || null,
    events,
  };
}
