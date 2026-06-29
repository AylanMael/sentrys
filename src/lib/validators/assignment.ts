import { z } from "zod";

export const assignmentStatusSchema = z.enum([
  "assigned",
  "present",
  "completed",
  "cancelled",
  "late",
]);

export const assignmentSchema = z.object({
  tenantId: z.string(),
  siteId: z.string(),
  agentId: z.string(),
  vacationId: z.string(),
  status: assignmentStatusSchema.default("assigned"),
  checkedInAt: z.any().optional(), // Timestamp
  checkInLat: z.number().optional().nullable(),
  checkInLng: z.number().optional().nullable(),
});

export const checkInRequestSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
