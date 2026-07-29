import "server-only";

import { createHash } from "node:crypto";
import type {
  DocumentReference,
  DocumentSnapshot,
  Transaction,
} from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase/admin";

export type AgentLinkContext = {
  agentId: string;
  agentRef: DocumentReference;
  agentSnap: DocumentSnapshot;
  linkRef: DocumentReference;
  linkSnap: DocumentSnapshot;
};

export function tenantAgentLinkId(tenantId: string, agentId: string) {
  return createHash("sha256")
    .update(`${tenantId}\0${agentId}`)
    .digest("hex");
}

export function tenantAgentLinkRef(tenantId: string, agentId: string) {
  return adminDb.collection("tenantAgentLinks").doc(tenantAgentLinkId(tenantId, agentId));
}

export async function loadAgentLinkContext(
  tx: Transaction,
  tenantId: string,
  agentId: string
): Promise<AgentLinkContext> {
  const agentRef = adminDb.collection("agents").doc(agentId);
  const linkRef = tenantAgentLinkRef(tenantId, agentId);
  const [agentSnap, linkSnap] = await Promise.all([
    tx.get(agentRef),
    tx.get(linkRef),
  ]);

  return { agentId, agentRef, agentSnap, linkRef, linkSnap };
}

export function assertAgentCanBeLinked(
  context: AgentLinkContext,
  tenantId: string,
  targetUid: string
) {
  if (!context.agentSnap.exists) {
    throw Object.assign(new Error("Agent introuvable."), { code: "AGENT_NOT_FOUND" });
  }

  const agent = context.agentSnap.data() as Record<string, unknown>;
  if (String(agent.tenantId ?? "") !== tenantId) {
    throw Object.assign(new Error("Agent hors agence."), { code: "AGENT_TENANT_MISMATCH" });
  }
  if (String(agent.status ?? "active") !== "active") {
    throw Object.assign(new Error("Seuls les agents actifs peuvent etre lies."), {
      code: "AGENT_INACTIVE",
    });
  }

  if (context.linkSnap.exists) {
    const link = context.linkSnap.data() as Record<string, unknown>;
    if (String(link.uid ?? "") !== targetUid) {
      throw Object.assign(new Error("Cet agent est deja lie a un autre compte."), {
        code: "AGENT_ALREADY_LINKED",
      });
    }
  }
}

export function reserveAgentLink(
  tx: Transaction,
  context: AgentLinkContext,
  tenantId: string,
  targetUid: string,
  actorUid: string,
  timestamp: unknown
) {
  tx.set(
    context.linkRef,
    {
      tenantId,
      agentId: context.agentId,
      uid: targetUid,
      updatedAt: timestamp,
      updatedBy: actorUid,
      ...(!context.linkSnap.exists
        ? { createdAt: timestamp, createdBy: actorUid }
        : {}),
    },
    { merge: true }
  );
}

export function releaseAgentLink(
  tx: Transaction,
  context: AgentLinkContext | null,
  targetUid: string
) {
  if (!context?.linkSnap.exists) return;
  const link = context.linkSnap.data() as Record<string, unknown>;
  if (String(link.uid ?? "") === targetUid) {
    tx.delete(context.linkRef);
  }
}