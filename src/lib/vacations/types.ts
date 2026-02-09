// src/lib/vacations/types.ts

export type VacationStatus =
  | "planned"
  | "partially_filled"
  | "filled"
  | "closed"
  | "cancelled";

export type VacationDoc = {
  tenantId: string;

  siteId: string;
  siteName?: string | null;

  // période
  startAt: any; // Timestamp (admin ou client)
  endAt: any; // Timestamp

  // besoin
  requiredAgents: number; // >= 1
  assignedAgentIds: string[]; // ids agents

  status: VacationStatus;

  notes?: string | null;

  createdAt?: any;
  updatedAt?: any;
  createdBy?: string | null;
  updatedBy?: string | null;
};

export type VacationApi = Omit<VacationDoc, "startAt" | "endAt" | "createdAt" | "updatedAt"> & {
  id: string;
  startAtIso: string | null;
  endAtIso: string | null;
  createdAtIso: string | null;
  updatedAtIso: string | null;
};