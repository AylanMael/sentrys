"use client";

import { useEffect, useState } from "react";
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, Legend
} from "recharts";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Loader2, TrendingUp, AlertTriangle, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/api/client-fetch";

type TrendData = {
  date: string;
  incidents: number;
  checkins: number;
};

export function AnalyticsCharts() {
  const [data, setData] = useState<TrendData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTrends() {
      try {
        const res = await apiFetch<{ ok: boolean; trends: TrendData[] }>("/api/analytics/trends?days=7");
        if (res?.ok) {
          setData(res.trends);
        }
      } catch (e) {
        console.error("Failed to load trends", e);
      } finally {
        setLoading(false);
      }
    }
    loadTrends();
  }, []);

  if (loading) {
    return (
      <div className="h-[400px] flex items-center justify-center bg-card rounded-[2rem] border animate-pulse">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const chartColor = "#3b82f6"; // primary
  const incidentColor = "#ef4444"; // red

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Trend Missions */}
      <div className="bg-card p-6 md:p-8 rounded-[2rem] border shadow-sm ring-1 ring-black/5 flex flex-col">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-xl font-black tracking-tight">Activité Opérationnelle</h3>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">Pointages sur 7 jours</p>
          </div>
          <div className="bg-primary/10 p-2.5 rounded-xl">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
        </div>

        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorCheckins" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColor} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={chartColor} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#88888820" />
              <XAxis
                dataKey="date"
                tickFormatter={(str) => format(parseISO(str), "EE", { locale: fr })}
                tick={{ fontSize: 10, fontWeight: 700 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fontWeight: 700 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                labelFormatter={(str) => format(parseISO(str), "dd MMMM", { locale: fr })}
              />
              <Area type="monotone" dataKey="checkins" stroke={chartColor} strokeWidth={3} fillOpacity={1} fill="url(#colorCheckins)" name="Présences" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Trend Incidents */}
      <div className="bg-card p-6 md:p-8 rounded-[2rem] border shadow-sm ring-1 ring-black/5 flex flex-col">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-xl font-black tracking-tight">Flux d'Incidents</h3>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">Évolution hebdomadaire</p>
          </div>
          <div className="bg-destructive/10 p-2.5 rounded-xl">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
        </div>

        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#88888820" />
              <XAxis
                dataKey="date"
                tickFormatter={(str) => format(parseISO(str), "EE", { locale: fr })}
                tick={{ fontSize: 10, fontWeight: 700 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fontWeight: 700 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                labelFormatter={(str) => format(parseISO(str), "dd MMMM", { locale: fr })}
              />
              <Bar dataKey="incidents" fill={incidentColor} radius={[4, 4, 0, 0]} name="Incidents" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
