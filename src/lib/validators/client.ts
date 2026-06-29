import { z } from "zod";

export const clientCreateSchema = z.object({
  name: z.string().min(2).max(120),
  legalName: z.string().max(180).optional(),
  siret: z.string().regex(/^\d{14}$/).optional(),
  vatNumber: z.string().max(32).optional(),

  contactName: z.string().max(120).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(32).optional(),
  billingEmail: z.string().email().optional(),

  address: z.object({
    line1: z.string().max(180).optional(),
    line2: z.string().max(180).optional(),
    postalCode: z.string().max(20).optional(),
    city: z.string().max(80).optional(),
    country: z.string().max(80).optional(),
  }).optional(),

  status: z.enum(["active", "inactive"]).default("active"),
  notes: z.string().max(2000).optional(),
});

export const clientUpdateSchema = clientCreateSchema.partial().refine(
  (obj) => Object.keys(obj).length > 0,
  "No fields to update"
);

export type ClientCreateInput = z.infer<typeof clientCreateSchema>;
export type ClientUpdateInput = z.infer<typeof clientUpdateSchema>;
