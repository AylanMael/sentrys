import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { adminDb } from "@/lib/firebase/admin";

export type Me = {
  uid: string;
  email?: string | null;
  name?: string | null;
  tenantId: string;
  role: string;
  status: string;
};

export async function requireMe(req: NextRequest): Promise<
  | { ok: true; me: Me }
  | { ok: false; res: NextResponse }
> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 }),
    };
  }

  try {
    const decoded = await getAuth().verifyIdToken(token);
    const uid = decoded.uid;

    // tenantUsers/{uid} = source of truth
    const tuSnap = await adminDb.collection("tenantUsers").doc(uid).get();
    if (!tuSnap.exists) {
      return {
        ok: false,
        res: NextResponse.json({ ok: false, error: "No tenant access" }, { status: 403 }),
      };
    }

    const tu = tuSnap.data() as Record<string, unknown> | undefined;

    if (tu?.status !== "active") {
      return {
        ok: false,
        res: NextResponse.json({ ok: false, error: "User disabled" }, { status: 403 }),
      };
    }

    const me: Me = {
      uid,
      email: decoded.email ?? null,
      name: (decoded.name as string | undefined) ?? null,
      tenantId: String(tu?.tenantId || ""),
      role: String(tu?.role || "client"),
      status: String(tu?.status || "disabled"),
    };

    if (!me.tenantId) {
      return {
        ok: false,
        res: NextResponse.json({ ok: false, error: "Missing tenantId" }, { status: 403 }),
      };
    }

    return { ok: true, me };
  } catch (e: unknown) {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: "Invalid token", details: e instanceof Error ? e.message : String(e) },
        { status: 401 }
      ),
    };
  }
}
