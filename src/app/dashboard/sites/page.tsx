"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth-provider";
import { useToast } from "@/hooks/use-toast";

import type { Site } from "@/lib/sites/types";
import { SiteForm, type SiteFormValues } from "@/components/sites/site-form";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PlusCircle, Search } from "lucide-react";

function siteTypeLabel(v: Site["siteType"]) {
  const map: Record<Site["siteType"], string> = {
    bureaux: "Bureaux",
    chantier: "Chantier",
    boutique: "Boutique",
    evenement: "Événement",
    hotel: "Hôtel",
    autre: "Autre",
  };
  return map[v] ?? "Autre";
}

function safeArr(v: unknown): string[] {
  return Array.isArray(v)
    ? (v.filter((x) => typeof x === "string") as string[])
    : [];
}

export default function SitesPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [sites, setSites] = useState<Site[]>([]);
  const [qText, setQText] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const role = String((user as any)?.role ?? "");
  const isAdmin = role === "admin";
  const canWrite = role === "admin" || role === "manager";

  useEffect(() => {
    if (!(user as any)?.tenantId) return;

    const ref = collection(db, "sites");

    const q = isAdmin
      ? query(ref, where("tenantId", "==", (user as any).tenantId), orderBy("createdAt", "desc"))
      : query(
          ref,
          where("tenantId", "==", (user as any).tenantId),
          where("accessUids", "array-contains", (user as any).uid),
          orderBy("createdAt", "desc")
        );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const data: Site[] = snap.docs.map((d) => {
          const raw = d.data() as any;
          return {
            id: d.id,
            ...(raw as any),
            managerIds: safeArr(raw?.managerIds),
            agentIds: safeArr(raw?.agentIds), // ⚠️ ids agents (pas uid)
            accessUids: safeArr(raw?.accessUids),
          } as Site;
        });

        setSites(data);
      },
      (err) => {
        console.error(err);

        const msg =
          err?.message?.includes("requires an index")
            ? "Index Firestore requis pour la liste des sites (tenantId + accessUids + createdAt)."
            : "Impossible de charger les sites.";

        toast({
          title: "Erreur",
          description: msg,
          variant: "destructive",
        });
      }
    );

    return () => unsub();
  }, [toast, (user as any)?.tenantId, (user as any)?.uid, isAdmin]);

  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();
    if (!t) return sites;
    return sites.filter((s) => {
      const hay = `${(s as any).name ?? ""} ${(s as any).clientName ?? ""} ${(s as any).city ?? ""} ${
        (s as any).address ?? ""
      }`.toLowerCase();
      return hay.includes(t);
    });
  }, [sites, qText]);

  async function createSite(values: SiteFormValues) {
    if (!user) {
      toast({
        title: "Non connecté",
        description: "Veuillez vous reconnecter.",
        variant: "destructive",
      });
      return;
    }

    if (!(user as any).tenantId) {
      toast({
        title: "Profil incomplet",
        description: "Provisioning en cours : tenantId manquant.",
        variant: "destructive",
      });
      return;
    }

    if (!canWrite) {
      toast({
        title: "Accès refusé",
        description: "Droits insuffisants.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      await addDoc(collection(db, "sites"), {
        tenantId: (user as any).tenantId,

        name: values.name,
        clientName: values.clientName || null,
        siteType: values.siteType,
        riskLevel: values.riskLevel,
        address: values.address || null,
        city: values.city || null,
        postalCode: values.postalCode || null,
        instructions: values.instructions || null,
        isActive: values.isActive,

        // ✅ RBAC init : le créateur devient manager du site
        managerIds: [(user as any).uid],
        agentIds: [], // ⚠️ ids agents
        accessUids: [(user as any).uid],

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: (user as any).uid,
        updatedBy: (user as any).uid,
      });

      toast({ title: "Site créé", description: "Le site est enregistré." });
      setOpen(false);
    } catch (e: any) {
      console.error(e);
      toast({
        title: "Erreur",
        description: e?.message ?? "Création impossible.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Sites</h1>
          <p className="text-sm text-muted-foreground">
            Lieux sécurisés, consignes, niveau de risque. Base de contexte pour incidents et missions.
          </p>
        </div>

        <div className="flex gap-2">
          <div className="relative w-full md:w-[360px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={qText}
              onChange={(e) => setQText(e.target.value)}
              placeholder="Rechercher (nom, client, ville...)"
              className="pl-9"
            />
          </div>

          {canWrite && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Nouveau site
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Créer un site</DialogTitle>
                </DialogHeader>
                <SiteForm submitLabel="Créer" onSubmit={createSite} isSubmitting={saving} />
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((s) => {
          const uid = (user as any)?.uid;

          // ✅ UI: "Assigné" si accessUids contient l'utilisateur
          const isAssigned = !!uid && safeArr((s as any).accessUids).includes(uid);

          return (
            <Card key={(s as any).id} className="transition hover:shadow-sm">
              <CardHeader className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-lg">
                    <Link href={`/dashboard/sites/${(s as any).id}`} className="hover:underline">
                      {(s as any).name}
                    </Link>
                  </CardTitle>

                  <div className="flex items-center gap-2">
                    {isAssigned ? <Badge variant="outline">Assigné</Badge> : null}
                    <Badge variant={(s as any).isActive ? "default" : "secondary"}>
                      {(s as any).isActive ? "Actif" : "Inactif"}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{siteTypeLabel((s as any).siteType)}</Badge>
                  <Badge variant="outline">Risque {(s as any).riskLevel ?? 3}/5</Badge>
                  {(s as any).city ? <Badge variant="outline">{(s as any).city}</Badge> : null}
                </div>
              </CardHeader>

              <CardContent className="space-y-2 text-sm text-muted-foreground">
                {(s as any).clientName ? (
                  <div>
                    <span className="text-foreground">Client :</span> {(s as any).clientName}
                  </div>
                ) : null}

                {(s as any).address ? <div>{(s as any).address}</div> : null}

                {(s as any).instructions ? (
                  <div className="line-clamp-2">{(s as any).instructions}</div>
                ) : (
                  <div className="italic">Aucune consigne renseignée.</div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {filtered.length === 0 && (
          <div className="rounded-lg border p-6 text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
            Aucun site trouvé.
          </div>
        )}
      </div>
    </div>
  );
}