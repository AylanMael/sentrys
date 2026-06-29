"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Plus,
  MapPin,
  Clock,
  ChevronRight,
  Shield,
  AlertCircle,
  Play
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";

import { useAuth } from "@/lib/auth-provider";

export default function PatrolsPage() {
  const { getToken } = useAuth();
  const [patrols, setPatrols] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    fetchPatrols();
  }, []);

  const fetchPatrols = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/patrols", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.ok) setPatrols(data.patrols);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/seed-patrol", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.ok) {
        await fetchPatrols();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black tracking-tighter sm:text-5xl bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/50">
            Rondes & Patrouilles
          </h1>
          <p className="text-muted-foreground mt-2 font-medium tracking-tight">
            Gérez vos parcours de surveillance et assurez une présence certifiée.
          </p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="rounded-2xl gap-2 h-12 px-6 shadow-xl shadow-primary/20 transition-all hover:scale-105 active:scale-95">
              <Plus className="size-5" />
              Nouveau Modèle
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl glass-card rounded-[2rem]">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black tracking-tight">Configuration de Ronde</DialogTitle>
              <DialogDescription>
                Définissez les points de passage et les objectifs de surveillance.
              </DialogDescription>
            </DialogHeader>
            <div className="p-4 bg-muted/20 rounded-2xl border border-border/10 text-center">
              <Shield className="size-12 mx-auto text-primary/40 mb-2" />
              <p className="text-sm font-medium text-muted-foreground">
                L'éditeur de parcours cartographique sera disponible prochainement.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          Array(3).fill(0).map((_, i) => (
            <Card key={i} className="glass-card overflow-hidden border-none">
              <CardHeader className="p-6">
                <Skeleton className="h-6 w-3/4 bg-foreground/5" />
                <Skeleton className="h-4 w-1/2 mt-2 bg-foreground/5" />
              </CardHeader>
              <CardContent className="p-6 pt-0 space-y-4">
                <Skeleton className="h-20 w-full bg-foreground/5 rounded-xl" />
              </CardContent>
            </Card>
          ))
        ) : patrols.length === 0 ? (
          <Card className="col-span-full glass-card border-none p-12 text-center flex flex-col items-center justify-center space-y-4">
            <div className="size-20 bg-primary/5 rounded-full flex items-center justify-center">
              <Activity className="size-10 text-primary/40" />
            </div>
            <div>
              <h3 className="text-xl font-bold">Aucune ronde configurée</h3>
              <p className="text-muted-foreground max-w-sm mx-auto mt-1 mb-6">
                Créez votre premier modèle de ronde pour commencer à certifier la présence de vos agents.
              </p>
              <Button
                variant="outline"
                className="rounded-xl gap-2 border-primary/20 hover:bg-primary/5"
                onClick={handleSeed}
                disabled={seeding}
              >
                {seeding ? "Création en cours..." : "Générer une Ronde de Démo"}
              </Button>
            </div>
          </Card>
        ) : (
          patrols.map((patrol) => (
            <Card key={patrol.id} className="glass-card overflow-hidden border-none group transition-all hover:translate-y-[-4px]">
              <CardHeader className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-xl font-black tracking-tight group-hover:text-primary transition-colors">
                      {patrol.name}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2 font-medium">
                      <MapPin className="size-3" />
                      Site ID: {patrol.siteId.substring(0, 8)}...
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="rounded-lg bg-background/50 border-primary/20 text-primary px-2 font-bold uppercase text-[10px]">
                    {patrol.checkpoints?.length || 0} POINTS
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-6 pt-0 space-y-6">
                <div className="relative pl-4 space-y-4 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[2px] before:bg-gradient-to-b before:from-primary/50 before:to-transparent">
                  {patrol.checkpoints?.slice(0, 2).map((cp: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="size-2 rounded-full bg-primary ring-4 ring-primary/10" />
                      <span className="text-sm font-semibold truncate">{cp.name}</span>
                    </div>
                  ))}
                  {(patrol.checkpoints?.length || 0) > 2 && (
                    <p className="text-xs text-muted-foreground font-black uppercase tracking-widest pl-5">
                      + {patrol.checkpoints.length - 2} autres points
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-border/5">
                  <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    <Clock className="size-3" />
                    {patrol.estimatedDuration || 30} min
                  </div>
                  <Button variant="ghost" size="sm" className="rounded-xl group/btn hover:bg-primary hover:text-primary-foreground border-none">
                    Détails
                    <ChevronRight className="size-4 ml-1 group-hover/btn:translate-x-1 transition-transform" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mt-12">
        <Card className="glass-card border-none bg-primary/[0.02]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="size-5 text-primary" />
              Activité de Ronde en Direct
            </CardTitle>
          </CardHeader>
          <CardContent className="h-64 flex flex-col items-center justify-center text-center text-muted-foreground">
            <AlertCircle className="size-8 opacity-20 mb-2" />
            <p className="text-sm font-medium">Aucune ronde n'est en cours actuellement.</p>
          </CardContent>
        </Card>

        <Card className="glass-card border-none overflow-hidden group border border-primary/5 relative">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <CardHeader className="relative z-10">
            <CardTitle>Démarrer une Session</CardTitle>
            <CardDescription aria-hidden="true">Interface pour agent mobile</CardDescription>
          </CardHeader>
          <CardContent className="relative z-10">
            <p className="text-sm mb-6 text-muted-foreground">
              Utilisez l'interface mobile pour scanner les QR codes ou valider les points par GPS.
            </p>
            <Button className="w-full h-12 rounded-2xl gap-2 font-black uppercase text-xs tracking-widest shadow-lg shadow-primary/10" disabled>
              <Play className="size-4" />
              Ouvrir l'Interface de Ronde
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
