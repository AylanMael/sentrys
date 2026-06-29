import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";

import { canWrite, requireTenantUser } from "@/app/api/_utils/withTenant";
import { adminDb } from "@/lib/firebase/admin";
import {
  normalizeAgentDocuments,
  normalizeAgentProfileField,
  type AgentDocumentItem,
} from "@/lib/agents/profile";
import { uploadTenantFile } from "@/lib/uploads/tenant-files";

export const runtime = "nodejs";

const MAX_DOCUMENT_SIZE = 12 * 1024 * 1024;
const ACCEPTED_DOCUMENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function bad(message: string) {
  return json(400, { ok: false, error: message });
}

function text(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function isAcceptedDocument(file: File) {
  return file.type.startsWith("image/") || ACCEPTED_DOCUMENT_TYPES.has(file.type);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!canWrite(auth.role)) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  const { id } = await params;
  const agentId = String(id ?? "").trim();
  if (!agentId) return bad("Missing agent id");

  const agentRef = adminDb.collection("agents").doc(agentId);
  const agentSnap = await agentRef.get();
  if (!agentSnap.exists) {
    return json(404, { ok: false, error: "Agent not found" });
  }

  const agent = agentSnap.data() as Record<string, unknown>;
  if (agent.tenantId !== auth.tenantId) {
    return json(404, { ok: false, error: "Agent not found" });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return bad("Invalid multipart body");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return bad("file is required");
  }

  if (!isAcceptedDocument(file)) {
    return bad("Only PDF, image or Word documents are accepted");
  }

  if (file.size <= 0) {
    return bad("File is empty");
  }

  if (file.size > MAX_DOCUMENT_SIZE) {
    return bad("Document must be smaller than 12 MB");
  }

  const previousProfile =
    agent.profile && typeof agent.profile === "object"
      ? (agent.profile as Record<string, unknown>)
      : {};
  const previousDocuments = normalizeAgentDocuments(previousProfile.documents);

  if (previousDocuments.length >= 30) {
    return bad("Maximum 30 documents per agent");
  }

  const label = text(formData.get("label")) || file.name;
  const kind = normalizeAgentProfileField(formData.get("kind")) ?? "other";
  const expiresAt = normalizeAgentProfileField(formData.get("expiresAt"));
  const buffer = Buffer.from(await file.arrayBuffer());

  let uploadResult: { url: string; path: string; storageMode: string };
  try {
    uploadResult = await uploadTenantFile({
      buffer,
      contentType: file.type || "application/octet-stream",
      originalName: file.name,
      tenantId: auth.tenantId,
      folderSegments: ["agents", agentId, "documents"],
      metadata: {
        agentId,
        uploadedBy: auth.uid,
        usage: "agent-document",
        kind,
      },
    });
  } catch (error) {
    console.error("[agent-document] upload failed", error);
    return json(503, {
      ok: false,
      error:
        "Storage bucket unavailable. Configure FIREBASE_STORAGE_BUCKET before uploading documents.",
    });
  }

  const document: AgentDocumentItem = {
    id: randomUUID(),
    label,
    url: uploadResult.url,
    kind,
    expiresAt,
    fileName: file.name,
    mimeType: file.type || null,
    size: file.size,
    uploadedAt: new Date().toISOString(),
  };

  const documents = [...previousDocuments, document];

  await agentRef.set(
    {
      profile: {
        ...previousProfile,
        documents,
      },
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: auth.uid,
    },
    { merge: true }
  );

  return json(200, {
    ok: true,
    document,
    path: uploadResult.path,
    storageMode: uploadResult.storageMode,
  });
}
