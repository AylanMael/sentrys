import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { collectDocumentReferences } from "./document-reference-inventory";
import { createDocumentReferenceReader } from "./document-reference-reader";
import { collectAgencyReferences } from "./agency-reference-inventory";
import { createAgencyReferenceReader } from "./agency-reference-reader";

/** Bounded read-only union. Completeness covers these four sources, not the whole database or concurrency. */
export async function collectTenantFileReferences(input: {
  db: Firestore; tenantId: string; pageSize?: number; maxPagesPerSource?: number;
}) {
  const paths = new Set<string>();
  let complete = true, unresolved = 0;
  const sources: Record<string, { complete: boolean; unresolved: number; recordsRead: number }> = {};
  try {
    const agents = await collectDocumentReferences({ tenantId: input.tenantId,
      readPage: createDocumentReferenceReader(input.db, input.tenantId, input.pageSize), maxPages: input.maxPagesPerSource });
    sources.agents = { complete: agents.complete, unresolved: agents.unresolved, recordsRead: agents.agentsRead };
    complete = agents.complete;
    unresolved += agents.unresolved;
    for (const path of agents.paths) paths.add(path);
    for (const source of ["tenants", "planningDispatches", "sitePlanningDispatches"] as const) {
      const result = await collectAgencyReferences({ tenantId: input.tenantId,
        readPage: createAgencyReferenceReader(input.db, input.tenantId, source, input.pageSize), maxPages: input.maxPagesPerSource });
      sources[source] = { complete: result.complete, unresolved: result.unresolved, recordsRead: result.recordsRead };
      complete = complete && result.complete;
      unresolved += result.unresolved;
      for (const path of result.paths) paths.add(path);
    }
  } catch {
    complete = false; // No raw error, private URL or token is returned.
  }
  return { complete, unresolved, paths: [...paths], sources };
}
