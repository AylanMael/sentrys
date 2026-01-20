export type Role = 'Admin' | 'Operations' | 'Agent';

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  role: Role;
  status: 'Active' | 'Inactive';
}

export interface Agent {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: 'Active' | 'Inactive' | 'On Leave';
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
  status: 'Draft' | 'Published' | 'Completed' | 'Cancelled';
}

export interface Incident {
  id: string;
  siteName: string;
  agentName: string;
  timestamp: Date;
  severity: 'Low' | 'Medium' | 'High';
  description: string;
  status: 'Open' | 'Closed';
}

export interface Kpi {
  title: string;
  value: string;
  change: string;
  changeType: 'increase' | 'decrease' | 'neutral';
  description: string;
}
