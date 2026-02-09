"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { auth, db } from "@/lib/firebase/client";
import { useToast } from "@/hooks/use-toast";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

    // Guard: firebase init
    if (!auth || !db) {
      toast({
        variant: "destructive",
        title: "Erreur de configuration",
        description:
          "Firebase n’est pas initialisé. Vérifie .env.local (NEXT_PUBLIC_FIREBASE_*) puis redémarre le serveur.",
      });
      return;
    }

    if (!cleanEmail || !password) {
      toast({
        variant: "destructive",
        title: "Champs manquants",
        description: "Merci de renseigner l’e-mail et le mot de passe.",
      });
      return;
    }

    setIsLoading(true);

    try {
      console.log("LOGIN STEP 1: signInWithEmailAndPassword...");
      const userCredential = await signInWithEmailAndPassword(
        auth,
        cleanEmail,
        password
      );
      const firebaseUser = userCredential.user;
      console.log("LOGIN STEP 1 OK ✅", { uid: firebaseUser.uid });

      // Token debug (prouve auth client OK)
      const token = await firebaseUser.getIdToken();
      console.log("LOGIN TOKEN length:", token?.length);

      console.log("LOGIN STEP 2: read tenantUsers/{uid}...");
      const tenantUserRef = doc(db, `tenantUsers/${firebaseUser.uid}`);
      const tenantUserSnap = await getDoc(tenantUserRef);

      if (!tenantUserSnap.exists()) {
        console.warn("LOGIN: tenantUser doc missing for uid:", firebaseUser.uid);
        await auth.signOut();

        toast({
          variant: "destructive",
          title: "Profil introuvable",
          description:
            "Votre compte est authentifié, mais aucun profil Sentrys n’a été trouvé. Utilisez l’inscription.",
        });
        return;
      }
      console.log("LOGIN STEP 2 OK ✅", tenantUserSnap.data());

      toast({
        title: "Connexion réussie",
        description: "Redirection vers votre tableau de bord...",
      });

      console.log("LOGIN STEP 3: redirect -> /dashboard");
      router.push("/dashboard");
      console.log("LOGIN STEP 3 OK ✅");
    } catch (error: any) {
      console.error("Login Error:", error);

      let description = "Une erreur est survenue. Veuillez réessayer.";
      if (
        error?.code === "auth/wrong-password" ||
        error?.code === "auth/invalid-credential"
      ) {
        description = "L'adresse e-mail ou le mot de passe est incorrect.";
      } else if (error?.code === "auth/user-not-found") {
        description = "Aucun compte trouvé avec cette adresse e-mail.";
      } else if (
        error?.code === "permission-denied" ||
        error?.code === "firestore/permission-denied"
      ) {
        description =
          "Permissions Firestore insuffisantes. Vérifie les règles sur tenantUsers.";
      } else if (typeof error?.message === "string") {
        description = error.message;
      }

      toast({
        variant: "destructive",
        title: "Échec de la connexion",
        description,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      title="Connexion"
      subtitle="Accédez à votre espace sécurisé Sentrys."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Pas de compte ?{" "}
          <Link
            href="/signup"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Créer un espace
          </Link>
        </p>
      }
    >
      <Card className="rounded-3xl">
        <CardContent className="p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="vous@exemple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                autoComplete="email"
                className="h-11 rounded-2xl"
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Mot de passe</Label>
                <Link
                  href="/forgot-password"
                  className="text-xs underline underline-offset-4 text-muted-foreground hover:text-foreground"
                >
                  Mot de passe oublié ?
                </Link>
              </div>

              <div className="relative">
                <Input
                  id="password"
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  autoComplete="current-password"
                  className="h-11 rounded-2xl pr-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={
                    showPwd ? "Masquer le mot de passe" : "Afficher le mot de passe"
                  }
                >
                  {showPwd ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="h-11 w-full rounded-2xl"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connexion...
                </>
              ) : (
                "Se connecter"
              )}
            </Button>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Ou
                </span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="h-11 w-full rounded-2xl"
              disabled
            >
              Se connecter avec Google (à activer)
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
