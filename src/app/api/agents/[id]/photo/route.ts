import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { canWrite, requireTenantUser } from "@/app/api/_utils/withTenant";
import { adminDb } from "@/lib/firebase/admin";
import { uploadTenantFile } from "@/lib/uploads/tenant-files";

export const runtime = "nodejs";

const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function bad(message: string) {
  return json(400, { ok: false, error: message });
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

  if (!file.type.startsWith("image/")) {
    return bad("Only image files are accepted");
  }

  if (file.size <= 0) {
    return bad("File is empty");
  }

  if (file.size > MAX_PHOTO_SIZE) {
    return bad("Photo must be smaller than 5 MB");
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  let uploadResult: { url: string; path: string; storageMode: string };

  try {
    uploadResult = await uploadTenantFile({
      buffer,
      contentType: file.type,
      tenantId: auth.tenantId,
      originalName: file.name,
      folderSegments: ["agents", agentId, "photo"],
      metadata: {
        agentId,
        uploadedBy: auth.uid,
        usage: "agent-photo",
      },
    });
  } catch (error) {
    console.error("[agent-photo] upload failed", error);
    return json(503, {
      ok: false,
      error:
        "Storage bucket unavailable. Configure FIREBASE_STORAGE_BUCKET before uploading photos.",
    });
  }

  const photoUrl = uploadResult.url;
  const previousProfile =
    agent.profile && typeof agent.profile === "object"
      ? (agent.profile as Record<string, unknown>)
      : {};

  await agentRef.set(
    {
      profile: {
        ...previousProfile,
        photoUrl,
      },
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: auth.uid,
    },
    { merge: true }
  );

  return json(200, {
    ok: true,
    photoUrl,
    path: uploadResult.path,
    storageMode: uploadResult.storageMode,
  });
}
