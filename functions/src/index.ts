import {setGlobalOptions} from "firebase-functions/v2";
import {onRequest} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, Timestamp} from "firebase-admin/firestore";

initializeApp();

setGlobalOptions({
  region: "europe-west9",
  maxInstances: 10,
});

type AgentRow = {
  id: string;
  tenantId: string;
  status?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
};

function json(res: any, status: number, body: any) {
  res.status(status).json(body);
}

function parseIsoOrThrow(v: string | null): Date {
  if (!v) throw new Error("Missing date");
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) throw new Error("Invalid date");
  return d;
}

function overlapQueryInfo(fromIso: string, toIso: string, siteId?: string | null) {
  return {fromIso, toIso, siteId: siteId ?? null};
}

export const agentsAvailable = onRequest(async (req, res) => {
  // --- CORS basique (si tu appelles depuis un domaine web)
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  try {
    // --- Auth (token Firebase ID)
    const authHeader = String(req.headers.authorization ?? "");
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      json(res, 401, {ok: false, error: "Missing Authorization Bearer token"});
      return;
    }

    const decoded = await getAuth().verifyIdToken(token);
    const tenantId = (decoded as any)?.tenantId as string | undefined;
    if (!tenantId) {
      json(res, 403, {ok: false, error: "Missing tenantId in token claims"});
      return;
    }

    // --- Params
    const fromIso = String(req.query.from ?? "");
    const toIso = String(req.query.to ?? "");
    const siteId = typeof req.query.siteId === "string" ? req.query.siteId : null;

    const from = parseIsoOrThrow(fromIso);
    const to = parseIsoOrThrow(toIso);

    if (to.getTime() <= from.getTime()) {
      json(res, 400, {ok: false, error: "`to` must be > `from`"});
      return;
    }

    const db = getFirestore();

    // --- 1) Charger les agents actifs
    const agentsSnap = await db
      .collection("agents")
      .where("tenantId", "==", tenantId)
      .get();

    const agents: AgentRow[] = agentsSnap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        tenantId: String(data.tenantId ?? ""),
        status: data.status ?? "active",
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
      };
    });

    const activeAgents = agents.filter((a) => String(a.status ?? "active").toLowerCase() === "active");

    // --- 2) Charger les vacations qui OVERLAP [from,to]
    // overlap: startAt < to AND endAt > from
    const fromTs = Timestamp.fromDate(from);
    const toTs = Timestamp.fromDate(to);

    let vacQuery = db
      .collection("vacations")
      .where("tenantId", "==", tenantId)
      .where("startAt", "<", toTs)
      .where("endAt", ">", fromTs);

    if (siteId && siteId !== "all") {
      vacQuery = vacQuery.where("siteId", "==", siteId);
    }

    const vacSnap = await vacQuery.get();

    const busyAgentIds = new Set<string>();

    for (const doc of vacSnap.docs) {
      const data = doc.data() as any;
      const assigned: string[] = Array.isArray(data.assignedAgentIds) ? data.assignedAgentIds : [];
      for (const id of assigned) busyAgentIds.add(String(id));
    }

    // --- 3) Filtrer agents dispo
    const available = activeAgents.filter((a) => !busyAgentIds.has(a.id));

    json(res, 200, {
      ok: true,
      tenantId,
      query: overlapQueryInfo(fromIso, toIso, siteId),
      counts: {
        totalAgents: agents.length,
        activeAgents: activeAgents.length,
        busyAgents: busyAgentIds.size,
        availableAgents: available.length,
        overlappedVacations: vacSnap.size,
      },
      agents: available.map((a) => ({
        id: a.id,
        firstName: a.firstName ?? null,
        lastName: a.lastName ?? null,
        email: a.email ?? null,
        phone: a.phone ?? null,
      })),
    });
  } catch (e: any) {
    logger.error("agentsAvailable error", e);
    json(res, 500, {ok: false, error: e?.message ?? String(e)});
  }
});
