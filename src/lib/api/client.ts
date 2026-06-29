import { z } from "zod";
import { clientCreateSchema, clientUpdateSchema } from "@/lib/validators/client";

export type ClientCreateInput = z.infer<typeof clientCreateSchema>;
export type ClientUpdateInput = z.infer<typeof clientUpdateSchema>;

async function apiFetch<T>(
  url: string,
  token: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    throw new Error(json?.error || `Request failed (${res.status})`);
  }
  return json as T;
}

export async function createClient(token: string, input: ClientCreateInput) {
  const data = clientCreateSchema.parse(input);
  return apiFetch<{ ok: true; item: any }>(`/api/clients`, token, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateClient(
  token: string,
  id: string,
  input: ClientUpdateInput
) {
  const data = clientUpdateSchema.parse(input);
  return apiFetch<{ ok: true; item: any }>(`/api/clients/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function archiveClient(token: string, id: string) {
  return apiFetch<{ ok: true }>(`/api/clients/${id}`, token, {
    method: "DELETE",
  });
}
