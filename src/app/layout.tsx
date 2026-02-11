import "./globals.css";
import type { Metadata, Viewport } from "next";
import Providers from "./providers";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Sentrys — Plateforme de gestion pour sociétés de sécurité privée",
    template: "%s | Sentrys",
  },
  description:
    "Sentrys centralise la gestion des agents, sites, vacations, planning et incidents. Une plateforme moderne pour piloter vos opérations de sécurité privée.",
  applicationName: "Sentrys",
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Sentrys",
    title: "Sentrys — Opérations de sécurité modernes, simplifiées",
    description:
      "Gérez agents, sites, vacations, planning et incidents sur une plateforme tout-en-un.",
    url: "/",
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sentrys",
    description:
      "Plateforme de gestion pour sociétés de sécurité privée : agents, sites, planning, incidents.",
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Sentrys",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "Sentrys centralise la gestion des agents, sites, vacations, planning et incidents. Une plateforme moderne pour piloter vos opérations de sécurité privée.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "EUR",
    },
  };

  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="min-h-dvh bg-background text-foreground antialiased font-sans selection:bg-primary/20 selection:text-foreground">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 rounded-md border bg-background px-3 py-2 text-sm shadow"
        >
          Aller au contenu
        </a>

        <Providers>
          <main id="main">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
