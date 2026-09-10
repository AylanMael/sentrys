/** Only a successful, readable response or an explicit refusal establishes access. */
export async function readAccessResponse(response: Response): Promise<{ ok: boolean }> {
  if (response.status === 401 || response.status === 403) return { ok: false };
  if (!response.ok) throw new Error("Access verification unavailable");
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("ok" in data) || typeof data.ok !== "boolean") {
    throw new Error("Invalid access verification response");
  }
  if (data.ok) {
    const value = data as Record<string, unknown>;
    if (typeof value.uid !== "string" || !value.uid || typeof value.hasTenant !== "boolean"
      || (value.hasTenant && (typeof value.tenantId !== "string" || !value.tenantId
        || typeof value.role !== "string" || !value.role || typeof value.status !== "string" || !value.status))) {
      throw new Error("Incomplete access verification response");
    }
  }
  return data as { ok: boolean };
}

/** Bound both token retrieval and HTTP verification; abort HTTP on timeout. */
export async function withAccessDeadline<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("Access verification timeout"));
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
