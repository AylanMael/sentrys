import type { Metadata } from "next";
import PublicLayout from "@/components/layouts/public-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contactez-nous pour une démo ou toute autre question.",
};

export default function ContactPage() {
  return (
    <PublicLayout>
      <section className="py-12 md:py-20">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Contactez-nous
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Que ce soit pour une démo, une question sur nos tarifs ou un partenariat, notre équipe est là pour vous répondre.
            </p>
          </div>

          <div className="mx-auto mt-12 max-w-xl">
            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <form className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nom complet</Label>
                    <Input id="name" placeholder="John Doe" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Adresse email</Label>
                    <Input id="email" type="email" placeholder="john.doe@example.com" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company">Entreprise (optionnel)</Label>
                  <Input id="company" placeholder="ACME Inc." />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">Message</Label>
                  <Textarea id="message" placeholder="Votre message..." required className="min-h-[120px]" />
                </div>
                <Button type="submit" className="w-full">
                  Envoyer le message
                </Button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
