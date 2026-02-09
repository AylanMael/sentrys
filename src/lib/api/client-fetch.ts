// src/lib/api/client-fetch.ts
import { getAuth } from "firebase/auth";

type ApiError = {
  ok?: false;
  error?: string;
  details?: any;
};

export async function apiFetch<T>(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<T> {
  const user = getAuth().currentUser;
  if (!user) throw new Error("Not authenticated");

  // Force refresh = false (par défaut), tu peux le passer à true si tu veux
  const token = await user.getIdToken(false);

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  // Si body présent et pas déjà un content-type, on met JSON par défaut
  const hasBody = init.body !== undefined && init.body !== null;
  if (hasBody && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const res = await fetch(input, {
    ...init,
    headers,
    // Bonnes pratiques Next/Fetch : éviter cache sur appels API authentifiés
    cache: init.cache ?? "no-store",
  });

  // 204 No Content
  if (res.status === 204) {
    return {} as T;
  }

  // On essaye JSON, sinon text (pour mieux debug)
  const contentType = res.headers.get("content-type") || "";
  let payload: any = null;

  if (contentType.includes("application/json")) {
    payload = await res.json().catch(() => null);
  } else {
    const text = await res.text().catch(() => "");
    payload = text ? { ok: false, error: text } : null;
  }

  // Si HTTP error, on throw pour que tes pages puissent afficher toast error proprement
  if (!res.ok) {
    const err = (payload ?? {}) as ApiError;
    const msg =
      err?.error ||
      `HTTP ${res.status} ${res.statusText || ""}`.trim() ||
      "Request failed";
    const e = new Error(msg);
    (e as any).status = res.status;
    (e as any).payload = payload;
    throw e;
  }

  return payload as T;
}
