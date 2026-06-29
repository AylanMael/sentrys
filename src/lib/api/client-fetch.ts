// src/lib/api/client-fetch.ts
import { getAuth } from "firebase/auth";

type ApiError = {
  ok: false;
  error?: string;
  code?: string;
  details?: unknown;
};

type JsonLikeBody =
  | Record<string, unknown>
  | unknown[]
  | number
  | boolean
  | null;

type ApiFetchInit = Omit<RequestInit, "body" | "headers"> & {
  noAuth?: boolean;
  headers?: HeadersInit;
  body?: BodyInit | JsonLikeBody;
};

type ApiFetchErrorInput = {
  message: string;
  url: string;
  status?: number | null;
  code?: string | null;
  rawMessage?: string | null;
  details?: unknown;
};

export class ApiFetchError extends Error {
  readonly status: number | null;
  readonly url: string;
  readonly code: string | null;
  readonly rawMessage: string | null;
  readonly details: unknown;

  constructor(input: ApiFetchErrorInput) {
    super(input.message);
    this.name = "ApiFetchError";
    this.status = input.status ?? null;
    this.url = input.url;
    this.code = input.code ?? null;
    this.rawMessage = input.rawMessage ?? null;
    this.details = input.details;
  }
}

export function isApiFetchError(error: unknown): error is ApiFetchError {
  return error instanceof ApiFetchError;
}

export function getApiErrorMessage(
  error: unknown,
  fallback = "Une erreur est survenue. Reessayez dans quelques instants."
) {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function isBodyInit(value: unknown): value is BodyInit {
  return (
    typeof value === "string" ||
    value instanceof FormData ||
    value instanceof URLSearchParams ||
    value instanceof Blob ||
    value instanceof ArrayBuffer ||
    value instanceof ReadableStream
  );
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function isFriendlyBusinessMessage(message: string) {
  const value = message.trim();
  if (!value) return false;

  const lower = value.toLowerCase();
  if (
    lower.includes("quota atteint") ||
    lower.includes("periode est verrouillee") ||
    lower.includes("controle requis") ||
    lower.includes("impossible de") ||
    lower.includes("deja") ||
    lower.includes("introuvable") ||
    lower.includes("non autorise")
  ) {
    return true;
  }

  return false;
}

function isTechnicalMessage(message: string) {
  const value = message.trim();
  if (!value) return true;

  return (
    /^HTTP\s+\d{3}$/i.test(value) ||
    /^(Internal Server Error|Forbidden|Unauthorized|Not authenticated|Missing token|Invalid token|API error)$/i.test(
      value
    ) ||
    /from\/to are required/i.test(value) ||
    /ISO date/i.test(value) ||
    /Failed to fetch|NetworkError|Load failed/i.test(value) ||
    /FirebaseError|TypeError|ReferenceError|SyntaxError/i.test(value) ||
    /Cannot read|undefined|null/i.test(value)
  );
}

function messageForStatus(status: number | null, rawMessage: string) {
  if (rawMessage && isFriendlyBusinessMessage(rawMessage)) {
    return rawMessage;
  }

  if (/from\/to are required/i.test(rawMessage)) {
    return "La periode demandee est incomplete. Rafraichissez la page puis reessayez.";
  }

  if (status === 400) {
    return isTechnicalMessage(rawMessage)
      ? "La demande est incomplete ou invalide. Verifiez les champs puis reessayez."
      : rawMessage;
  }

  if (status === 401) {
    return "Votre session a expire ou n'est pas encore chargee. Reconnectez-vous puis reessayez.";
  }

  if (status === 403) {
    return "Action non autorisee avec votre role. Demandez l'acces a un administrateur.";
  }

  if (status === 404) {
    return "Element introuvable. Il a peut-etre ete supprime ou deplace.";
  }

  if (status === 405) {
    return "Cette action n'est pas disponible depuis cet ecran. Rafraichissez puis reessayez.";
  }

  if (status === 409) {
    return "Conflit detecte. Verifiez les donnees puis relancez l'action.";
  }

  if (status === 413) {
    return "Le fichier ou la demande est trop volumineux.";
  }

  if (status === 429) {
    return "Trop de demandes en peu de temps. Patientez un instant puis reessayez.";
  }

  if (status && status >= 500) {
    return "Le service a rencontre une erreur. Vos donnees ne sont pas perdues, reessayez dans quelques instants.";
  }

  if (!rawMessage || isTechnicalMessage(rawMessage)) {
    return "Une erreur est survenue. Reessayez dans quelques instants.";
  }

  return rawMessage;
}

function makeApiFetchError(input: {
  url: string;
  status?: number | null;
  rawMessage?: unknown;
  code?: string | null;
  details?: unknown;
}) {
  const rawMessage = normalizeText(input.rawMessage);
  const status = input.status ?? null;

  return new ApiFetchError({
    url: input.url,
    status,
    code: input.code ?? null,
    rawMessage: rawMessage || null,
    details: input.details,
    message: messageForStatus(status, rawMessage),
  });
}

export async function apiFetch<T>(
  url: string,
  init: ApiFetchInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");

  let body: BodyInit | undefined;

  if (typeof init.body !== "undefined") {
    if (isBodyInit(init.body)) {
      body = init.body;

      // On laisse l'appelant définir le Content-Type
      // sauf quand on sérialise nous-mêmes en JSON.
      if (
        !(init.body instanceof FormData) &&
        !(init.body instanceof URLSearchParams) &&
        !(init.body instanceof Blob) &&
        !(init.body instanceof ArrayBuffer) &&
        !(init.body instanceof ReadableStream) &&
        typeof init.body !== "string" &&
        !headers.has("Content-Type")
      ) {
        headers.set("Content-Type", "application/json");
      }
    } else {
      body = JSON.stringify(init.body);
      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
    }
  }

  if (!init.noAuth) {
    const user = getAuth().currentUser;
    if (!user) {
      throw makeApiFetchError({
        url,
        status: 401,
        rawMessage: "Not authenticated",
      });
    }

    const token = await user.getIdToken();
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      headers,
      body,
      cache: "no-store",
    });
  } catch (error) {
    throw makeApiFetchError({
      url,
      status: null,
      rawMessage:
        error instanceof Error ? error.message : "Network request failed",
      details: error,
    });
  }

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  const payload = isJson
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");

  if (!response.ok) {
    if (isJson && payload && typeof payload === "object") {
      const err = payload as ApiError;
      throw makeApiFetchError({
        url,
        status: response.status,
        rawMessage: err.error || `HTTP ${response.status}`,
        code: err.code ?? null,
        details: err.details,
      });
    }

    if (typeof payload === "string" && payload.trim()) {
      throw makeApiFetchError({
        url,
        status: response.status,
        rawMessage: payload,
      });
    }

    throw makeApiFetchError({
      url,
      status: response.status,
      rawMessage: `HTTP ${response.status}`,
    });
  }

  if (isJson && payload && typeof payload === "object") {
    const errLike = payload as Partial<ApiError>;
    if (errLike.ok === false) {
      throw makeApiFetchError({
        url,
        status: response.status,
        rawMessage: errLike.error || "API error",
        code: errLike.code ?? null,
        details: errLike.details,
      });
    }
  }

  return payload as T;
}
