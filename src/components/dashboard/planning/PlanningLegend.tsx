"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export const PlanningLegend: React.FC = () => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary">
          <Info className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-white/20 shadow-2xl rounded-2xl">
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-border/50">
            <Info className="h-4 w-4 text-primary" />
            <h4 className="font-bold text-sm tracking-tight uppercase italic">Légende Opérationnelle</h4>
          </div>

          <div className="grid gap-3">
            <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <Badge className="bg-emerald-500 shadow-sm shrink-0 mt-0.5">Complet</Badge>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100">Effectif au complet</p>
                <p className="text-[10px] text-muted-foreground leading-tight">Tous les agents requis sont affectés au poste.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <Badge className="bg-amber-500 shadow-sm shrink-0 mt-0.5">Partiel</Badge>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100">Effectif incomplet</p>
                <p className="text-[10px] text-muted-foreground leading-tight">Au moins un agent affecté, mais des postes restent vides.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <Badge className="bg-rose-500 shadow-sm shrink-0 mt-0.5">À pourvoir</Badge>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100">Urgence : 0 Agent</p>
                <p className="text-[10px] text-muted-foreground leading-tight">Poste critique sans aucune affectation. Action immédiate requise.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <Badge className="bg-indigo-600 shadow-sm shrink-0 mt-0.5">Absence</Badge>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100">Indisponibilité Agent</p>
                <p className="text-[10px] text-muted-foreground leading-tight">Congés, repos ou absence signalée (identifié par mots-clés).</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-700 shadow-sm shrink-0 mt-0.5">Brouillon</Badge>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100">Pas encore envoyé</p>
                <p className="text-[10px] text-muted-foreground leading-tight">Vacation en preparation, visible par l&apos;exploitation uniquement.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <Badge variant="outline" className="border-emerald-300 bg-emerald-100 text-emerald-800 shadow-sm shrink-0 mt-0.5">Publie</Badge>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100">Planning envoyé</p>
                <p className="text-[10px] text-muted-foreground leading-tight">Vacation deja publiée et à jour pour les agents.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-800 shadow-sm shrink-0 mt-0.5">A republiér</Badge>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100">Modification après publication</p>
                <p className="text-[10px] text-muted-foreground leading-tight">Une vacation publiée a changé et doit être renvoyée.</p>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-border/50">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground italic">
              <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Les couleurs sont optimisées pour la vision nocturne et le contraste élevé.
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
