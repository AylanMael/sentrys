import type { Timestamp } from "firebase/firestore";

export type IncidentSeverity = "faible" | "moyenne" | "élevée";
export type IncidentStatus = "ouvert" | "fermé";

export interface Incident {
  id: string;
  tenantId: string;
  siteId: string;
  siteName?: string;
  reportedByName?: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  createdAt: Timestamp;
  createdBy: string;
}
