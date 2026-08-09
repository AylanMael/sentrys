import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { forbidden, isSuperAdmin, requireTenantUser } from "@/app/api/_utils/withTenant";
import { adminDb } from "@/lib/firebase/admin";
import { articleGuidance, buildArticleDescription, readingTimeMinutes } from "@/lib/blog";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
function json(status: number, body: unknown) { const response = NextResponse.json(body, { status }); response.headers.set("Cache-Control", "no-store"); return response; }
function value(input: unknown) { return String(input ?? "").trim(); }
async function authorize(req: NextRequest) { const auth = await requireTenantUser(req); if (!auth.ok) return auth; if (!isSuperAdmin(auth.role) || auth.tenantId !== "platform") return { ok: false as const, res: forbidden("Super administrateur plateforme requis") }; return auth; }

export async function PATCH(req: NextRequest, context: Context) {
  const auth = await authorize(req); if (!auth.ok) return auth.res;
  try {
    const { id } = await context.params; const ref = adminDb.collection("blogPosts").doc(id); const current = await ref.get();
    if (!current.exists) return json(404, { ok: false, error: "Article introuvable." });
    const body = await req.json().catch(() => null) as Record<string, unknown> | null; if (!body) return json(400, { ok: false, error: "Données de l’article requises." });
    const title = value(body.title), summary = value(body.summary), content = value(body.content), category = value(body.category), image = value(body.image);
    const oldStatus = value(current.data()?.status); const status = body.action === "publish" ? "published" : body.action === "archive" ? "archived" : "draft";
    if (title.length < 5) return json(400, { ok: false, error: "Ajoutez un titre plus précis." });
    if (content.length < 30) return json(400, { ok: false, error: "Ajoutez quelques lignes de contenu." });
    await ref.update({ title, summary, description: buildArticleDescription(summary, content), content, category, image, imageAlt: image ? `${title} — Sentrys` : "", status, readingMinutes: readingTimeMinutes(content), updatedAt: FieldValue.serverTimestamp(), updatedBy: auth.uid, ...(status === "published" && oldStatus !== "published" ? { publishedAt: FieldValue.serverTimestamp() } : {}) });
    return json(200, { ok: true, id, slug: value(current.data()?.slug) || id, status, guidance: articleGuidance({ title, summary, content, image }) });
  } catch (error) { console.error("[platform.articles.PATCH]", error); return json(500, { ok: false, error: "Impossible de mettre à jour l’article." }); }
}