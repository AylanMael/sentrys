"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase/client";

export default function DebugTokenPage() {
  const [state, setState] = useState<"loading" | "no-user" | "ok" | "error">("loading");
  const [token, setToken] = useState<string>("");
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    const unsub = onAuthStateChanged(
      auth,
      async (user) => {
        if (!user) {
          setState("no-user");
          setToken("Pas connecté. Va sur /login, connecte-toi, puis reviens ici et refresh.");
          return;
        }
        try {
          setEmail(user.email ?? "");
          const t = await user.getIdToken(true);
          setToken(t);
          setState("ok");
          console.log("ID TOKEN =", t);
        } catch (e: any) {
          setState("error");
          setToken(`Erreur getIdToken: ${e?.message ?? String(e)}`);
        }
      },
      (err) => {
        setState("error");
        setToken(`Erreur onAuthStateChanged: ${err?.message ?? String(err)}`);
      }
    );

    return () => unsub();
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Debug ID Token</h1>

      {state === "loading" && <p>Chargement Auth...</p>}
      {email && <p>Connecté en tant que: <b>{email}</b></p>}

      <p>Copie le token ci-dessous :</p>
      <textarea value={token} readOnly style={{ width: "100%", height: 260, fontSize: 12 }} />
    </div>
  );
}