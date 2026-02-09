import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const v = process.env.ADMIN_API_KEY;
  return NextResponse.json({
    hasAdminKey: typeof v === "string" && v.length > 0,
    len: v?.length ?? 0,
  });
}