"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const LiveMapClient = dynamic(
  () => import("./live-map-client"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[400px] flex items-center justify-center rounded-[2rem] bg-muted/20 border border-dashed animate-pulse">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-bold text-muted-foreground">Initialisation de la carte...</p>
        </div>
      </div>
    )
  }
);

export function LiveMap(props: any) {
  return <LiveMapClient {...props} />;
}
