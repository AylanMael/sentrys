import { z } from "genkit";
import { ai } from "../genkit";

export const IncidentClassificationInputSchema = z.object({
  description: z.string(),
});

export const IncidentClassificationOutputSchema = z.object({
  category: z.enum(["Security", "Safety", "Medical", "Technical", "Fire", "Other"]),
  suggestedSeverity: z.enum(["low", "medium", "high", "critical"]),
  reasoning: z.string(),
  tags: z.array(z.string()),
});

export const incidentClassificationFlow = ai.defineFlow(
  {
    name: "incidentClassificationFlow",
    inputSchema: IncidentClassificationInputSchema,
    outputSchema: IncidentClassificationOutputSchema,
  },
  async (input) => {
    const { output } = await ai.generate({
      prompt: `
        Tu es un expert en sécurité opérationnelle pour la plateforme SENTRYS.
        Analyse la description de l'incident suivant et fournis une classification structurée.

        Description: "${input.description}"

        Instructions:
        1. Catégorie: Choisis la plus appropriée (Security, Safety, Medical, Technical, Fire, Other).
        2. Gravité suggérée: Évalue l'impact potentiel (low, medium, high, critical).
        3. Raisonnement: Explique brièvement (en français) pourquoi tu as choisi cette classification.
        4. Tags: Génère 3-5 mots-clés pertinents (en français).
      `,
      output: { format: "json", schema: IncidentClassificationOutputSchema },
    });

    if (!output) {
      throw new Error("L'IA n'a pas pu générer de classification.");
    }

    return output;
  }
);
