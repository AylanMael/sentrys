import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { forbidden, isSuperAdmin, requireTenantUser } from "@/app/api/_utils/withTenant";
import { adminDb } from "@/lib/firebase/admin";
import { articleGuidance, buildArticleDescription, listManagedPosts, readingTimeMinutes, slugifyArticle } from "@/lib/blog";

export const runtime = "nodejs";
function json(status: number, body: unknown) { const response = NextResponse.json(body, { status }); response.headers.set("Cache-Control", "no-store"); return response; }
function value(input: unknown) { return String(input ?? "").trim(); }
async function authorize(req: NextRequest) { const auth = await requireTenantUser(req); if (!auth.ok) return auth; if (!isSuperAdmin(auth.role) || auth.tenantId !== "platform") return { ok: false as const, res: forbidden("Super administrateur plateforme requis") }; return auth; }

export async function GET(req: NextRequest) {
  const auth = await authorize(req); if (!auth.ok) return auth.res;
  try { return json(200, { ok: true, articles: await listManagedPosts() }); }
  catch (error) { console.error("[platform.articles.GET]", error); return json(500, { ok: false, error: "Impossible de charger les articles." }); }
}

export async function POST(req: NextRequest) {
  const auth = await authorize(req); if (!auth.ok) return auth.res;
  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return json(400, { ok: false, error: "Données de l’article requises." });
    const title = value(body.title), summary = value(body.summary), content = value(body.content), category = value(body.category), image = value(body.image);
    const status = body.action === "publish" ? "published" : "draft";
    if (title.length < 5) return json(400, { ok: false, error: "Ajoutez un titre plus précis." });
    if (content.length < 30) return json(400, { ok: false, error: "Ajoutez quelques lignes de contenu." });
    const base = slugifyArticle(title); let slug = base;
    for (let index = 2; index < 100; index += 1) { const existing = await adminDb.collection("blogPosts").doc(slug).get(); if (!existing.exists) break; slug = `${base}-${index}`; }
    const now = FieldValue.serverTimestamp();
    const article = { slug, title, summary, description: buildArticleDescription(summary, content), content, category, image, imageAlt: image ? `${title} — Sentrys` : "", status, readingMinutes: readingTimeMinutes(content), createdAt: now, updatedAt: now, publishedAt: status === "published" ? now : null, createdBy: auth.uid, updatedBy: auth.uid };
    await adminDb.collection("blogPosts").doc(slug).create(article);
    return json(201, { ok: true, id: slug, slug, status, guidance: articleGuidance({ title, summary, content, image }) });
  } catch (error) { console.error("[platform.articles.POST]", error); return json(500, { ok: false, error: "Impossible d’enregistrer l’article." }); }
}