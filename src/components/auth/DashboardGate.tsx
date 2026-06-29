"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "firebase/auth";
import { AppRole, hasRole, normalizeRole } from "@/lib/auth/role";

type MeSuccessResponse = {
  ok: true;
  uid: string;
  email: string | null;
  name: string | null;
  tenantId: string | null;
  role: string | null;
  status: string | null;
  hasTenant: boolean;
};

type MeErrorResponse = {
  ok: false;
  error: string;
};

type MeResponse = MeSuccessResponse | MeErrorResponse;

function norm(v: unknown) {
  return String(v ?? "").trim().toLowerCase();
}

function isInternalTenantRole(role: AppRole | null) {
  return hasRole(role, [
    "super_admin",
    "owner",
    "admin",
    "manager",
    "agent",
    "viewer",
  ]);
}

export function DashboardGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function verifyAccess() {
      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        router.replace("/login?next=/dashboard");
        return;
      }

      const token = await user.getIdToken();
      const res = await fetch("/api/me", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });

      const data = (await res.json().catch(() => null)) as MeResponse | null;

      if (cancelled) return;

      if (!res.ok || !data || data.ok === false) {
        router.replace("/login?next=/dashboard");
        return;
      }

      const role = normalizeRole(data.role);
      const status = norm(data.status);
      const tenantId = data.tenantId;

      if (isInternalTenantRole(role)) {
        if (!tenantId || status !== "active") {
          router.replace("/forbidden");
          return;
        }

        setReady(true);
        return;
      }

      if (role === "client") {
        if (status === "pending") {
          router.replace("/dashboard/pending");
          return;
        }

        if (status === "rejected") {
          router.replace("/dashboard/rejected");
          return;
        }

        if (status === "archived") {
          router.replace("/dashboard/archived");
          return;
        }

        if (status !== "active") {
          router.replace("/forbidden");
          return;
        }

        setReady(true);
        return;
      }

      router.replace("/forbidden");
    }

    verifyAccess().catch(() => {
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
