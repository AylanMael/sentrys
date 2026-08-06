export type RiskLevel = "ok" | "watch" | "critical";
export type SignalTone = "critical" | "warning" | "info";
export type PlatformPlanId = "free" | "starter" | "pro" | "growth";
export type SupportScope = "diagnostic" | "billing" | "technical" | "security";
export type TenantWorkspaceTab = "situation" | "activation" | "billing" | "access" | "support" | "audit";

export const TENANT_WORKSPACE_TABS = [
  "situation",
  "activation",
  "billing",
  "access",
  "support",
  "audit",
] as const satisfies readonly TenantWorkspaceTab[];

export function normalizeTenantWorkspaceTab(
  hash: string | null | undefined
): TenantWorkspaceTab {
  const value = (hash ?? "").replace(/^#/, "").trim().toLowerCase();
  if (value === "overview") return "situation";
  if (value === "governance") return "billing";
  if (TENANT_WORKSPACE_TABS.includes(value as TenantWorkspaceTab)) {
    return value as TenantWorkspaceTab;
  }
  return "situation";
}

export type TenantUserRow = {
  id: string;
  uid: string | null;
  name: string | null;
  email: string | null;
  role: string;
  status: string;
  createdAtIso: string | null;
  updatedAtIso: string | null;
};

export type PlatformAuditEvent = {
  id: string;
  action: string;
  actionLabel: string;
  tenantId: string | null;
  tenantName: string | null;
  actorEmail: string | null;
  reason: string | null;
  status: string;
  tone: SignalTone;
  createdAtIso: string | null;
};

export type SupportSessionRow = {
  id: string;
  scope: string;
  status: string;
  reason: string | null;
  actorEmail: string | null;
  readOnly: boolean;
  impersonation: boolean;
  durationMinutes: number;
  startedAtIso: string | null;
  expiresAtIso: string | null;
  closedAtIso: string | null;
};

export type OwnerInvitationRow = {
  id: string;
  uid: string | null;
  email: string | null;
  name: string | null;
  status: string;
  createdAuthUser: boolean;
  resetLinkCreated: boolean;
  resetLinkError: string | null;
  actorEmail: string | null;
  createdAtIso: string | null;
};

export type OwnerInviteResult = {
  uid: string;
  email: string;
  name: string;
  role: string;
  createdAuthUser: boolean;
  resetLink: string | null;
  resetLinkError: string | null;
  invitationId: string;
  message: string;
};

export type ActivationStepRow = {
  id: string;
  label: string;
  detail: string;
  done: boolean;
  blocker: boolean;
};

export type TenantDétailResponse = {
  ok: true;
  generatedAtIso: string;
  tenant: {
    id: string;
    name: string;
    status: string;
    plan: string;
    ownerEmail: string | null;
    createdAtIso: string | null;
    updatedAtIso: string | null;
  };
  counters: {
    users: number;
    agents: number;
    sites: number;
    clients: number;
    vacationsMonth: number;
    openIncidents: number;
  };
  billing: {
    plan: {
      id: string;
      name: string;
      active: boolean;
      priceMonthlyCents: number | null;
    };
    subscription: {
      planId: string;
      status: string;
      addons: Record<string, unknown>;
      stripeCustomerId: string | null;
      stripeSubId: string | null;
    };
    limits: {
      agents: number;
      sites: number;
      tenants: number;
    };
  };
  risk: {
    riskLevel: RiskLevel;
    riskReasons: string[];
  };
  onboarding: {
    status: string;
    ownerEmail: string | null;
    ownerUid: string | null;
    completion: number;
    readyToActivate: boolean;
    steps: ActivationStepRow[];
  };
  users: TenantUserRow[];
  supportSessions: SupportSessionRow[];
  ownerInvitations: OwnerInvitationRow[];
  auditLog: PlatformAuditEvent[];
  signals: Array<{
    id: string;
    tone: SignalTone;
    title: string;
    detail: string;
  }>;
};
