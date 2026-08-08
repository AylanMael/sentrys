import { adminDb } from "@/lib/firebase/admin";

const WINDOW_LIMIT = 500;
const CARRYOVER_LIMIT = 250;
const MAX_CANDIDATES = 5000;
const MAX_RANGE_DAYS = 62;
const MIN_SPLIT_MS = 60 * 60 * 1000;

type LoadVacationWindowInput = {
  tenantId: string;
  from: Date;
  to: Date;
  vacationIds?: string[];
};

export class VacationWindowError extends Error {
  constructor(public readonly code: "RANGE_TOO_LARGE" | "PERIOD_TOO_DENSE") {
    super(code);
  }
}

function assertRange(from: Date, to: Date) {
  const duration = to.getTime() - from.getTime();
  if (duration <= 0 || duration > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
    throw new VacationWindowError("RANGE_TOO_LARGE");
  }
}

export async function loadDispatchVacationWindow(input: LoadVacationWindowInput) {
  assertRange(input.from, input.to);
  const selectedIds = Array.from(new Set(input.vacationIds ?? [])).slice(0, MAX_CANDIDATES + 1);
  if (selectedIds.length > MAX_CANDIDATES) throw new VacationWindowError("PERIOD_TOO_DENSE");

  if (selectedIds.length > 0) {
    const selected: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    for (let index = 0; index < selectedIds.length; index += 200) {
      const ids = selectedIds.slice(index, index + 200);
      const snapshots = await adminDb.getAll(...ids.map((id) => adminDb.collection("vacations").doc(id)));
      snapshots.forEach((snapshot) => {
        if (snapshot.exists && snapshot.data()?.tenantId === input.tenantId) {
          selected.push(snapshot as FirebaseFirestore.QueryDocumentSnapshot);
        }
      });
    }
    return selected;
  }

  const base = adminDb.collection("vacations").where("tenantId", "==", input.tenantId);
  const collected = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();

  const loadStarts = async (from: Date, to: Date): Promise<void> => {
    const query = base.where("startAt", ">=", from).where("startAt", "<", to);
    const count = (await query.count().get()).data().count;
    if (collected.size + count > MAX_CANDIDATES) throw new VacationWindowError("PERIOD_TOO_DENSE");

    if (count <= WINDOW_LIMIT) {
      const snapshot = await query.orderBy("startAt", "asc").limit(WINDOW_LIMIT).get();
      snapshot.docs.forEach((doc) => collected.set(doc.id, doc));
      return;
    }

    const duration = to.getTime() - from.getTime();
    if (duration <= MIN_SPLIT_MS) throw new VacationWindowError("PERIOD_TOO_DENSE");
    const middle = new Date(from.getTime() + Math.floor(duration / 2));
    await loadStarts(from, middle);
    await loadStarts(middle, to);
  };

  await loadStarts(input.from, input.to);

  const carryovers = await base
    .where("startAt", "<", input.from)
    .where("endAt", ">", input.from)
    .orderBy("startAt", "desc")
    .limit(CARRYOVER_LIMIT + 1)
    .get();
  if (carryovers.size > CARRYOVER_LIMIT || collected.size + carryovers.size > MAX_CANDIDATES) {
    throw new VacationWindowError("PERIOD_TOO_DENSE");
  }
  carryovers.docs.forEach((doc) => collected.set(doc.id, doc));

  return [...collected.values()];
}
