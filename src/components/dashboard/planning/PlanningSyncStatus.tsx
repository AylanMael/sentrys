import React from 'react';
import { CloudOff, Loader2 } from 'lucide-react';

export function PlanningSyncStatus({ loading }: { loading: boolean }) {
  const Icon = loading ? Loader2 : CloudOff;
  return (
    <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-foreground">
      <Icon aria-hidden="true" className={`mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400 ${loading ? 'motion-safe:animate-spin' : ''}`} />
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold">{loading ? 'Actualisation du planning…' : 'Données du planning non confirmées'}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Le résumé opérationnel sera affiché après confirmation du serveur. Les vacations déjà visibles peuvent ne plus être à jour.
        </p>
      </div>
    </div>
  );
}
