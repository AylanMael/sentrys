import "server-only";
import { FieldPath, type Firestore } from "firebase-admin/firestore";

/** Server-side, tenant-scoped reads only. Caller owns environment selection. */
export function createDocumentReferenceReader(db: Firestore, tenantId: string, pageSize = 100) {
  if (!tenantId || tenantId !== tenantId.trim() || /[\\/\u0000-\u001f]/.test(tenantId)) throw new Error("Invalid inventory scope");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 250) throw new Error("Invalid inventory page size");
  return async (cursor: string | null) => {
    if (cursor !== null && (!cursor || /[\\/\u0000-\u001f]/.test(cursor))) throw new Error("Invalid inventory cursor");
    let query = db.collection("agents").where("tenantId", "==", tenantId)
      .orderBy(FieldPath.documentId()).select("tenantId", "profile").limit(pageSize);
    if (cursor !== null) query = query.startAfter(cursor);
    const snapshot = await query.get();
    return {
      agents: snapshot.docs.map(doc => ({id: doc.id, tenantId: doc.data().tenantId, profile: doc.data().profile})),
      // A full page requires a further read, even if it turns out to be empty.
      nextCursor: snapshot.size === pageSize ? snapshot.docs[snapshot.size - 1].id : null,
    };
  };
}
