
import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser } from "@/app/api/_utils/withTenant";
import { incidentClassificationFlow } from "@/ai/flows/incident-classification";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  try {
    const { description } = await req.json();

    if (!description || typeof description !== "string") {
      return NextResponse.json(
        { ok: false, error: "Description manquante ou invalide." },
        { status: 400 }
      );
    }

    const analysis = await incidentClassificationFlow({ description });

    return NextResponse.json({
      ok: true,
      analysis,
    });
  } catch (e: any) {
    console.error("[api/ai/classify-incident] failed", e);
    return NextResponse.json(
      { ok: false, error: "L'analyse IA a échoué." },
      { status: 500 }
    );
  }
}
