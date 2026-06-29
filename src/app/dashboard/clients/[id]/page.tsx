// src/app/dashboard/clients/[id]/page.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  ExternalLink,
  RefreshCcw,
  MapPin,
  Shield,
  BriefcaseBusiness,
  Mail,
  Phone,
  Building2,
  FileText,
  AlertTriangle,
  Users,
  Plus,
  ChevronRight,
  MoreHorizontal,
} from "lucide-react";

import { useAuth } from "@/lib/auth-provider";
import { apiFetch } from "@/lib/api/client-fetch";
import { hasRole, normalizeRole } from "@/lib/auth/role";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import type { Site } from "@/lib/sites/types";
import { useSitesByClientApi } from "@/hooks/use-sites-by-client-api";

type ClientStatus = "active" | "inactive";

type ClientItem = {
  id: string;
  tenantId: string;
  name: string;
  legalName?: string | null;
  siret?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  billingEmail?: string | null;
  address?: {
    line1?: string | null;
    line2?: string | null;
    postalCode?: string | null;
    city?: string | null;
    country?: string | null;
  } | null;
  status: ClientStatus;
  notes?: string | null;
  createdAt?: any;
  updatedAt?: any;
  archivedAt?: any;
};

function safeStr(v: any) {
  return typeof v === "string" ? v : "";
}

function fmtAddress(a?: ClientItem["address"] | null) {
  if (!a) return "—";

  const parts = [
    safeStr(a.line1),
    safeStr(a.line2),
    [safeStr(a.postalCode), safeStr(a.city)].filter(Boolean).join(" "),
    safeStr(a.country),
  ].filter((x) => x && x.trim());

  return parts.length ? parts.join(", ") : "—";
}

function hasAddress(a?: ClientItem["address"] | null) {
  if (!a) return false;

  return [
    safeStr(a.line1),
    safeStr(a.line2),
    safeStr(a.postalCode),
    safeStr(a.city),
    safeStr(a.country),
  ].some((x) => x.trim().length > 0);
}

function siteTypeLabel(v: Site["siteType"]) {
  const map: Record<Site["siteType"], string> = {
    bureaux: "Bureaux",
    chantier: "Chantier",
    boutique: "Boutique",
    evenement: "Événement",
    hotel: "Hôtel",
    autre: "Autre",
  };
  return map[v] ?? "Autre";
}

export default function ClientDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const { user, loading: authLoading } = useAuth();

  const role = useMemo(
    () => normalizeRole((user as any)?.role) ?? "client",
    [user]
  );

  const canRead = useMemo(() => {
    return hasRole(role, ["super_admin", "owner", "admin", "manager", "viewer"]);
  }, [role]);

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<ClientItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    if (authLoading) return;

    if (!user) {
      setLoading(false);
      setItem(null);
      setError("Non connecté.");
      return;
    }

    if (!(user as any)?.tenantId) {
      setLoading(false);
      setItem(null);
      setError("tenantId manquant (claims). Vérifie le provisioning.");
      return;
    }

    if (!canRead) {
      setLoading(false);
      setItem(null);
      setError("Droits insuffisants pour consulter ce client.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch<{ ok: boolean; item?: ClientItem; error?: string }>(
        `/api/clients/${id}`
      );

      if (!res.ok) {
        setItem(null);
        setError(res.error ?? "Impossible de charger le client.");
        return;
      }

      const data = res.item ?? null;

      if (
        data &&
        (data as any).tenantId &&
        (data as any).tenantId !== (user as any).tenantId
      ) {
        setItem(null);
        setError("Accès refusé : ce client n’appartient pas à votre organisation.");
        return;
      }

      setItem(data);
    } catch (e: any) {
      setItem(null);
      setError(e?.message ?? "Impossible de charger le client.");
    } finally {
      setLoading(false);
    }
  }, [id, authLoading, user, canRead]);

  useEffect(() => {
    void load();
  }, [load]);

  const title = useMemo(() => item?.name ?? "Client", [item]);

  const { items: sites, loading: sitesLoading, error: sitesError } =
    useSitesByClientApi(item?.id ?? null, {
      max: 50,
      includeInactive: true,
    });

  const siteStats = useMemo(
    () => ({
      active: sites.filter((site) => site.isActive).length,
      inactive: sites.filter((site) => !site.isActive).length,
      withoutAddress: sites.filter((site) => !safeStr(site.address)).length,
    }),
    [sites]
  );

  const clientSitesHref = item
    ? `/dashboard/sites?clientId=${encodeURIComponent(
        item.id
      )}&clientName=${encodeURIComponent(item.name)}`
    : "/dashboard/sites";

  const newClientSiteHref = item
    ? `${clientSitesHref}&new=1`
    : "/dashboard/sites";

  const clientPlanningPdfHref = item
    ? `/site-planning/print?clientId=${encodeURIComponent(item.id)}`
    : "/site-planning/print";

  const clientAddressText = item ? fmtAddress(item.address) : "";
  const clientHasAddress = item ? hasAddress(item.address) : false;
  const clientMapsHref = clientHasAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        clientAddressText
      )}`
    : null;

  const openClientPlanningPdf = useCallback(() => {
    const opened = window.open(clientPlanningPdfHref, "_blank");

    if (opened) {
      opened.opener = null;
      opened.focus();
      return;
    }

    window.location.assign(clientPlanningPdfHref);
  }, [clientPlanningPdfHref]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium tracking-widest uppercase">
            Chargement de la fiche client...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95 duration-500">
        <div className="bg-destructive/10 p-6 rounded-full mb-6">
          <AlertTriangle className="h-12 w-12 text-destructive" />
        </div>
        <h2 className="text-2xl font-black tracking-tight mb-2">Erreur d'accès</h2>
        <p className="text-muted-foreground mb-8 max-w-md">{error}</p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button variant="outline" asChild className="h-12 rounded-xl px-6 font-bold">
            <Link href="/dashboard/clients">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour à la liste
            </Link>
          </Button>
          <Button onClick={load} className="h-12 rounded-xl px-6 font-bold gap-2">
            <RefreshCcw className="h-4 w-4" />
            Réessayer
          </Button>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95 duration-500">
        <div className="bg-muted p-6 rounded-full mb-6">
          <BriefcaseBusiness className="h-12 w-12 text-muted-foreground/50" />
        </div>
        <h2 className="text-2xl font-black tracking-tight mb-2">Client introuvable</h2>
        <p className="text-muted-foreground mb-8">
          Ce client n'existe pas ou a été supprimé.
        </p>

        <Button variant="outline" asChild className="h-12 rounded-xl px-6 font-bold">
          <Link href="/dashboard/clients">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour à la liste
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-10 w-full">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between bg-card p-6 md:p-8 rounded-[2rem] border shadow-sm ring-1 ring-black/5 bg-gradient-to-br from-card to-muted/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-start gap-4">
          <Button
            variant="outline"
            asChild
            className="h-9 rounded-xl px-4 font-bold border-muted-foreground/20 text-muted-foreground hover:text-foreground transition-all"
          >
            <Link href="/dashboard/clients">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour
            </Link>
          </Button>

          <div>
            <div className="flex items-center gap-3 mb-2">
              <Badge
                variant={item.status === "active" ? "default" : "secondary"}
                className={cn(
                  "rounded-lg px-3 py-1 font-bold text-[10px] uppercase tracking-wider",
                  item.status === "active"
                    ? "bg-green-500/10 text-green-600 hover:bg-green-500/20 border-transparent"
                    : "opacity-60"
                )}
              >
                {item.status === "active" ? "Client Actif" : "Client Inactif"}
              </Badge>

              {item.siret && (
                <Badge
                  variant="outline"
                  className="rounded-lg font-mono text-[10px] py-1 border-muted-foreground/30 uppercase tracking-tighter"
                >
                  SIRET: {item.siret}
                </Badge>
              )}
            </div>

            <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-foreground">
              {title}
            </h1>

            {item.legalName && (
              <p className="text-sm font-bold text-muted-foreground mt-1 uppercase tracking-widest">
                {item.legalName}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 relative z-10">
          <Button
            asChild
            className="h-12 rounded-xl px-6 font-black shadow-lg shadow-primary/15 hover:translate-y-[-2px] active:scale-95 transition-all"
          >
            <Link href={newClientSiteHref}>
              <Plus className="h-5 w-5 mr-2" />
              Ajouter un site
            </Link>
          </Button>

          <Button
            variant="outline"
            onClick={openClientPlanningPdf}
            className="h-12 rounded-xl px-5 font-bold border-muted-foreground/20 hover:bg-muted transition-all"
          >
            <FileText className="h-5 w-5 mr-2" />
            PDF tous les sites
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-12 rounded-xl px-5 font-bold border-muted-foreground/20 hover:bg-muted transition-all"
              >
                <MoreHorizontal className="h-5 w-5 mr-2" />
                Actions
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              className="w-64 rounded-2xl border-muted-foreground/10 p-2 shadow-xl"
            >
              <DropdownMenuItem
                className="rounded-xl p-3 font-bold cursor-pointer"
                onSelect={(event) => {
                  event.preventDefault();
                  void load();
                }}
              >
                <RefreshCcw className="h-4 w-4" />
                Actualiser la fiche
              </DropdownMenuItem>

              <DropdownMenuItem
                className="rounded-xl p-3 font-bold cursor-pointer"
                onSelect={(event) => {
                  event.preventDefault();
                  router.push(clientSitesHref);
                }}
              >
                <ExternalLink className="h-4 w-4" />
                Voir les sites du client
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 items-start">
        <div className="lg:col-span-1 space-y-6">
          <Card className="rounded-[2rem] border-none shadow-xl shadow-black/[0.02] bg-background ring-1 ring-black/5 overflow-hidden">
            <div className="p-6 md:p-8 bg-muted/20 border-b">
              <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
                <BriefcaseBusiness className="h-5 w-5 text-primary" />
                Coordonnées
              </h2>
            </div>

            <CardContent className="p-6 md:p-8 space-y-6">
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="bg-muted p-2 rounded-xl">
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                      Contact principal
                    </p>
                    <p className="text-sm font-bold text-foreground mt-0.5 truncate">
                      {item.contactName || "Non renseigné"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="bg-muted p-2 rounded-xl">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                      Email Opérationnel
                    </p>
                    <p className="text-sm font-bold text-foreground mt-0.5 truncate">
                      {item.email || "—"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="bg-muted p-2 rounded-xl">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                      Téléphone
                    </p>
                    <p className="text-sm font-bold text-foreground mt-0.5 truncate">
                      {item.phone || "—"}
                    </p>
                  </div>
                </div>
              </div>

              <Separator className="opacity-50" />

              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="bg-primary/10 p-2 rounded-xl border border-primary/20">
                    <Mail className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest">
                      Email Facturation
                    </p>
                    <p className="text-sm font-bold text-foreground mt-0.5 truncate">
                      {item.billingEmail || "Identique à l'opérationnel"}
                    </p>
                  </div>
                </div>

                {clientHasAddress && (
                  <div className="rounded-2xl border border-muted-foreground/10 bg-muted/20 p-4">
                    <div className="flex items-start gap-4">
                      <div className="bg-background p-2 rounded-xl border border-muted-foreground/10">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                          Adresse du siège
                        </p>
                        <p className="text-sm font-medium text-foreground mt-1 leading-relaxed">
                          {clientAddressText}
                        </p>
                      </div>
                    </div>

                    {clientMapsHref && (
                      <Button
                        variant="outline"
                        asChild
                        className="mt-4 h-9 rounded-xl px-3 text-xs font-black"
                      >
                        <a href={clientMapsHref} target="_blank" rel="noreferrer">
                          <MapPin className="h-4 w-4 mr-2" />
                          Ouvrir dans Maps
                        </a>
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border-none shadow-xl shadow-black/[0.02] bg-primary/5 ring-1 ring-primary/10 overflow-hidden relative">
            <FileText className="absolute top-6 right-6 h-24 w-24 text-primary opacity-5 pointer-events-none" />
            <div className="p-6 border-b border-primary/10">
              <h2 className="text-sm font-black tracking-widest uppercase text-primary">
                Notes internes
              </h2>
            </div>
            <CardContent className="p-6">
              {item.notes ? (
                <div className="text-sm font-medium leading-relaxed italic text-foreground/80 whitespace-pre-wrap">
                  "{item.notes}"
                </div>
              ) : (
                <div className="text-sm text-muted-foreground italic">
                  Aucune consigne ou note interne.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="rounded-[2.5rem] border-none shadow-2xl shadow-black/[0.03] bg-background ring-1 ring-black/5 overflow-hidden h-full flex flex-col">
            <div className="p-6 md:p-8 bg-muted/20 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-xl font-black tracking-tight flex items-center gap-3">
                <MapPin className="h-6 w-6 text-primary" />
                Sites d'intervention
                <Badge variant="secondary" className="ml-2 font-black">
                  {sites.length}
                </Badge>
              </h2>

              <div className="flex flex-wrap items-center gap-2">
                {sites.length > 0 && (
                  <>
                    <Badge
                      variant="outline"
                      className="rounded-full border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300"
                    >
                      {siteStats.active} actif(s)
                    </Badge>
                    {siteStats.inactive > 0 && (
                      <Badge
                        variant="outline"
                        className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em]"
                      >
                        {siteStats.inactive} inactif(s)
                      </Badge>
                    )}
                    {siteStats.withoutAddress > 0 && (
                      <Badge
                        variant="outline"
                        className="rounded-full border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300"
                      >
                        {siteStats.withoutAddress} adresse(s) a completer
                      </Badge>
                    )}
                  </>
                )}
                <Button
                  variant="outline"
                  asChild
                  className="h-10 rounded-xl px-4 font-bold border-muted-foreground/20"
                >
                  <Link href={clientSitesHref}>
                    Voir la liste <ChevronRight className="h-4 w-4 ml-1 opacity-50" />
                  </Link>
                </Button>
              </div>
            </div>

            <CardContent className="p-0 flex-1">
              {sitesLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                  <p className="text-xs font-bold uppercase tracking-widest">
                    Recherche des sites...
                  </p>
                </div>
              ) : sitesError ? (
                <div className="m-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                  <p className="text-sm font-bold text-destructive">{sitesError}</p>
                </div>
              ) : sites.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center px-4">
                  <div className="bg-muted p-6 rounded-full mb-4">
                    <MapPin className="h-10 w-10 text-muted-foreground/50" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground">
                    Aucun site configuré
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-sm mb-6">
                    Ce client n'a pas encore de lieux d'intervention associés.
                  </p>
                  <Button asChild className="rounded-xl font-bold shadow-lg shadow-primary/20">
                    <Link href={newClientSiteHref}>
                      <Plus className="h-4 w-4 mr-2" /> Ajouter le premier site
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="divide-y">
                  {sites.map((s) => (
                    <Link
                      key={s.id}
                      href={`/dashboard/sites/${s.id}`}
                      className="group flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 transition-all hover:bg-muted/30"
                    >
                      <div className="flex items-start gap-4">
                        <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20 transition-transform group-hover:scale-105">
                          <MapPin className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-black text-base group-hover:text-primary transition-colors">
                              {s.name}
                            </h3>
                            {!s.isActive && (
                              <Badge
                                variant="secondary"
                                className="text-[9px] uppercase font-bold py-0 h-5"
                              >
                                Inactif
                              </Badge>
                            )}
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs font-medium text-muted-foreground">
                            <span className="flex items-center gap-1.5 bg-muted px-2 py-1 rounded-md">
                              <Shield className="h-3 w-3" />
                              {siteTypeLabel(s.siteType)}
                            </span>
                            {s.riskLevel && (
                              <span className="flex items-center gap-1.5 border border-muted-foreground/20 px-2 py-1 rounded-md">
                                Risque : <strong className="text-foreground">{s.riskLevel}/5</strong>
                              </span>
                            )}
                          </div>

                          {s.address && (
                            <p className="mt-2 text-xs text-muted-foreground/80 line-clamp-1">
                              {s.address}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="hidden md:flex items-center justify-end pl-4">
                        <div className="h-10 w-10 rounded-full bg-background border flex items-center justify-center group-hover:border-primary group-hover:bg-primary/5 transition-colors">
                          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
