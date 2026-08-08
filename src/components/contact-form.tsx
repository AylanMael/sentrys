"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Reason = { value: string; label: string };
export function ContactForm({ reasons, defaultReason = "demo" }: { reasons: Reason[]; defaultReason?: string }) {
  const [loading, setLoading] = useState(false); const [success, setSuccess] = useState(false); const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setLoading(true);
    const form = new FormData(event.currentTarget);
    try { const response = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form.entries())) }); const data = await response.json().catch(() => null) as { error?: string } | null; if (!response.ok) throw new Error(data?.error || "La demande n’a pas pu être envoyée."); setSuccess(true); event.currentTarget.reset(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "La demande n’a pas pu être envoyée."); }
    finally { setLoading(false); }
  }
  if (success) return <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /><h3 className="mt-4 text-2xl font-black text-emerald-950">Demande bien reçue</h3><p className="mt-2 text-emerald-800">Notre équipe vous recontactera avec les prochaines étapes.</p><Button type="button" variant="outline" onClick={() => setSuccess(false)} className="mt-6">Envoyer une autre demande</Button></div>;
  return <form onSubmit={submit} className="space-y-8">
    <div className="hidden" aria-hidden="true"><Label htmlFor="website">Site web</Label><Input id="website" name="website" tabIndex={-1} autoComplete="off" /></div>
    <div className="grid gap-6 sm:grid-cols-2"><div className="space-y-3"><Label htmlFor="name">Nom complet</Label><Input id="name" name="name" autoComplete="name" required /></div><div className="space-y-3"><Label htmlFor="email">Email professionnel</Label><Input id="email" name="email" type="email" autoComplete="email" required /></div></div>
    <div className="grid gap-6 sm:grid-cols-2"><div className="space-y-3"><Label htmlFor="company">Société</Label><Input id="company" name="company" autoComplete="organization" /></div><div className="space-y-3"><Label htmlFor="reason">Objet de la demande</Label><select id="reason" name="reason" className="h-12 w-full rounded-xl border bg-muted/40 px-4 text-sm font-bold" defaultValue={reasons.some((item) => item.value === defaultReason) ? defaultReason : "demo"}>{reasons.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select></div></div>
    <div className="space-y-3"><Label htmlFor="message">Détail de votre besoin</Label><Textarea id="message" name="message" minLength={20} maxLength={4000} required className="min-h-[180px]" /></div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    <div className="flex flex-col items-center justify-between gap-5 border-t pt-6 md:flex-row"><p className="max-w-sm text-xs text-muted-foreground">En envoyant cette demande, vous acceptez notre <Link href="/confidentialite" className="font-bold text-primary hover:underline">politique de confidentialité</Link>.</p><Button type="submit" size="lg" disabled={loading} className="h-14 w-full rounded-2xl px-10 font-black md:w-auto">{loading ? <Loader2 className="animate-spin" /> : null}Envoyer la demande<ArrowRight /></Button></div>
  </form>;
}