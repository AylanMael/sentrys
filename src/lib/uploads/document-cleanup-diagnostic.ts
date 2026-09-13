import "server-only";

type Trace = { tenantId?: unknown; agentId?: unknown; cleanupStatus?: unknown; cleanupPath?: unknown };
export type CleanupDiagnosticInput = {
  tenantId: string;
  agentId: string;
  agentTenantId: string | null;
  trace: Trace | null;
  // Populated by a future exhaustive server-side collector, never by the client.
  references: { complete: boolean; paths: readonly string[]; unresolved: number };
};

function validSegment(value: string) {
  return !!value && value === value.trim() && !/[\\/\u0000-\u001f%]/.test(value) && !value.includes("..");
}

/** Pure preflight only: no I/O, no deletion permit and no Storage absence claim. */
export function diagnoseDocumentCleanup(input: CleanupDiagnosticInput) {
  if (!validSegment(input.tenantId) || !validSegment(input.agentId)) return { status: "blocked", reason: "invalid-scope" } as const;
  if (input.agentTenantId !== input.tenantId || !input.trace
    || input.trace.tenantId !== input.tenantId || input.trace.agentId !== input.agentId) {
    return { status: "blocked", reason: "scope-mismatch" } as const;
  }
  if (input.trace.cleanupStatus !== "pending") return { status: "blocked", reason: "not-pending" } as const;
  const path = input.trace.cleanupPath;
  const prefix = `tenants/${input.tenantId}/agents/${input.agentId}/documents/`;
  if (typeof path !== "string" || !path.startsWith(prefix) || !validSegment(path.slice(prefix.length))) {
    return { status: "blocked", reason: "invalid-document-path" } as const;
  }
  if (input.references.complete !== true || input.references.unresolved !== 0) {
    return { status: "blocked", reason: "incomplete-references" } as const;
  }
  if (input.references.paths.includes(path)) return { status: "blocked", reason: "still-referenced" } as const;
  // Even this result requires Storage/generation inspection and concurrency protection.
  // Never return the private path in a diagnostic intended for display or logging.
  return { status: "needs-storage-inspection", reason: "reference-check-passed" } as const;
}
