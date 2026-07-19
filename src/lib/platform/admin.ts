export const PLATFORM_ADMIN = {
  name: "VSW Digital",
  email: "contact@vsw-digital.fr",
  role: "Administrateur SaaS",
  ownerLabel: "Éditeur et administrateur de la plateforme Sentrys",
} as const;

export const PLATFORM_ADMIN_EMAILS = [PLATFORM_ADMIN.email] as const;

export function isPlatformAdminEmail(email: unknown): boolean {
  if (typeof email !== "string") return false;

  const normalized = email.trim().toLowerCase();
  return PLATFORM_ADMIN_EMAILS.some(
    (adminEmail) => adminEmail.toLowerCase() === normalized
  );
}
