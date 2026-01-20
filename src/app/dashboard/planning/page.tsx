import { PlusCircle, MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { shifts } from "@/lib/placeholder-data";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from "date-fns";

const ShiftRow = ({ shift }: { shift: (typeof shifts)[0] }) => (
  <TableRow>
    <TableCell>
      <div className="font-medium">{shift.siteName}</div>
      <div className="text-sm text-muted-foreground">{shift.clientName}</div>
    </TableCell>
    <TableCell>
      {shift.agentName ? (
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src={shift.agentAvatarUrl} alt={shift.agentName} />
            <AvatarFallback>{shift.agentName.charAt(0)}</AvatarFallback>
          </Avatar>
          {shift.agentName}
        </div>
      ) : (
        <span className="text-muted-foreground">Non assigné</span>
      )}
    </TableCell>
    <TableCell>
      {format(shift.start, "PPP, p")}
    </TableCell>
    <TableCell>
      {format(shift.end, "PPP, p")}
    </TableCell>
    <TableCell>
      <Badge variant="outline">{shift.status}</Badge>
    </TableCell>
    <TableCell>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-haspopup="true" size="icon" variant="ghost">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Toggle menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem>Modifier</DropdownMenuItem>
          <DropdownMenuItem>Assigner un agent</DropdownMenuItem>
          <DropdownMenuItem className="text-destructive">Supprimer</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </TableCell>
  </TableRow>
);

export default function PlanningPage() {
  const publishedShifts = shifts.filter((s) => s.status !== "Brouillon");
  const draftShifts = shifts.filter((s) => s.status === "Brouillon");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
            <div>
                <CardTitle>Planification des missions</CardTitle>
                <CardDescription>
                Gérez et planifiez les quarts des agents sur tous les sites.
                </CardDescription>
            </div>
            <Button size="sm" className="gap-1">
                <PlusCircle className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                Nouveau quart
                </span>
            </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="published">
          <TabsList>
            <TabsTrigger value="published">Publiés</TabsTrigger>
            <TabsTrigger value="draft">Brouillons</TabsTrigger>
          </TabsList>
          <TabsContent value="published">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site/Client</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Heure de début</TableHead>
                  <TableHead>Heure de fin</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {publishedShifts.map((shift) => (
                  <ShiftRow key={shift.id} shift={shift} />
                ))}
              </TableBody>
            </Table>
          </TabsContent>
          <TabsContent value="draft">
          <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site/Client</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Heure de début</TableHead>
                  <TableHead>Heure de fin</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {draftShifts.map((shift) => (
                  <ShiftRow key={shift.id} shift={shift} />
                ))}
              </TableBody>
            </Table>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
