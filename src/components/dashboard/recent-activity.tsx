"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { ActivityFeed } from "@/components/activity/activity-feed";

export function RecentActivityCard() {
  return (
    <div className="p-10 flex flex-col h-full">
      <div className="mb-8 flex items-start justify-between gap-4 relative z-10">
        <div>
          <h3 className="text-2xl font-black tracking-tighter text-foreground">Activité Flux</h3>
          <p className="text-sm font-bold text-muted-foreground/60 mt-2 leading-relaxed max-w-[240px]">
            Flux opérationnel en temps réel des agents et sites.
          </p>
        </div>

        <Button asChild variant="ghost" size="sm" className="h-10 px-4 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-white/10 border border-white/5">
          <Link href="/dashboard/activity">Historique <ChevronRight className="ml-1 h-3.5 w-3.5" /></Link>
        </Button>
      </div>

      <div className="flex-1">
        <ActivityFeed limit={6} />
      </div>
    </div>
  );
}
