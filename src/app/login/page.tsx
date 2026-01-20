
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
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

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      // 1. Sign in with auth
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;

      // 2. Check for the tenantUser document in Firestore
      if (!db) {
        throw new Error("La connexion à Firestore n'est pas disponible.");
      }
      const tenantUserRef = doc(db, `tenantUsers/${firebaseUser.uid}`);
      const tenantUserSnap = await getDoc(tenantUserRef);

      if (!tenantUserSnap.exists()) {
        // If the user is authenticated but has no corresponding document,
        // it's an invalid state. Sign them out and show an error.
        await auth.signOut();
        toast({
          variant: "destructive",
          title: "Échec de la connexion",
          description: "Votre compte est authentifié, mais aucun profil utilisateur n'a été trouvé. Veuillez utiliser le formulaire d'inscription.",
        });
        setIsLoading(false);
        return;
      }
      
      // 3. If everything is correct, proceed to dashboard
      toast({
        title: "Connexion réussie",
        description: "Vous allez être redirigé vers votre tableau de bord.",
      });
      router.push("/dashboard");

    } catch (error: any) {
      console.error(error);
      let description = "Une erreur est survenue. Veuillez réessayer.";
      if (error.code === "auth/wrong-password" || error.code === 'auth/invalid-credential') {
        description = "L'adresse e-mail ou le mot de passe est incorrect.";
      } else if (error.code === "auth/user-not-found") {
        description = "Aucun compte trouvé avec cette adresse e-mail.";
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
    <Card>
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl">Content de vous revoir</CardTitle>
        <CardDescription>
          Saisissez vos informations pour accéder à votre compte
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleLogin} className="space-y-4">
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
            <div className="flex items-center">
              <Label htmlFor="password">Mot de passe</Label>
              <Link href="#" className="ml-auto inline-block text-sm underline">
                Mot de passe oublié ?
              </Link>
            </div>
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
            {isLoading ? "Connexion..." : "Connexion"}
          </Button>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Ou continuer avec
              </span>
            </div>
          </div>
          <Button variant="outline" className="w-full" disabled={isLoading}>
            Se connecter avec Google
          </Button>
          <p className="px-8 text-center text-sm text-muted-foreground">
            Vous n'avez pas de compte ?{" "}
            <Link
              href="/signup"
              className="underline underline-offset-4 hover:text-primary"
            >
              Inscrivez-vous
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
