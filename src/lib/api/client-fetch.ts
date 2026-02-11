// src/lib/api/client-fetch.ts
import { getAuth } from "firebase/auth";

type ApiError = {
  ok?: false;
  error?: string;
  details?: any;
};

type ApiFetchInit = Omit<RequestInit, "body" | "headers"> & {
  headers?: HeadersInit;
  body?: any; // ✅ autorise objet (sera JSON.stringify si objet simple)
};

function isPlainObject(v: any) {
  if (!v || typeof v !== "object") return false;
  if (v instanceof FormData) return false;
  if (v instanceof Blob) return false;
  if (v instanceof ArrayBuffer) return false;
  if (v instanceof URLSearchParams) return false;
  return true;
}

export async function apiFetch<T>(
  input: RequestInfo | URL,
  init: ApiFetchInit = {}
): Promise<T> {
  const user = getAuth().currentUser;
  if (!user) throw new Error("Not authenticated");

  const token = await user.getIdToken(false);

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  // ✅ Normalisation body
  let body: BodyInit | null | undefined = init.body as any;
  const hasBody = body !== undefined && body !== null;

  if (hasBody) {
    const hasContentType =
      headers.has("content-type") || headers.has("Content-Type");

    // Objet simple => JSON
    if (isPlainObject(body)) {
      if (!hasContentType) headers.set("content-type", "application/json");
      body = JSON.stringify(body);
    } else {
      // string => si pas de content-type, on suppose JSON (utile pour PATCH/POST rapides)
      if (!hasContentType && typeof body === "string") {
        headers.set("content-type", "application/json");
      }
      // FormData/Blob/etc => on laisse tel quel + pas de content-type forcé
    }
  }

  const res = await fetch(input, {
    ...init,
    headers,
    body,
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
