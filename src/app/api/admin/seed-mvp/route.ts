import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import {
  canWrite,
  requireTenantUser,
} from "@/app/api/_utils/withTenant";
import { assignmentDocId } from "@/app/api/vacations/_service";
import { adminDb } from "@/lib/firebase/admin";
import { logActivity } from "@/lib/activity/logger";
import {
  operationSignalStateDocId,
  type OperationSignalStatus,
} from "@/lib/operations/cockpit-signals";

export const runtime = "nodejs";

type DemoAgent = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  monthlyContractHours: number;
  employeeNumber: string;
  professionalCardNumber: string | null;
  professionalCardExpiresAt: string | null;
  qualifications: string[];
  notes: string;
};

type DemoSite = {
  id: string;
  clientId: string;
  clientName: string;
  name: string;
  address: string;
  city: string;
  postalCode: string;
  siteType: string;
  riskLevel: number;
  agentIds: string[];
  instructions: string;
};

type DemoVacation = {
  id: string;
  siteId: string;
  siteName: string;
  title: string;
  missionType: string;
  requiredQualification: string | null;
  notes: string;
  startAt: Date;
  endAt: Date;
  assignedAgentIds: string[];
  isPublished: boolean;
};

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function docId(tenantId: string, suffix: string) {
  return `${tenantId}_mvp_${suffix}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function normalizeSearch(...parts: Array<string | null | undefined>) {
  return parts
    .map((part) => String(part ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ");
}

function getWeekStartMonday(date: Date) {
  const next = new Date(date);
  const weekday = next.getDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  next.setDate(next.getDate() + mondayOffset);
  next.setHours(0, 0, 0, 0);
  return next;
}

function atDay(base: Date, dayOffset: number, hour: number, minute = 0) {
  const date = new Date(base);
  date.setDate(base.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function addHours(date: Date, hours: number) {
  const next = new Date(date);
  next.setHours(next.getHours() + hours);
  return next;
}

function toTimestamp(date: Date) {
  return Timestamp.fromDate(date);
}

function agentName(agent: DemoAgent) {
  return `${agent.firstName} ${agent.lastName}`.trim();
}

function statusFor(assignedAgentIds: string[]) {
  return assignedAgentIds.length > 0 ? "filled" : "planned";
}

function event(
  auth: { uid: string; email: string | null; name: string | null; role: string },
  status: OperationSignalStatus,
  note: string | null,
  previousStatus: OperationSignalStatus = "new"
) {
  return {
    status,
    previousStatus,
    atIso: new Date().toISOString(),
    actorUid: auth.uid,
    actorEmail: auth.email ?? null,
    actorName: auth.name ?? null,
    actorRole: auth.role ?? null,
    note,
  };
}

function vacationSummary(vacation: DemoVacation) {
  return {
    id: vacation.id,
    siteName: vacation.siteName,
    title: vacation.title,
    missionType: vacation.missionType,
    startAtIso: vacation.startAt.toISOString(),
    endAtIso: vacation.endAt.toISOString(),
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!canWrite(auth.role)) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  const now = FieldValue.serverTimestamp();
  const nowDate = new Date();
  const nowIso = nowDate.toISOString();
  const weekStart = getWeekStartMonday(nowDate);
  const from = atDay(weekStart, 0, 0);
  const to = atDay(weekStart, 14, 0);

  const clientRetailId = docId(auth.tenantId, "client_retail");
  const clientTertiaireId = docId(auth.tenantId, "client_tertiaire");

  const agents: DemoAgent[] = [
    {
      id: docId(auth.tenantId, "agent_rabah"),
      firstName: "Rabah",
      lastName: "Mahfouf",
      email: "rabah.mahfouf.demo@sentrys.local",
      phone: "06 11 22 33 44",
      monthlyContractHours: 151.67,
      employeeNumber: "MVP-001",
      professionalCardNumber: "CAR-075-2026-001",
      professionalCardExpiresAt: "2028-09-30",
      qualifications: ["ADS", "SST"],
      notes: "Agent polyvalent, bon contact client.",
    },
    {
      id: docId(auth.tenantId, "agent_nabil"),
      firstName: "Nabil",
      lastName: "Lallaoui",
      email: "nabil.lallaoui.demo@sentrys.local",
      phone: "06 22 33 44 55",
      monthlyContractHours: 151.67,
      employeeNumber: "MVP-002",
      professionalCardNumber: "CAR-075-2026-002",
      professionalCardExpiresAt: "2028-05-15",
      qualifications: ["ADS", "SSIAP 1", "SST"],
      notes: "Profil SSIAP pour site sensible.",
    },
    {
      id: docId(auth.tenantId, "agent_karim"),
      firstName: "Karim",
      lastName: "Benali",
      email: null,
      phone: "06 33 44 55 66",
      monthlyContractHours: 130,
      employeeNumber: "MVP-003",
      professionalCardNumber: "CAR-075-2026-003",
      professionalCardExpiresAt: "2026-06-30",
      qualifications: ["ADS"],
      notes: "Email manquant volontairement pour tester la diffusion bloquee.",
    },
    {
      id: docId(auth.tenantId, "agent_nadia"),
      firstName: "Nadia",
      lastName: "Serradj",
      email: "nadia.serradj.demo@sentrys.local",
      phone: "06 44 55 66 77",
      monthlyContractHours: 151.67,
      employeeNumber: "MVP-004",
      professionalCardNumber: "CAR-075-2026-004",
      professionalCardExpiresAt: "2029-01-10",
      qualifications: ["ADS", "Chef de poste"],
      notes: "Profil chef de poste, gestion d'equipe.",
    },
    {
      id: docId(auth.tenantId, "agent_sofia"),
      firstName: "Sofia",
      lastName: "Martin",
      email: "sofia.martin.demo@sentrys.local",
      phone: null,
      monthlyContractHours: 80,
      employeeNumber: "MVP-005",
      professionalCardNumber: "CAR-075-2026-005",
      professionalCardExpiresAt: "2025-12-31",
      qualifications: ["ADS"],
      notes: "Carte expiree volontairement pour tester la conformite.",
    },
  ];

  const sites: DemoSite[] = [
    {
      id: docId(auth.tenantId, "site_boutique_vendome"),
      clientId: clientRetailId,
      clientName: "Groupe Retail Vendome",
      name: "Boutique Vendome",
      address: "12 rue de la Paix",
      city: "Paris",
      postalCode: "75002",
      siteType: "retail",
      riskLevel: 3,
      agentIds: [agents[0].id, agents[2].id, agents[3].id],
      instructions: "Accueil client, controle d'acces, rondes surface de vente.",
    },
    {
      id: docId(auth.tenantId, "site_halles"),
      clientId: clientRetailId,
      clientName: "Groupe Retail Vendome",
      name: "Centre Commercial Les Halles",
      address: "101 Porte Berger",
      city: "Paris",
      postalCode: "75001",
      siteType: "centre_commercial",
      riskLevel: 4,
      agentIds: [agents[1].id, agents[3].id, agents[4].id],
      instructions: "Flux public important, vigilance vols et assistance PMR.",
    },
    {
      id: docId(auth.tenantId, "site_datacenter"),
      clientId: clientTertiaireId,
      clientName: "TechCloud Services",
      name: "Data Center Nanterre",
      address: "4 avenue du Parc",
      city: "Nanterre",
      postalCode: "92000",
      siteType: "tertiaire",
      riskLevel: 5,
      agentIds: [agents[1].id, agents[2].id, agents[3].id],
      instructions: "Controle badges, registre visiteurs, ronde technique nuit.",
    },
    {
      id: docId(auth.tenantId, "site_chantier"),
      clientId: clientTertiaireId,
      clientName: "TechCloud Services",
      name: "Chantier Quai Ouest",
      address: "18 quai de la Seine",
      city: "Saint-Denis",
      postalCode: "93200",
      siteType: "chantier",
      riskLevel: 4,
      agentIds: [agents[0].id, agents[2].id],
      instructions: "Controle engins, rondes perimetre, fermeture portail.",
    },
  ];

  const vacations: DemoVacation[] = [
    {
      id: docId(auth.tenantId, "vac_boutique_lun"),
      siteId: sites[0].id,
      siteName: sites[0].name,
      title: "Accueil securite boutique",
      missionType: "surveillance",
      requiredQualification: "ADS",
      notes: "Vacation type jour 08h-18h.",
      startAt: atDay(weekStart, 0, 8),
      endAt: atDay(weekStart, 0, 18),
      assignedAgentIds: [agents[0].id],
      isPublished: true,
    },
    {
      id: docId(auth.tenantId, "vac_boutique_mar"),
      siteId: sites[0].id,
      siteName: sites[0].name,
      title: "Accueil securite boutique",
      missionType: "surveillance",
      requiredQualification: "ADS",
      notes: "Vacation recurrente, test duplication semaine.",
      startAt: atDay(weekStart, 1, 8),
      endAt: atDay(weekStart, 1, 18),
      assignedAgentIds: [agents[0].id],
      isPublished: true,
    },
    {
      id: docId(auth.tenantId, "vac_boutique_non_affectee"),
      siteId: sites[0].id,
      siteName: sites[0].name,
      title: "Renfort caisse - poste a couvrir",
      missionType: "renfort",
      requiredQualification: "ADS",
      notes: "Poste volontairement non affecte pour tester la couverture.",
      startAt: atDay(weekStart, 2, 12),
      endAt: atDay(weekStart, 2, 20),
      assignedAgentIds: [],
      isPublished: false,
    },
    {
      id: docId(auth.tenantId, "vac_halles_ssiap"),
      siteId: sites[1].id,
      siteName: sites[1].name,
      title: "PC securite SSIAP",
      missionType: "ssiap",
      requiredQualification: "SSIAP 1",
      notes: "Qualification SSIAP obligatoire.",
      startAt: atDay(weekStart, 3, 10),
      endAt: atDay(weekStart, 3, 20),
      assignedAgentIds: [agents[1].id],
      isPublished: true,
    },
    {
      id: docId(auth.tenantId, "vac_halles_weekend"),
      siteId: sites[1].id,
      siteName: sites[1].name,
      title: "Renfort samedi centre commercial",
      missionType: "surveillance",
      requiredQualification: "ADS",
      notes: "Vacation week-end pour lisibilite PDF et prepaie.",
      startAt: atDay(weekStart, 5, 9),
      endAt: atDay(weekStart, 5, 19),
      assignedAgentIds: [agents[3].id],
      isPublished: true,
    },
    {
      id: docId(auth.tenantId, "vac_datacenter_nuit"),
      siteId: sites[2].id,
      siteName: sites[2].name,
      title: "Ronde technique nuit",
      missionType: "ronde",
      requiredQualification: "ADS",
      notes: "Vacation de nuit traversant minuit.",
      startAt: atDay(weekStart, 1, 20),
      endAt: atDay(weekStart, 2, 8),
      assignedAgentIds: [agents[2].id],
      isPublished: true,
    },
    {
      id: docId(auth.tenantId, "vac_conflit_volontaire"),
      siteId: sites[2].id,
      siteName: sites[2].name,
      title: "Conflit volontaire pour recette",
      missionType: "surveillance",
      requiredQualification: "ADS",
      notes: "Chevauchement volontaire avec Boutique Vendome pour tester les alertes.",
      startAt: atDay(weekStart, 0, 9),
      endAt: atDay(weekStart, 0, 13),
      assignedAgentIds: [agents[0].id],
      isPublished: false,
    },
    {
      id: docId(auth.tenantId, "vac_chantier_dimanche"),
      siteId: sites[3].id,
      siteName: sites[3].name,
      title: "Surveillance chantier dimanche",
      missionType: "surveillance",
      requiredQualification: "ADS",
      notes: "Vacation dimanche pour prepaie et PDF.",
      startAt: atDay(weekStart, 6, 8),
      endAt: atDay(weekStart, 6, 18),
      assignedAgentIds: [agents[2].id],
      isPublished: true,
    },
    {
      id: docId(auth.tenantId, "vac_halles_carte_expiree"),
      siteId: sites[1].id,
      siteName: sites[1].name,
      title: "Cas conformite bloquante",
      missionType: "surveillance",
      requiredQualification: "ADS",
      notes: "Agent avec carte expiree pour tester le registre conformite.",
      startAt: atDay(weekStart, 4, 14),
      endAt: atDay(weekStart, 4, 18),
      assignedAgentIds: [agents[4].id],
      isPublished: false,
    },
  ];

  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  const vacationsByAgent = new Map<string, DemoVacation[]>();
  vacations.forEach((vacation) => {
    vacation.assignedAgentIds.forEach((agentId) => {
      const list = vacationsByAgent.get(agentId) ?? [];
      list.push(vacation);
      vacationsByAgent.set(agentId, list);
    });
  });

  const batch = adminDb.batch();

  const clients = [
    {
      id: clientRetailId,
      name: "Groupe Retail Vendome",
      legalName: "GROUPE RETAIL VENDOME SAS",
      email: "client.retail.demo@sentrys.local",
      billingEmail: "facturation.retail.demo@sentrys.local",
      phone: "01 42 00 10 10",
      contactName: "Claire Dumont",
      siret: "11122233300044",
      address: {
        line1: "12 rue de la Paix",
        line2: "75002 Paris",
        postalCode: "75002",
        city: "Paris",
        country: "France",
      },
    },
    {
      id: clientTertiaireId,
      name: "TechCloud Services",
      legalName: "TECHCLOUD SERVICES SA",
      email: "operations.techcloud.demo@sentrys.local",
      billingEmail: "finance.techcloud.demo@sentrys.local",
      phone: "01 55 00 20 20",
      contactName: "Marc Lefevre",
      siret: "55566677700018",
      address: {
        line1: "4 avenue du Parc",
        line2: "92000 Nanterre",
        postalCode: "92000",
        city: "Nanterre",
        country: "France",
      },
    },
  ];

  clients.forEach((client) => {
    batch.set(
      adminDb.collection("clients").doc(client.id),
      {
        tenantId: auth.tenantId,
        ...client,
        status: "active",
        search: normalizeSearch(
          client.name,
          client.legalName,
          client.email,
          client.billingEmail,
          client.phone,
          client.contactName,
          client.siret,
          client.address.line1,
          client.address.city
        ),
        demoMvp: true,
        createdAt: now,
        updatedAt: now,
        createdBy: auth.uid,
        updatedBy: auth.uid,
      },
      { merge: true }
    );
  });

  agents.forEach((agent) => {
    const fullName = agentName(agent);
    batch.set(
      adminDb.collection("agents").doc(agent.id),
      {
        tenantId: auth.tenantId,
        firstName: agent.firstName,
        lastName: agent.lastName,
        email: agent.email,
        phone: agent.phone,
        monthlyContractHours: agent.monthlyContractHours,
        profile: {
          photoUrl: null,
          employeeNumber: agent.employeeNumber,
          birthDate: null,
          addressLine1: "Adresse de test",
          addressLine2: "Ile-de-France",
          professionalCardNumber: agent.professionalCardNumber,
          professionalCardExpiresAt: agent.professionalCardExpiresAt,
          qualifications: agent.qualifications,
          emergencyContactName: "Contact urgence demo",
          emergencyContactPhone: "06 00 00 00 00",
          documents: agent.professionalCardNumber
            ? [
                {
                  id: `${agent.id}_carte_pro`,
                  label: "Carte professionnelle demo",
                  url: "https://example.invalid/demo-carte-pro.pdf",
                  kind: "professional_card",
                  expiresAt: agent.professionalCardExpiresAt,
                  fileName: "demo-carte-pro.pdf",
                  mimeType: "application/pdf",
                  size: 124000,
                  uploadedAt: nowIso,
                },
              ]
            : [],
          notes: agent.notes,
        },
        status: "active",
        search: normalizeSearch(
          fullName,
          agent.email,
          agent.phone,
          agent.employeeNumber
        ),
        demoMvp: true,
        createdAt: now,
        updatedAt: now,
        createdBy: auth.uid,
        updatedBy: auth.uid,
      },
      { merge: true }
    );
  });

  sites.forEach((site) => {
    batch.set(
      adminDb.collection("sites").doc(site.id),
      {
        tenantId: auth.tenantId,
        name: site.name,
        clientId: site.clientId,
        clientName: site.clientName,
        siteType: site.siteType,
        riskLevel: site.riskLevel,
        address: site.address,
        city: site.city,
        postalCode: site.postalCode,
        latitude: null,
        longitude: null,
        instructions: site.instructions,
        isActive: true,
        status: "active",
        agentIds: site.agentIds,
        managerIds: [],
        accessUids: site.agentIds,
        search: normalizeSearch(
          site.name,
          site.clientName,
          site.address,
          site.city,
          site.postalCode
        ),
        demoMvp: true,
        createdAt: now,
        updatedAt: now,
        createdBy: auth.uid,
        updatedBy: auth.uid,
      },
      { merge: true }
    );
  });

  vacations.forEach((vacation) => {
    batch.set(
      adminDb.collection("vacations").doc(vacation.id),
      {
        tenantId: auth.tenantId,
        siteId: vacation.siteId,
        siteName: vacation.siteName,
        title: vacation.title,
        missionType: vacation.missionType,
        requiredQualification: vacation.requiredQualification,
        notes: vacation.notes,
        startAt: toTimestamp(vacation.startAt),
        endAt: toTimestamp(vacation.endAt),
        requiredAgents: 1,
        assignedAgentIds: vacation.assignedAgentIds,
        status: statusFor(vacation.assignedAgentIds),
        isPublished: vacation.isPublished,
        publishedAt: vacation.isPublished ? now : null,
        publishedBy: vacation.isPublished ? auth.uid : null,
        demoMvp: true,
        createdAt: now,
        updatedAt: now,
        createdBy: auth.uid,
        updatedBy: auth.uid,
      },
      { merge: true }
    );

    vacation.assignedAgentIds.forEach((agentId) => {
      batch.set(
        adminDb
          .collection("assignments")
          .doc(assignmentDocId(vacation.id, agentId)),
        {
          tenantId: auth.tenantId,
          vacationId: vacation.id,
          siteId: vacation.siteId,
          agentId,
          status: "assigned",
          demoMvp: true,
          createdAt: now,
          createdBy: auth.uid,
          updatedAt: now,
          updatedBy: auth.uid,
        },
        { merge: true }
      );
    });
  });

  batch.set(
    adminDb.collection("planningTemplates").doc(docId(auth.tenantId, "template_boutique")),
    {
      tenantId: auth.tenantId,
      siteId: sites[0].id,
      siteName: sites[0].name,
      name: "Planning type boutique - Lun-Ven 08h-18h",
      entries: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
        dayOfWeek,
        startTime: "08:00",
        endTime: "18:00",
        missionType: "surveillance",
        title: "Accueil securite boutique",
        requiredQualification: "ADS",
        assignedAgentId: agents[0].id,
        notes: "Standard boutique semaine sans week-end.",
      })),
      demoMvp: true,
      createdAt: now,
      updatedAt: now,
      createdBy: auth.uid,
      updatedBy: auth.uid,
    },
    { merge: true }
  );

  [agents[0], agents[1]].forEach((agent) => {
    const agentVacations = (vacationsByAgent.get(agent.id) ?? []).filter(
      (vacation) => vacation.isPublished
    );
    if (agentVacations.length === 0) return;

    const dispatchId = docId(auth.tenantId, `dispatch_${agent.employeeNumber.toLowerCase()}`);
    const siteNames = Array.from(new Set(agentVacations.map((vacation) => vacation.siteName)));
    batch.set(
      adminDb.collection("planningDispatches").doc(dispatchId),
      {
        tenantId: auth.tenantId,
        agentId: agent.id,
        agentName: agentName(agent),
        agentEmail: agent.email,
        agentPhone: agent.phone,
        fromIso: from.toISOString(),
        toIso: to.toISOString(),
        vacationIds: agentVacations.map((vacation) => vacation.id),
        vacationCount: agentVacations.length,
        siteNames,
        vacations: agentVacations.map(vacationSummary),
        channel: "portal",
        deliveryMode: "portal",
        deliveryStatus: "portal_published",
        deliveryTarget: agent.email ?? agent.phone,
        deliveryNote: "Planning publie dans le portail agent - donnees de recette.",
        sentAt: now,
        sentAtIso: nowIso,
        sentBy: auth.uid,
        viewedAt: null,
        lastViewedAt: null,
        viewedCount: 0,
        printedAt: null,
        lastPrintedAt: null,
        printedCount: 0,
        acknowledgedAt: null,
        acknowledgedByUid: null,
        acknowledgedByName: null,
        acknowledgedByEmail: null,
        agencyProfile: null,
        complianceOverride: false,
        complianceOverrideReason: null,
        complianceOverrideDetail: null,
        demoMvp: true,
        createdAt: now,
      },
      { merge: true }
    );
  });

  const clientRetailVacations = vacations.filter(
    (vacation) => vacation.siteId === sites[0].id || vacation.siteId === sites[1].id
  );
  batch.set(
    adminDb.collection("sitePlanningDispatches").doc(docId(auth.tenantId, "site_dispatch_retail")),
    {
      tenantId: auth.tenantId,
      clientId: clientRetailId,
      clientName: "Groupe Retail Vendome",
      clientEmail: "client.retail.demo@sentrys.local",
      clientPhone: "01 42 00 10 10",
      contactName: "Claire Dumont",
      fromIso: from.toISOString(),
      toIso: to.toISOString(),
      siteIds: [sites[0].id, sites[1].id],
      siteCount: 2,
      siteNames: [sites[0].name, sites[1].name],
      vacationIds: clientRetailVacations.map((vacation) => vacation.id),
      vacationCount: clientRetailVacations.length,
      readyVacationCount: clientRetailVacations.filter((vacation) => vacation.isPublished).length,
      draftCount: clientRetailVacations.filter((vacation) => !vacation.isPublished).length,
      modifiedCount: 0,
      missingAgentCount: clientRetailVacations.filter(
        (vacation) => vacation.assignedAgentIds.length === 0
      ).length,
      plannedAgentCount: new Set(
        clientRetailVacations.flatMap((vacation) => vacation.assignedAgentIds)
      ).size,
      channel: "email",
      deliveryMode: "simulation",
      deliveryStatus: "simulated",
      deliveryTarget: "client.retail.demo@sentrys.local",
      deliveryNote: "Preparation email client simulee - PDF pret pour recette.",
      pdfUrl: `/site-planning/print?from=${encodeURIComponent(
        from.toISOString()
      )}&to=${encodeURIComponent(to.toISOString())}&clientId=${encodeURIComponent(
        clientRetailId
      )}`,
      sentAt: now,
      sentAtIso: nowIso,
      sentBy: auth.uid,
      agencyProfile: null,
      demoMvp: true,
      createdAt: now,
    },
    { merge: true }
  );

  const signalAuth = {
    uid: auth.uid,
    email: auth.email ?? null,
    name: auth.name ?? null,
    role: auth.role,
  };
  const signals = [
    {
      signalId: "mvp-main-courante-prise-service",
      status: "in_progress" as OperationSignalStatus,
      titleSnapshot: "Relance agent pour confirmation de prise de service",
      detailSnapshot:
        "Cas de recette : relance telephone effectuee, attente retour agent.",
      href: "/dashboard/planning",
      kind: "manual",
      note: "Relance a recontroler dans 30 minutes.",
    },
    {
      signalId: "mvp-poste-non-affecte-boutique",
      status: "new" as OperationSignalStatus,
      titleSnapshot: "Poste non affecte - Boutique Vendome",
      detailSnapshot:
        "Le renfort caisse du mercredi midi n'a pas encore d'agent affecte.",
      href: "/dashboard/planning",
      kind: "coverage",
      note: null,
    },
    {
      signalId: "mvp-diffusion-agent-en-attente",
      status: "seen" as OperationSignalStatus,
      titleSnapshot: "Planning agent publie sans accuse reception",
      detailSnapshot:
        "Un planning est disponible dans le portail agent, confirmation en attente.",
      href: "/dashboard/agent-planning",
      kind: "dispatch",
      note: "A relancer si non confirme avant fin de journee.",
    },
  ];

  signals.forEach((signal) => {
    batch.set(
      adminDb
        .collection("operationSignalStates")
        .doc(operationSignalStateDocId(auth.tenantId, signal.signalId)),
      {
        tenantId: auth.tenantId,
        signalId: signal.signalId,
        status: signal.status,
        note: signal.note,
        titleSnapshot: signal.titleSnapshot,
        detailSnapshot: signal.detailSnapshot,
        href: signal.href,
        kind: signal.kind,
        events: [event(signalAuth, signal.status, signal.note)],
        demoMvp: true,
        createdAt: now,
        createdAtIso: nowIso,
        updatedAt: now,
        updatedAtIso: nowIso,
        updatedByUid: auth.uid,
        updatedByEmail: auth.email ?? null,
        updatedByName: auth.name ?? null,
        updatedByRole: auth.role ?? null,
      },
      { merge: true }
    );
  });

  await batch.commit();

  await logActivity({
    tenantId: auth.tenantId,
    actorUid: auth.uid,
    actorEmail: auth.email ?? null,
    actorRole: auth.role,
    action: "admin.seed_mvp",
    entityType: "system",
    entityId: "mvp-exploitation",
    message: "Jeu de donnees MVP Exploitation installe",
    severity: "info",
    meta: {
      clients: clients.length,
      sites: sites.length,
      agents: agents.length,
      vacations: vacations.length,
      fromIso: from.toISOString(),
      toIso: to.toISOString(),
    },
  });

  return json(200, {
    ok: true,
    tenantId: auth.tenantId,
    range: {
      fromIso: from.toISOString(),
      toIso: to.toISOString(),
    },
    createdOrUpdated: {
      clients: clients.length,
      sites: sites.length,
      agents: agents.length,
      vacations: vacations.length,
      assignments: vacations.reduce(
        (total, vacation) => total + vacation.assignedAgentIds.length,
        0
      ),
      planningTemplates: 1,
      agentDispatches: 2,
      siteDispatches: 1,
      operationSignals: signals.length,
    },
    links: {
      planning: "/dashboard/planning",
      conduite: "/dashboard/conduite",
      prepaie: `/dashboard/prepaie`,
      sitePdf: `/site-planning/print?from=${encodeURIComponent(
        from.toISOString()
      )}&to=${encodeURIComponent(to.toISOString())}&clientId=${encodeURIComponent(
        clientRetailId
      )}`,
    },
    note: "Seed non destructif : les documents MVP sont upsert via merge:true.",
  });
}
