"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Loader2,
  Info,
  CheckCircle2,
  ShieldAlert
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api/client-fetch";
import { cn } from "@/lib/utils";

type Risk = {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  agentName?: string;
  message: string;
  recommendation: string;
};

type AnalysisResult = {
  risks: Risk[];
  summary: string;
  overallScore: number;
};

export function AiRiskAlerts() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [expanded, setExpanded] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ ok: boolean; analysis?: AnalysisResult; error?: string }>("/api/ai/schedule-risk", {
        method: "POST"
      });
      if (res?.ok && res.analysis) {
        setResult(res.analysis);
        setExpanded(true);
      } else {
        setError(res?.error || "Une erreur inconnue est survenue.");
      }
    } catch (e) {
      console.error("AI Analysis failed", e);
      setError("Impossible de contacter le service d'audit IA.");
    } finally {
      setLoading(false);
    }
  };

  if (!result && !loading) {
    return (
      <div className="group relative overflow-hidden glass-card p-10 rounded-[2.5rem] border-none transition-all duration-700 hover:shadow-2xl hover:shadow-primary/10">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="bg-primary/10 p-4 rounded-3xl shadow-[0_0_30px_rgba(var(--primary),0.1)] group-hover:scale-110 group-hover:bg-primary/20 transition-all duration-500">
              <Sparkles className="h-8 w-8 text-primary animate-pulse" />
            </div>
            <div>
              <h3 className="text-2xl font-black tracking-tighter text-foreground">Audit SENTRY-AI</h3>
              <p className="text-base font-semibold text-muted-foreground/60 mt-1">Identifiez les angles morts de votre dispositif de sécurité.</p>
            </div>
          </div>
          <Button
            disabled={loading}
            onClick={runAnalysis}
            className="h-14 rounded-2xl px-10 font-black bg-primary shadow-xl shadow-primary/20 hover:scale-[1.05] active:scale-95 transition-all group"
          >
            {loading ? <Loader2 className="mr-3 h-5 w-5 animate-spin" /> : <Sparkles className="mr-3 h-5 w-5 group-hover:rotate-12 transition-transform" />}
            Lancer l'Audit Prospectif
          </Button>
        </div>

        {error && (
            <div className="mt-8 p-6 rounded-3xl bg-destructive/5 border border-destructive/10 flex items-center gap-4 animate-in fade-in slide-in-from-left-4">
                <AlertTriangle className="h-6 w-6 text-destructive/50" />
                <div className="flex-1">
                    <p className="text-sm font-black text-destructive uppercase tracking-tight">Anomalie Critique</p>
                    <p className="text-[11px] font-bold text-muted-foreground/50 mt-1"> {error.includes("403") ? "Authentification Gemini requise via Google AI Studio." : error}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => window.open('https://aistudio.google.com/app/apikey', '_blank')} className="h-9 text-[10px] font-black uppercase tracking-widest px-4 hover:bg-destructive/10 order-last">Réparer</Button>
            </div>
        )}

        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[100px] -mt-20 -mr-20 pointer-events-none group-hover:bg-primary/20 transition-all duration-1000" />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden transition-all duration-1000 glass-card rounded-[2.5rem] border-none group ${result && result.overallScore < 70 ? 'ring-2 ring-destructive/20' : ''}`}>
      {/* Header Area */}
      <div className="p-8 md:p-10 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-[120px] -mt-40 -mr-40 pointer-events-none" />

        <div className="flex items-center gap-6 relative z-10">
          <div className="bg-primary/10 p-4 rounded-3xl backdrop-blur-md border border-primary/10">
            {loading ? <Loader2 className="h-8 w-8 text-primary animate-spin" /> : <ShieldAlert className="h-8 w-8 text-primary" />}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-2xl font-black tracking-tighter text-foreground">Rapport d'Intelligence</h3>
              {result && (
                <Badge className={cn(
                  "rounded-full font-black px-4 py-1.5 text-xs uppercase tracking-widest border-none",
                   result.overallScore > 80 ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'
                )}>
                  Score {result.overallScore}%
                </Badge>
              )}
            </div>
            <p className="text-sm font-bold text-muted-foreground/60 mt-1 leading-relaxed max-w-2xl">{result?.summary}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 relative z-10">
            <Button variant="outline" onClick={() => setExpanded(!expanded)} className="h-12 rounded-2xl px-6 font-black border-border/20 bg-background/40 backdrop-blur-md hover:bg-background">
                {expanded ? <ChevronDown className="mr-2 h-5 w-5" /> : <ChevronRight className="mr-2 h-5 w-5" />}
                Détails
            </Button>
            <Button disabled={loading} onClick={runAnalysis} className="h-12 w-12 p-0 rounded-2xl bg-primary shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all">
                 <Sparkles className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
        </div>
      </div>

      {/* Risks List */}
      {expanded && result && (
        <div className="px-8 md:px-10 pb-10 space-y-6 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="grid gap-4">
            {result.risks.map((risk, idx) => (
              <div key={idx} className="group/risk flex items-start gap-6 p-6 rounded-[2rem] bg-white/5 border border-white/5 hover:border-primary/20 transition-all duration-500 hover:bg-white/10">
                <div className={`mt-1 p-3 rounded-2xl flex items-center justify-center transition-all duration-500 ${
                    risk.severity === 'critical' ? 'bg-destructive/10 text-destructive group-hover/risk:bg-destructive/20' :
                    risk.severity === 'high' ? 'bg-orange-500/10 text-orange-600 group-hover/risk:bg-orange-500/20' :
                    'bg-primary/10 text-primary group-hover/risk:bg-primary/20'
                }`}>
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-black text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">{risk.agentName || "Système"} • {risk.type}</h4>
                    <Badge variant="outline" className={cn(
                        "text-[9px] uppercase font-black py-0.5 px-2 rounded-lg border-none",
                        risk.severity === 'critical' ? 'bg-destructive/10 text-destructive' :
                        risk.severity === 'high' ? 'bg-orange-500/10 text-orange-600' :
                        'bg-primary/10 text-primary'
                    )}>
                        {risk.severity}
                    </Badge>
                  </div>
                  <p className="text-base font-black text-foreground/90 tracking-tight">{risk.message}</p>
                  <div className="mt-4 bg-primary/5 p-4 rounded-2xl border border-primary/10 group-hover/risk:border-primary/20 transition-colors">
                    <p className="text-xs font-semibold text-foreground/70 leading-relaxed">
                      <span className="font-black premium-gradient-text mr-2 uppercase tracking-widest text-[10px]">Correction suggérée :</span> {risk.recommendation}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {result.risks.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="bg-primary/10 p-6 rounded-full border border-primary/10 mb-6">
                      <CheckCircle2 className="h-12 w-12 text-primary" />
                    </div>
                    <h4 className="text-2xl font-black tracking-tighter text-foreground">Zéro Défaut Identifié</h4>
                    <p className="text-sm font-semibold text-muted-foreground/50 mt-2 max-w-sm">Le dispositif opérationnel est parfaitement calibré selon les protocoles de sécurité SENTRY.</p>
                </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
