import React from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock } from "lucide-react";

/** No presence data is supplied by the cockpit: absence of alerts is not proof of presence. */
export function PointageVerificationNotice() {
  return (
    <div className="md:col-span-2 xl:col-span-4 rounded-2xl border border-border bg-muted/20 p-5 sm:p-6">
      <div className="flex items-start gap-3 sm:gap-4">
        <CalendarClock aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="font-semibold text-foreground">Présences non vérifiées dans cette vue</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Le cockpit ne contrôle pas les prises et fins de service enregistrées.
            Consultez les pointages pour vérifier la situation des agents.
          </p>
          <Link href="/dashboard/pointages" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            Vérifier les pointages
            <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
          </Link>
          <p className="mt-2 text-xs text-muted-foreground">
            Mission commencée la veille ? Elle apparaît aussi dans les pointages des journées qu’elle chevauche.
          </p>
        </div>
      </div>
    </div>
  );
}
