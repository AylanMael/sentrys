export type SuspensionNotice = { mode: "commercial" | "security"; message: string };
const listeners = new Set<(notice: SuspensionNotice) => void>();
let pending: SuspensionNotice | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

export function subscribeSuspensionFeedback(listener: (notice: SuspensionNotice) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// Publish after the caller's catch/finally: its generic error toast must not
// replace the actionable suspension explanation. Concurrent refusals coalesce.
export function reportSuspensionFeedback(notice: SuspensionNotice) {
  if (typeof window === "undefined" || listeners.size === 0) return;
  pending = notice;
  if (timer !== undefined) return;
  timer = setTimeout(() => {
    timer = undefined;
    const current = pending;
    pending = null;
    if (current) listeners.forEach(listener => listener(current));
  }, 0);
}
