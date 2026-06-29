// src/app/robots.ts
import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export default function robots(): MetadataRoute.Robots {
  const isProd =
    SITE_URL.startsWith("https://") &&
    !SITE_URL.includes("localhost") &&
    !SITE_URL.includes("vercel.app");

  return {
    rules: isProd
      ? [
          {
            userAgent: "*",
            allow: "/",
          },
        ]
      : [
          // En dev / preview : on évite l’indexation
          {
            userAgent: "*",
            disallow: "/",
          },
        ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
