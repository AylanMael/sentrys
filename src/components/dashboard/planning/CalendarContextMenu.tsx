"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Users, Clock, AlertCircle, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { VacationApiItem } from "./PlanningContext";

interface CalendarContextMenuProps {
  x: number;
  y: number;
  eventId: string;
  onClose: () => void;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  filteredVacations: VacationApiItem[];
  setActiveVacationId: (id: string) => void;
  setDetailsOpen: (open: boolean) => void;
  setReplaceOpen: (open: boolean) => void;
  duplicateVacation: (id: string) => void;
  openPropagation: (id: string) => void;
  setIdsToDelete: (ids: string[]) => void;
  setDeleteConfirmOpen: (open: boolean) => void;
  magicFill: () => void;
}

export const CalendarContextMenu: React.FC<CalendarContextMenuProps> = ({
  x, y, eventId, onClose, selectedIds, setSelectedIds,
  filteredVacations, setActiveVacationId, setDetailsOpen, setReplaceOpen,
  duplicateVacation, openPropagation, setIdsToDelete, setDeleteConfirmOpen, magicFill
}) => {
  if (typeof document === "undefined") return null;

  const activeVacation =
    filteredVacations.find((vacation) => vacation.id === eventId) ??
    filteredVacations.find((vacation) => eventId.startsWith(`${vacation.id}-`));
  const baseEventId = activeVacation?.id ?? eventId;
  const canReplace = Boolean(activeVacation && activeVacation.status !== "cancelled" && activeVacation.status !== "closed");

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[9998] bg-black/5 backdrop-blur-[1px]"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className={cn(
           "fixed z-[9999] glass-card shadow-luxe-hover border-white/40 dark:border-slate-800/60 rounded-2xl py-2 min-w-[220px] animate-in fade-in zoom-in-95 duration-200 ring-1 ring-black/10 overflow-hidden"
        )}
        style={{
          top: Math.min(y, typeof window !== 'undefined' ? window.innerHeight - 250 : y),
          left: Math.min(x, typeof window !== 'undefined' ? window.innerWidth - 220 : x)
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-2 text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 border-b border-border/50 mb-1 flex items-center justify-between">
          <span>Mission Control {selectedIds.size > 1 && `(${selectedIds.size})`}</span>
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>

        {selectedIds.size > 1 && (
          <button
            className="w-full text-left px-4 py-2 text-sm bg-amber-500/10 hover:bg-amber-500 hover:text-white flex items-center gap-2 transition-all duration-200 group/item text-amber-700 dark:text-amber-400"
            onClick={() => {
              magicFill();
              onClose();
            }}
          >
            <div className="h-6 w-6 rounded bg-amber-500/20 flex items-center justify-center group-hover/item:bg-white/20">
              <Wand2 className="h-3.5 w-3.5" />
            </div>
            Optimiser la sÃ©lection
          </button>
        )}

        <button
          className="w-full text-left px-4 py-2 text-sm hover:bg-primary hover:text-white flex items-center gap-2 transition-all duration-200 group/item"
          onClick={() => {
            const v = activeVacation;
            if (v) {
              setActiveVacationId(v.id);
              setDetailsOpen(true);
            }
            onClose();
          }}
        >
          <div className="h-6 w-6 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center group-hover/item:bg-white/20">
            <Users className="h-3.5 w-3.5" />
          </div>
          DÃ©tails de la mission
        </button>

        <button
          className="w-full text-left px-4 py-2 text-sm bg-cyan-500/10 hover:bg-cyan-600 hover:text-white flex items-center gap-2 transition-all duration-200 group/item text-cyan-700 dark:text-cyan-300 disabled:pointer-events-none disabled:opacity-45"
          disabled={!canReplace}
          onClick={() => {
            const v = activeVacation;
            if (v) {
              setActiveVacationId(v.id);
              setDetailsOpen(false);
              setReplaceOpen(true);
            }
            onClose();
          }}
        >
          <div className="h-6 w-6 rounded bg-cyan-500/15 flex items-center justify-center group-hover/item:bg-white/20">
            <Wand2 className="h-3.5 w-3.5" />
          </div>
          Remplacer l&apos;agent
        </button>
        <button
          className="w-full text-left px-4 py-2 text-sm hover:bg-primary hover:text-white flex items-center gap-2 transition-all duration-200 group/item"
          onClick={() => {
            duplicateVacation(baseEventId);
            onClose();
          }}
        >
          <div className="h-6 w-6 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center group-hover/item:bg-white/20">
            <Clock className="h-3.5 w-3.5" />
          </div>
          Dupliquer
        </button>

        <button
          className="w-full text-left px-4 py-2 text-sm hover:bg-primary hover:text-white flex items-center gap-2 transition-all duration-200 group/item"
          onClick={() => {
            openPropagation(baseEventId);
            onClose();
          }}
        >
          <div className="h-6 w-6 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center group-hover/item:bg-white/20">
            <Wand2 className="h-3.5 w-3.5" />
          </div>
          Propager
        </button>

        <button
          className="w-full text-left px-4 py-2 text-sm hover:bg-primary hover:text-white flex items-center gap-2 transition-all duration-200 group/item"
          onClick={() => {
            setSelectedIds(new Set([baseEventId]));
            onClose();
          }}
        >
          <div className="h-6 w-6 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center group-hover/item:bg-white/20">
            <div className="h-3 w-3 border-2 border-current rounded-sm" />
          </div>
          SÃ©lectionner
        </button>

        <div className="h-px bg-border/50 my-1 mx-2" />

        <button
          className="w-full text-left px-4 py-2 text-sm hover:bg-destructive hover:text-white flex items-center gap-2 transition-all duration-200 group/item"
          onClick={() => {
            setIdsToDelete([baseEventId]);
            setDeleteConfirmOpen(true);
            onClose();
          }}
        >
          <div className="h-6 w-6 rounded bg-destructive/10 dark:bg-destructive/20 flex items-center justify-center group-hover/item:bg-white/20">
            <AlertCircle className="h-3.5 w-3.5 text-destructive group-hover/item:text-white" />
          </div>
          Supprimer
        </button>
      </div>
    </>,
    document.body
  );
};



