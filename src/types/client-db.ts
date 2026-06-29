export type ClientStatus = "active" | "inactive";

export type ClientDB = {
  id: string;
  tenantId: string;

  name: string;
  legalName?: string;
  siret?: string;

  contactName?: string;
  email?: string;
  phone?: string;

  billingEmail?: string;

  address?: {
    line1?: string;
    line2?: string;
    postalCode?: string;
    city?: string;
    country?: string;
  };

  status: ClientStatus;
  notes?: string;

  createdAt?: any;
  updatedAt?: any;
  archivedAt?: any;
};
