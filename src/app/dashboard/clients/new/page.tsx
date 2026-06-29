// src/app/dashboard/clients/new/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Loader2,
  Save,
  Building2,
  BriefcaseBusiness,
  MapPin,
  FileText,
  AlertTriangle,
} from "lucide-react";

import { useAuth } from "@/lib/auth-provider";
import { apiFetch } from "@/lib/api/client-fetch";
import { hasRole, normalizeRole } from "@/lib/auth/role";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ClientStatus = "active" | "inactive";

type ClientCreatePayload = {
  name: string;
  legalName?: string;
  siret?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  billingEmail?: string;
  address?: {
    line1?: string;
    line2?: string;
    postalCode?: string;
    city?: string;
    country?: string;
  };
  status: ClientStatus;
  notes?: string;
};

function normalizeEmail(v: string) {
  const x = v.trim();
  return x ? x.toLowerCase() : "";
}

function normalizePhone(v: string) {
  return v.trim();
}

function normalizeSiret(v: string) {
  return v.replace(/\s+/g, "").trim();
}

function optStr(v: string): string | undefined {
  const x = v.trim();
  return x ? x : undefined;
}

export default function NewClientPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const role = useMemo(
    () => normalizeRole((user as any)?.role) ?? "client",
    [user]
  );

  const canWrite = useMemo(() => {
    return hasRole(role, ["super_admin", "owner", "admin", "manager"]);
  }, [role]);

  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [siret, setSiret] = useState("");

  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [billingEmail, setBillingEmail] = useState("");

  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("France");

  const [status, setStatus] = useState<ClientStatus>("active");
  const [notes, setNotes] = useState("");

  const disabled = useMemo(() => {
    if (saving) return true;
    if (!canWrite) return true;
    return !name.trim();
  }, [saving, canWrite, name]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!user) {
      toast({
        title: "Non connecté",
        description: "Veuillez vous reconnecter.",
        variant: "destructive",
      });
      return;
    }

    if (!(user as any)?.tenantId) {
      toast({
        title: "Profil incomplet",
        description: "tenantId manquant (claims). Vérifie le provisioning.",
        variant: "destructive",
      });
      return;
    }

    if (!canWrite) {
      toast({
        title: "Accès refusé",
        description: "Droits insuffisants.",
        variant: "destructive",
      });
      return;
    }

    const payload: ClientCreatePayload = {
      name: name.trim(),
      status,
    };

    const legal = optStr(legalName);
    if (legal) payload.legalName = legal;

    const si = optStr(normalizeSiret(siret));
    if (si) payload.siret = si;

    const cn = optStr(contactName);
    if (cn) payload.contactName = cn;

    const em = optStr(normalizeEmail(email));
    if (em) payload.email = em;

    const ph = optStr(normalizePhone(phone));
    if (ph) payload.phone = ph;

    const be = optStr(normalizeEmail(billingEmail));
    if (be) payload.billingEmail = be;

    const nt = optStr(notes);
    if (nt) payload.notes = nt;

    const addr: NonNullable<ClientCreatePayload["address"]> = {};
    const l1 = optStr(line1);
    const l2 = optStr(line2);
    const pc = optStr(postalCode);
    const ct = optStr(city);
    const co = optStr(country);

    if (l1) addr.line1 = l1;
    if (l2) addr.line2 = l2;
    if (pc) addr.postalCode = pc;
    if (ct) addr.city = ct;
    if (co) addr.country = co;

    if (Object.keys(addr).length > 0) {
      payload.address = addr;
    }

    setSaving(true);

    try {
      const res = await apiFetch<{ ok: boolean; item?: any; error?: string }>(
        "/api/clients",
        {
          method: "POST",
          body: payload,
        }
      );

      if (!res.ok) {
        toast({
          title: "Erreur",
          description: res.error ?? "Création impossible.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Client créé",
        description: "Le client a été enregistré avec succès.",
      });

      router.push("/dashboard/clients");
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Erreur",
        description: err?.message ?? "Création impossible.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-in fade-in duration-700 w-full max-w-[1200px] mx-auto pb-24">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between bg-card p-6 md:p-8 rounded-[2rem] border shadow-sm ring-1 ring-black/5 bg-gradient-to-br from-card to-muted/20 relative overflow-hidden mb-8">
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
            <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-foreground">
              Nouveau Client
            </h1>
            <p className="text-sm font-medium text-muted-foreground mt-2 max-w-xl">
              Saisissez les informations du donneur d&apos;ordre. Ces données seront
              utilisées pour la facturation et la gestion opérationnelle.
            </p>
          </div>
        </div>

        <div className="hidden md:flex relative z-10">
          <Button
            type="submit"
            form="client-create-form"
            disabled={disabled}
            className="h-12 rounded-xl px-8 font-black shadow-lg shadow-primary/20 hover:translate-y-[-2px] active:scale-95 transition-all"
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
            ) : (
              <Save className="h-5 w-5 mr-2" />
            )}
            Enregistrer le client
          </Button>
        </div>
      </div>

      {!canWrite && (
        <div className="mb-8 rounded-2xl border border-destructive/30 bg-destructive/10 p-6 flex items-start gap-4">
          <AlertTriangle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="font-black text-destructive text-lg">Accès refusé</p>
            <p className="text-sm font-medium text-destructive/80 mt-1">
              Seuls les rôles <strong className="text-destructive">super_admin</strong>,
              <strong className="text-destructive"> owner</strong>,
              <strong className="text-destructive"> admin</strong> et
              <strong className="text-destructive"> manager</strong> peuvent créer de
              nouveaux clients.
            </p>
          </div>
        </div>
      )}

      <form id="client-create-form" onSubmit={onSubmit} className="space-y-8">
        <Card className="rounded-[2rem] border-none shadow-xl shadow-black/[0.02] bg-background ring-1 ring-black/5 overflow-hidden">
          <div className="p-6 md:p-8 bg-muted/20 border-b flex items-center gap-3">
            <div className="bg-background p-2.5 rounded-xl shadow-sm">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-xl font-black tracking-tight">Identité Légale</h2>
          </div>
          <CardContent className="p-6 md:p-8 grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                Nom commercial <span className="text-destructive">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Groupe Securitas"
                required
                className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-bold focus-visible:ring-primary/30"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                Raison sociale
              </Label>
              <Input
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="Ex: SECURITAS FRANCE SARL"
                className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-medium focus-visible:ring-primary/30"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                SIRET
              </Label>
              <Input
                value={siret}
                onChange={(e) => setSiret(e.target.value)}
                placeholder="14 chiffres sans espaces"
                inputMode="numeric"
                className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-mono focus-visible:ring-primary/30"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                Statut d'activité
              </Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ClientStatus)}>
                <SelectTrigger className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-bold focus-visible:ring-primary/30">
                  <SelectValue placeholder="Choisir" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="active" className="font-bold text-green-600">
                    Client Actif
                  </SelectItem>
                  <SelectItem value="inactive" className="font-bold text-muted-foreground">
                    Inactif / Suspendu
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-none shadow-xl shadow-black/[0.02] bg-background ring-1 ring-black/5 overflow-hidden">
          <div className="p-6 md:p-8 bg-muted/20 border-b flex items-center gap-3">
            <div className="bg-background p-2.5 rounded-xl shadow-sm">
              <BriefcaseBusiness className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-xl font-black tracking-tight">Coordonnées</h2>
          </div>
          <CardContent className="p-6 md:p-8 grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                Contact Principal
              </Label>
              <Input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Prénom Nom"
                className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-medium focus-visible:ring-primary/30"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                Téléphone
              </Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+33 6 00 00 00 00"
                className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-medium focus-visible:ring-primary/30"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                Email Opérationnel
              </Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@entreprise.com"
                type="email"
                className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-medium focus-visible:ring-primary/30"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-black uppercase tracking-widest text-primary ml-1">
                Email de Facturation
              </Label>
              <Input
                value={billingEmail}
                onChange={(e) => setBillingEmail(e.target.value)}
                placeholder="compta@entreprise.com"
                type="email"
                className="h-12 rounded-xl bg-primary/5 border-primary/20 font-medium focus-visible:ring-primary/30 placeholder:text-primary/40"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-none shadow-xl shadow-black/[0.02] bg-background ring-1 ring-black/5 overflow-hidden">
          <div className="p-6 md:p-8 bg-muted/20 border-b flex items-center gap-3">
            <div className="bg-background p-2.5 rounded-xl shadow-sm">
              <MapPin className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-xl font-black tracking-tight">Adresse du Siège</h2>
          </div>
          <CardContent className="p-6 md:p-8 grid gap-6 md:grid-cols-2">
            <div className="space-y-3 md:col-span-2">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                Adresse (Ligne 1)
              </Label>
              <Input
                value={line1}
                onChange={(e) => setLine1(e.target.value)}
                placeholder="Numéro et nom de voie"
                className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-medium focus-visible:ring-primary/30"
              />
            </div>

            <div className="space-y-3 md:col-span-2">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                Complément (Ligne 2)
              </Label>
              <Input
                value={line2}
                onChange={(e) => setLine2(e.target.value)}
                placeholder="Bâtiment, étage, ZI..."
                className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-medium focus-visible:ring-primary/30"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                Code Postal
              </Label>
              <Input
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="75000"
                className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-medium focus-visible:ring-primary/30"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                Ville
              </Label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Paris"
                className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-medium focus-visible:ring-primary/30"
              />
            </div>

            <div className="space-y-3 md:col-span-2">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                Pays
              </Label>
              <Input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="France"
                className="h-12 rounded-xl bg-muted/30 border-muted-foreground/20 font-medium focus-visible:ring-primary/30"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-none shadow-xl shadow-black/[0.02] bg-background ring-1 ring-black/5 overflow-hidden">
          <div className="p-6 md:p-8 bg-muted/20 border-b flex items-center gap-3">
            <div className="bg-background p-2.5 rounded-xl shadow-sm">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-xl font-black tracking-tight">Informations Internes</h2>
          </div>
          <CardContent className="p-6 md:p-8">
            <div className="space-y-3">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground ml-1">
                Notes ou consignes (Optionnel)
              </Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Modalités contractuelles, particularités du client, historique de négociation..."
                rows={6}
                className="rounded-xl bg-muted/30 border-muted-foreground/20 font-medium resize-y focus-visible:ring-primary/30 p-4 leading-relaxed"
              />
            </div>
          </CardContent>
        </Card>
      </form>

      <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-xl border-t z-50">
        <Button
          type="submit"
          form="client-create-form"
          disabled={disabled}
          className="w-full h-14 rounded-2xl font-black shadow-xl shadow-primary/20"
        >
          {saving ? (
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
          ) : (
            <Save className="h-5 w-5 mr-2" />
          )}
          Enregistrer le client
        </Button>
      </div>
    </div>
  );
}
