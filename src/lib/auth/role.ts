// src/lib/auth/rôles.ts

export const APP_ROLES = [
  "super_admin",
  "owner",
  "admin",
  "manager",
  "agent",
  "client",
  "viewer",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

const ROLE_SET = new Set<string>(APP_ROLES);

const ROLE_ALIASES: Record<string, AppRole> = {
  superadmin: "super_admin",
  "super_admin": "super_admin",
  "super-admin": "super_admin",
  "super admin": "super_admin",

  proprietor: "owner",
  propriétaire: "owner",

  administrator: "admin",
  administrateur: "admin",

  responsable: "manager",

  guard: "agent",

  customer: "client",

  read_only: "viewer",
  readonly: "viewer",
  observateur: "viewer",
};

function normalizeRawRole(role: unknown): string | null {
  if (typeof role !== "string") return null;

  const trimmed = role.trim();
  if (!trimmed) return null;

  return trimmed.toLowerCase().replace(/\s+/g, " ");
}

export function normalizeRole(role: unknown): AppRole | null {
  const raw = normalizeRawRole(role);
  if (!raw) return null;

  if (ROLE_SET.has(raw)) {
    return raw as AppRole;
  }

  return ROLE_ALIASES[raw] ?? null;
}

export function isKnownRole(role: unknown): role is AppRole {
  return normalizeRole(role) !== null;
}

export function hasRole(role: unknown, allowed: readonly AppRole[]): boolean {
  const normalized = normalizeRole(role);
  return normalized ? allowed.includes(normalized) : false;
}

export function isSuperAdminRole(role: unknown): boolean {
  return hasRole(role, ["super_admin"]);
}

export function isOwnerRole(role: unknown): boolean {
  return hasRole(role, ["owner"]);
}

export function isAdminRole(role: unknown): boolean {
  return hasRole(role, ["super_admin", "owner", "admin"]);
}

export function isAdminLike(role: unknown): boolean {
  return hasRole(role, ["super_admin", "owner", "admin"]);
}

export function isManagerRole(role: unknown): boolean {
  return hasRole(role, ["manager"]);
}

export function isAgentRole(role: unknown): boolean {
  return hasRole(role, ["agent"]);
}

export function isClientRole(role: unknown): boolean {
  return hasRole(role, ["client"]);
}

export function isViewerRole(role: unknown): boolean {
  return hasRole(role, ["viewer"]);
}

export function canAccessDashboard(role: unknown): boolean {
  return hasRole(role, [
    "super_admin",
    "owner",
    "admin",
    "manager",
    "agent",
    "client",
    "viewer",
  ]);
}

export function canReadBackoffice(role: unknown): boolean {
  return hasRole(role, ["super_admin", "owner", "admin", "manager", "viewer"]);
}

export function canAccessCommandCenter(role: unknown): boolean {
  return hasRole(role, ["super_admin", "owner", "admin", "manager"]);
}

export function canManagePlanning(role: unknown): boolean {
  return hasRole(role, ["super_admin", "owner", "admin", "manager"]);
}

export function canCreateVacation(role: unknown): boolean {
  return hasRole(role, ["super_admin", "owner", "admin", "manager"]);
}

export function canAssignAgent(role: unknown): boolean {
  return hasRole(role, ["super_admin", "owner", "admin", "manager"]);
}

export function canManageAgents(role: unknown): boolean {
  return hasRole(role, ["super_admin", "owner", "admin", "manager"]);
}

export function canManageSites(role: unknown): boolean {
  return hasRole(role, ["super_admin", "owner", "admin", "manager"]);
}

export function canManageIncidents(role: unknown): boolean {
  return hasRole(role, ["super_admin", "owner", "admin", "manager", "agent"]);
}

export function canViewBilling(role: unknown): boolean {
  return hasRole(role, ["super_admin", "owner", "admin"]);
}

export function canManageTenant(role: unknown): boolean {
  return hasRole(role, ["super_admin", "owner", "admin"]);
}

export function canManageUsers(role: unknown): boolean {
  return hasRole(role, ["super_admin", "owner", "admin"]);
}

export function canViewReports(role: unknown): boolean {
  return hasRole(role, ["super_admin", "owner", "admin", "manager", "viewer"]);
}

export function canViewOwnClientSpace(role: unknown): boolean {
  return hasRole(role, ["client"]);
}

export function getRoleLabel(role: unknown): string {
  const normalized = normalizeRole(role);

  switch (normalized) {
    case "super_admin":
      return "Super administrateur";
    case "owner":
      return "Propriétaire";
    case "admin":
      return "Administrateur";
    case "manager":
      return "Manager";
    case "agent":
      return "Agent";
    case "client":
      return "Client";
    case "viewer":
      return "Observateur";
    default:
      return "Inconnu";
  }
}
