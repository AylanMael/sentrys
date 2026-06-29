export type AgencyDocumentProfile = {
  displayName: string;
  legalName: string | null;
  logoUrl: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  phone: string | null;
  email: string | null;
  cnaps: string | null;
  siret: string | null;
  footerNote: string | null;
};

const EMPTY_PROFILE: AgencyDocumentProfile = {
  displayName: "SENTRYS",
  legalName: null,
  logoUrl: null,
  addressLine1: null,
  addressLine2: null,
  phone: null,
  email: null,
  cnaps: null,
  siret: null,
  footerNote: null,
};

function normalizeText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function normalizeAgencyDocumentProfile(
  value: unknown,
  fallbackName?: string | null
): AgencyDocumentProfile {
  const data = readRecord(value);
  const fallback = normalizeText(fallbackName) ?? EMPTY_PROFILE.displayName;

  return {
    displayName:
      normalizeText(data.displayName) ??
      normalizeText(data.name) ??
      normalizeText(data.companyName) ??
      fallback,
    legalName: normalizeText(data.legalName),
    logoUrl:
      normalizeText(data.logoUrl) ??
      normalizeText(data.logoPath) ??
      normalizeText(data.logo),
    addressLine1: normalizeText(data.addressLine1),
    addressLine2: normalizeText(data.addressLine2),
    phone: normalizeText(data.phone),
    email: normalizeText(data.email),
    cnaps: normalizeText(data.cnaps),
    siret: normalizeText(data.siret),
    footerNote: normalizeText(data.footerNote),
  };
}

export function profileFromTenant(
  tenant: Record<string, unknown> | null | undefined
): AgencyDocumentProfile {
  const tenantData = tenant ?? {};
  const nested = readRecord(tenantData.agencyProfile);

  return normalizeAgencyDocumentProfile(
    {
      ...tenantData,
      ...nested,
    },
    normalizeText(tenantData.name)
  );
}

export function publicEnvAgencyProfile(): AgencyDocumentProfile {
  return normalizeAgencyDocumentProfile({
    displayName: process.env.NEXT_PUBLIC_COMPANY_NAME,
    legalName: process.env.NEXT_PUBLIC_COMPANY_LEGAL_NAME,
    logoUrl: process.env.NEXT_PUBLIC_COMPANY_LOGO_PATH,
    addressLine1: process.env.NEXT_PUBLIC_COMPANY_ADDRESS_LINE_1,
    addressLine2: process.env.NEXT_PUBLIC_COMPANY_ADDRESS_LINE_2,
    phone: process.env.NEXT_PUBLIC_COMPANY_PHONE,
    email: process.env.NEXT_PUBLIC_COMPANY_EMAIL,
    cnaps: process.env.NEXT_PUBLIC_COMPANY_CNAPS,
    siret: process.env.NEXT_PUBLIC_COMPANY_SIRET,
  });
}
