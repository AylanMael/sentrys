import React from 'react';
import type { SiteApiItem } from './PlanningContext';

/** Only display the selected site's data, never inferred mission qualifications. */
export function PlanningSiteSummary({ site }: { site?: SiteApiItem }) {
  const name = site?.name?.trim() || 'Site non disponible';
  const client = site?.clientName?.trim() || 'Non renseigné';
  return (
    <section aria-label="Site du planning" className="shrink-0 border-b border-border/40 bg-muted/30 px-3 py-2 sm:px-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Site sélectionné</p>
      <p className="line-clamp-2 break-words text-sm font-semibold text-foreground">{name}</p>
      <p className="line-clamp-1 break-words text-xs text-muted-foreground">
        Client : {client}
      </p>
      <details className="mt-1 text-xs">
        <summary className="w-fit cursor-pointer rounded text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Voir les noms complets</summary>
        <div tabIndex={0} role="region" aria-label="Noms complets du site et du client" className="mt-2 max-h-24 overflow-y-auto rounded border border-border p-2 break-words focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <p>Site : {name}</p>
          <p>Client : {client}</p>
        </div>
      </details>
    </section>
  );
}
