import { NextRequest, NextResponse } from "next/server";

export const ADMIN_HEADER = "x-admin-key";

function safeEq(a: string, b: string) {
  // comparaison simple (OK ici). Si tu veux, on passera en timingSafeEqual ensuite.
  return a === b;
}

export function requireAdminKey(req: NextRequest) {
  const expected = process.env.ADMIN_API_KEY;
  const provided = req.headers.get(ADMIN_HEADER) ?? "";

  if (typeof expected !== "string" || expected.length < 16) {
    return NextResponse.json(
      { ok: false, error: "Server misconfigured (ADMIN_API_KEY missing/too short)" },
      { status: 500 }
    );
  }

  if (!safeEq(provided, expected)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  return null; // OK
}