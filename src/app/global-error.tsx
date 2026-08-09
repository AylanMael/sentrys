"use client";
import { useEffect } from "react";
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[ui.global-error]", { digest: error.digest, name: error.name }); }, [error]);
  return <html lang="fr"><body><main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui" }}><div style={{ maxWidth: 520, textAlign: "center" }}><h1>Une erreur empêche Sentrys de démarrer</h1><p>Réessayez. Si le problème persiste, communiquez la référence {error.digest ?? "indisponible"} à l’assistance.</p><button type="button" onClick={reset} style={{ padding: "12px 20px", borderRadius: 10, fontWeight: 700 }}>Réessayer</button></div></main></body></html>;
}