"use client";
import { usePlanning } from "./PlanningContext";

export function PlanningIndicatorNotice() {
  const { indicatorScope } = usePlanning();
  return <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
    <p className="font-semibold text-foreground">Heures planifiées · {indicatorScope.period} · Heure de Paris</p>
    <p>{indicatorScope.filters}</p>
    <p>{indicatorScope.reason}</p>
    <details className="mt-1">
      <summary className="w-fit cursor-pointer rounded text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Comprendre les indicateurs et leurs limites</summary>
      <div className="mt-2 space-y-1 border-t border-border pt-2">
        <p>Un contrat absent n’est pas remplacé par une valeur standard.</p>
        <p>Avec un filtre agent, la comparaison est individuelle ; le contrôle mensuel de l’agence reste non évalué.</p>
        <p>Les compteurs actuels incluent les vacations annulées et, si affichées, les absences. Ils ne représentent pas des pointages.</p>
        <p>Alertes sur les données chargées, éventuellement hors période visible : aucune alerte détectée ne signifie pas contrôle complet ni conformité garantie.</p>
      </div>
    </details>
  </div>;
}
