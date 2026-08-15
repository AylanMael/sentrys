"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  documentId,
  limit,
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

const RECENT_COMMENT_LIMIT = 20;
const HISTORY_PAGE_SIZE = 20;

type CommentDoc = {
  text: string;
  createdAt?: Timestamp;
  createdBy: { uid: string; email?: string | null };
};

type CommentRow = CommentDoc & { id: string; createdAtIso: string | null };
type HistoryResponse = {
  ok: boolean;
  items?: Array<{
    id: string;
    text: string;
    createdAtIso: string | null;
    createdBy: { uid: string; email: string | null };
  }>;
  nextCursor?: string | null;
};

function formatFR(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function chronological(left: CommentRow, right: CommentRow) {
  const byDate = (left.createdAtIso ?? "").localeCompare(right.createdAtIso ?? "");
  return byDate || left.id.localeCompare(right.id);
}

export function IncidentComments(props: { incidentId: string; tenantId: string }) {
  const { incidentId } = props;
  const { toast } = useToast();
  const { user, getToken } = useAuth();

  const role = String((user as any)?.role ?? "");
  const canWrite = role === "admin" || role === "manager" || role === "agent";

  const [recentRows, setRecentRows] = useState<CommentRow[]>([]);
  const [historyRows, setHistoryRows] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialError, setInitialError] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [historyStarted, setHistoryStarted] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const requestRef = useRef(0);
  const historyLoadingRef = useRef(false);

  const canRead = useMemo(() => !!db && !!incidentId && !!user, [incidentId, user]);
  const rows = useMemo(() => {
    const merged = new Map<string, CommentRow>();
    for (const row of historyRows) merged.set(row.id, row);
    for (const row of recentRows) merged.set(row.id, row);
    return Array.from(merged.values()).sort(chronological);
  }, [historyRows, recentRows]);

  useEffect(() => {
    let unsub: Unsubscribe | null = null;
    requestRef.current += 1;
    historyLoadingRef.current = false;
    setRecentRows([]);
    setHistoryRows([]);
    setHistoryStarted(false);
    setNextCursor(null);
    setHasMore(true);
    setHistoryLoading(false);
    setHistoryError(false);
    setInitialError(false);

    if (!canRead) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const ref = collection(db!, "incidents", incidentId, "comments");
    const qy = query(
      ref,
      orderBy("createdAt", "desc"),
      orderBy(documentId(), "desc"),
      limit(RECENT_COMMENT_LIMIT)
    );

    unsub = onSnapshot(
      qy,
      (snap) => {
        const next: CommentRow[] = snap.docs.map((doc) => {
          const data = doc.data() as CommentDoc;
          return {
            ...data,
            id: doc.id,
            createdAtIso: data.createdAt?.toDate?.().toISOString() ?? null,
          };
        });
        setRecentRows(next);
        setInitialError(false);
        setLoading(false);
      },
      () => {
        setRecentRows([]);
        setInitialError(true);
        setLoading(false);
        toast({
          variant: "destructive",
          title: "Erreur commentaires",
          description: "Impossible de charger les commentaires récents.",
        });
      }
    );

    return () => {
      requestRef.current += 1;
      historyLoadingRef.current = false;
      unsub?.();
    };
  }, [canRead, incidentId, toast]);

  async function loadPrevious() {
    if (!user || historyLoadingRef.current || (historyStarted && !hasMore)) return;
    const requestId = requestRef.current;
    historyLoadingRef.current = true;
    setHistoryLoading(true);
    setHistoryError(false);

    try {
      const params = new URLSearchParams({ limit: String(HISTORY_PAGE_SIZE) });
      if (nextCursor) {
        params.set("cursor", nextCursor);
      } else {
        const oldestRecent = [...recentRows].sort(chronological)[0];
        if (oldestRecent) params.set("anchor", oldestRecent.id);
      }
      const token = await getToken();
      if (!token) throw new Error("authentication_required");
      const response = await fetch(`/api/incidents/${incidentId}/comments?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as HistoryResponse | null;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.items)) {
        throw new Error("history_request_failed");
      }
      if (requestRef.current !== requestId) return;
      const page = payload.items.map((item) => ({
        id: item.id,
        text: item.text,
        createdAtIso: item.createdAtIso,
        createdAt: undefined,
        createdBy: item.createdBy,
      }));
      setHistoryRows((current) => {
        const merged = new Map(current.map((row) => [row.id, row]));
        for (const row of page) merged.set(row.id, row);
        return Array.from(merged.values());
      });
      setHistoryStarted(true);
      setNextCursor(payload.nextCursor ?? null);
      setHasMore(Boolean(payload.nextCursor));
    } catch {
      if (requestRef.current === requestId) setHistoryError(true);
    } finally {
      if (requestRef.current === requestId) setHistoryLoading(false);
      historyLoadingRef.current = false;
    }
  }

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
    } catch {
      toast({ variant: "destructive", title: "Erreur", description: "Envoi impossible." });
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
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </div>
        ) : initialError ? (
          <div className="text-sm text-destructive">Impossible de charger les commentaires récents.</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">Aucun commentaire.</div>
        ) : (
          <div className="space-y-3">
            {rows.map((comment) => (
              <div key={comment.id} className="rounded-2xl border p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{comment.createdBy?.email ?? "—"}</span>
                  {role ? <Badge variant="outline">{role}</Badge> : null}
                  <span>• {formatFR(comment.createdAtIso)}</span>
                </div>
                <div className="mt-2 whitespace-pre-wrap text-sm">{comment.text}</div>
              </div>
            ))}
          </div>
        )}

        {!loading && !initialError && (recentRows.length === RECENT_COMMENT_LIMIT || historyStarted) ? (
          <div className="space-y-2">
            {hasMore ? (
              <Button type="button" variant="outline" onClick={loadPrevious} disabled={historyLoading}>
                {historyLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Charger 20 commentaires précédents
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">Tout l’historique disponible est affiché.</p>
            )}
            {historyError ? (
              <p className="text-sm text-destructive">Impossible de charger les commentaires précédents. Réessayez.</p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={canWrite ? "Écrire un commentaire…" : "Lecture seule"}
            disabled={!canWrite || sending}
            onKeyDown={(event) => {
              if (event.key === "Enter") send();
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
