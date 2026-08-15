"use client";

import { useEffect, useState } from "react";
import { Activity, MapPin, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import { useAuth } from "@/lib/auth-provider";

export default function PatrolsPage() {
  const { getToken } = useAuth();
  const [patrols, setPatrols] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="space-y-8">
      <div>
        <div>
          <h1 className="text-4xl font-black tracking-tighter sm:text-5xl bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/50">
            Rondes & Patrouilles
          </h1>
          <p className="text-muted-foreground mt-2 font-medium tracking-tight">
            Consultez les parcours de surveillance configurés pour vos sites.
          </p>
        </div>
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
              <p className="text-muted-foreground max-w-sm mx-auto mt-1">
                Aucun parcours de surveillance n'est disponible pour le moment.
              </p>
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

                <div className="flex items-center pt-4 border-t border-border/5">
                  <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    <Clock className="size-3" />
                    {patrol.estimatedDuration || 30} min
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

    </div>
  );
}
