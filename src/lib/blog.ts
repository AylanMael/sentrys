import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { cache } from "react";

const BLOG_DIR = path.join(process.cwd(), "src", "content", "blog");

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  date: string; // ISO
  category?: string;
  author?: string;
  image?: string; // public path
  imageAlt?: string;
  published?: boolean;
};

function isTruthy(v: unknown) {
  return v === true || v === "true";
}

export const getAllPosts = cache(async (): Promise<BlogPost[]> => {
  const files = await fs.readdir(BLOG_DIR);
  const mdxFiles = files.filter((f) => f.endsWith(".mdx"));

  const posts = await Promise.all(
    mdxFiles.map(async (file) => {
      const slug = file.replace(/\.mdx$/, "");
      const raw = await fs.readFile(path.join(BLOG_DIR, file), "utf8");
      const { data } = matter(raw);

      const post: BlogPost = {
        slug,
        title: String(data.title ?? ""),
        description: String(data.description ?? ""),
        date: String(data.date ?? ""),
        category: data.category ? String(data.category) : undefined,
        author: data.author ? String(data.author) : undefined,
        image: data.image ? String(data.image) : undefined,
        imageAlt: data.imageAlt ? String(data.imageAlt) : undefined,
        published: data.published === undefined ? true : isTruthy(data.published),
      };

      return post;
    })
  );

  const now = new Date();
  return posts
    .filter((p) => p.published !== false)
    .filter((p) => {
      const d = new Date(p.date);
      return !Number.isNaN(d.getTime()) && d <= now;
    })
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));
});

export const getPostBySlug = cache(async (slug: string) => {
  const filePath = path.join(BLOG_DIR, `${slug}.mdx`);
  const raw = await fs.readFile(filePath, "utf8");
  const { data, content } = matter(raw);

  const post: BlogPost = {
    slug,
    title: String(data.title ?? ""),
    description: String(data.description ?? ""),
    date: String(data.date ?? ""),
    category: data.category ? String(data.category) : undefined,
    author: data.author ? String(data.author) : undefined,
    image: data.image ? String(data.image) : undefined,
    imageAlt: data.imageAlt ? String(data.imageAlt) : undefined,
    published: data.published === undefined ? true : isTruthy(data.published),
  };

  return { post, content };
});
