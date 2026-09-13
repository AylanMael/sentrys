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
import { deleteTenantFile, uploadTenantFile } from "@/lib/uploads/tenant-files";
import { isAgentStoragePath, parseFirebaseStoragePath, secureAgentFileUrl } from "@/lib/uploads/agent-file-access";
import {
  hasExpectedFileSignature,
  isAllowedAgentDocumentMimeType,
} from "@/lib/uploads/file-validation";

export const runtime = "nodejs";

const MAX_DOCUMENT_SIZE = 12 * 1024 * 1024;


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
  return isAllowedAgentDocumentMimeType(file.type);
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
  const replaceId = text(formData.get("replaceId"));
  const reason = text(formData.get("reason"));
  const previousDocument = replaceId ? previousDocuments.find(item => item.id === replaceId) : null;
  if (replaceId && (!reason || reason.length < 12 || reason.length > 500)) {
    return bad("Le motif du remplacement doit contenir entre 12 et 500 caractères.");
  }
  if (replaceId && !previousDocument) {
    return json(409, { ok: false, error: "Ce document a changé. Actualisez la fiche avant de le remplacer." });
  }
  const oldPath = previousDocument ? previousDocument.path || parseFirebaseStoragePath(previousDocument.url) : null;
  if (oldPath && (!isAgentStoragePath(oldPath, auth.tenantId, agentId)
    || !oldPath.startsWith(`tenants/${auth.tenantId}/agents/${agentId}/documents/`))) {
    return bad("Référence du fichier incohérente. Contactez le support.");
  }

  if (!replaceId && previousDocuments.length >= 30) {
    return bad("Maximum 30 documents per agent");
  }

  const label = text(formData.get("label")) || file.name;
  const kind = normalizeAgentProfileField(formData.get("kind")) ?? "other";
  const expiresAt = normalizeAgentProfileField(formData.get("expiresAt"));
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!hasExpectedFileSignature(buffer, file.type)) {
    return bad("File content does not match its declared type");
  }

  let uploadResult: { path: string; storageMode: string };
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

  const documentId = randomUUID();
  const traceRef = replaceId ? agentRef.collection("documentReplacementTraces").doc(documentId) : null;
  const storedDocument: AgentDocumentItem = {
    id: documentId,
    label,
    url: "",
    path: uploadResult.path,
    kind,
    expiresAt,
    fileName: file.name,
    mimeType: file.type || null,
    size: file.size,
    uploadedAt: new Date().toISOString(),
  };
  const responseDocument: AgentDocumentItem = {
    ...storedDocument,
    url: secureAgentFileUrl(agentId, documentId),
  };

  try {
    await adminDb.runTransaction(async (transaction) => {
      const currentSnap = await transaction.get(agentRef);
      if (!currentSnap.exists) throw new Error("AGENT_NOT_FOUND");
      const currentAgent = currentSnap.data() as Record<string, unknown>;
      if (currentAgent.tenantId !== auth.tenantId) throw new Error("AGENT_NOT_FOUND");
      const currentProfile =
        currentAgent.profile && typeof currentAgent.profile === "object"
          ? (currentAgent.profile as Record<string, unknown>)
          : {};
      const currentDocuments = normalizeAgentDocuments(currentProfile.documents);
      if (replaceId) {
        const currentDocument = currentDocuments.find(item => item.id === replaceId);
        if (!currentDocument || JSON.stringify(currentDocument) !== JSON.stringify(previousDocument)) {
          throw new Error("DOCUMENT_CHANGED");
        }
      } else if (currentDocuments.length >= 30) throw new Error("DOCUMENT_LIMIT_REACHED");

      transaction.set(
        agentRef,
        {
          profile: {
            ...currentProfile,
            documents: replaceId
              ? currentDocuments.map(item => item.id === replaceId ? storedDocument : item)
              : [...currentDocuments, storedDocument],
          },
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: auth.uid,
        },
        { merge: true }
      );
      if (traceRef && previousDocument) {
        transaction.set(traceRef, {
          tenantId: auth.tenantId, agentId, previousDocumentId: replaceId,
          documentId, label: previousDocument.label, previousFileName: previousDocument.fileName ?? null,
          newFileName: file.name, reason, actorUid: auth.uid, actorName: auth.name ?? null,
          createdAt: FieldValue.serverTimestamp(),
          cleanupStatus: oldPath ? "pending" : "not-required",
          // Server-only cleanup reference, never included in the history response.
          cleanupPath: oldPath,
        });
      }
    });
  } catch (error) {
    if (traceRef) {
      // A lost commit acknowledgement must never cause deletion of the new live file.
      try {
        const committedTrace = await traceRef.get();
        if (committedTrace.exists) {
          return json(200, { ok: true, document: responseDocument, path: uploadResult.path,
            storageMode: uploadResult.storageMode, replacedDocumentId: replaceId,
            storageCleanup: oldPath ? "pending" : "not-required" });
        }
      } catch {
        return json(503, { ok: false, error: "L’état du remplacement n’a pas pu être confirmé. Actualisez la fiche avant de réessayer." });
      }
    }
    try {
      await deleteTenantFile({ path: uploadResult.path, tenantId: auth.tenantId });
    } catch (cleanupError) {
      console.error("[agent-document.POST] rollback cleanup failed", cleanupError);
    }
    if ((error as Error).message === "DOCUMENT_LIMIT_REACHED") {
      return bad("Maximum 30 documents per agent");
    }
    if ((error as Error).message === "DOCUMENT_CHANGED") {
      return json(409, { ok: false, error: "Ce document vient d’être modifié. Actualisez la fiche ; votre remplacement n’a pas été appliqué." });
    }
    if ((error as Error).message === "AGENT_NOT_FOUND") {
      return json(404, { ok: false, error: "Agent not found" });
    }
    console.error("[agent-document.POST] persistence failed", error);
    return json(500, { ok: false, error: "Impossible d'archiver le document." });
  }

  let storageCleanup = "not-required";
  if (traceRef && oldPath) {
    try {
      const cleanup = await deleteTenantFile({ path: oldPath, tenantId: auth.tenantId });
      storageCleanup = cleanup.deleted ? "deleted" : "not-found";
      await traceRef.update({ cleanupStatus: storageCleanup, cleanupPath: FieldValue.delete() });
    } catch {
      // The atomic trace stays pending so an operator can investigate and retry.
      storageCleanup = "pending";
      console.error("[agent-document.POST] replacement cleanup pending", { agentId, documentId });
    }
  }

  return json(200, {
    ok: true,
    document: responseDocument,
    path: uploadResult.path,
    storageMode: uploadResult.storageMode,
    replacedDocumentId: replaceId || null,
    storageCleanup,
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return json(403, { ok: false, error: "Action non autorisée." });
  const { id } = await params;
  try {
    const ref = adminDb.collection("agents").doc(id);
    const agent = await ref.get();
    if (!agent.exists || agent.data()?.tenantId !== auth.tenantId) return json(404, { ok: false, error: "Agent introuvable." });
    const snapshot = await ref.collection("documentReplacementTraces").orderBy("createdAt", "desc").limit(51).get();
    const traces = snapshot.docs.slice(0, 50).map(doc => {
      const data = doc.data();
      return { id: doc.id, label: data.label, previousFileName: data.previousFileName,
        newFileName: data.newFileName, reason: data.reason, actorUid: data.actorUid,
        actorName: data.actorName, createdAt: data.createdAt?.toDate?.().toISOString() ?? null,
        cleanupStatus: data.cleanupStatus };
    });
    return json(200, { ok: true, traces, hasMore: snapshot.size > 50 });
  } catch {
    return json(503, { ok: false, error: "Historique momentanément indisponible." });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) {
    return json(403, { ok: false, error: "Action non autorisee." });
  }

  const { id } = await params;
  const agentId = String(id ?? "").trim();
  if (!agentId) return bad("Identifiant agent manquant.");

  let documentId = "";
  try {
    const body = (await req.json()) as { documentId?: unknown };
    documentId = String(body.documentId ?? "").trim();
  } catch {
    return bad("Corps JSON invalide.");
  }
  if (!documentId) return bad("Identifiant document manquant.");

  const agentRef = adminDb.collection("agents").doc(agentId);
  try {
    const result = await adminDb.runTransaction(async (transaction) => {
      const agentSnap = await transaction.get(agentRef);
      if (!agentSnap.exists) return { status: "agent-not-found" as const, path: null };

      const agent = agentSnap.data() as Record<string, unknown>;
      if (agent.tenantId !== auth.tenantId) {
        return { status: "agent-not-found" as const, path: null };
      }

      const previousProfile =
        agent.profile && typeof agent.profile === "object"
          ? (agent.profile as Record<string, unknown>)
          : {};
      const documents = normalizeAgentDocuments(previousProfile.documents);
      const document = documents.find((item) => item.id === documentId);
      if (!document) return { status: "document-not-found" as const, path: null };
      const documentPath = document.path || parseFirebaseStoragePath(document.url);
      if (documentPath && (!isAgentStoragePath(documentPath, auth.tenantId, agentId)
        || !documentPath.startsWith(`tenants/${auth.tenantId}/agents/${agentId}/documents/`))) {
        throw new Error("INVALID_DOCUMENT_PATH");
      }

      transaction.set(
        agentRef,
        {
          profile: {
            ...previousProfile,
            documents: documents.filter((item) => item.id !== documentId),
          },
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: auth.uid,
        },
        { merge: true }
      );

      return {
        status: "deleted" as const,
        path: documentPath,
      };
    });

    if (result.status === "agent-not-found") {
      return json(404, { ok: false, error: "Agent introuvable." });
    }
    if (result.status === "document-not-found") {
      return json(404, { ok: false, error: "Document introuvable." });
    }

    let storageCleanup = "not-required";
    if (result.path) {
      try {
        const cleanup = await deleteTenantFile({ path: result.path, tenantId: auth.tenantId });
        storageCleanup = cleanup.deleted ? "deleted" : "not-found";
      } catch (error) {
        storageCleanup = "pending";
        console.error("[agent-document.DELETE] storage cleanup failed", {
          agentId,
          documentId,
          error,
        });
      }
    }

    return json(200, { ok: true, documentId, storageCleanup });
  } catch (error) {
    console.error("[agent-document.DELETE] failed", { agentId, documentId, error });
    return json(500, { ok: false, error: "Impossible de supprimer le document." });
  }
}
