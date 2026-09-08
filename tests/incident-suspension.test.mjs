import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = new URL("../", import.meta.url);
const compiled = new Map();
const at = value => ({ toMillis: () => value, toDate: () => new Date(value) });
const route = "src/app/api/incidents/route.ts";

// Real route, schema, auth and mission authorization, including atomic audit. Only
// Firebase/network boundaries are replaced. No emulator or credentials loaded.
function fixture({ mode = "commercial", role = "agent", beforeTransaction = () => {}, failAudit = false } = {}) {
  const rows = new Map([
    ["tenantUsers/u", { uid: "u", tenantId: "t", role, agentId: "a", status: "active" }],
    ["tenants/t", mode === "none" ? { status: "active" }
      : { status: "suspended", suspensionMode: mode, suspendedAt: at(500) }],
    ["vacations/v", { tenantId: "t", siteId: "s", assignedAgentIds: ["a"],
      startAt: at(100), endAt: at(2000), status: "filled" }],
    ["sites/s", { tenantId: "t", name: "Fixture site" }],
  ]);
  const reads = [];
  const writes = [];
  let transactionStarted = false;
  const snapshot = key => ({ exists: rows.has(key), data: () => rows.get(key) });
  const ref = key => ({ path: key, id: key.split("/").at(-1),
    async get() { reads.push({ key, transaction: false }); return snapshot(key); },
  });
  const adminDb = {
    collection(name) { return {
      doc: (id = "generated") => ref(`${name}/${id}`),
      async add() { throw new Error("Non-transactional write is forbidden in this fixture"); },
    }; },
    async runTransaction(fn) {
      transactionStarted = true;
      beforeTransaction(rows);
      const pending = [];
      const result = await fn({
        async get(doc) {
          assert.equal(pending.length, 0, "All authorization reads must precede writes");
          reads.push({ key: doc.path, transaction: true });
          return snapshot(doc.path);
        },
        create(doc, data) {
          if (failAudit && doc.path.startsWith("activity/")) throw new Error("Simulated audit write failure");
          pending.push({ key: doc.path, data, transaction: true });
        },
      });
      writes.push(...pending);
      return result;
    },
  };
  const mocks = {
    "@/lib/firebase/admin": { adminDb },
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "firebase-admin/auth": { getAuth: () => ({ async verifyIdToken(token, revoked) {
      assert.equal(token, "fixture"); assert.equal(revoked, true); return { uid: "u" };
    } }) },
    "firebase-admin/firestore": { FieldValue: { serverTimestamp: () => at(1000) } },
  };
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    if (!compiled.has(file)) compiled.set(file, ts.transpileModule(readFileSync(new URL(file, root), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText);
    const exports = {};
    cache.set(file, exports);
    runInNewContext(compiled.get(file), {
      exports, Date: class extends Date { static now() { return 1000; } },
      console: { error() {}, warn() {} },
      require(name) {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        if (["zod", "node:crypto"].includes(name)) return require(name);
        const local = name.startsWith("@/") ? `src/${name.slice(2)}.ts`
          : path.posix.normalize(`${path.posix.dirname(file)}/${name}.ts`);
        assert.ok(local.startsWith("src/lib/auth/") || [
          "src/app/api/_utils/withTenant.ts", "src/lib/api/schemas.ts",
          "src/lib/utils/geo.ts", "src/lib/activity/logger.ts", "src/lib/validators/activity.ts",
        ].includes(local), `Unexpected import: ${name}`);
        return load(local);
      },
    }, { filename: file });
    return exports;
  }
  return { rows, reads, writes, get transactionStarted() { return transactionStarted; },
    async post(body = {}) {
      return load(route).POST({ method: "POST", headers: new Headers({ authorization: "Bearer fixture" }),
        json: async () => ({ title: "Signalement terrain", description: "Incident sur la mission en cours",
          siteId: "s", vacationId: "v", severity: "medium", ...body }),
      });
    },
  };
}

for (const mode of ["none", "commercial"]) {
  test(`incident ${mode}: real route creates own mission incident and valid activity`, async () => {
    const f = fixture({ mode });
    const response = await f.post({ tenantId: "forged", agentId: "forged", status: "closed" });
    assert.equal(response.status, 201);
    assert.equal(f.writes.length, 2);
    const incident = f.writes.find(write => write.key === "incidents/generated");
    assert.equal(incident.transaction, true);
    assert.equal(incident.data.tenantId, "t");
    assert.equal(incident.data.agentId, "a");
    assert.equal(incident.data.vacationId, "v");
    assert.equal(incident.data.siteId, "s");
    assert.equal(incident.data.status, "open");
    assert.equal(incident.data.createdBy, "u");
    assert.equal(incident.data.createdAt.toMillis(), 1000);
    const audit = f.writes.find(write => write.key === "activity/generated");
    assert.equal(audit.data.action, "incident.created");
    assert.equal(audit.data.actorUid, "u");
    assert.equal(audit.data.entityId, "generated");
    assert.equal(audit.data.meta.siteId, "s");
    assert.equal(audit.transaction, true, "Incident and activity must commit atomically");
    assert.equal(audit.data.createdAt.toMillis(), 1000);
    const { logActivityInputSchema } = (() => {
      const exports = {};
      runInNewContext(ts.transpileModule(readFileSync(new URL("src/lib/validators/activity.ts", root), "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
      }).outputText, { exports, require });
      return exports;
    })();
    assert.equal(logActivityInputSchema.safeParse(audit.data).success, true);
    for (const key of ["tenantUsers/u", "tenants/t", "vacations/v", "sites/s"]) {
      assert.ok(f.reads.some(read => read.key === key && read.transaction), `${key} must be reread in transaction`);
    }
  });
}

const changes = {
  "missing member": rows => rows.delete("tenantUsers/u"),
  "foreign member": rows => { rows.get("tenantUsers/u").tenantId = "foreign"; },
  "disabled member": rows => { rows.get("tenantUsers/u").status = "disabled"; },
  "member role changed": rows => { rows.get("tenantUsers/u").role = "owner"; },
  "agent link changed": rows => { rows.get("tenantUsers/u").agentId = "other"; },
  "agent link removed": rows => { delete rows.get("tenantUsers/u").agentId; },
  "missing tenant": rows => rows.delete("tenants/t"),
  "security changed in transaction": rows => { rows.get("tenants/t").suspensionMode = "security"; },
  "legacy mode removed in transaction": rows => { delete rows.get("tenants/t").suspensionMode; },
  "invalid mode in transaction": rows => { rows.get("tenants/t").suspensionMode = "invalid"; },
  "missing vacation": rows => rows.delete("vacations/v"),
  "foreign vacation": rows => { rows.get("vacations/v").tenantId = "foreign"; },
  "wrong vacation site": rows => { rows.get("vacations/v").siteId = "other"; },
  "foreign assigned agent": rows => { rows.get("vacations/v").assignedAgentIds = ["other"]; },
  "missing assigned agents": rows => { delete rows.get("vacations/v").assignedAgentIds; },
  "closed vacation": rows => { rows.get("vacations/v").status = "closed"; },
  "absence title": rows => { rows.get("vacations/v").title = "Congé payé"; },
  "absence kind": rows => { rows.get("vacations/v").kind = "absence"; },
  "missing status": rows => { delete rows.get("vacations/v").status; },
  "missing cutoff": rows => { delete rows.get("tenants/t").suspendedAt; },
  "missing start": rows => { delete rows.get("vacations/v").startAt; },
  "missing end": rows => { delete rows.get("vacations/v").endAt; },
  "starts after cutoff": rows => { rows.get("vacations/v").startAt = at(600); },
  "ended mission": rows => { rows.get("vacations/v").endAt = at(1000); },
  "missing site": rows => rows.delete("sites/s"),
  "foreign site": rows => { rows.get("sites/s").tenantId = "foreign"; },
};
for (const [label, beforeTransaction] of Object.entries(changes)) {
  test(`incident transaction denies ${label} after successful initial authentication`, async () => {
    const f = fixture({ beforeTransaction });
    assert.equal((await f.post()).status, 403);
    assert.equal(f.transactionStarted, true);
    assert.deepEqual(f.writes, [], "No incident or audit may be written on denial");
  });
}

for (const mode of ["security", "invalid"]) {
  test(`incident initial guard denies ${mode} before transaction`, async () => {
    const f = fixture({ mode });
    assert.equal((await f.post()).status, 403);
    assert.equal(f.transactionStarted, false);
    assert.deepEqual(f.writes, []);
    assert.equal(f.reads.some(read => read.key.startsWith("sites/")), false);
  });
}

test("incident active -> security between guard and transaction denies", async () => {
  const f = fixture({ mode: "none", beforeTransaction(rows) {
    rows.set("tenants/t", { status: "suspended", suspensionMode: "security" });
  } });
  assert.equal((await f.post()).status, 403);
  assert.equal(f.transactionStarted, true);
  assert.deepEqual(f.writes, []);
});

test("incident missing vacation request is denied without business writes", async () => {
  const f = fixture();
  assert.equal((await f.post({ vacationId: null })).status, 403);
  assert.deepEqual(f.writes, []);
});

test("incident transaction infrastructure error fails closed without audit", async () => {
  const f = fixture({ beforeTransaction() { throw new Error("Local simulated outage"); } });
  assert.equal((await f.post()).status, 500);
  assert.deepEqual(f.writes, []);
});

test("incident audit failure rolls back the incident", async () => {
  const f = fixture({ failAudit: true });
  assert.equal((await f.post()).status, 500);
  assert.deepEqual(f.writes, []);
});

test("foreign site with coordinates returns 403 before geofence, without outside site read", async () => {
  const f = fixture();
  f.rows.set("sites/s", { tenantId: "foreign", latitude: 48, longitude: 2 });
  assert.equal((await f.post({ reportedLat: 49, reportedLng: 3 })).status, 403);
  assert.equal(f.transactionStarted, true);
  assert.equal(f.reads.some(read => read.key === "sites/s" && !read.transaction), false);
  assert.deepEqual(f.writes, []);
});

for (const [siteLat, siteLng, reportedLat, reportedLng, expected] of [
  [48, 2, 49, 3, 400],
  [0, 0, 0, 0, 201],
  [0, 0, 0, 1, 400],
  [0, 0, 1, 0, 400],
  [1, 1, 0, 0, 400],
  [0, 0, 0, 0.001, 201],
]) {
  test(`authorized geofence (${siteLat},${siteLng}) -> (${reportedLat},${reportedLng}) returns ${expected}`, async () => {
    const f = fixture();
    f.rows.set("sites/s", { tenantId: "t", latitude: siteLat, longitude: siteLng });
    const response = await f.post({ reportedLat, reportedLng });
    assert.equal(response.status, expected);
    assert.equal(f.reads.some(read => read.key === "sites/s" && !read.transaction), false);
    if (expected === 400) {
      assert.deepEqual(await response.json(), { ok: false, error: "Vous devez être à moins de 500m du site pour déclarer un incident." });
      assert.deepEqual(f.writes, []);
    } else assert.equal(f.writes.length, 2);
  });
}
