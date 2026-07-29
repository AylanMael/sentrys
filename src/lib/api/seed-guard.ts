import "server-only";

import { NextResponse } from "next/server";

export function blockSeedInProduction() {
  if (process.env.NODE_ENV !== "production") {
    return null;
  }

  const response = NextResponse.json(
    { ok: false, error: "Not found" },
    { status: 404 }
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}