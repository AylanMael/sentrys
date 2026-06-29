"use client";

import React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePlanning } from "./PlanningContext";
import { Trash2 } from "lucide-react";

export function DeleteConfirmDialog() {
  const {
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    idsToDelete,
    setIdsToDelete,
    deleteVacation,
    clearSelection
  } = usePlanning();

  const handleConfirm = async () => {
    const ok = await deleteVacation(idsToDelete);
    if (ok) {
      clearSelection();
    }
    setDeleteConfirmOpen(false);
    setIdsToDelete([]);
  };

  const isMultiple = idsToDelete.length > 1;

  return (
    <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
      <AlertDialogContent className="border-border/50 bg-background/95 backdrop-blur-xl shadow-2xl max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 text-destructive mb-2">
            <div className="p-2 bg-destructive/10 rounded-full">
              <Trash2 className="w-5 h-5" />
            </div>
            <AlertDialogTitle className="text-xl">
              {isMultiple ? "Supprimer ces vacations ?" : "Supprimer cette vacation ?"}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-muted-foreground text-base">
            {isMultiple
              ? `Vous êtes sur le point de supprimer ${idsToDelete.length} missions du planning. Cette action est irréversible.`
              : "Cette mission sera définitivement retirée du planning. Cette opération ne peut pas être annulée."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-6 gap-3">
          <AlertDialogCancel className="bg-secondary/50 hover:bg-secondary border-none">
            Annuler
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-lg shadow-destructive/20 border-none"
          >
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
