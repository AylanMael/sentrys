import { NextResponse } from "next/server";
import { getAllPosts } from "@/lib/blog";

export const runtime = "nodejs";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

function xmlEscape(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function GET() {
  const posts = await getAllPosts();

  const items = posts.slice(0, 50).map((p) => {
    const link = `${SITE_URL}/blog/${p.slug}`;
    return `
      <item>
        <title>${xmlEscape(p.title)}</title>
        <link>${xmlEscape(link)}</link>
        <guid isPermaLink="true">${xmlEscape(link)}</guid>
        <pubDate>${new Date(p.date).toUTCString()}</pubDate>
        ${p.category ? `<category>${xmlEscape(p.category)}</category>` : ""}
        <description>${xmlEscape(p.description ?? "")}</description>
      </item>
    `.trim();
  }).join("\n");

  const rssUrl = `${SITE_URL}/rss.xml`;

  const rss = `
    <?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
      <channel>
        <title>${xmlEscape("Blog Sentrys")}</title>
        <link>${xmlEscape(`${SITE_URL}/blog`)}</link>
        <atom:link href="${xmlEscape(rssUrl)}" rel="self" type="application/rss+xml" />
        <description>${xmlEscape(
          "Analyses métier, nouveautés produit et conseils concrets pour la sécurité privée."
        )}</description>
        <language>fr-FR</language>
        <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
        ${items}
      </channel>
    </rss>
  `.trim();

  return new NextResponse(rss, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
