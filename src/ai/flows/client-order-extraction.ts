import { z } from "genkit";
import { ai } from "../genkit";

const SourceKindSchema = z.enum(["pdf", "image", "email", "text", "unknown"]);

const KnownClientSchema = z.object({
  id: z.string(),
  name: z.string().nullable().optional(),
  legalName: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
});

const KnownSiteSchema = z.object({
  id: z.string(),
  name: z.string().nullable().optional(),
  clientId: z.string().nullable().optional(),
  clientName: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
});

export const ClientOrderExtractionLineSchema = z.object({
  operation: z.enum(["add", "update", "cancel"]),
  siteId: z.string().nullable().optional(),
  siteName: z.string().nullable().optional(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  agentCount: z.number(),
  missionType: z.string().nullable().optional(),
  requiredQualification: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  confidence: z.number(),
  warnings: z.array(z.string()),
});

export const ClientOrderExtractionResultSchema = z.object({
  reference: z.string().nullable().optional(),
  title: z.string(),
  clientId: z.string().nullable().optional(),
  clientName: z.string().nullable().optional(),
  channel: z.enum(["email", "phone", "portal", "manual", "other"]),
  requesterName: z.string().nullable().optional(),
  requesterEmail: z.string().nullable().optional(),
  requesterPhone: z.string().nullable().optional(),
  periodStart: z.string().nullable().optional(),
  periodEnd: z.string().nullable().optional(),
  lines: z.array(ClientOrderExtractionLineSchema),
  summary: z.string(),
  confidence: z.number(),
  missingFields: z.array(z.string()),
  warnings: z.array(z.string()),
});

const ClientOrderExtractionInputSchema = z.object({
  sourceKind: SourceKindSchema,
  sourceText: z.string().optional(),
  fileName: z.string().nullable().optional(),
  fileMimeType: z.string().nullable().optional(),
  fileDataUri: z.string().nullable().optional(),
  defaultChannel: z.enum(["email", "phone", "portal", "manual", "other"]).optional(),
  knownClients: z.array(KnownClientSchema),
  knownSites: z.array(KnownSiteSchema),
});

function compactJson(value: unknown) {
  return JSON.stringify(value).slice(0, 70000);
}

export const clientOrderExtractionFlow = ai.defineFlow(
  {
    name: "clientOrderExtraction",
    inputSchema: ClientOrderExtractionInputSchema,
    outputSchema: ClientOrderExtractionResultSchema,
  },
  async (input) => {
    const systemPrompt = [
      "Tu es l'IA d'exploitation Sentrys, specialisee en securite privee en France.",
      "Ta mission est d'extraire un bon de commande client ou une mise a jour de planning.",
      "Tu dois produire des lignes de vacations exploitables, sans inventer d'information.",
      "Si le document contient une recurrence claire, par exemple du lundi au vendredi sur une periode precise, developpe les dates une par une.",
      "Si une date ou un site est ambigu, conserve la ligne seulement si elle est exploitable et ajoute un warning clair.",
      "Associe siteId et clientId uniquement si la correspondance avec les listes connues est evidente.",
      "Chaque ligne doit avoir date au format YYYY-MM-DD, startTime/endTime au format HH:mm, agentCount >= 1.",
      "Une vacation demandee pour plusieurs agents doit rester une ligne agentCount=N; Sentrys creera ensuite N vacations brouillon.",
      "Pour une annulation ou un changement, utilise operation=cancel ou operation=update.",
      "Ne publie jamais, ne diffuse jamais, ne declare jamais que le planning final est valide.",
    ].join("\n");

    const businessContext = [
      "CLIENTS CONNUS:",
      compactJson(input.knownClients),
      "SITES CONNUS:",
      compactJson(input.knownSites),
      "CANAL PAR DEFAUT:",
      input.defaultChannel ?? "email",
      "FICHIER:",
      input.fileName ?? "aucun",
      "MIME:",
      input.fileMimeType ?? "aucun",
      "TEXTE / EMAIL COPIE:",
      input.sourceText || "(aucun texte fourni)",
    ].join("\n\n");

    const promptParts: any[] = [
      { text: systemPrompt },
      { text: businessContext },
    ];

    if (input.fileDataUri && input.fileMimeType) {
      promptParts.push({
        media: {
          url: input.fileDataUri,
          contentType: input.fileMimeType,
        },
      });
      promptParts.push({
        text:
          "Analyse aussi le fichier joint. S'il s'agit d'un PDF scanne ou d'une image, lis le contenu visuel comme un bon de commande.",
      });
    }

    const { output } = await ai.generate({
      prompt: promptParts,
      output: {
        format: "json",
        schema: ClientOrderExtractionResultSchema,
      },
    });

    if (!output) {
      throw new Error("Extraction IA impossible");
    }

    return output;
  }
);
