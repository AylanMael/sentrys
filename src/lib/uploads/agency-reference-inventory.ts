import "server-only";
import { collectDocumentReferences } from "./document-reference-inventory";

type AgencyRecord = {
  id: string; tenantId: unknown; agencyProfile?: unknown;
  logoUrl?: unknown; logoPath?: unknown; logo?: unknown;
};
export type AgencyReferencePage = { records: readonly AgencyRecord[]; nextCursor: string | null };

/** Logos are potential references, including copies retained in historical dispatches. */
export async function collectAgencyReferences(input: {
  tenantId: string;
  readPage: (cursor: string | null) => Promise<AgencyReferencePage>;
  maxPages?: number;
}) {
  const result = await collectDocumentReferences({
    tenantId: input.tenantId,
    maxPages: input.maxPages,
    readPage: async (cursor) => {
      const page = await input.readPage(cursor);
      if (!Array.isArray(page.records)) throw new Error("Invalid reference page");
      return {
        nextCursor: page.nextCursor,
        agents: page.records.map((row) => {
          const documents: Array<{ path?: unknown; url?: unknown }> = [];
          const scan = (fields: { logoUrl?: unknown; logoPath?: unknown; logo?: unknown }) => {
            for (const value of [fields.logoUrl, fields.logoPath, fields.logo]) {
              if (value == null || value === "") continue;
              // Reuse the conservative parser; unknown URLs/paths remain unresolved.
              documents.push(typeof value === "string" && value.startsWith("tenants/")
                ? { path: value } : { url: value });
            }
          };
          scan(row);
          if (row.agencyProfile != null) {
            if (typeof row.agencyProfile !== "object" || Array.isArray(row.agencyProfile)) {
              documents.push({}); // An unreadable profile must block the diagnostic.
            } else {
              scan(row.agencyProfile);
            }
          }
          return { id: row.id, tenantId: row.tenantId, profile: { documents } };
        }),
      };
    },
  });
  return { complete: result.complete, paths: result.paths, unresolved: result.unresolved, recordsRead: result.agentsRead };
}
