import "server-only";

import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

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
  url: null;
  path: string;
  storageMode: "firebase" | "local-dev";
  bucketName?: string | null;
};

export function sanitizeUploadFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-90) || "upload";
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
  metadata,
}: {
  buffer: Buffer;
  contentType: string;
  path: string;
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
          cacheControl: "private, no-store, max-age=0",
          metadata,
        },
      });

      return {
        url: null,
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

async function saveToLocalPrivateUpload({
  buffer,
  path,
}: {
  buffer: Buffer;
  path: string;
}) {
  const relativePath = [".private-uploads", path].join("/");
  const absolutePath = join(process.cwd(), ...relativePath.split("/"));

  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer);

  return {
    url: null,
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
      metadata: cleanMetadata,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      throw error;
    }

    return saveToLocalPrivateUpload({ buffer, path });
  }
}
export async function deleteTenantFile({
  path,
  tenantId,
}: {
  path: string;
  tenantId: string;
}) {
  const normalizedPath = String(path ?? "").trim().replace(/\\/g, "/");
  const tenantPrefix = `tenants/${tenantId}/`;
  if (
    !normalizedPath.startsWith(tenantPrefix) ||
    normalizedPath.includes("..") ||
    normalizedPath.startsWith("/")
  ) {
    throw new Error("Invalid tenant storage path");
  }

  if (process.env.NODE_ENV !== "production") {
    const privateRoot = resolve(process.cwd(), ".private-uploads");
    const localPath = resolve(privateRoot, ...normalizedPath.split("/"));
    const relativePath = relative(privateRoot, localPath);
    if (!relativePath.startsWith("..") && !relativePath.includes(":\\")) {
      try {
        await unlink(localPath);
        return { deleted: true, storageMode: "local-dev" as const };
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOENT") throw error;
      }
    }
  }

  let lastError: unknown = null;
  for (const bucketName of storageBucketCandidates()) {
    try {
      await adminStorage.bucket(bucketName).file(normalizedPath).delete({ ignoreNotFound: true });
      return { deleted: true, storageMode: "firebase" as const };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return { deleted: false, storageMode: "firebase" as const };
}