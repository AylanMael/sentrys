export type SiteEmergencyContact = {
  name: string;
  role?: string | null;
  phone?: string | null;
  email?: string | null;
  priority?: number;
};

export type SiteType =
  | "bureaux"
  | "chantier"
  | "boutique"
  | "evenement"
  | "hotel"
  | "autre";

export type Site = {
  id: string;
  tenantId: string;

  name: string;
  clientId?: string | null;
  clientName?: string | null;

  siteType: SiteType;
  riskLevel: 1 | 2 | 3 | 4 | 5;

  address?: string;
  city?: string;
  postalCode?: string;

  instructions?: string;
  latitude?: number | null;
  longitude?: number | null;
  isActive: boolean;
  emergencyContacts?: SiteEmergencyContact[];

  // ✅ RBAC par site
  managerIds?: string[]; // admin/manager
  agentIds?: string[];   // agents

  createdAt?: unknown;
  updatedAt?: unknown;

  createdBy?: string;
  updatedBy?: string;
};
