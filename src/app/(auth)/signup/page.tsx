// src/app/signup/page.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { Eye, EyeOff, Loader2, Building2, User, Mail, Lock, Sparkles, ArrowRight } from "lucide-react";

import { auth, db } from "@/lib/firebase/client";
import { useToast } from "@/hooks/use-toast";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function getFirebaseErrorCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }

  return null;
}

export default function SignupPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [fullName, setFullName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const cleanEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const cleanTenantName = useMemo(() => tenantName.trim(), [tenantName]);
  const cleanFullName = useMemo(() => fullName.trim(), [fullName]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!auth || !db) {
      toast({
        variant: "destructive",
        title: "Configuration",
        description: "L'instance de sécurité n'est pas initialisée.",
      });
      return;
    }

    if (!cleanEmail || !password || !cleanTenantName || !cleanFullName) {
      toast({
        variant: "destructive",
        title: "Informations manquantes",
        description: "Veuillez remplir l'intégralité du formulaire.",
      });
      return;
    }

    setIsLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      const user = userCredential.user;
      const uid = user.uid;

      await updateProfile(user, { displayName: cleanFullName });

      const tenantId = uid;

      // Création du profil utilisateur
      await setDoc(doc(db, "tenantUsers", uid), {
        tenantId,
        uid,
        email: cleanEmail,
        name: cleanFullName,
        role: "admin",
        status: "active",
        createdAt: serverTimestamp(),
      });

      // Création de l'organisation (Tenant)
      await setDoc(doc(db, "tenants", tenantId), {
        name: cleanTenantName,
        createdAt: serverTimestamp(),
        createdBy: uid,
        status: "active",
      });

      toast({
        title: "Bienvenue sur Sentrys",
        description: "Votre espace agence a été configuré avec succès.",
      });

      router.push("/dashboard");
    } catch (error: unknown) {
      let description = "Une erreur est survenue lors de la création.";
      const code = getFirebaseErrorCode(error);
      if (code === "auth/email-already-in-use") {
        description = "Cette adresse e-mail est déjà associée à un compte.";
      } else if (code === "auth/weak-password") {
        description = "Le mot de passe doit contenir au moins 6 caractères.";
      }

      toast({ variant: "destructive", title: "Erreur d'inscription", description });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      title="Démarrez avec Sentrys"
      subtitle="Configurez votre terminal d'exploitation en quelques secondes."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Vous avez déjà un compte ?{" "}
          <Link href="/login" className="text-primary font-bold hover:underline underline-offset-4">
            Identifiez-vous
          </Link>
        </p>
      }
    >
      <Card className="rounded-[2rem] border-none shadow-2xl shadow-black/[0.03] bg-background ring-1 ring-black/5 overflow-hidden">
        <CardContent className="p-8 md:p-10">
          <form onSubmit={handleSignup} className="space-y-6">
            <div className="space-y-4">
              {/* Entreprise */}
              <div className="space-y-2">
                <Label htmlFor="company-name" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">
                  Nom de l&apos;agence
                </Label>
                <div className="relative group">
                  <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    id="company-name"
                    placeholder="Sentrys Protection Service"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    disabled={isLoading}
                    className="h-12 rounded-2xl pl-11 bg-muted/30 border-none focus-visible:ring-2 focus-visible:ring-primary/20 transition-all"
                    required
                  />
                </div>
              </div>

              {/* Nom Complet */}
              <div className="space-y-2">
                <Label htmlFor="full-name" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">
                  Responsable d&apos;exploitation
                </Label>
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    id="full-name"
                    placeholder="Jean Dupont"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={isLoading}
                    className="h-12 rounded-2xl pl-11 bg-muted/30 border-none focus-visible:ring-2 focus-visible:ring-primary/20 transition-all"
                    required
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">
                  Email Professionnel
                </Label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="contact@agence.fr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    autoComplete="email"
                    className="h-12 rounded-2xl pl-11 bg-muted/30 border-none focus-visible:ring-2 focus-visible:ring-primary/20 transition-all"
                    required
                  />
                </div>
              </div>

              {/* Mot de passe */}
              <div className="space-y-2">
              <Label htmlFor="password" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">
  Mot de passe
</Label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    id="password"
                    type={showPwd ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    autoComplete="new-password"
                    className="h-12 rounded-2xl pl-11 pr-11 bg-muted/30 border-none focus-visible:ring-2 focus-visible:ring-primary/20 transition-all"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-tighter px-1 flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-primary" /> Sécurité : 6+ caractères conseillés
                </p>
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
                  <span>Initialisation...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span>Déployer mon espace</span>
                  <ArrowRight className="h-5 w-5" />
                </div>
              )}
            </Button>

            <div className="pt-4 text-center">
              <p className="text-[10px] font-medium text-muted-foreground leading-relaxed">
                En créant un compte, vous acceptez nos{" "}
                <Link href="/terms" className="text-foreground font-bold underline decoration-primary/30 underline-offset-2">CGU</Link>
                {" "}et notre{" "}
                <Link href="/privacy" className="text-foreground font-bold underline decoration-primary/30 underline-offset-2">Politique de confidentialité</Link>.
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
