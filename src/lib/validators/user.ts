import { z } from "zod";

export const roleSchema = z.enum([
  "super_admin",
  "owner",
  "admin",
  "manager",
  "agent",
  "client",
  "viewer",
]);

export const userProfileSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().max(32).optional(),
  avatarUrl: z.string().url().optional(),
});

export const tenantUserSchema = z.object({
  uid: z.string(),
  tenantId: z.string(),
  role: roleSchema,
  status: z.enum(["active", "disabled"]).default("active"),
  createdAt: z.any().optional(), // Firestore Timestamp
});

export const meResponseSchema = z.object({
  ok: z.boolean(),
  uid: z.string(),
  email: z.string().email().nullable(),
  name: z.string().nullable(),
  tenantId: z.string().nullable(),
  role: roleSchema.nullable(),
  status: z.string().nullable(),
  hasTenant: z.boolean(),
});
