// src/app/dashboard/archived/page.tsx
"use client";

import { Button } from "@/components/ui/button";
import { auth } from "@/lib/firebase/client";
import { useRouter } from "next/navigation";
import { Archive, LogOut } from "lucide-react";

export default function ArchivedPage() {
  const router = useRouter();

  async function logout() {
    await auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6">
      <div className="max-w-lg w-full rounded-3xl border bg-card p-8 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center">
            <Archive className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Compte archivé</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Ce compte a été archivé. Si vous pensez qu’il s’agit d’une erreur, contactez l’assistance.
            </p>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <Button variant="outline" onClick={() => router.push("/support")} className="rounded-xl">
            Contacter l’assistance
          </Button>
          <Button onClick={logout} className="rounded-xl">
            <LogOut className="h-4 w-4 mr-2" />
            Se déconnecter
          </Button>
        </div>
      </div>
    </div>
  );
}
