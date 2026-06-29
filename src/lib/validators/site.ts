import { z } from "zod";

export const siteSchema = z.object({
  tenantId: z.string(),
  name: z.string().min(2).max(120),
  address: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  isActive: z.boolean().default(true),
  managerIds: z.array(z.string()).default([]),
  agentIds: z.array(z.string()).default([]),
  accessUids: z.array(z.string()).default([]),
});

export const siteCreateSchema = siteSchema.omit({ tenantId: true });
export const siteUpdateSchema = siteCreateSchema.partial();
