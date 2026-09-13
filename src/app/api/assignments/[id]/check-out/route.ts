import { NextRequest } from "next/server";
import { pointage } from "../../_pointage";
export const runtime = "nodejs";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return pointage(req, params, "out");
}
