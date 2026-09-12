import "server-only";

type AgentRecord = {
  id: string; tenantId: unknown; profile?: unknown;
  documents?: unknown; photoPath?: unknown; photoUrl?: unknown;
};
type ReferencePage = { agents: readonly AgentRecord[]; nextCursor: string | null };
type Inventory = { complete: boolean; paths: string[]; unresolved: number; agentsRead: number };
type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => !!value && typeof value === "object" && !Array.isArray(value);

/** Read-only scan of nested and legacy root references. Does not inspect Storage or lock writes. */
export async function collectDocumentReferences(input: {
  tenantId: string;
  readPage: (cursor: string | null) => Promise<ReferencePage>;
  maxPages?: number;
}): Promise<Inventory> {
  const paths = new Set<string>();
  const agents = new Set<string>();
  const cursors = new Set<string>();
  let unresolved = 0;
  const result = (complete: boolean): Inventory => ({complete, paths: [...paths], unresolved, agentsRead: agents.size});
  const maxPages = input.maxPages ?? 100;
  if (!input.tenantId || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1000) return result(false);

  function addPath(value: unknown) {
    if (typeof value !== "string" || !/^tenants\/[^/]+\/agents\/[^/]+\/(documents|photo)\/[^/]+$/.test(value)
      || /[\\\u0000-\u001f%]/.test(value) || value.includes("..") || value !== value.trim()) {
      unresolved++; return;
    }
    paths.add(value);
  }
  function addReference(path: unknown, url: unknown) {
    if (path != null && path !== "") addPath(path);
    if (url == null || url === "") return;
    if (typeof url !== "string") { unresolved++; return; }
    // An internal file route is only accounted for when its private path is present.
    if (/^\/api\/agents\/[^/]+\/files\/[^/]+$/.test(url) && typeof path === "string" && paths.has(path)) return;
    try {
      const parsed = new URL(url);
      const match = /^\/v0\/b\/[^/]+\/o\/(.+)$/.exec(parsed.pathname);
      if (parsed.protocol !== "https:" || parsed.hostname !== "firebasestorage.googleapis.com" || !match) { unresolved++; return; }
      addPath(decodeURIComponent(match[1]));
    } catch { unresolved++; }
  }

  function scanFields(fields: { photoPath?: unknown; photoUrl?: unknown; documents?: unknown }) {
    addReference(fields.photoPath, fields.photoUrl);
    if (fields.documents == null) return;
    if (!Array.isArray(fields.documents)) { unresolved++; return; }
    for (const document of fields.documents) {
      if (!record(document)) { unresolved++; continue; }
      if (!document.path && !document.url) { unresolved++; continue; }
      addReference(document.path, document.url);
    }
  }

  let cursor: string | null = null;
  try {
    for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
      const page = await input.readPage(cursor);
      if (!Array.isArray(page.agents)) return result(false);
      for (const agent of page.agents) {
        if (!agent || typeof agent.id !== "string" || !agent.id || agents.has(agent.id) || agent.tenantId !== input.tenantId) return result(false);
        agents.add(agent.id);
        // Scan both schemas, not a fallback: either may contain a live reference.
        scanFields(agent);
        if (agent.profile == null) continue;
        if (!record(agent.profile)) { unresolved++; continue; }
        scanFields(agent.profile);
      }
      if (page.nextCursor === null) return result(true);
      if (typeof page.nextCursor !== "string" || !page.nextCursor || cursors.has(page.nextCursor)) return result(false);
      cursors.add(page.nextCursor);
      cursor = page.nextCursor;
    }
  } catch {
    // No exception text: it may contain private paths or access tokens.
    return result(false);
  }
  return result(false);
}
