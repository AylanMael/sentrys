import { z } from 'genkit';
import { ai } from '../genkit';

export const RiskTypeSchema = z.enum(['overlap', 'buffer', 'fatigue', 'skill_mismatch', 'other']);

export const ScheduleRiskSchema = z.object({
  type: RiskTypeSchema,
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  agentId: z.string().optional(),
  agentName: z.string().optional(),
  message: z.string(),
  affectedAssignments: z.array(z.string()).optional(), // assignment IDs
  recommendation: z.string(),
});

export const ScheduleAnalysisResultSchema = z.object({
  risks: z.array(ScheduleRiskSchema),
  summary: z.string(),
  overallScore: z.number().min(0).max(100), // 100 = perfect, 0 = disaster
});

export const scheduleAnalysisFlow = ai.defineFlow(
  {
    name: 'scheduleAnalysis',
    inputSchema: z.object({
      assignments: z.array(z.any()),
      agents: z.array(z.any()),
      sites: z.array(z.any()),
    }),
    outputSchema: ScheduleAnalysisResultSchema,
  },
  async (input) => {
    const { assignments, agents, sites } = input;

    const prompt = `
      Tu es un expert en gestion d'exploitation pour une agence de sécurité privée.
      Analyse le planning de missions suivant et identifie les risques opérationnels.

      DONNÉES :
      - Missions (${assignments.length}) : ${JSON.stringify(assignments)}
      - Agents (${agents.length}) : ${JSON.stringify(agents)}
      - Sites (${sites.length}) : ${JSON.stringify(sites)}

      CRITÈRES D'ANALYSE :
      1. CHEVAUCHEMENT : Un agent ne peut pas être à deux endroits en même temps. Vérifie les startTime et endTime.
      2. TEMPS DE TRAJET : Laisse au moins 30 minutes entre deux missions sur des sites différents.
      3. FATIGUE : Signale les agents ayant plus de 12h de service sur 24h ou des vacations trop rapprochées (< 11h de repos).
      4. ADÉQUATION : Vérifie si des sites à haut risque sont gérés par des agents disponibles ou si la charge est bien répartie.

      RÉPONDS AU FORMAT JSON STRUCTURÉ (ScheduleAnalysisResult).
      Utilise un ton professionnel et donne des recommandations concrètes.
    `;

    const { output } = await ai.generate({
       prompt,
       output: { format: 'json', schema: ScheduleAnalysisResultSchema }
    });

    if (!output) throw new Error('AI failed to generate analysis');
    return output;
  }
);
