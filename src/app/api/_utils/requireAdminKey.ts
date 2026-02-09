import { NextRequest, NextResponse } from "next/server";

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

export function forbid(msg = "Forbidden", extra?: any) {
  return json(403, { ok: false, error: msg, ...extra });
}

/**
 * Vérifie une clé admin (DEV/OPS) passée en header.
 * - En prod: tu peux choisir de l’autoriser (ops) ou la désactiver.
 */
export function requireAdminKey(req: NextRequest) {
  const expected = process.env.ADMIN_API_KEY || "";
  if (!expected) {
    return { ok: false as const, res: forbid("ADMIN_API_KEY not configured") };
  }

  // accepte plusieurs noms de headers (pratique)
  const provided =
    req.headers.get("x-admin-key") ||
    req.headers.get("x-admin-api-key") ||
    req.headers.get("authorization")?.toLowerCase().startsWith("bearer ")
      ? req.headers.get("authorization")?.slice(7).trim()
      : req.headers.get("authorization")?.trim();

  if (!provided) {
    return { ok: false as const, res: forbid("Missing admin key") };
  }

  // comparaison simple (ok pour dev). Si tu veux, on passera en timingSafeEqual plus tard.
  if (String(provided) !== String(expected)) {
    return { ok: false as const, res: forbid("Invalid admin key") };
  }

  return { ok: true as const };
}
