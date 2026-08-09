import { appLogger } from "@/lib/observability/logger";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
const REASONS = new Set(["demo", "tarifs", "support", "partenariat"]);
function text(value: unknown, max: number) { return String(value ?? "").trim().slice(0, max); }
function json(status: number, body: unknown) { const response = NextResponse.json(body, { status }); response.headers.set("Cache-Control", "no-store"); return response; }
function clientFingerprint(req: NextRequest) { const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"; const agent = req.headers.get("user-agent") || "unknown"; const salt = process.env.CONTACT_RATE_LIMIT_SALT || "sentrys-contact"; return createHash("sha256").update(`${salt}:${forwarded}:${agent}`).digest("hex").slice(0, 32); }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null; if (!body) return json(400, { ok: false, error: "Formulaire incomplet." });
    if (text(body.website, 200)) return json(202, { ok: true });
    const name = text(body.name, 120), email = text(body.email, 200).toLowerCase(), company = text(body.company, 160), message = text(body.message, 4000); const reason = text(body.reason, 40);
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 20 || !REASONS.has(reason)) return json(400, { ok: false, error: "Vérifiez votre nom, votre email et le détail de la demande." });
    const fingerprint = clientFingerprint(req); const hour = new Date().toISOString().slice(0, 13); const rateRef = adminDb.collection("contactRateLimits").doc(`${fingerprint}-${hour}`); const requestRef = adminDb.collection("contactRequests").doc();
    await adminDb.runTransaction(async (tx) => { const rate = await tx.get(rateRef); const count = Number(rate.data()?.count ?? 0); if (count >= 5) throw new Error("RATE_LIMIT"); tx.set(rateRef, { count: count + 1, expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), updatedAt: FieldValue.serverTimestamp() }, { merge: true }); tx.create(requestRef, { name, email, company: company || null, reason, message, status: "new", source: "public_contact", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }); });
    return json(201, { ok: true, requestId: requestRef.id });
  } catch (error) { if (error instanceof Error && error.message === "RATE_LIMIT") return json(429, { ok: false, error: "Trop de demandes ont été envoyées. Réessayez dans une heure." }); appLogger.error("contact.request.failed", error); return json(500, { ok: false, error: "La demande n’a pas pu être enregistrée. Réessayez dans quelques instants." }); }
}