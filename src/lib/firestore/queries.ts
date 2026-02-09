import { collection, query, where, orderBy, limit, Timestamp } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";

export function qRecentIncidents(db: Firestore, tenantId: string, n = 6) {
  return query(
    collection(db, "incidents"),
    where("tenantId", "==", tenantId),
    orderBy("createdAt", "desc"),
    limit(n)
  );
}

/**
 * Incidents ouverts
 * Reco: à terme, utilise statusKey="ouvert" partout.
 */
export function qOpenIncidents(db: Firestore, tenantId: string) {
  return query(
    collection(db, "incidents"),
    where("tenantId", "==", tenantId),
    where("status", "==", "Ouvert")
  );
}

// ✅ incidents depuis une date (ce mois, 7 jours, etc.)
export function qIncidentsSince(db: Firestore, tenantId: string, since: Timestamp) {
  return query(
    collection(db, "incidents"),
    where("tenantId", "==", tenantId),
    where("createdAt", ">=", since),
    orderBy("createdAt", "desc")
  );
}

// ✅ standard: isActive (comme tes docs sites)
export function qActiveSites(db: Firestore, tenantId: string) {
  return query(
    collection(db, "sites"),
    where("tenantId", "==", tenantId),
    where("isActive", "==", true)
  );
}

// ✅ standard: isActive (à appliquer aussi sur agents)
export function qActiveAgents(db: Firestore, tenantId: string) {
  return query(
    collection(db, "agents"),
    where("tenantId", "==", tenantId),
    where("isActive", "==", true)
  );
}
