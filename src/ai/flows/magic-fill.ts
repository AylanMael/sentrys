import { z } from 'genkit';
import { ai } from '../genkit';

export const MagicFillAssignmentSchema = z.object({
  shiftId: z.string(),
  assignedAgentIds: z.array(z.string()),
  reasoning: z.string().optional()
});

export const MagicFillResultSchema = z.object({
  assignments: z.array(MagicFillAssignmentSchema),
  unfilledShiftIds: z.array(z.string()),
  summary: z.string()
});

export const magicFillFlow = ai.defineFlow(
  {
    name: 'magicFill',
    inputSchema: z.object({
      unfilledShifts: z.array(z.any()),   // shifts that need agents
      existingShifts: z.array(z.any()),   // already planned shifts
      agents: z.array(z.any()),           // all available active agents
    }),
    outputSchema: MagicFillResultSchema,
  },
  async (input) => {
    const { unfilledShifts, existingShifts, agents } = input;

    const prompt = `
      Tu es l'IA "Sentrys Magic Fill", un expert en planification d'agents de sécurité.
      Ton objectif est d'affecter le meilleur agent possible à chaque mission (shift) non pourvue,
      en respectant des contraintes strictes.

      DONNÉES :
      - Missions à pourvoir (${unfilledShifts.length}) : ${JSON.stringify(unfilledShifts)}
      - Missions déjà planifiées (pour vérifier les conflits) : ${JSON.stringify(existingShifts)}
      - Agents disponibles : ${JSON.stringify(agents)}

      CONTRAINTES STRICTES (HARD RULES) :
      1. CHEVAUCHEMENT : Un agent NE PEUT PAS être affecté à une mission si elle chevauche (start/end)
         une mission qu'il a déjà ("existingShifts").
      2. REQUIS : Affecte exactement le nombre d'agents requis (requiredAgents) pour chaque mission.
         Si pas d'agent disponible, laisse le tableau "assignedAgentIds" vide ou incomplet.

      CRITÈRES D'OPTIMISATION (SOFT RULES) :
      1. Temps de trajet : Évite d'affecter le même agent sur 2 sites différents la même journée sans au moins 2 heures de battement.
      2. Équité : Essaie de répartir les heures entre les agents (ne donne pas tout au même).

      RÉPONDS AU FORMAT JSON STRUCTURÉ (MagicFillResultSchema).
      Attention, retourne uniquement les affectations NOUVELLES pour les missions dans "unfilledShifts".
      Donne un bref "summary" global (ex: "J'ai couvert 3 missions sur 4").
    `;

    const { output } = await ai.generate({
       prompt,
       output: { format: 'json', schema: MagicFillResultSchema }
    });

    if (!output) throw new Error('AI failed to generate magic fill');
    return output;
  }
);
