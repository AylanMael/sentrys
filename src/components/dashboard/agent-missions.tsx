// src/components/dashboard/agent-missions.tsx
"use client";

import React, { useEffect, useState } from "react";
import {
  MapPin,
  Clock,
  CheckCircle2,
  Navigation,
  Loader2,
  AlertCircle
} from "lucide-react";
import {
  onSnapshot,
  doc,
  getDoc
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth-provider";
import { qAgentAssignments } from "@/lib/firestore/queries";
import { apiFetch } from "@/lib/api/client-fetch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Assignment = {
  id: string;
  siteId: string;
  vacationId: string;
  status: string;
  updatedAt: any;
  siteName?: string;
};

export function AgentMissions() {
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  const { toast } = useToast();
  const [missions, setMissions] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid || !tenantId) return;

    const q = qAgentAssignments(db, tenantId, user.uid);
    const unsubscribe = onSnapshot(q, async (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment));

      // Fetch site names for the missions
      const withNames = await Promise.all(list.map(async (m) => {
        try {
          const sSnap = await getDoc(doc(db, "sites", m.siteId));
          return { ...m, siteName: sSnap.exists() ? sSnap.data().name : "Site inconnu" };
        } catch {
          return { ...m, siteName: "Site inconnu" };
        }
      }));

      setMissions(withNames);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user?.uid, tenantId]);

  const handleCheckIn = async (assignmentId: string) => {
    setCheckingIn(assignmentId);

    try {
      // 1. Get Location
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
      });

      const { latitude, longitude } = position.coords;

      // 2. Call API
      const res = await apiFetch<any>(`/api/assignments/${assignmentId}/check-in`, {
        method: "POST",
        body: { latitude, longitude }
      });

      if (!res.ok) {
        throw new Error(res.error || "Échec du pointage");
      }

      toast({
        title: "Pointage réussi",
        description: "Votre présence a été enregistrée avec succès.",
      });

    } catch (err: any) {
      console.error("[check-in]", err);
      toast({
        variant: "destructive",
        title: "Erreur de pointage",
        description: err.message || "Impossible de récupérer votre position GPS.",
      });
    } finally {
      setCheckingIn(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (missions.length === 0) {
    return (
      <Card className="border-dashed border-2 bg-muted/30">
        <CardContent className="flex flex-col items-center justify-center py-10 text-center">
          <Clock className="h-10 w-10 text-muted-foreground/40 mb-4" />
          <h3 className="font-bold text-lg">Aucune mission en attente</h3>
          <p className="text-sm text-muted-foreground max-w-[250px]">
            Vous n'avez pas de mission active ou à venir assignée pour le moment.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
        <Navigation className="h-5 w-5 text-primary" />
        Mes Missions Actives
      </h2>

      <div className="grid gap-4">
        {missions.map((m) => (
          <Card key={m.id} className="overflow-hidden group hover:border-primary/50 transition-colors">
            <div className="flex flex-col md:flex-row md:items-center justify-between p-5 gap-4">
              <div className="flex gap-4">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                  <MapPin className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h4 className="font-bold text-lg leading-tight uppercase tracking-tight">
                    {m.siteName}
                  </h4>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px] font-bold uppercase py-0 px-2 rounded-md border-primary/20 bg-primary/5 text-primary">
                      Assigné
                    </Badge>
                    <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      En attente de pointage
                    </span>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => handleCheckIn(m.id)}
                disabled={checkingIn === m.id}
                className="h-12 rounded-xl px-6 font-black shadow-lg shadow-primary/20 hover:translate-y-[-2px] active:scale-95 transition-all text-sm uppercase tracking-wider"
              >
                {checkingIn === m.id ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Pointage...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-5 w-5" />
                    Signaler ma Présence
                  </>
                )}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
