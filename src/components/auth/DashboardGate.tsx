"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "firebase/auth";

type MeResponse =
  | { ok: true; tenantId: string; role: string; status: string }
  | { ok: false; error: string };

export function DashboardGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        router.replace("/login?next=/dashboard");
        return;
      }

      const token = await user.getIdToken(true);

      const res = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = (await res.json()) as MeResponse;

      if (cancelled) return;

      if (!data.ok) {
        router.replace("/login?next=/dashboard");
        return;
      }

      if (data.status !== "active" || !data.tenantId) {
        router.replace("/forbidden");
        return;
      }

      setReady(true);
    })().catch(() => {
      router.replace("/login?next=/dashboard");
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
        Vérification des accès…
      </div>
    );
  }

  return <>{children}</>;
}