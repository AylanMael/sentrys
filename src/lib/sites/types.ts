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
  clientName?: string;

  siteType: SiteType;
  riskLevel: 1 | 2 | 3 | 4 | 5;

  address?: string;
  city?: string;
  postalCode?: string;

  instructions?: string;
  isActive: boolean;

  // ✅ RBAC par site
  managerIds?: string[]; // admin/manager
  agentIds?: string[];   // agents

  createdAt?: any;
  updatedAt?: any;

  createdBy?: string;
  updatedBy?: string;
};