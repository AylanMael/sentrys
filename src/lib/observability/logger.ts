type LogLevel = "info" | "warning" | "error";
type LogMeta = Record<string, unknown>;
function safeError(error: unknown) { if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack }; return { message: String(error) }; }
function emit(level: LogLevel, event: string, meta: LogMeta = {}) { const payload = { severity: level === "warning" ? "WARNING" : level.toUpperCase(), event, timestamp: new Date().toISOString(), ...meta }; const line = JSON.stringify(payload); if (level === "error") console.error(line); else if (level === "warning") console.warn(line); else console.info(line); }
export const appLogger = {
  info(event: string, meta?: LogMeta) { emit("info", event, meta); },
  warning(event: string, meta?: LogMeta) { emit("warning", event, meta); },
  error(event: string, error: unknown, meta: LogMeta = {}) { emit("error", event, { ...meta, error: safeError(error) }); },
};