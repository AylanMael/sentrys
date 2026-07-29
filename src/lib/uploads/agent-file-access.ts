import "server-only";

export function secureAgentFileUrl(agentId: string, fileId: string) {
  return `/api/agents/${encodeURIComponent(agentId)}/files/${encodeURIComponent(fileId)}`;
}

export function parseFirebaseStoragePath(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.hostname !== "firebasestorage.googleapis.com") return null;
    const match = url.pathname.match(/^\/v0\/b\/[^/]+\/o\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export function isAgentStoragePath(path: string, tenantId: string, agentId: string) {
  const prefix = `tenants/${tenantId}/agents/${agentId}/`;
  return path.startsWith(prefix)
    && !path.includes("..")
    && (path.includes("/photo/") || path.includes("/documents/"));
}