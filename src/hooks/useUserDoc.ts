"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/auth-provider";

export function useUserDoc() {
  const { user } = useAuth();
  const [userDoc, setUserDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    const ref = doc(db, "users", user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      setUserDoc(snap.exists() ? snap.data() : null);
      setLoading(false);
    });

    return () => unsub();
  }, [user?.uid]);

  return { userDoc, loading };
}
