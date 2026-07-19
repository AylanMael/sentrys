// src/app/login/page.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { Eye, EyeOff, Loader2, ShieldCheck, ArrowRight, Lock, Mail } from "lucide-react";

import { auth, db } from "@/lib/firebase/client";
import { useToast } from "@/hooks/use-toast";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";


function resolveNextPath(rawNext: string | null, fallback: string) {
  if (!rawNext) return fallback;

  const next = rawNext.trim();
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("://")) {
    return fallback;
  }

  return next;
}

function getFirebaseErrorCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }

  return null;
}

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const cleanEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!auth || !db) {
      toast({
        variant: "destructive",
        title: "Configuration requise",
        description: "L'instance de sécurité n'est pas initialisée.",
      });
      return;
    }

    if (!cleanEmail || !password) {
      toast({
        variant: "destructive",
        title: "Champs requis",
        description: "Veuillez renseignér vos identifiants.",
      });
      return;
    }

    setIsLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const firebaseUser = userCredential.user;

      const tenantUserRef = doc(db, `tenantUsers/${firebaseUser.uid}`);
      const tenantUserSnap = await getDoc(tenantUserRef);

      if (!tenantUserSnap.exists()) {
        await auth.signOut();
        toast({
          variant: "destructive",
          title: "Accès restreint",
          description: "Aucun profil opérationnel associé à ce compte.",
        });
        return;
      }

      const profile = tenantUserSnap.data() as { role?: unknown; tenantId?: unknown };
      const role = String(profile.role ?? "").trim().toLowerCase();
      const tenantId = String(profile.tenantId ?? "").trim();
      const isPlatformSuperAdmin = role === "super_admin" && tenantId === "platform";
      const fallbackPath = isPlatformSuperAdmin ? "/platform" : "/dashboard";
      const nextParam =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("next")
          : null;
      const requestedDestination = resolveNextPath(nextParam, fallbackPath);
      const destination = isPlatformSuperAdmin
        ? requestedDestination.startsWith("/platform")
          ? requestedDestination
          : "/platform"
        : requestedDestination.startsWith("/platform")
          ? fallbackPath
          : requestedDestination;

      toast({ title: "Accès autorisé", description: "Chargement de votre environnement..." });
      router.push(destination);
    } catch (error: unknown) {
      let description = "Une erreur est survenue lors de l'authentification.";
      const code = getFirebaseErrorCode(error);

      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        description = "Identifiants incorrects.";
      } else if (code === "auth/user-not-found") {
        description = "Ce compte n'existe pas.";
      }

      toast({ variant: "destructive", title: "Échec de connexion", description });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      title="Content de vous revoir"
      subtitle="Identifiez-vous pour accéder au terminal Sentrys."
      footer={
        <div className="space-y-4">
          <p className="text-center text-sm text-muted-foreground">
            Pas encore membre ?{" "}
            <Link href="/signup" className="text-primary font-bold hover:underline underline-offset-4">
              Créer un espace agence
            </Link>
          </p>
        </div>
      }
    >
      <Card className="rounded-[2rem] border-none shadow-2xl shadow-black/[0.03] bg-background ring-1 ring-black/5 overflow-hidden">
        <CardContent className="p-8 md:p-10">
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">
                  Email Professionnel
                </Label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="nom@agence.fr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    autoComplete="email"
                    className="h-12 rounded-2xl pl-11 bg-muted/30 border-none focus-visible:ring-2 focus-visible:ring-primary/20 transition-all"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <Label htmlFor="password" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Mot de passe
                  </Label>
                  <Link
  href="/forgot-password"
  className="text-[10px] font-bold text-primary hover:opacity-80 transition-opacity"
>
  Oublié ?
</Link>
                </div>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    id="password"
                    type={showPwd ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    autoComplete="current-password"
                    className="h-12 rounded-2xl pl-11 pr-11 bg-muted/30 border-none focus-visible:ring-2 focus-visible:ring-primary/20 transition-all"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPwd ? "Masquer" : "Afficher"}
                  >
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              className={cn(
                "h-14 w-full rounded-2xl font-black text-base shadow-xl shadow-primary/20 transition-all active:scale-[0.98]",
                isLoading ? "opacity-80" : "hover:translate-y-[-2px]"
              )}
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Validation...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span>Accéder au dashboard</span>
                  <ArrowRight className="h-5 w-5" />
                </div>
              )}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-muted" />
              </div>
              <div className="relative flex justify-center text-[10px] font-black uppercase tracking-[0.2em]">
                <span className="bg-background px-4 text-muted-foreground/50">Sécurité Sentrys</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="h-12 w-full rounded-2xl border-dashed border-2 hover:bg-primary/5 hover:text-primary transition-all font-bold"
              disabled
            >
              <ShieldCheck className="mr-2 h-4 w-4" />
              SSO Entreprise (Prochainement)
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
