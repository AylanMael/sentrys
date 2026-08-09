"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Mail } from "lucide-react";
import { sendPasswordResetEmail } from "firebase/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { auth } from "@/lib/firebase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState(""); const [loading, setLoading] = useState(false); const [sent, setSent] = useState(false); const [error, setError] = useState("");
  const cleanEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  async function submit(event: React.FormEvent) { event.preventDefault(); setError(""); if (!cleanEmail) { setError("Indiquez votre adresse professionnelle."); return; } setLoading(true); try { await sendPasswordResetEmail(auth, cleanEmail); setSent(true); } catch { setError("Le lien n’a pas pu être envoyé. Vérifiez l’adresse ou réessayez plus tard."); } finally { setLoading(false); } }
  return <AuthShell title="Retrouver votre accès" subtitle="Recevez un lien sécurisé pour choisir un nouveau mot de passe."><Card className="rounded-[2rem] border-none shadow-2xl ring-1 ring-black/5"><CardContent className="p-8 md:p-10">{sent ? <div className="space-y-5 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /><h2 className="text-xl font-black">Consultez votre messagerie</h2><p className="text-muted-foreground">Si cette adresse correspond à un compte, Firebase a envoyé les instructions de réinitialisation.</p><Button asChild className="w-full"><Link href="/login">Revenir à la connexion</Link></Button></div> : <form onSubmit={submit} className="space-y-5"><div className="space-y-2"><Label htmlFor="reset-email">Email professionnel</Label><div className="relative"><Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="reset-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 pl-11" required /></div></div>{error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}<Button type="submit" disabled={loading} className="h-12 w-full font-black">{loading ? <Loader2 className="animate-spin" /> : null}Envoyer le lien</Button><Button asChild variant="ghost" className="w-full"><Link href="/login"><ArrowLeft />Retour</Link></Button></form>}</CardContent></Card></AuthShell>;
}