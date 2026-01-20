
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) {
        toast({
            variant: "destructive",
            title: "Erreur de configuration",
            description: "La base de données n'est pas initialisée. Veuillez vérifier votre configuration Firebase.",
        });
        return;
    }
    setIsLoading(true);

    try {
      // 1) Create Auth user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const uid = user.uid;

      // optionnel : nom affiché dans Auth
      await updateProfile(user, { displayName: fullName });
    
      // 2) Create tenantId (simple)
      const tenantId = uid;

      // 3) Create tenantUser doc FIRST (required by rules for tenants create)
      await setDoc(doc(db, "tenantUsers", uid), {
        tenantId,
        uid,
        email,
        name: fullName,
        role: "admin",
        status: "active",
        createdAt: serverTimestamp(),
      });

      // 4) Create tenant doc
      await setDoc(doc(db, "tenants", tenantId), {
        name: tenantName,
        createdAt: serverTimestamp(),
        createdBy: uid,
        status: "active",
      });

      // 5) redirect
      toast({
          title: "Compte créé avec succès !",
          description: "Votre espace de travail est prêt. Redirection...",
      });
      router.push("/dashboard");

    } catch (error: any) {
        // Handle other errors (mostly from Auth)
        let description = "Une erreur est survenue. Veuillez réessayer.";
        if (error.code === "auth/email-already-in-use") {
          description = "Cette adresse e-mail est déjà utilisée.";
        } else if (error.code === "auth/weak-password") {
          description = "Le mot de passe doit comporter au moins 6 caractères.";
        }
        console.error("Signup Error:", error);
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
    <Card>
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl">Créer un compte</CardTitle>
        <CardDescription>
          Saisissez vos informations pour créer votre nouvel espace de travail de sécurité
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSignup} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company-name">Nom de l'entreprise</Label>
            <Input
              id="company-name"
              placeholder="Votre Sécurité Inc."
              required
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="full-name">Nom complet</Label>
            <Input
              id="full-name"
              placeholder="Jean Dupont"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="jean@exemple.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Création du compte..." : "Créer un compte"}
          </Button>

          <p className="px-8 text-center text-sm text-muted-foreground">
            En cliquant sur continuer, vous acceptez nos{" "}
            <Link
              href="/terms"
              className="underline underline-offset-4 hover:text-primary"
            >
              Conditions d'utilisation
            </Link>{" "}
            et{" "}
            <Link
              href="/privacy"
              className="underline underline-offset-4 hover:text-primary"
            >
              Politique de confidentialité
            </Link>
            .
          </p>

          <div className="mt-4 text-center text-sm">
            Vous avez déjà un compte ?{" "}
            <Link href="/login" className="underline">
              Connectez-vous
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
