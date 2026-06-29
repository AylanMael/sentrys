import { NextRequest, NextResponse } from "next/server";
import { requireTenantUser, canWrite } from "@/app/api/_utils/withTenant";
import { magicFillFlow } from "@/ai/flows/magic-fill";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!canWrite(auth.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { unfilledShifts, existingShifts, agents } = body;

    // Minimum validation
    if (!Array.isArray(unfilledShifts) || !Array.isArray(agents)) {
      return NextResponse.json({ ok: false, error: "Invalid payload format" }, { status: 400 });
    }

    if (unfilledShifts.length === 0) {
      return NextResponse.json({
        ok: true,
        assignments: [],
        unfilledShiftIds: [],
        summary: "Aucune mission à remplir."
      });
    }

    const result = await magicFillFlow({
      unfilledShifts,
      existingShifts: Array.isArray(existingShifts) ? existingShifts : [],
      agents,
    });

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (error: any) {
    console.error("[ai/magic-fill] Error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal Genkit Error" },
      { status: 500 }
    );
  }
}
