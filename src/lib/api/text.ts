// src/lib/api/text.ts
export function norm(v: any) {
    return String(v ?? "").trim();
  }

  export function normLower(v: any) {
    return norm(v).toLowerCase();
  }
