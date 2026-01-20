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

export default function LoginPage() {
  return (
    <Card>
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl">Content de vous revoir</CardTitle>
        <CardDescription>
          Saisissez vos informations pour accéder à votre compte
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" placeholder="jean@exemple.com" required />
        </div>
        <div className="space-y-2">
          <div className="flex items-center">
            <Label htmlFor="password">Mot de passe</Label>
            <Link href="#" className="ml-auto inline-block text-sm underline">
              Mot de passe oublié ?
            </Link>
          </div>
          <Input id="password" type="password" required />
        </div>
        <Button type="submit" className="w-full as-child">
          <Link href="/dashboard">Connexion</Link>
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
        <Button variant="outline" className="w-full">
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
      </CardContent>
    </Card>
  )
}
