"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { auth, db } from "@/lib/firebase/client";
import { useToast } from "@/hooks/use-toast";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

    if (!cleanEmail || !password || !cleanTenantName || !cleanFullName) {
      toast({
        variant: "destructive",
        title: "Champs manquants",
        description: "Merci de remplir tous les champs.",
      });
      return;
    }

    setIsLoading(true);

    try {
      console.log("STEP 1: createUserWithEmailAndPassword...");
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        cleanEmail,
        password
      );
      const user = userCredential.user;
      const uid = user.uid;
      console.log("STEP 1 OK ✅", { uid });

      console.log(
        "PROJECT (env):",
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
      );

      const token = await user.getIdToken();
      console.log("ID TOKEN length:", token?.length);

      console.log("STEP 2: updateProfile...");
      await updateProfile(user, { displayName: cleanFullName });
      console.log("STEP 2 OK ✅");

      // V1 (simple et robuste)
      const tenantId = uid;

      console.log("STEP 3: write tenantUsers/{uid}...");
      await setDoc(doc(db, "tenantUsers", uid), {
        tenantId,
        uid,
        email: cleanEmail,
        name: cleanFullName,
        role: "admin",
        status: "active",
        createdAt: serverTimestamp(),
      });
      console.log("STEP 3 OK ✅");

      console.log("STEP 4: write tenants/{tenantId}...");
      await setDoc(doc(db, "tenants", tenantId), {
        name: cleanTenantName,
        createdAt: serverTimestamp(),
        createdBy: uid,
        status: "active",
      });
      console.log("STEP 4 OK ✅");

      toast({
        title: "Compte créé",
        description: "Votre espace Sentrys est prêt.",
      });

      console.log("STEP 5: redirect -> /dashboard");
      router.push("/dashboard");
      console.log("STEP 5 OK ✅");
    } catch (error: any) {
      console.error("Signup Error:", error);

      let description = "Une erreur est survenue. Veuillez réessayer.";
      if (error?.code === "auth/email-already-in-use") {
        description =
          "Cette adresse e-mail est déjà utilisée. Connectez-vous.";
      } else if (error?.code === "auth/weak-password") {
        description = "Le mot de passe doit comporter au moins 6 caractères.";
      } else if (
        error?.code === "permission-denied" ||
        error?.code === "firestore/permission-denied"
      ) {
        description =
          "Permissions Firestore insuffisantes. Vérifie les règles tenantUsers/tenants.";
      } else if (typeof error?.message === "string") {
        description = error.message;
      }

      toast({
        variant: "destructive",
        title: "Échec de l'inscription",
        description,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      title="Créer un compte"
      subtitle="Créez votre espace Sentrys sécurisé en moins d’une minute."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Déjà un compte ?{" "}
          <Link
            href="/login"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Se connecter
          </Link>
        </p>
      }
    >
      <Card className="rounded-3xl">
        <CardContent className="p-6">
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company-name">Nom de l’entreprise</Label>
              <Input
                id="company-name"
                placeholder="Votre Société"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                disabled={isLoading}
                className="h-11 rounded-2xl"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="full-name">Nom complet</Label>
              <Input
                id="full-name"
                placeholder="Nom & prénom"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={isLoading}
                className="h-11 rounded-2xl"
                required
              />
            </div>

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
              <Label htmlFor="password">Mot de passe</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  autoComplete="new-password"
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
              <p className="text-xs text-muted-foreground">
                Astuce : 10+ caractères, 1 majuscule, 1 chiffre.
              </p>
            </div>

            <Button
              type="submit"
              className="h-11 w-full rounded-2xl"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Création...
                </>
              ) : (
                "Créer mon espace"
              )}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              En continuant, vous acceptez nos{" "}
              <Link
                href="/terms"
                className="underline underline-offset-4 hover:text-foreground"
              >
                CGU
              </Link>{" "}
              et notre{" "}
              <Link
                href="/privacy"
                className="underline underline-offset-4 hover:text-foreground"
              >
                politique de confidentialité
              </Link>
              .
            </p>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
