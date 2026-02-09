import { NextRequest, NextResponse } from "next/server";
import { requireAdminKey } from "@/lib/api/admin-auth";
import { adminDb } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

type Body = {
  tenantId: string;
  tenantName: string;
  adminUid: string;
  adminEmail?: string;
};

function bad(msg: string, extra?: any) {
  return NextResponse.json({ ok: false, error: msg, ...extra }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const denied = requireAdminKey(req);
  if (denied) return denied;

  try {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return bad("Invalid JSON body");
    }

    const tenantId = (body.tenantId ?? "").trim();
    const tenantName = (body.tenantName ?? "").trim();
    const adminUid = (body.adminUid ?? "").trim();
    const adminEmail = (body.adminEmail ?? "").trim() || undefined;

    if (!tenantId) return bad("tenantId is required");
    if (!tenantName) return bad("tenantName is required");
    if (!adminUid) return bad("adminUid is required");

    // Vérifie que l’utilisateur existe côté Firebase Auth
    try {
      await getAuth().getUser(adminUid);
    } catch (e: any) {
      return bad("adminUid not found in Firebase Auth", { details: e?.message });
    }

    const tenantRef = adminDb.collection("tenants").doc(tenantId);
    const tuRef = adminDb.collection("tenantUsers").doc(adminUid);

    await adminDb.runTransaction(async (tx) => {
      // ✅ 1) TOUS LES READS D’ABORD (obligatoire pour Firestore transactions)
      const [tenantSnap, tuSnap] = await Promise.all([
        tx.get(tenantRef),
        tx.get(tuRef),
      ]);

      // ✅ 2) ENSUITE LES WRITES
      if (!tenantSnap.exists) {
        tx.set(tenantRef, {
          name: tenantName,
          status: "active",
          createdAt: FieldValue.serverTimestamp(),
          createdBy: adminUid,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      const base = {
        uid: adminUid,
        tenantId,
        role: "admin",
        status: "active",
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (!tuSnap.exists) {
        tx.set(tuRef, {
          ...base,
          email: adminEmail ?? null,
          createdAt: FieldValue.serverTimestamp(),
        });
      } else {
        tx.update(tuRef, {
          ...base,
          ...(adminEmail ? { email: adminEmail } : {}),
        });
      }
    });

    return NextResponse.json({
      ok: true,
      tenantId,
      adminUid,
      note: "Tenant + tenantUser admin ensured",
    });
  } catch (e: any) {
    console.error("[bootstrap] fatal", e);
    return NextResponse.json(
      { ok: false, error: "Internal error", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}