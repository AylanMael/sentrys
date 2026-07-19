"use client";

import * as React from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { Loader2, Plus } from "lucide-react";

import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth-provider";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Severity = "Faible" | "Moyenne" | "Élevée";
type Status = "Ouvert" | "Clos";

export type SiteRef = {
  id: string;
  name: string;
  tenantId?: string;
  address?: string | null;
  city?: string | null;
  riskLevel?: number | null;
  isActive?: boolean | null;
};

type Props = {
  site: SiteRef;
  triggerLabel?: string;
};

function normalizeStatusKey(status: Status) {
  return status === "Ouvert" ? "ouvert" : "clos";
}

function normalizeSeverityKey(sev: Severity) {
  if (sev === "Faible") return "faible";
  if (sev === "Moyenne") return "moyenne";
  return "elevee";
}

export function CreateIncidentForSiteDialog({
  site,
  triggerLabel = "Nouvel incident",
}: Props) {
  const { toast } = useToast();
  const { user } = useAuth();

  const [open, setOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const [severity, setSeverity] = React.useState<Severity>("Moyenne");
  const [description, setDescription] = React.useState("");

  const siteInactive = site.isActive === false;

  const canSubmit =
    !!db &&
    !!user?.uid &&
    !!user?.tenantId &&
    !siteInactive &&
    description.trim().length >= 2 &&
    !isLoading;

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();

    if (!db) {
      toast({
        variant: "destructive",
        title: "Firestore indisponible",
        description: "Vérifie la configuration Firebase.",
      });
      return;
    }
    if (!user?.uid || !user?.tenantId) {
      toast({
        variant: "destructive",
        title: "Session incomplète",
        description: "Reconnecte-toi puis réessaie.",
      });
      return;
    }

    // Garde-fou tenant (UX + évite de “débugger des permissions”)
    if (site.tenantId && site.tenantId !== user.tenantId) {
      toast({
        variant: "destructive",
        title: "Site invalide",
        description: "Ce site n’appartient pas à votre organisation.",
      });
      return;
    }

    const cleanDesc = description.trim();
    if (cleanDesc.length < 2) return;

    setIsLoading(true);
    try {
      const status: Status = "Ouvert";

      await addDoc(collection(db, "incidents"), {
        tenantId: user.tenantId,

        // lien fort vers un site
        siteId: site.id,
        siteName: site.name ?? "—",
        siteSnapshot: {
          id: site.id,
          name: site.name ?? null,
          address: site.address ?? null,
          city: site.city ?? null,
          riskLevel: site.riskLevel ?? 3,
          isActive: site.isActive ?? true,
        },

        // incident
        severity,
        severityKey: normalizeSeverityKey(severity),
        status,
        statusKey: normalizeStatusKey(status),
        description: cleanDesc,

        // audit
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: {
          uid: user.uid,
          email: user.email ?? null,
          name: null,
        },
      });

      toast({
        title: "Incident créé",
        description: "Ajouté à la liste du site.",
      });

      setDescription("");
      setSeverity("Moyenne");
      setOpen(false);
    } catch (err: any) {
      console.error("CreateIncidentForSiteDialog error:", err);
      toast({
        variant: "destructive",
        title: "Création impossible",
        description: err?.message?.includes("Missing or insufficient permissions")
          ? "Permissions Firestore insuffisantés (rules incidents) ou site hors tenant."
          : err?.message ?? "Erreur inconnue.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-2xl gap-2" disabled={siteInactive}>
          <Plus className="h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg rounded-3xl">
        <DialogHeader>
          <DialogTitle>Nouvel incident — {site.name ?? "Site"}</DialogTitle>
          <DialogDescription>
            {siteInactive
              ? "Ce site est inactif. Active-le pour pouvoir créer des incidents."
              : "L’incident sera rattaché à ce site et visible dans la liste."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onCreate} className="space-y-4">
          <div className="space-y-2">
            <Label>Sévérité</Label>
            <Select
              value={severity}
              onValueChange={(v) => setSeverity(v as Severity)}
              disabled={isLoading || siteInactive}
            >
              <SelectTrigger className="h-11 rounded-2xl">
                <SelectValue placeholder="Choisir" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Faible">Faible</SelectItem>
                <SelectItem value="Moyenne">Moyenne</SelectItem>
                <SelectItem value="Élevée">Élevée</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="desc">Description</Label>
            <Textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Décris clairement ce qui s’est passé…"
              className="min-h-[120px] rounded-2xl"
              disabled={isLoading || siteInactive}
              required
            />
            <p className="text-xs text-muted-foreground">
              Minimum 2 caractères. Sois précis, ça sert d’historique.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={!canSubmit} className="rounded-2xl">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Création…
                </>
              ) : (
                "Créer"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
