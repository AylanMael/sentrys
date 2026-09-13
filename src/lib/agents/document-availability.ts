import type { AgentDocumentItem } from "./profile";

// This checks the API-provided reference, not the existence of the Storage object.
// Actual download authorization and file existence remain server-side checks.
export function hasPrivateDocumentReference(
  document: Pick<AgentDocumentItem, "id" | "url" | "path">,
  agentId: string,
  tenantId: string,
) {
  if (!agentId || !tenantId || !document.id || !document.path) return false;
  const prefix = `tenants/${tenantId}/agents/${agentId}/documents/`;
  return document.path.startsWith(prefix)
    && document.path.length > prefix.length
    && !document.path.includes("..")
    && document.url === `/api/agents/${encodeURIComponent(agentId)}/files/${encodeURIComponent(document.id)}`;
}
