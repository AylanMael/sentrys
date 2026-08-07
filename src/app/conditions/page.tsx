import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
export const metadata: Metadata = { title: "Conditions générales d’utilisation", description: "Conditions d’utilisation de la plateforme Sentrys.", alternates: { canonical: "/conditions" } };
export default function ConditionsPage() { return <LegalPage eyebrow="Cadre contractuel" title="Conditions générales d’utilisation" updated="29 juillet 2026" sections={[
  { title: "1. Objet", paragraphs: ["Les présentes conditions encadrent l’accès et l’utilisation de Sentrys, plateforme professionnelle de gestion des opérations de sécurité privée éditée par VSW Digital."] },
  { title: "2. Accès au service", paragraphs: ["L’accès est réservé aux utilisateurs autorisés par leur organisation. Chaque utilisateur doit protéger ses identifiants et signaler sans délai tout accès suspect."] },
  { title: "3. Responsabilité des données", paragraphs: ["L’organisation cliente reste responsable de l’exactitude, de la licéité et de l’usage des données saisies. Les propositions automatiques doivent être validées par un responsable avant toute décision opérationnelle."] },
  { title: "4. Disponibilité", paragraphs: ["Sentrys met en œuvre des moyens raisonnables pour assurer la continuité du service. Des interruptions peuvent être nécessaires pour maintenance, sécurité ou évolution technique."] },
  { title: "5. Propriété intellectuelle", paragraphs: ["Les logiciels, interfaces, marques et contenus propres à Sentrys restent la propriété de leur titulaire. Aucun droit de reproduction ou d’exploitation n’est accordé hors usage normal du service."] },
  { title: "6. Suspension et résiliation", paragraphs: ["Un accès peut être suspendu en cas de risque de sécurité, d’usage illicite ou de manquement contractuel. Les modalités commerciales et de restitution des données sont précisées dans le contrat de l’organisation."] },
  { title: "7. Contact", paragraphs: ["Toute question contractuelle peut être adressée à contact@vsw-digital.fr."] }
]} />; }