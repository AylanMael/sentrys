
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, serverTimestamp, collection, writeBatch } from "firebase/firestore";
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
import { FirestorePermissionError } from "@/lib/firebase/errors";
import { errorEmitter } from "@/lib/firebase/error-emitter";

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

    let tenantData: any, tenantUserData: any;

    try {
      // 1. Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const batch = writeBatch(db);

      // 2. Create tenant document
      const tenantRef = doc(collection(db, "tenants"));
      tenantData = {
        name: tenantName,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        status: "active",
      };
      batch.set(tenantRef, tenantData);

      // 3. Create tenantUsers document for the new admin
      const tenantUserRef = doc(db, "tenantUsers", user.uid);
      tenantUserData = {
        tenantId: tenantRef.id,
        uid: user.uid,
        email: user.email,
        name: fullName,
        role: "Admin" as const,
        status: "active" as const,
        createdAt: serverTimestamp(),
      };
      batch.set(tenantUserRef, tenantUserData);
      
      // 4. Commit the batch write
      await batch.commit();
      
      toast({
          title: "Compte créé avec succès !",
          description: "Votre espace de travail est prêt. Redirection...",
      });
      router.push("/dashboard");

    } catch (error: any) {
      // Check if it's a Firestore permission error
      if (error.code === "permission-denied" || error.code === "firestore/permission-denied") {
          const permissionError = new FirestorePermissionError({
              path: `BATCH WRITE to collections: 'tenants', 'tenantUsers'`,
              operation: 'write',
              requestResourceData: { tenant: tenantData, tenantUser: tenantUserData },
          });
          errorEmitter.emit('permission-error', permissionError);
      } else {
        // Handle other errors (mostly from Auth)
        let description = "Une erreur est survenue. Veuillez réessayer.";
        if (error.code === "auth/email-already-in-use") {
          description = "Cette adresse e-mail est déjà utilisée.";
        } else if (error.code === "auth/weak-password") {
          description = "Le mot de passe doit comporter au moins 6 caractères.";
        }
        toast({
          variant: "destructive",
          title: "Échec de l'inscription",
          description,
        });
      }
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
