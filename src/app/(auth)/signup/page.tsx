import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function SignupPage() {
  return (
    <Card>
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl">Créer un compte</CardTitle>
        <CardDescription>
          Saisissez vos informations pour créer votre nouvel espace de travail de sécurité
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
            <Label htmlFor="company-name">Nom de l'entreprise</Label>
            <Input id="company-name" placeholder="Votre Sécurité Inc." required />
        </div>
        <div className="space-y-2">
            <Label htmlFor="full-name">Nom complet</Label>
            <Input id="full-name" placeholder="Jean Dupont" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" placeholder="jean@exemple.com" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Mot de passe</Label>
          <Input id="password" type="password" required />
        </div>
        <Button type="submit" className="w-full as-child">
          <Link href="/dashboard">Créer un compte</Link>
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
      </CardContent>
    </Card>
  )
}
