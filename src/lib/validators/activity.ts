import { z } from "zod";

export const activityEntityTypeSchema = z.enum([
  "agent",
  "site",
  "vacation",
  "incident",
  "assignment",
  "user",
  "billing",
  "system",
]);

export const activitySeveritySchema = z.enum(["info", "warning", "critical"]);

export const activityActionSchema = z.string().min(3).max(100);

export const logActivityInputSchema = z.object({
  tenantId: z.string().min(1),
  actorUid: z.string().min(1),
  actorEmail: z.string().email().optional().nullable(),
  actorRole: z.string().optional().nullable(),
  action: activityActionSchema,
  entityType: activityEntityTypeSchema,
  entityId: z.string().optional().nullable(),
  message: z.string().min(1).max(500),
  meta: z.record(z.any()).optional(),
  severity: activitySeveritySchema.default("info"),
});

export type LogActivityInput = z.infer<typeof logActivityInputSchema>;
