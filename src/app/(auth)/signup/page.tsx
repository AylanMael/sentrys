"use client";

import Link from "next/link";
import { ArrowRight, Building2, LogIn, ShieldCheck } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function SignupPage() {
  return (
    <AuthShell
      title="Créer votre espace Sentrys"
      subtitle="Chaque agence est préparée et vérifiée avant son ouverture."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Vous avez déjà un compte ?{" "}
          <Link href="/login" className="font-bold text-primary hover:underline">
            Se connecter
          </Link>
        </p>
      }
    >
      <Card className="overflow-hidden rounded-[2rem] border-none shadow-2xl ring-1 ring-black/5">
        <CardContent className="space-y-6 p-8 md:p-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Building2 className="h-7 w-7" />
          </div>
          <div className="space-y-3">
            <h2 className="text-2xl font-black tracking-tight">Demandez l’ouverture de votre agence</h2>
            <p className="leading-relaxed text-muted-foreground">
              Nous configurons votre société, vos droits et votre environnement avec vous. Aucun compte incomplet ne sera créé.
            </p>
          </div>
          <div className="rounded-2xl border bg-muted/30 p-4 text-sm text-muted-foreground">
            <p className="flex items-center gap-2 font-bold text-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Ouverture contrôlée
            </p>
            <p className="mt-2">Vous recevez vos accès dès que l’espace est prêt.</p>
          </div>
          <Button asChild className="h-13 w-full rounded-xl font-black">
            <Link href="/contact?reason=demo">
              Demander mon espace
              <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-12 w-full rounded-xl font-bold">
            <Link href="/login">
              <LogIn />
              J’ai déjà mes accès
            </Link>
          </Button>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
