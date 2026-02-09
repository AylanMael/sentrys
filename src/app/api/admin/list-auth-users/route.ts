import { NextRequest, NextResponse } from "next/server";
import { requireAdminKey } from "@/lib/api/admin-auth";
import admin from "firebase-admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const denied = requireAdminKey(req);
  if (denied) return denied;

  const max = Math.min(Number(req.nextUrl.searchParams.get("max") ?? "10"), 100);

  const res = await admin.auth().listUsers(max);

  return NextResponse.json({
    ok: true,
    count: res.users.length,
    users: res.users.map((u) => ({
      uid: u.uid,
      email: u.email ?? null,
      displayName: u.displayName ?? null,
      disabled: u.disabled,
      providerIds: u.providerData?.map((p) => p.providerId) ?? [],
    })),
  });
}