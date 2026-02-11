"use client";

import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { ActivityFeed } from "@/components/activity/activity-feed";

export function RecentActivityCard() {
  return (
    <Card className="rounded-3xl">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">Activité récente</CardTitle>
          <div className="mt-1 text-xs text-muted-foreground">
            Actions sur agents, sites, vacations et incidents.
          </div>
        </div>

        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/activity">Tout voir</Link>
        </Button>
      </CardHeader>

      <CardContent>
        <ActivityFeed limit={6} />
      </CardContent>
    </Card>
  );
}
