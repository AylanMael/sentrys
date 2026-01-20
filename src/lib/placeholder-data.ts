import type { Kpi, Shift, Incident, Agent, Client, User } from './types';
import { PlaceHolderImages } from './placeholder-images';

const agentAvatars = PlaceHolderImages.filter(p => p.id.startsWith('agent-avatar'));

export const kpis: Kpi[] = [
  { title: 'Active Missions', value: '72', change: '+10.2%', changeType: 'increase', description: 'from last month' },
  { title: 'Agents on Duty', value: '128', change: '-5.1%', changeType: 'decrease', description: 'from last hour' },
  { title: 'Open Incidents', value: '4', change: '+2', changeType: 'increase', description: 'in the last 24 hours' },
  { title: 'Sites Covered', value: '35', change: '', changeType: 'neutral', description: 'Total active sites' },
];

export const shifts: Shift[] = [
    { id: '1', siteName: 'Grand Mall', clientName: 'ACME Corp', agentName: 'John Wick', agentAvatarUrl: agentAvatars[0]?.imageUrl, start: new Date(new Date().setHours(8, 0, 0, 0)), end: new Date(new Date().setHours(16, 0, 0, 0)), status: 'Published' },
    { id: '2', siteName: 'Tech Park Tower A', clientName: 'Stark Industries', agentName: 'Jane Doe', agentAvatarUrl: agentAvatars[1]?.imageUrl, start: new Date(new Date().setHours(9, 0, 0, 0)), end: new Date(new Date().setHours(17, 0, 0, 0)), status: 'Published' },
    { id: '3', siteName: 'City Museum', clientName: 'City Council', agentName: 'Michael Scott', agentAvatarUrl: agentAvatars[2]?.imageUrl, start: new Date(new Date().setHours(22, 0, 0, 0)), end: new Date(new Date(new Date().setDate(new Date().getDate() + 1)).setHours(6, 0, 0, 0)), status: 'Published' },
    { id: '4', siteName: 'Downtown Bank', clientName: 'Global Bank', start: new Date(new Date(new Date().setDate(new Date().getDate() + 1)).setHours(10, 0, 0, 0)), end: new Date(new Date(new Date().setDate(new Date().getDate() + 1)).setHours(18, 0, 0, 0)), status: 'Draft' },
    { id: '5', siteName: 'Logistics Warehouse', clientName: 'ShipItFast', agentName: 'Alice Johnson', agentAvatarUrl: agentAvatars[0]?.imageUrl, start: new Date(new Date().setHours(14, 0, 0, 0)), end: new Date(new Date().setHours(22, 0, 0, 0)), status: 'Completed' },
];

export const incidents: Incident[] = [
    { id: 'inc-1', siteName: 'Grand Mall', agentName: 'John Wick', timestamp: new Date(new Date().setHours(new Date().getHours() - 2)), severity: 'Medium', description: 'Suspicious individual reported near west entrance.', status: 'Open' },
    { id: 'inc-2', siteName: 'Tech Park Tower A', agentName: 'Jane Doe', timestamp: new Date(new Date().setDate(new Date().getDate() - 1)), severity: 'Low', description: 'False fire alarm activation on 3rd floor.', status: 'Closed' },
    { id: 'inc-3', siteName: 'City Museum', agentName: 'Michael Scott', timestamp: new Date(new Date().setDate(new Date().getDate() - 2)), severity: 'High', description: 'Attempted unauthorized access to restricted area.', status: 'Closed' },
];

export const agents: Agent[] = [
    { id: 'agent-1', name: 'John Wick', email: 'j.wick@sentrys.io', phone: '+33 6 12 34 56 78', status: 'Active', avatarUrl: agentAvatars[0]?.imageUrl },
    { id: 'agent-2', name: 'Jane Doe', email: 'j.doe@sentrys.io', phone: '+33 6 23 45 67 89', status: 'Active', avatarUrl: agentAvatars[1]?.imageUrl },
    { id: 'agent-3', name: 'Michael Scott', email: 'm.scott@sentrys.io', phone: '+33 6 34 56 78 90', status: 'On Leave', avatarUrl: agentAvatars[2]?.imageUrl },
    { id: 'agent-4', name: 'Alice Johnson', email: 'a.johnson@sentrys.io', phone: '+33 6 45 67 89 01', status: 'Inactive', avatarUrl: agentAvatars[0]?.imageUrl },
];

export const clients: Client[] = [
    { id: 'client-1', name: 'ACME Corp', contactPerson: 'Bob Builder', contactEmail: 'bob@acme.com', sitesCount: 3 },
    { id: 'client-2', name: 'Stark Industries', contactPerson: 'Pepper Potts', contactEmail: 'pepper@stark.com', sitesCount: 1 },
    { id: 'client-3', name: 'City Council', contactPerson: 'Leslie Knope', contactEmail: 'l.knope@city.gov', sitesCount: 5 },
    { id: 'client-4', name: 'Global Bank', contactPerson: 'Janet Yellen', contactEmail: 'janet@globalbank.com', sitesCount: 2 },
];

const userAvatar = PlaceHolderImages.find(p => p.id === 'user-avatar-1');
export const users: User[] = [
    { id: 'user-1', name: 'Admin User', email: 'admin@sentrys.io', role: 'Admin', status: 'Active', avatarUrl: userAvatar?.imageUrl ?? '' },
    { id: 'user-2', name: 'Ops Manager', email: 'ops@sentrys.io', role: 'Operations', status: 'Active', avatarUrl: userAvatar?.imageUrl ?? '' },
    { id: 'user-3', name: 'Inactive User', email: 'inactive@sentrys.io', role: 'Agent', status: 'Inactive', avatarUrl: userAvatar?.imageUrl ?? '' },
];
