import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Calculator,
  CheckCircle2,
  FileText,
  LayoutDashboard,
  LockKeyhole,
  RadioTower,
  Send,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type RecetteTone = "critical" | "warning" | "ready";

type RecetteStep = {
  id: string;
  title: string;
  objective: string;
  href: string;
  actionLabel: string;
  tone: RecetteTone;
  icon: React.ComponentType<{ className?: string }>;
  checks: string[];
  success: string;
};

const steps: RecetteStep[] = [
  {
    id: "dashboard",
    title: "Dashboard et cockpit",
    objective: "Comprendre en 5 secondes l'etat de la journee et la prochaine action.",
    href: "/dashboard",
    actionLabel: "Tester le dashboard",
    tone: "critical",
    icon: LayoutDashboard,
    checks: [
      "La prochaine action est visible sans chercher.",
      "Les urgences sont plus visibles que les statistiques secondaires.",
      "Un responsable novice sait ou cliquer ensuite.",
    ],
    success:
      "Le responsable sait quoi faire maintenant : couvrir, traiter, publier, diffuser ou suivre.",
  },
  {
    id: "planning",
    title: "Planning exploitation",
    objective: "Creer, corriger, dupliquer et propager les vacations sans friction.",
    href: "/dashboard/planning",
    actionLabel: "Tester le planning",
    tone: "critical",
    icon: CalendarDays,
    checks: [
      "Creation par defaut 08:00 - 18:00.",
      "Modification horaire par pas de 30 minutes.",
      "Duplication, propagation semaine et planning type comprehensibles.",
      "Conflits agents detectes et forcages traces.",
    ],
    success:
      "Une semaine type peut etre construite, ajustee et publiee sans assistance.",
  },
  {
    id: "pdf",
    title: "PDF agent, site et client",
    objective: "Verifier que les documents terrain sont lisibles et presentables.",
    href: "/dashboard/planning",
    actionLabel: "Tester les PDF",
    tone: "critical",
    icon: FileText,
    checks: [
      "PDF agent lisible sur une page paysage.",
      "PDF site clair pour le client : qui est present, ou, quand.",
      "PDF tous les sites client ouvert sans perdre le contexte.",
    ],
    success:
      "Un agent ou un client comprend le document en moins de 5 secondes.",
  },
  {
    id: "diffusion",
    title: "Diffusion et accusés",
    objective: "Preparer l'envoi agent/client et conserver une trace exploitable.",
    href: "/dashboard/planning",
    actionLabel: "Tester diffusion",
    tone: "warning",
    icon: Send,
    checks: [
      "Selection des agents planifies.",
      "Historique : envoye a qui, quand, par quel canal.",
      "Relance des plannings non accuses.",
    ],
    success:
      "L'exploitation peut prouver qu'un planning a ete prepare, envoye ou relance.",
  },
  {
    id: "conduite",
    title: "Registre de conduite",
    objective: "Transformer les signaux en main courante suivie et historisee.",
    href: "/dashboard/conduite",
    actionLabel: "Tester conduite",
    tone: "warning",
    icon: RadioTower,
    checks: [
      "Passage d'un signal : nouveau, vu, en cours, traite.",
      "Creation d'une note main courante.",
      "Export CSV et impression PDF du registre.",
    ],
    success:
      "Chaque decision sensible laisse une trace claire pour l'exploitation.",
  },
  {
    id: "prepaie",
    title: "Pre-paie",
    objective: "Sortir un dossier paie controlable avant transmission cabinet.",
    href: "/dashboard/prepaie",
    actionLabel: "Tester pre-paie",
    tone: "warning",
    icon: Calculator,
    checks: [
      "Calcul mensuel sur les vacations publiees.",
      "Anomalies visibles avant export.",
      "CSV detail, CSV cabinet et synthese PDF telechargeables.",
    ],
    success:
      "Le gestionnaire de paie recoit un dossier coherent et exploitable.",
  },
  {
    id: "security",
    title: "Roles et securite",
    objective: "Verifier que chaque utilisateur accede uniquement a ce qu'il doit voir.",
    href: "/dashboard/settings",
    actionLabel: "Controler securite",
    tone: "ready",
    icon: LockKeyhole,
    checks: [
      "Compte admin, exploitation, viewer et agent.",
      "Actions sensibles bloquees cote API.",
      "Firestore et Storage cloisonnes par agence.",
    ],
    success:
      "Aucune donnee d'une agence ou d'un agent n'est accessible hors autorisation.",
  },
];

const goNoGo = [
  "Le build production passe serveur dev arrete.",
  "Le planning se cree, se corrige et se diffuse sans assistance.",
  "Les PDF agent, site et client sont lisibles en 5 secondes.",
  "Le registre de conduite retrace les decisions sensibles.",
  "La pre-paie exporte un dossier utilisable par le cabinet.",
  "Les roles et regles Firebase bloquent les acces non autorises.",
];

function toneClass(tone: RecetteTone) {
  if (tone === "critical") {
    return "border-red-500/25 bg-red-500/10 text-red-900 dark:text-red-100";
  }
  if (tone === "warning") {
    return "border-amber-500/25 bg-amber-500/10 text-amber-900 dark:text-amber-100";
  }
  return "border-emerald-500/25 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100";
}

function toneLabel(tone: RecetteTone) {
  if (tone === "critical") return "Critique MVP";
  if (tone === "warning") return "A stabiliser";
  return "Controle final";
}

export default function RecetteMvpPage() {
  const criticalCount = steps.filter((step) => step.tone === "critical").length;
  const warningCount = steps.filter((step) => step.tone === "warning").length;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-10">
      <section className="relative overflow-hidden rounded-[2.5rem] border bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.16),transparent_32%),linear-gradient(135deg,hsl(var(--card)),hsl(var(--background)))] p-6 shadow-sm">
        <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full bg-primary px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-primary-foreground">
                Stabilisation MVP
              </Badge>
              <Badge
                variant="outline"
                className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]"
              >
                Recette terrain
              </Badge>
            </div>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-foreground md:text-5xl">
              Centre de recette exploitation
            </h1>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-muted-foreground">
              Objectif : figer une version utilisable par une agence de securite
              privee. On valide les parcours dans l'ordre, sans se disperser.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:w-[520px]">
            <MiniKpi label="Critiques" value={criticalCount} tone="critical" />
            <MiniKpi label="A stabiliser" value={warningCount} tone="warning" />
            <MiniKpi label="Go / No-Go" value={goNoGo.length} tone="ready" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <Card className="rounded-[2rem] border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl font-black">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Ordre de test recommande
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { href: "/dashboard/settings", label: "Installer MVP" },
              { href: "/dashboard", label: "Lire cockpit" },
              { href: "/dashboard/planning", label: "Tester planning" },
              { href: "/dashboard/prepaie", label: "Exporter paie" },
            ].map((item, index) => (
              <Button
                key={item.href}
                asChild
                variant={index === 0 ? "default" : "outline"}
                className="h-12 justify-start rounded-2xl font-black"
              >
                <Link href={item.href}>
                  <span className="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-background/20 text-xs">
                    {index + 1}
                  </span>
                  {item.label}
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-amber-500/25 bg-amber-500/10">
          <CardContent className="flex h-full items-start gap-4 p-5 text-amber-900 dark:text-amber-100">
            <div className="rounded-2xl bg-amber-500/15 p-3">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <p className="font-black">Regle d'or de recette</p>
              <p className="mt-2 text-sm font-semibold leading-6 opacity-80">
                Si un exploitant novice ne comprend pas l'action en 5 secondes,
                ce n'est pas encore assez simple pour le MVP.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <Card key={step.id} className="overflow-hidden rounded-[2rem] border-border/60">
              <CardHeader className="border-b bg-muted/25">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                      <Badge
                        className={cn(
                          "mb-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]",
                          toneClass(step.tone)
                        )}
                      >
                        {index + 1}. {toneLabel(step.tone)}
                      </Badge>
                      <CardTitle className="text-xl font-black tracking-tight">
                        {step.title}
                      </CardTitle>
                      <p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">
                        {step.objective}
                      </p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5 p-5">
                <div className="grid gap-2">
                  {step.checks.map((check) => (
                    <div
                      key={check}
                      className="flex items-start gap-3 rounded-2xl border bg-background/60 p-3"
                    >
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <p className="text-sm font-semibold leading-5 text-muted-foreground">
                        {check}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm font-semibold leading-6 text-emerald-900 dark:text-emerald-100">
                  <span className="font-black">Validation : </span>
                  {step.success}
                </div>

                <Button asChild className="h-11 w-full rounded-2xl font-black">
                  <Link href={step.href}>
                    {step.actionLabel}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <Card className="rounded-[2rem] border-border/60">
        <CardHeader>
          <CardTitle className="text-xl font-black">Go / No-Go MVP</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {goNoGo.map((item) => (
            <div key={item} className="flex items-start gap-3 rounded-2xl bg-muted/35 p-4">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-sm font-bold leading-5 text-muted-foreground">
                {item}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function MiniKpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: RecetteTone;
}) {
  return (
    <div className={cn("rounded-3xl border p-4", toneClass(tone))}>
      <p className="text-[10px] font-black uppercase tracking-[0.18em] opacity-70">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  );
}
