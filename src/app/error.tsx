"use client";
import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[ui.error]", { digest: error.digest, name: error.name }); }, [error]);
  return <main className="grid min-h-[70vh] place-items-center p-6"><div className="max-w-lg rounded-[2rem] border bg-background p-8 text-center shadow-sm"><AlertTriangle className="mx-auto h-12 w-12 text-amber-600" /><h1 className="mt-5 text-2xl font-black">Cette page n’a pas pu être chargée</h1><p className="mt-3 text-muted-foreground">Vos données ne sont pas perdues. Réessayez, puis contactez l’assistance si le problème persiste.</p>{error.digest && <p className="mt-3 text-xs text-muted-foreground">Référence : {error.digest}</p>}<div className="mt-6 flex justify-center gap-3"><Button onClick={reset}><RefreshCw />Réessayer</Button><Button asChild variant="outline"><Link href="/contact?reason=support">Assistance</Link></Button></div></div></main>;
}