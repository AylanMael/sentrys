import { z } from "zod";

const EmergencyContactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  role: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  priority: z.number().int().min(1).max(20).default(1),
});

/**
 * Schéma pour la création d'un site
 */
export const SiteCreateSchema = z.object({
  name: z.string().min(2, "Le nom doit contenir au moins 2 caractères").max(100),
  clientId: z.string().nullable().optional(),
  clientName: z.string().nullable().optional(),
  siteType: z.enum(["bureaux", "chantier", "boutique", "evenement", "hotel", "autre"]).default("autre"),
  riskLevel: z.number().int().min(1).max(5).default(3),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  instructions: z.string().nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  isActive: z.boolean().default(true),
  agentIds: z.array(z.string()).default([]),
  managerIds: z.array(z.string()).default([]),
  accessUids: z.array(z.string()).default([]),
  emergencyContacts: z.array(EmergencyContactSchema).default([]),
});

/**
 * Schéma pour la création d'un incident
 */
export const IncidentCreateSchema = z.object({
  title: z.string().min(2, "Le titre est requis").max(150),
  description: z.string().min(5, "Une description détaillée est requise"),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  status: z.enum(["open", "investigating", "resolved", "closed"]).default("open"),
  siteId: z.string().min(1, "Le site est requis"),
  agentId: z.string().nullable().optional(),
  vacationId: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  // Pour le géofencing lors de la déclaration
  reportedLat: z.number().nullable().optional(),
  reportedLng: z.number().nullable().optional(),
});

/**
 * Schéma pour les logs d'activité
 */
export const ActivityLogSchema = z.object({
  action: z.string(),
  entityType: z.enum(["agent", "site", "vacation", "incident", "user", "billing", "system"]),
  entityId: z.string().nullable().optional(),
  message: z.string(),
  severity: z.enum(["info", "warning", "critical"]).default("info"),
  meta: z.record(z.any()).optional(),
});

/**
 * Point de passage d'une ronde (Checkpoint)
 */
export const CheckpointSchema = z.object({
  id: z.string(),
  name: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  order: z.number().int().default(0),
});

/**
 * Modèle de Ronde (Patrol Template)
 */
export const PatrolTemplateSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  siteId: z.string().min(1),
  checkpoints: z.array(CheckpointSchema).min(1, "Au moins un point de passage est requis"),
  estimatedDuration: z.number().int().optional(), // en minutes
  isActive: z.boolean().default(true),
});

/**
 * Session de Ronde active
 */
export const PatrolSessionSchema = z.object({
  templateId: z.string().min(1),
  agentId: z.string().min(1),
  siteId: z.string().min(1),
  status: z.enum(["active", "completed", "cancelled"]).default("active"),
  validatedPoints: z.array(z.object({
    checkpointId: z.string(),
    validatedAt: z.string(), // ISO string
    lat: z.number().optional(),
    lng: z.number().optional(),
    distance: z.number().optional(), // distance au point en mètres
  })).default([]),
});

export type SiteCreateInput = z.infer<typeof SiteCreateSchema>;
export type IncidentCreateInput = z.infer<typeof IncidentCreateSchema>;
export type ActivityLogInput = z.infer<typeof ActivityLogSchema>;
export type PatrolTemplateInput = z.infer<typeof PatrolTemplateSchema>;
export type PatrolSessionInput = z.infer<typeof PatrolSessionSchema>;
