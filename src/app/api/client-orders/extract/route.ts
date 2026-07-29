import { NextRequest, NextResponse } from "next/server";

import {
  canWrite,
  requireTenantUser,
} from "@/app/api/_utils/withTenant";
import { logActivity } from "@/lib/activity/logger";
import { adminDb } from "@/lib/firebase/admin";
import { clientOrderExtractionFlow } from "@/ai/flows/client-order-extraction";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function bad(error: string, extra?: Record<string, unknown>) {
  return json(400, { ok: false, error, ...extra });
}

function forbidden(error = "Forbidden") {
  return json(403, { ok: false, error });
}

function serverError(error: unknown, tag: string) {
  console.error("[" + tag + "]", error);
  return json(500, {
    ok: false,
    error: "Extraction IA impossible pour le moment",
  });
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function optionalText(value: unknown) {
  const text = normalizeText(value);
  return text.length ? text : null;
}

function normalizeChannel(value: unknown) {
  const text = normalizeText(value).toLowerCase();
  if (text === "phone" || text === "portal" || text === "manual" || text === "other") {
    return text;
  }
  return "email";
}

function hasGoogleAiKey() {
  return Boolean(
    process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_GENAI_API_KEY
  );
}

function friendlyAiFailureReason(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (
    /RESOURCE_EXHAUSTED|429|Too Many Requests|prepayment credits|credits are depleted|quota/i.test(raw)
  ) {
    return "Credits IA Gemini epuises. Rechargez le projet Google AI Studio ou utilisez une autre cle API pour relancer l'analyse automatique.";
  }

  if (/GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_GENAI_API_KEY|API key|apiKey/i.test(raw)) {
    return "IA non configuree. Ajoutez GEMINI_API_KEY, GOOGLE_API_KEY ou GOOGLE_GENAI_API_KEY pour analyser les PDF/images automatiquement.";
  }

  return "Extraction IA indisponible pour le moment. Le mode degrade local a pris le relais.";
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function parseDateToken(token: string) {
  const clean = token.trim();
  const iso = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return clean;

  const fr = clean.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/);
  if (!fr) return null;

  const day = Number(fr[1]);
  const month = Number(fr[2]);
  const year = Number(fr[3].length === 2 ? "20" + fr[3] : fr[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateInput(date: Date) {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function normalizeTimeToken(token: string | null, fallback: string) {
  if (!token) return fallback;
  const match = token.match(/(\d{1,2})(?:\s*(?:h|:)\s*(\d{2}))?/i);
  if (!match) return fallback;
  const hour = Math.min(Math.max(Number(match[1]), 0), 23);
  const minute = match[2] ? Math.min(Math.max(Number(match[2]), 0), 59) : 0;
  return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
}

function extractDateRange(text: string) {
  const lower = text.toLowerCase();
  const range = lower.match(/du\s+(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\d{4}-\d{2}-\d{2})\s+(?:au|a|jusqu(?:'|\s)a)\s+(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\d{4}-\d{2}-\d{2})/);
  if (range) {
    return {
      start: parseDateToken(range[1]),
      end: parseDateToken(range[2]),
    };
  }

  const single = lower.match(/(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\d{4}-\d{2}-\d{2})/);
  const date = single ? parseDateToken(single[1]) : null;
  return { start: date, end: date };
}

function expandDates(startIso: string | null, endIso: string | null, weekdaysOnly: boolean) {
  if (!startIso) return [];
  const start = new Date(startIso + "T00:00:00");
  const end = new Date((endIso || startIso) + "T00:00:00");
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return [];
  if (end.getTime() < start.getTime()) return [startIso];

  const dates: string[] = [];
  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = addDays(cursor, 1)) {
    const day = cursor.getDay();
    if (!weekdaysOnly || (day >= 1 && day <= 5)) {
      dates.push(toDateInput(cursor));
    }
    if (dates.length >= 370) break;
  }
  return dates;
}

function extractTimes(text: string) {
  const lower = text.toLowerCase();
  const range = lower.match(/(?:de\s*)?(\d{1,2}\s*(?:h|:)\s*\d{0,2}|\d{1,2}h?)\s*(?:a|au|-|jusqu(?:'|\s)a)\s*(\d{1,2}\s*(?:h|:)\s*\d{0,2}|\d{1,2}h?)/);
  if (!range) return { startTime: "08:00", endTime: "18:00" };
  return {
    startTime: normalizeTimeToken(range[1], "08:00"),
    endTime: normalizeTimeToken(range[2], "18:00"),
  };
}

function extractAgentCount(text: string) {
  const field = extractField(text, ["nombre agents", "nombre d'agents", "agents", "nb agents"]);
  const value = field || text;
  const match = value.toLowerCase().match(/(\d{1,2})\s*(?:agent|agents|ads|vigile|vigiles)?/);
  if (!match) return 1;
  return Math.min(Math.max(Number(match[1]), 1), 25);
}

function inferOperation(text: string) {
  const action = normalizeForMatch(extractField(text, ["action", "operation", "type"]) || text);
  if (/annul|cancel|supprim|retir/.test(action)) return "cancel";
  if (/modif|update|change|deplac|remplac|maj|mise a jour/.test(action)) return "update";
  return "add";
}

function inferMissionType(text: string) {
  const mission = extractField(text, ["mission", "poste", "prestation"]) || text;
  const upper = mission.toUpperCase();
  if (upper.includes("SSIAP 3")) return "SSIAP 3";
  if (upper.includes("SSIAP 2")) return "SSIAP 2";
  if (upper.includes("SSIAP 1")) return "SSIAP 1";
  if (upper.includes("CYNOPHILE") || upper.includes("MAITRE-CHIEN") || upper.includes("MAITRE CHIEN")) return "Agent cynophile";
  if (upper.includes("RONDE")) return "Ronde mobile";
  if (upper.includes("ACCUEIL")) return "Accueil / filtrage";
  if (upper.includes("CONTROLE") || upper.includes("CONTRÔLE")) return "Controle d'acces";
  return "ADS";
}

function normalizeFieldLabel(value: unknown) {
  return normalizeForMatch(value).replace(/\s+/g, " ");
}

function extractField(text: string, labels: string[]) {
  const wanted = labels.map(normalizeFieldLabel);
  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) continue;

    const rawLabel = line.slice(0, separatorIndex);
    const label = normalizeFieldLabel(rawLabel);

    if (wanted.some((item) => label === item || label.endsWith(" " + item))) {
      return line.slice(separatorIndex + 1).trim();
    }
  }

  return null;
}

function extractReference(text: string) {
  const field = extractField(text, ["reference client", "reference", "ref client", "ref bdc"]);
  if (field) return field;
  const match = text.match(/\bBDC[-_\s]?\d{4}[-_\s]?\d{2}[-_\s]?[A-Z0-9-]+/i);
  return match ? match[0].trim() : null;
}

function splitLocalOrderBlocks(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lineMarker = /^\s*(?:ligne|prestation|vacation)\s+(\d+|[A-Z])\s*[:.\-]?\s*$/gim;
  const matches = Array.from(normalized.matchAll(lineMarker));

  if (!matches.length) return [];

  return matches.map((match, index) => {
    const next = matches[index + 1];
    const start = match.index ?? 0;
    const endIndex = next?.index ?? normalized.length;
    const block = normalized.slice(start, endIndex).trim();
    return {
      index: index + 1,
      label: match[0].trim(),
      block,
    };
  });
}

function isWeekdaysOnly(text: string) {
  return /lundi\s+(?:au|a)\s+vendredi|jours\s+ouvres|jours\s+ouvrables|hors\s+week-?end|sans\s+week-?end/i.test(text);
}

function lineDates(block: string, globalRange: { start: string | null; end: string | null }) {
  const dateField = extractField(block, ["date", "jour"]);
  const rangeSource = dateField || block;
  const localRange = extractDateRange(rangeSource);
  const start = localRange.start ?? globalRange.start;
  const end = localRange.end ?? (dateField ? localRange.start : globalRange.end);
  const dates = expandDates(start ?? null, end ?? null, isWeekdaysOnly(block));
  return dates.length ? dates : [start ?? toDateInput(new Date())];
}

function lineTimes(block: string) {
  const explicit =
    extractField(block, ["nouvel horaire", "nouveaux horaires", "horaire", "horaires", "plage horaire"]) ||
    block;

  return extractTimes(explicit);
}

function findClient(input: {
  preferredClientId: string | null;
  clients: any[];
  text: string;
}) {
  if (input.preferredClientId) {
    const preferred = input.clients.find((client) => client.id === input.preferredClientId);
    if (preferred) return preferred;
  }

  const clientName =
    extractField(input.text, ["nom client", "client", "donneur d'ordre", "donneur ordre"]) ??
    input.text;

  return input.clients.find(
    (client) => sameOrIncludes(client.name, clientName) || sameOrIncludes(client.legalName, clientName)
  );
}

function scoreMatch(needle: unknown, haystack: unknown) {
  const a = normalizeForMatch(needle);
  const b = normalizeForMatch(haystack);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length) * 80;

  const aTokens = new Set(a.split(" ").filter((token) => token.length > 2));
  const bTokens = new Set(b.split(" ").filter((token) => token.length > 2));
  if (!aTokens.size || !bTokens.size) return 0;

  let common = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) common += 1;
  }

  return (common / Math.max(aTokens.size, bTokens.size)) * 70;
}

function findSite(input: {
  sites: any[];
  preferredClientId: string | null;
  siteName: string | null;
  block: string;
}) {
  const candidateText = input.siteName || input.block;
  const scoped = input.preferredClientId
    ? input.sites.filter((site) => !site.clientId || site.clientId === input.preferredClientId)
    : input.sites;

  const ranked = scoped
    .map((site) => ({
      site,
      score: Math.max(
        scoreMatch(site.name, candidateText),
        scoreMatch(site.name, input.siteName),
        scoreMatch(site.clientName, candidateText) * 0.5
      ),
    }))
    .filter((item) => item.score >= 45)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.site ?? null;
}

function buildStructuredLocalLines(input: {
  text: string;
  sites: any[];
  preferredClientId: string | null;
  reason: string;
}) {
  const globalRange = extractDateRange(input.text);
  const blocks = splitLocalOrderBlocks(input.text);

  if (!blocks.length) return [];

  return blocks.flatMap((entry) => {
    const block = entry.block;
    const operation = inferOperation(block);
    const siteName = extractField(block, ["site", "lieu", "adresse site"]);
    const site = findSite({
      sites: input.sites,
      preferredClientId: input.preferredClientId,
      siteName,
      block,
    });
    const times = lineTimes(block);
    const dates = lineDates(block, globalRange);
    const missionType = inferMissionType(block);
    const requiredQualification =
      extractField(block, ["qualification requise", "qualification", "habilitation", "profil"]) ||
      missionType;
    const rawNotes =
      extractField(block, ["consigne", "consignes", "motif", "notes", "precision", "précision"]) ||
      null;
    const warnings = [
      ...(!site
        ? [
            siteName ? "Site a choisir" : "Site manquant",
          ]
        : []),
      ...(!extractField(block, ["date", "jour"]) && !globalRange.start ? ["Date a confirmer"] : []),
      ...(!extractField(block, ["horaire", "horaires", "nouvel horaire", "plage horaire"]) ? ["Horaire par defaut 08:00-18:00"] : []),
    ];

    return dates.map((date) => ({
      operation,
      siteId: site?.id ?? null,
      siteName: site?.name ?? siteName ?? null,
      date,
      startTime: times.startTime,
      endTime: times.endTime,
      agentCount: extractAgentCount(block),
      missionType,
      requiredQualification,
      notes: rawNotes,
      confidence: site ? 0.86 : 0.58,
      warnings,
    }));
  });
}

function buildFallbackExtraction(input: {
  sourceText: string;
  defaultChannel: string;
  fileName: string | null;
  clients: any[];
  sites: any[];
  reason: string;
  preferredClientId: string | null;
}) {
  const text = input.sourceText || "";
  const range = extractDateRange(text);
  const matchedClient = findClient({
    preferredClientId: input.preferredClientId,
    clients: input.clients,
    text,
  });

  let lines = buildStructuredLocalLines({
    text,
    sites: input.sites,
    preferredClientId: matchedClient?.id ?? input.preferredClientId,
    reason: input.reason,
  });

  if (!lines.length) {
    const weekdaysOnly = isWeekdaysOnly(text);
    const dates = expandDates(range.start, range.end, weekdaysOnly);
    const times = extractTimes(text);
    const agentCount = extractAgentCount(text);
    const operation = inferOperation(text);
    const missionType = inferMissionType(text);
    const matchedSites = input.sites.filter((site) => sameOrIncludes(site.name, text));
    const targetSites = matchedSites.length ? matchedSites : [null];
    const targetDates = dates.length ? dates : [range.start || toDateInput(new Date())];

    lines = targetSites.flatMap((site) =>
      targetDates.map((date) => ({
        operation,
        siteId: site?.id ?? null,
        siteName: site?.name ?? null,
        date,
        startTime: times.startTime,
        endTime: times.endTime,
        agentCount,
        missionType,
        requiredQualification: missionType,
        notes: null,
        confidence: site ? 0.55 : 0.25,
        warnings: [
          input.reason,
          ...(!site ? ["Site a confirmer manuellement"] : []),
          ...(!text ? ["Aucun texte exploitable fourni"] : []),
        ],
      }))
    );
  }

  const siteMissing = lines.some((line) => !line.siteId);
  const averageConfidence =
    lines.length > 0
      ? lines.reduce((sum, line) => sum + Number(line.confidence ?? 0), 0) / lines.length
      : 0.2;

  return {
    reference: extractReference(text),
    title:
      extractField(text, ["objet", "titre"]) ??
      (input.fileName ? "BDC importe - " + input.fileName : "Bon de commande client"),
    clientId: matchedClient?.id ?? null,
    clientName: matchedClient?.name ?? matchedClient?.legalName ?? null,
    channel: input.defaultChannel,
    requesterName: extractField(text, ["contact demandeur", "demandeur", "contact client"]),
    requesterEmail: extractField(text, ["email demandeur", "email", "mail"]),
    requesterPhone: extractField(text, ["telephone demandeur", "telephone", "tel"]),
    periodStart: range.start,
    periodEnd: range.end,
    lines,
    summary:
      lines.length > 1
        ? "Extraction locale structuree : " + lines.length + " ligne(s) detectee(s), controle obligatoire avant enregistrement."
        : "Extraction locale realisee en mode degrade. Controle obligatoire avant enregistrement.",
    confidence: Math.min(siteMissing ? averageConfidence : Math.max(averageConfidence, 0.82), 0.92),
    missingFields: [
      ...(!matchedClient ? ["client"] : []),
      ...(siteMissing ? ["site"] : []),
    ],
    warnings: [
      input.reason,
      ...(siteMissing ? ["Certaines lignes n'ont pas encore de site reconnu automatiquement."] : []),
    ],
  };
}

function isTextLikeFile(mime: string | null, fileName: string | null) {
  const lowerName = (fileName ?? "").toLowerCase();
  const lowerMime = (mime ?? "").toLowerCase();
  return (
    lowerMime.startsWith("text/") ||
    lowerMime.includes("json") ||
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".csv") ||
    lowerName.endsWith(".tsv") ||
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".eml")
  );
}


function sourceKindFromMime(mime: string | null, fileName: string | null, hasText: boolean) {
  const lowerName = (fileName ?? "").toLowerCase();
  const lowerMime = (mime ?? "").toLowerCase();

  if (lowerMime.includes("pdf") || lowerName.endsWith(".pdf")) return "pdf";
  if (lowerMime.startsWith("image/")) return "image";
  if (lowerName.endsWith(".eml") || lowerName.endsWith(".msg")) return "email";
  if (hasText) return "text";
  return "unknown";
}

function normalizeForMatch(value: unknown) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sameOrIncludes(a: unknown, b: unknown) {
  const aa = normalizeForMatch(a);
  const bb = normalizeForMatch(b);
  if (!aa || !bb) return false;
  return aa === bb || aa.includes(bb) || bb.includes(aa);
}

async function listKnownClients(tenantId: string) {
  const snap = await adminDb
    .collection("clients")
    .where("tenantId", "==", tenantId)
    .limit(300)
    .get();

  return snap.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      name: optionalText(data.name),
      legalName: optionalText(data.legalName),
      email: optionalText(data.email),
    };
  });
}

async function listKnownSites(tenantId: string) {
  const snap = await adminDb
    .collection("sites")
    .where("tenantId", "==", tenantId)
    .limit(500)
    .get();

  return snap.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      name: optionalText(data.name),
      clientId: optionalText(data.clientId),
      clientName: optionalText(data.clientName),
      city: optionalText(data.city),
    };
  });
}

function reconcileExtraction(extraction: any, clients: any[], sites: any[]) {
  const matchedClient =
    extraction.clientId && clients.some((client) => client.id === extraction.clientId)
      ? clients.find((client) => client.id === extraction.clientId)
      : clients.find((client) =>
          sameOrIncludes(client.name, extraction.clientName) ||
          sameOrIncludes(client.legalName, extraction.clientName)
        );

  const lines = Array.isArray(extraction.lines) ? extraction.lines : [];
  const reconciledLines = lines.map((line: any) => {
    const matchedSite =
      line.siteId && sites.some((site) => site.id === line.siteId)
        ? sites.find((site) => site.id === line.siteId)
        : sites.find((site) =>
            sameOrIncludes(site.name, line.siteName) ||
            sameOrIncludes(site.clientName, line.siteName)
          );

    return {
      ...line,
      siteId: matchedSite?.id ?? line.siteId ?? null,
      siteName: matchedSite?.name ?? line.siteName ?? null,
      warnings: [
        ...(Array.isArray(line.warnings) ? line.warnings : []),
        ...(!matchedSite ? ["Site a confirmer manuellement"] : []),
      ],
    };
  });

  return {
    ...extraction,
    clientId: matchedClient?.id ?? extraction.clientId ?? null,
    clientName: matchedClient?.name ?? matchedClient?.legalName ?? extraction.clientName ?? null,
    lines: reconciledLines,
    missingFields: [
      ...(Array.isArray(extraction.missingFields) ? extraction.missingFields : []),
      ...(!matchedClient ? ["client"] : []),
      ...(reconciledLines.some((line: any) => !line.siteId) ? ["site"] : []),
    ].filter((value, index, arr) => arr.indexOf(value) === index),
  };
}

async function fileToDataUri(file: File | null) {
  if (!file) {
    return {
      fileName: null,
      fileMimeType: null,
      fileDataUri: null,
      textContent: "",
    };
  }

  const maxBytes = 12 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error("Fichier trop volumineux. Limite actuelle : 12 Mo.");
  }

  const mime = file.type || "application/octet-stream";
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name || "document";
  return {
    fileName,
    fileMimeType: mime,
    fileDataUri: "data:" + mime + ";base64," + buffer.toString("base64"),
    textContent: isTextLikeFile(mime, fileName) ? buffer.toString("utf8") : "",
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!canWrite(auth.role)) return forbidden("Insufficient rights");

  try {
    let sourceText = "";
    let file: File | null = null;
    let defaultChannel = "email";
    let preferredClientId: string | null = null;

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      sourceText = normalizeText(form.get("sourceText"));
      defaultChannel = normalizeChannel(form.get("channel"));
      preferredClientId = optionalText(form.get("clientId"));
      const candidate = form.get("file");
      file = isUploadedFile(candidate) ? candidate : null;
    } else {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      sourceText = normalizeText(body.sourceText);
      defaultChannel = normalizeChannel(body.channel);
      preferredClientId = optionalText(body.clientId);
    }

    if (!sourceText && !file) {
      return bad("Ajoutez un PDF, une image, un email ou un texte de bon de commande.");
    }

    const [clients, sites, filePayload] = await Promise.all([
      listKnownClients(auth.tenantId),
      listKnownSites(auth.tenantId),
      fileToDataUri(file),
    ]);

    const combinedSourceText = [sourceText, filePayload.textContent]
      .map((value) => normalizeText(value))
      .filter(Boolean)
      .join("\n\n");

    const sourceKind = sourceKindFromMime(
      filePayload.fileMimeType,
      filePayload.fileName,
      !!combinedSourceText
    );

    let extraction: any;
    let degraded = false;

    if (!hasGoogleAiKey()) {
      degraded = true;
      extraction = buildFallbackExtraction({
        sourceText: combinedSourceText,
        defaultChannel,
        fileName: filePayload.fileName,
        clients,
        sites,
        reason:
          "IA non configuree. Ajoutez GEMINI_API_KEY, GOOGLE_API_KEY ou GOOGLE_GENAI_API_KEY pour analyser les PDF/images automatiquement.",
        preferredClientId,
      });
    } else {
      try {
        extraction = await clientOrderExtractionFlow({
          sourceKind,
          sourceText: combinedSourceText,
          fileName: filePayload.fileName,
          fileMimeType: filePayload.fileMimeType,
          fileDataUri: filePayload.fileDataUri,
          defaultChannel: defaultChannel as any,
          knownClients: clients,
          knownSites: sites,
        });
      } catch (aiError) {
        degraded = true;
        extraction = buildFallbackExtraction({
          sourceText: combinedSourceText,
          defaultChannel,
          fileName: filePayload.fileName,
          clients,
          sites,
          reason: friendlyAiFailureReason(aiError),
          preferredClientId,
        });
      }
    }

    const reconciled = reconcileExtraction(extraction, clients, sites);

    await logActivity({
      tenantId: auth.tenantId,
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      actorRole: auth.role ?? null,
      action: "client_order.extracted",
      entityType: "system",
      entityId: "client-orders",
      message: "Bon de commande analyse par IA",
      meta: {
        sourceKind,
        fileName: filePayload.fileName,
        lineCount: reconciled.lines?.length ?? 0,
        confidence: reconciled.confidence ?? null,
        clientId: reconciled.clientId ?? null,
        degraded,
      },
      severity: degraded || (reconciled.confidence ?? 0) < 0.7 ? "warning" : "info",
    });

    return json(200, {
      ok: true,
      tenantId: auth.tenantId,
      degraded,
      extraction: reconciled,
    });
  } catch (error) {
    return serverError(error, "client-orders.extract.POST");
  }
}
