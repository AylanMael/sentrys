"use client";

import React from "react";
import { usePlanning } from "./PlanningContext";
import { Button } from "@/components/ui/button";
import {
  Trash2,
  Copy,
  X,
  Users,
  CheckCircle2,
  AlertCircle,
  ShieldCheck
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

export const BulkActionBar: React.FC = () => {
  const {
    selectedIds,
    clearSelection,
    bulkAssign,
    bulkDelete,
    handleCopy,
    agents,
    vacations,
    setIdsToDelete,
    setDeleteConfirmOpen
  } = usePlanning();

  if (selectedIds.size === 0) return null;

  const count = selectedIds.size;
  const selectedVacations = vacations.filter(v => selectedIds.has(v.id));

  // Quick overview: any mission with requirement?
  const uniqueQuals = Array.from(new Set(selectedVacations.map(v => v.requiredQualification).filter(Boolean)));

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-8 fade-in duration-500">
      <div className="flex items-center gap-4 px-6 py-3 bg-slate-900/90 dark:bg-slate-800/95 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.4)] ring-1 ring-white/10 text-white min-w-[500px]">

        {/* Count Indicator */}
        <div className="flex items-center gap-3 pr-4 border-r border-white/10">
          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center font-black text-xs ring-4 ring-primary/20">
            {count}
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-widest text-primary-foreground/60 leading-none">Missions</span>
            <span className="text-xs font-bold leading-tight">Sélect.</span>
          </div>
        </div>

        {/* Actions Group */}
        <div className="flex items-center gap-1.5 flex-1">

          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-9 px-3 text-white hover:bg-white/10 text-xs font-bold gap-2"
          >
            <Copy className="h-4 w-4 text-primary" />
            Copier
          </Button>

          <Separator orientation="vertical" className="h-6 bg-white/10 mx-1" />

          {/* Bulk Assign Select */}
          <div className="flex items-center gap-2 group">
             <Select onValueChange={(val) => bulkAssign(val)}>
               <SelectTrigger className="h-9 min-w-[180px] bg-white/5 border-white/10 text-white hover:bg-white/10 transition-colors text-[11px] font-bold rounded-xl ring-offset-slate-900">
                  <div className="flex items-center gap-2 truncate">
                    <Users className="h-3.5 w-3.5 text-primary" />
                    <span>Affecter à...</span>
                  </div>
               </SelectTrigger>
               <SelectContent className="bg-slate-900 border-white/10 text-white min-w-[200px] rounded-xl overflow-hidden shadow-2xl">
                 <div className="p-2 border-b border-white/5 bg-white/5">
                    <p className="text-[10px] font-black uppercase tracking-tighter opacity-50 px-2 flex items-center gap-1.5">
                      <ShieldCheck className="h-3 w-3" />
                      Vérification Qualification
                    </p>
                 </div>
                 {agents.map(a => {
                    // Check if qualified for ALL selected?
                    const isAllQualified = selectedVacations.every(v =>
                      !v.requiredQualification || a.qualifications?.includes(v.requiredQualification)
                    );

                    return (
                      <SelectItem
                        key={a.id}
                        value={a.id}
                        className="text-white hover:bg-primary/20 focus:bg-primary/20 py-2.5 transition-colors"
                      >
                        <div className="flex items-center justify-between w-full pr-1 shrink-0">
                          <span className="text-xs truncate max-w-[120px]">{a.firstName} {a.lastName}</span>
                          {!isAllQualified && (
                            <span title="Manque qualification pour certaines missions">
                              <AlertCircle className="h-3.5 w-3.5 text-orange-500 ml-2" />
                            </span>
                          )}
                          {isAllQualified && uniqueQuals.length > 0 && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 ml-2" />
                          )}
                        </div>
                      </SelectItem>
                    );
                 })}
               </SelectContent>
             </Select>
          </div>

          <Separator orientation="vertical" className="h-6 bg-white/10 mx-1" />

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setIdsToDelete(Array.from(selectedIds));
              setDeleteConfirmOpen(true);
            }}
            className="h-9 px-3 text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs font-bold gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Supprimer
          </Button>
        </div>

        {/* Clear Group */}
        <div className="pl-3 border-l border-white/10">
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSelection}
            aria-label="Quitter la selection"
            className="h-9 rounded-xl px-3 text-xs font-bold text-white/70 transition-all hover:bg-white/10 hover:text-white"
          >
            <X className="mr-1.5 h-4 w-4" />
            Terminer
          </Button>
        </div>
      </div>
    </div>
  );
};
