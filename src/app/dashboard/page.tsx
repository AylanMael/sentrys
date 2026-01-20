
"use client";

import {
  Activity,
  ArrowUpRight,
  ShieldCheck,
  Siren,
  Building2,
  Info,
} from "lucide-react";

import { useAuth } from "@/lib/auth-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { kpis, incidents } from "@/lib/placeholder-data";
import { cn } from "@/lib/utils";
import type { Kpi } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const kpiIcons: { [key: string]: React.ReactNode } = {
  "Missions Actives": <Activity className="h-4 w-4 text-muted-foreground" />,
  "Agents de service": <ShieldCheck className="h-4 w-4 text-muted-foreground" />,
  "Incidents ouverts": <Siren className="h-4 w-4 text-muted-foreground" />,
  "Sites couverts": <Building2 className="h-4 w-4 text-muted-foreground" />,
};

export default function Dashboard() {
  const { user } = useAuth();
  
  return (
    <div className="flex flex-1 flex-col gap-4 md:gap-8">

      {user && (
         <Alert>
         <Info className="h-4 w-4" />
         <AlertTitle>Informations de session</AlertTitle>
         <AlertDescription>
           Vous êtes connecté en tant que <span className="font-semibold">{user.email}</span> avec le rôle <Badge variant="secondary">{user.role}</Badge> sur le tenant <span className="font-mono text-xs">{user.tenantId}</span>.
         </AlertDescription>
       </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>
              {kpiIcons[kpi.title as keyof typeof kpiIcons]}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpi.value}</div>
              <p className="text-xs text-muted-foreground flex items-center">
                <span
                  className={cn("mr-1", {
                    "text-green-600": kpi.changeType === "increase",
                    "text-red-600": kpi.changeType === "decrease",
                  })}
                >
                  {kpi.change}
                </span>
                {kpi.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 md:gap-8 lg:grid-cols-2 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-center">
            <div className="grid gap-2">
              <CardTitle>Incidents récents</CardTitle>
              <CardDescription>
                Un aperçu des derniers incidents signalés.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site</TableHead>
                  <TableHead>Sévérité</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Heure</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidents.slice(0, 5).map((incident) => (
                  <TableRow key={incident.id}>
                    <TableCell>
                      <div className="font-medium">{incident.siteName}</div>
                      <div className="hidden text-sm text-muted-foreground md:inline">
                        Signalé par {incident.agentName}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          incident.severity === "Élevée"
                            ? "destructive"
                            : incident.severity === "Moyenne"
                            ? "secondary"
                            : "outline"
                        }
                        className={cn(
                          incident.severity === "Moyenne" &&
                            "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300"
                        )}
                      >
                        {incident.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={incident.status === 'Ouvert' ? 'default' : 'outline'} className={cn(incident.status === 'Ouvert' && 'bg-red-500')}>{incident.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {incident.timestamp.toLocaleTimeString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
