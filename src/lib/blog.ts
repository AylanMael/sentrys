import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { adminDb } from "@/lib/firebase/admin";

const BLOG_DIR = path.join(process.cwd(), "src", "content", "blog");
const BLOG_COLLECTION = "blogPosts";

export type BlogStatus = "draft" | "published" | "archived";
export type BlogPost = { id?: string; slug: string; title: string; description: string; date: string; updatedAt?: string; category?: string; author?: string; image?: string; imageAlt?: string; published?: boolean; status?: BlogStatus; readingMinutes?: number };
export type ManagedBlogPost = BlogPost & { id: string; content: string; status: BlogStatus; createdAt?: string };
export type ArticleGuidance = { tone: "success" | "warning"; message: string };

function text(value: unknown) { return String(value ?? "").trim(); }
function isTruthy(value: unknown) { return value === true || value === "true"; }
function toIso(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value && "toDate" in value) return (value as { toDate(): Date }).toDate().toISOString();
  return undefined;
}
export function slugifyArticle(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || "article"; }
export function plainText(value: string) { return value.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[#>*_`~\-]+/g, " ").replace(/\s+/g, " ").trim(); }
export function buildArticleDescription(summary: string, content: string) { const source = plainText(summary) || plainText(content); return source.length <= 155 ? source : `${source.slice(0, 152).replace(/\s+\S*$/, "")}…`; }
export function readingTimeMinutes(content: string) { const words = plainText(content).match(/\S+/g)?.length ?? 0; return Math.max(1, Math.ceil(words / 220)); }
export function articleGuidance(input: { title: string; summary: string; content: string; image?: string }): ArticleGuidance[] {
  const messages: ArticleGuidance[] = [];
  if (plainText(input.summary).length < 80) messages.push({ tone: "warning", message: "Résumé trop court : ajoutez une phrase." });
  if (!text(input.image)) messages.push({ tone: "warning", message: "Ajoutez une image pour améliorer le partage." });
  if (plainText(input.content).length < 500) messages.push({ tone: "warning", message: "Article encore court : développez une idée ou ajoutez un exemple." });
  if (input.title.length > 70) messages.push({ tone: "warning", message: "Titre un peu long : essayez de le raccourcir." });
  if (!messages.length) messages.push({ tone: "success", message: "Votre article est prêt à être publié." });
  return messages;
}
function firestorePost(id: string, data: FirebaseFirestore.DocumentData): ManagedBlogPost {
  const status = (text(data.status) || "draft") as BlogStatus; const content = text(data.content);
  return { id, slug: text(data.slug) || id, title: text(data.title), description: text(data.description), content, date: toIso(data.publishedAt) || toIso(data.createdAt) || new Date().toISOString(), createdAt: toIso(data.createdAt), updatedAt: toIso(data.updatedAt), category: text(data.category) || undefined, author: text(data.author) || "Sentrys", image: text(data.image) || undefined, imageAlt: text(data.imageAlt) || undefined, published: status === "published", status, readingMinutes: Number(data.readingMinutes) || readingTimeMinutes(content) };
}
async function getLegacyPosts(): Promise<BlogPost[]> {
  const files = await fs.readdir(BLOG_DIR).catch(() => []);
  return Promise.all(files.filter((file) => file.endsWith(".mdx")).map(async (file) => { const slug = file.replace(/\.mdx$/, ""); const raw = await fs.readFile(path.join(BLOG_DIR, file), "utf8"); const { data } = matter(raw); return { slug, title: text(data.title), description: text(data.description), date: text(data.date), category: data.category ? text(data.category) : undefined, author: data.author ? text(data.author) : undefined, image: data.image ? text(data.image) : undefined, imageAlt: data.imageAlt ? text(data.imageAlt) : undefined, published: data.published === undefined ? true : isTruthy(data.published) }; }));
}
export async function listManagedPosts(): Promise<ManagedBlogPost[]> { const snapshot = await adminDb.collection(BLOG_COLLECTION).orderBy("updatedAt", "desc").get(); return snapshot.docs.map((doc) => firestorePost(doc.id, doc.data())); }
export async function getAllPosts(): Promise<BlogPost[]> {
  const [managedSnapshot, legacy] = await Promise.all([adminDb.collection(BLOG_COLLECTION).where("status", "==", "published").get().catch(() => null), getLegacyPosts()]);
  const managed = managedSnapshot?.docs.map((doc) => firestorePost(doc.id, doc.data())) ?? []; const managedSlugs = new Set(managed.map((post) => post.slug)); const now = Date.now();
  return [...managed, ...legacy.filter((post) => !managedSlugs.has(post.slug))].filter((post) => post.published !== false).filter((post) => { const timestamp = new Date(post.date).getTime(); return Number.isFinite(timestamp) && timestamp <= now; }).sort((a, b) => +new Date(b.date) - +new Date(a.date));
}
export async function getPostBySlug(slug: string) {
  const doc = await adminDb.collection(BLOG_COLLECTION).doc(slug).get().catch(() => null);
  if (doc?.exists && text(doc.data()?.status) === "published") { const post = firestorePost(doc.id, doc.data()!); return { post, content: post.content }; }
  try { const raw = await fs.readFile(path.join(BLOG_DIR, `${slug}.mdx`), "utf8"); const { data, content } = matter(raw); const post: BlogPost = { slug, title: text(data.title), description: text(data.description), date: text(data.date), category: data.category ? text(data.category) : undefined, author: data.author ? text(data.author) : undefined, image: data.image ? text(data.image) : undefined, imageAlt: data.imageAlt ? text(data.imageAlt) : undefined, published: data.published === undefined ? true : isTruthy(data.published) }; return { post, content }; } catch { return { post: null, content: "" }; }
}