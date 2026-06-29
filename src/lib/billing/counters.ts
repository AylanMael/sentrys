import { adminDb } from "@/lib/firebase/admin";

/**
 * Atomic counter for numbering docs (quotes/invoices).
 * Stored in /counters/{tenantId}_{kind}_{year} with { current }.
 * Must be called server-side (Admin SDK).
 */
export async function nextCounter(
  tenantId: string,
  kind: "quote" | "invoice",
  year: number
) {
  const id = `${tenantId}_${kind}_${year}`;
  const ref = adminDb.collection("counters").doc(id);

  const seq = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? Number(snap.data()?.current ?? 0) : 0;
    const next = current + 1;
    tx.set(ref, { tenantId, kind, year, current: next }, { merge: true });
    return next;
  });

  return seq;
}
