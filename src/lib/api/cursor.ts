// src/lib/api/cursor.ts
export type CursorPayload = {
    // Tri stable : createdAt desc + id desc (en fallback)
    createdAtMs: number; // createdAt en ms
    id: string;          // doc id
  };

  export function encodeCursor(payload: CursorPayload) {
    const json = JSON.stringify(payload);
    return Buffer.from(json, "utf8").toString("base64url");
  }

  export function decodeCursor(cursor: string | null): CursorPayload | null {
    if (!cursor) return null;
    try {
      const json = Buffer.from(cursor, "base64url").toString("utf8");
      const obj = JSON.parse(json);
      if (!obj || typeof obj !== "object") return null;
      if (typeof obj.createdAtMs !== "number") return null;
      if (typeof obj.id !== "string") return null;
      return obj as CursorPayload;
    } catch {
      return null;
    }
  }
