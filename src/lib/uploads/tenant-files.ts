import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { adminStorage } from "@/lib/firebase/admin";

type UploadTenantFileInput = {
  buffer: Buffer;
  contentType: string;
  originalName: string;
  tenantId: string;
  folderSegments: string[];
  metadata?: Record<string, string | null | undefined>;
};

export type TenantFileUploadResult = {
  url: string;
  path: string;
  storageMode: "firebase" | "local-dev";
  bucketName?: string | null;
};

export function sanitizeUploadFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-90) || "upload";
}

function buildFirebaseDownloadUrl(bucketName: string, path: string, token: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    path
  )}?alt=media&token=${token}`;
}

function storageBucketCandidates() {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
    "sentrys";
  const configured =
    process.env.FIREBASE_STORAGE_BUCKET ??
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
    "";

  return Array.from(
    new Set(
      [
        configured,
        `${projectId}.firebasestorage.app`,
        `${projectId}.appspot.com`,
      ].filter(Boolean)
    )
  );
}

async function uploadToFirebaseStorage({
  buffer,
  contentType,
  path,
  token,
  metadata,
}: {
  buffer: Buffer;
  contentType: string;
  path: string;
  token: string;
  metadata: Record<string, string>;
}) {
  let lastError: unknown = null;

  for (const bucketName of storageBucketCandidates()) {
    const bucket = adminStorage.bucket(bucketName);
    const storageFile = bucket.file(path);

    try {
      await storageFile.save(buffer, {
        resumable: false,
        contentType,
        metadata: {
          cacheControl: "public, max-age=3600",
          metadata: {
            ...metadata,
            firebaseStorageDownloadTokens: token,
          },
        },
      });

      return {
        url: buildFirebaseDownloadUrl(bucket.name, path, token),
        path,
        storageMode: "firebase" as const,
        bucketName: bucket.name,
      };
    } catch (error) {
      lastError = error;
      console.warn("[tenant-file-upload] Firebase Storage upload failed", {
        bucketName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Firebase Storage upload failed");
}

async function saveToLocalPublicUpload({
  buffer,
  path,
}: {
  buffer: Buffer;
  path: string;
}) {
  const relativePath = ["uploads", path].join("/");
  const absolutePath = join(process.cwd(), "public", ...relativePath.split("/"));

  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer);

  return {
    url: `/${relativePath}`,
    path,
    storageMode: "local-dev" as const,
    bucketName: null,
  };
}

export async function uploadTenantFile({
  buffer,
  contentType,
  originalName,
  tenantId,
  folderSegments,
  metadata = {},
}: UploadTenantFileInput): Promise<TenantFileUploadResult> {
  const safeName = `${Date.now()}-${sanitizeUploadFileName(originalName)}`;
  const path = ["tenants", tenantId, ...folderSegments, safeName].join("/");
  const token = randomUUID();
  const cleanMetadata = Object.fromEntries(
    Object.entries({
      tenantId,
      originalName,
      ...metadata,
    })
      .filter((entry): entry is [string, string] => {
        return typeof entry[1] === "string" && entry[1].trim().length > 0;
      })
      .map(([key, value]) => [key, value.trim()])
  );

  try {
    return await uploadToFirebaseStorage({
      buffer,
      contentType,
      path,
      token,
      metadata: cleanMetadata,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      throw error;
    }

    return saveToLocalPublicUpload({ buffer, path });
  }
}
