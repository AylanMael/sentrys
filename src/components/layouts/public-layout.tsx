
import Link from "next/link";
import {
  ArrowRight,
  ShieldCheck,
  Menu,
  ChevronRight,
} from "lucide-react";
import Logo from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const nav = [
  { label: "Fonctionnalités", href: "/fonctionnalites" },
  { label: "Tarifs", href: "/tarifs" },
  { label: "Blog", href: "/blog" },
  { label: "Contact", href: "/contact" },
];

function MobileMenu() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Ouvrir le menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-[320px] sm:w-[380px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Logo />
          </SheetTitle>
        </SheetHeader>

        <div className="mt-8 flex flex-col gap-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center justify-between rounded-lg px-3 py-2.5 text-base hover:bg-muted"
            >
              {item.label}
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}

          <Separator className="my-4" />

          <Button asChild variant="outline" className="w-full">
            <Link href="/login">Connexion</Link>
          </Button>
          <Button asChild className="w-full">
            <Link href="/signup">Démarrer</Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2" aria-label="Sentrys">
            <Logo />
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Navigation principale">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2">
              <Button variant="ghost" asChild>
                <Link href="/login">Connexion</Link>
              </Button>
              <Button asChild className="gap-2">
                <Link href="/signup">
                  Démarrer <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
            <MobileMenu />
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t">
        <div className="container py-12">
          <div className="grid gap-8 md:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Logo />
              <p className="text-sm text-muted-foreground">
                La plateforme opérationnelle pour les entreprises de sécurité privée.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-8 text-sm md:col-span-2 md:grid-cols-3">
              <div className="grid gap-2">
                <h3 className="font-semibold">Produit</h3>
                <Link href="/fonctionnalites" className="text-muted-foreground hover:text-foreground">
                  Fonctionnalités
                </Link>
                <Link href="/tarifs" className="text-muted-foreground hover:text-foreground">
                  Tarifs
                </Link>
                <Link href="/contact" className="text-muted-foreground hover:text-foreground">
                  Démo
                </Link>
              </div>

              <div className="grid gap-2">
                <h3 className="font-semibold">Entreprise</h3>
                <Link href="/blog" className="text-muted-foreground hover:text-foreground">
                  Blog
                </Link>
                <Link href="/contact" className="text-muted-foreground hover:text-foreground">
                  Contact
                </Link>
              </div>

              <div className="grid gap-2">
                <h3 className="font-semibold">Légal</h3>
                <Link href="/conditions" className="text-muted-foreground hover:text-foreground">
                  Conditions
                </Link>
                <Link href="/confidentialite" className="text-muted-foreground hover:text-foreground">
                  Confidentialité
                </Link>
              </div>
            </div>
          </div>

          <Separator className="my-8" />

          <p className="text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} Sentrys. Tous droits réservés.
          </p>
        </div>
      </footer>
    </div>
  );
}
