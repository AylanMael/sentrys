import "server-only";
import { FieldPath, type Firestore } from "firebase-admin/firestore";
import type { AgencyReferencePage } from "./agency-reference-inventory";

export type AgencyReferenceSource = "tenants" | "planningDispatches" | "sitePlanningDispatches";

/** Explicit database, source allowlist and tenant scope; no writes or environment fallback. */
export function createAgencyReferenceReader(db: Firestore, tenantId: string, source: AgencyReferenceSource, pageSize = 100) {
  if (!tenantId || tenantId !== tenantId.trim() || /[\\/\u0000-\u001f]/.test(tenantId)) throw new Error("Invalid inventory scope");
  if (!["tenants", "planningDispatches", "sitePlanningDispatches"].includes(source)) throw new Error("Invalid inventory source");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 250) throw new Error("Invalid inventory page size");
  return async (cursor: string | null): Promise<AgencyReferencePage> => {
    if (cursor !== null && (!cursor || /[\\/\u0000-\u001f]/.test(cursor) || source === "tenants")) throw new Error("Invalid inventory cursor");
    let query = db.collection(source)
      .where(source === "tenants" ? FieldPath.documentId() : "tenantId", "==", tenantId)
      .orderBy(FieldPath.documentId())
      .select("tenantId", "agencyProfile", "logoUrl", "logoPath", "logo")
      .limit(source === "tenants" ? 1 : pageSize);
    if (cursor !== null) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (source === "tenants" && snapshot.empty) throw new Error("Missing inventory tenant");
    return {
      records: snapshot.docs.map((doc) => {
        const data = doc.data();
        return { id: doc.id, tenantId: source === "tenants" ? doc.id : data.tenantId,
          agencyProfile: data.agencyProfile, logoUrl: data.logoUrl, logoPath: data.logoPath, logo: data.logo };
      }),
      nextCursor: source !== "tenants" && snapshot.size === pageSize ? snapshot.docs[snapshot.size - 1].id : null,
    };
  };
}
