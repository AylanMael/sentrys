"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api/client-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type CreateAgentResponse =
  | { ok: true; tenantId: string; agent: { id: string } }
  | { ok: false; error?: string };

export default function NewAgentPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  async function onSave() {
    setSaving(true);
    try {
      const res = await apiFetch<CreateAgentResponse>("/api/agents", {
        method: "POST",
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          status: "active",
        }),
      });

      if (res.ok) {
        router.push(`/dashboard/agents/${res.agent.id}`);
        return;
      }

      alert(res.error ?? "Erreur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ajouter un agent</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            placeholder="Prénom"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <Input
            placeholder="Nom"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Input
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            placeholder="Téléphone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()} disabled={saving}>
            Annuler
          </Button>
          <Button
            onClick={onSave}
            disabled={saving || !firstName.trim() || !lastName.trim()}
          >
            {saving ? "Enregistrement…" : "Créer"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}