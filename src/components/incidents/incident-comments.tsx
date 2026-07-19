"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import type { Unsubscribe } from "firebase/firestore";
import { Loader2, Send } from "lucide-react";

import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth-provider";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type CommentDoc = {
  text: string;
  createdAt?: Timestamp;
  createdBy: { uid: string; email?: string | null };
};

type CommentRow = CommentDoc & { id: string };

function formatFR(ts?: Timestamp | null) {
  const d = ts?.toDate?.();
  if (!d) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function IncidentComments(props: { incidentId: string; tenantId: string }) {
  // tenantId est requis par ton composant actuel -> on le garde pour l’API,
  // mais on ne s'en sert pas côté query (la sécurité est via le parent incident).
  const { incidentId } = props;

  const { toast } = useToast();
  const { user } = useAuth();

  const role = String((user as any)?.role ?? "");
  const canWrite = role === "admin" || role === "manager" || role === "agent";

  const [rows, setRows] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const canRead = useMemo(() => {
    return !!db && !!incidentId && !!user;
  }, [incidentId, user]);

  useEffect(() => {
    let unsub: Unsubscribe | null = null;

    if (!canRead) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const ref = collection(db!, "incidents", incidentId, "comments");
    const qy = query(ref, orderBy("createdAt", "asc"));

    unsub = onSnapshot(
      qy,
      (snap) => {
        const next: CommentRow[] = snap.docs.map((d) => ({ ...(d.data() as any), id: d.id }));
        setRows(next);
        setLoading(false);
      },
      (err) => {
        console.error("IncidentComments onSnapshot error:", err);
        setRows([]);
        setLoading(false);

        const msg = err?.message ?? "";
        toast({
          variant: "destructive",
          title: "Erreur commentaires",
          description: msg.includes("Missing or insufficient permissions")
            ? "Permissions Firestore insuffisantés (rules commentaires)."
            : "Impossible de charger les commentaires.",
        });
      }
    );

    return () => unsub?.();
  }, [canRead, incidentId, toast]);

  async function send() {
    const value = text.trim();
    if (!value) return;

    if (!user?.uid) {
      toast({ variant: "destructive", title: "Non connecté", description: "Veuillez vous reconnecter." });
      return;
    }

    if (!canWrite) {
      toast({ variant: "destructive", title: "Accès refusé", description: "Droits insuffisants." });
      return;
    }

    setSending(true);
    try {
      await addDoc(collection(db!, "incidents", incidentId, "comments"), {
        text: value,
        createdAt: serverTimestamp(),
        createdBy: { uid: user.uid, email: user.email ?? null },
      });

      setText("");
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Erreur", description: e?.message ?? "Envoi impossible." });
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle>Commentaires</CardTitle>
        <CardDescription>Fil de suivi lié à cet incident.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement…
          </div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">Aucun commentaire.</div>
        ) : (
          <div className="space-y-3">
            {rows.map((c) => (
              <div key={c.id} className="rounded-2xl border p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{c.createdBy?.email ?? "—"}</span>
                  {role ? <Badge variant="outline">{role}</Badge> : null}
                  <span>• {formatFR(c.createdAt ?? null)}</span>
                </div>
                <div className="mt-2 whitespace-pre-wrap text-sm">{c.text}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={canWrite ? "Écrire un commentaire…" : "Lecture seule"}
            disabled={!canWrite || sending}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
          />
          <Button onClick={send} disabled={!canWrite || sending || !text.trim()} className="gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Envoyer
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}