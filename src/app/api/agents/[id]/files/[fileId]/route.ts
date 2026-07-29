import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";

import {
  canWrite,
  forbidden,
  isAgent,
  requireTenantUser,
} from "@/app/api/_utils/withTenant";
import { normalizeAgentDocuments } from "@/lib/agents/profile";
import { adminBucket, adminDb } from "@/lib/firebase/admin";
import {
  isAgentStoragePath,
  parseFirebaseStoragePath,
} from "@/lib/uploads/agent-file-access";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function safeFileName(value: unknown) {
  return String(value ?? "download")
    .replace(/[\r\n"\\/]/g, "-")
    .slice(0, 120) || "download";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  const { id: agentId, fileId } = await params;
  if (!canWrite(auth.role) && !isAgent(auth.role)) return forbidden("Forbidden");
  if (isAgent(auth.role) && (auth.agentId ?? auth.uid) !== agentId) {
    return forbidden("Forbidden");
  }

  const agentSnap = await adminDb.collection("agents").doc(agentId).get();
  if (!agentSnap.exists) return json(404, { ok: false, error: "File not found" });

  const agent = agentSnap.data() as Record<string, unknown>;
  if (agent.tenantId !== auth.tenantId) {
    return json(404, { ok: false, error: "File not found" });
  }

  const profile = agent.profile && typeof agent.profile === "object"
    ? (agent.profile as Record<string, unknown>)
    : {};

  let storagePath: string | null = null;
  let fileName = "download";
  let expectedMimeType: string | null = null;
  let inline = false;

  if (fileId === "photo") {
    storagePath = String(profile.photoPath ?? "").trim()
      || parseFirebaseStoragePath(profile.photoUrl);
    fileName = "photo-agent";
    inline = true;
  } else {
    const document = normalizeAgentDocuments(profile.documents).find(
      (item) => item.id === fileId
    );
    if (document) {
      storagePath = document.path || parseFirebaseStoragePath(document.url);
      fileName = document.fileName || document.label || "document";
      expectedMimeType = document.mimeType || null;
    }
  }

  if (!storagePath || !isAgentStoragePath(storagePath, auth.tenantId, agentId)) {
    return json(404, { ok: false, error: "File not found" });
  }

  try {
    let body: Buffer;
    let contentType = expectedMimeType || "application/octet-stream";

    if (process.env.NODE_ENV !== "production") {
      try {
        body = await readFile(join(process.cwd(), ".private-uploads", ...storagePath.split("/")));
      } catch {
        const file = adminBucket.file(storagePath);
        const [data, metadata] = await Promise.all([file.download(), file.getMetadata()]);
        body = data[0];
        contentType = metadata[0].contentType || contentType;
      }
    } else {
      const file = adminBucket.file(storagePath);
      const [data, metadata] = await Promise.all([file.download(), file.getMetadata()]);
      body = data[0];
      contentType = metadata[0].contentType || contentType;
    }

    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeFileName(fileName)}"`,
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[agent-file.GET] failed", { agentId, fileId, error });
    return json(404, { ok: false, error: "File not found" });
  }
}