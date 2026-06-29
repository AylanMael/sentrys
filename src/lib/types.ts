
export type Role =
  | "super_admin"
  | "owner"
  | "admin"
  | "manager"
  | "agent"
  | "client"
  | "viewer";

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  role: Role;
  status: 'Actif' | 'Inactif';
}

export interface Agent {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: 'Actif' | 'Inactif' | 'En congé';
  avatarUrl: string;
}

export interface Client {
  id: string;
  name: string;
  contactPerson: string;
  contactEmail: string;
  sitesCount: number;
}

export interface Site {
  id: string;
  clientId: string;
  name: string;
  address: string;
}

export interface Shift {
  id: string;
  siteName: string;
  clientName: string;
  agentName?: string;
  agentAvatarUrl?: string;
  start: Date;
  end: Date;
  status: 'Brouillon' | 'Publié' | 'Terminé' | 'Annulé';
}

export interface Incident {
  id: string;
  siteName: string;
  agentName: string;
  timestamp: Date;
  severity: 'Faible' | 'Moyenne' | 'Élevée';
  description: string;
  status: 'Ouvert' | 'Fermé';
}

export interface Kpi {
  title: string;
  value: string;
  change: string;
  changeType: 'increase' | 'decrease' | 'neutral';
  description: string;
}

export interface Tenant {
  id: string;
  name: string;
  createdAt: any; // serverTimestamp
  createdBy: string;
  status: 'active' | 'inactive';
}

// This replaces the TenantUser interface
export interface TenantUser {
    tenantId: string;
    uid: string;
    role: Role;
    status: 'active' | 'disabled';
    createdAt: any; // serverTimestamp
}
