import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = new URL("../", import.meta.url);
const at = value => ({ toMillis: () => value });
const compiled = new Map();

// Execute real policy, guard, transaction authorization and pointage handlers.
// External services are explicit in-memory boundaries, never Firebase init.
function fixture({ mode = "none", role = "agent", method = "POST", tenantExists = true } = {}) {
  const rows = new Map([
    ["tenantUsers/u", { status: "active", tenantId: "t", role, agentId: "a" }],
    ["tenants/t", mode === "none" ? { status: "active" } : { status: "suspended", suspensionMode: mode, suspendedAt: at(500) }],
    ["vacations/v", { tenantId: "t", siteId: "s", assignedAgentIds: ["a"], startAt: at(100), endAt: at(2000), status: "filled" }],
    ["sites/s", { tenantId: "t", name: "Site" }],
    ["assignments/x", { tenantId: "t", siteId: "s", agentId: "a", vacationId: "v", status: "assigned" }],
  ]);
  if (!tenantExists) rows.delete("tenants/t");
  const writes = [];
  const reads = [];
  const snapshot = key => ({ id: key.split("/").at(-1), exists: rows.has(key), data: () => rows.get(key) });
  const ref = key => ({ path: key, id: key.split("/").at(-1), get: async () => { reads.push(key); return snapshot(key); } });
  const tx = {
    get: async ref => { reads.push(ref.path); return snapshot(ref.path); },
    update: (ref, data) => { writes.push({ path: ref.path, data }); },
    set: (ref, data) => { writes.push({ path: ref.path, data }); },
  };
  const adminDb = {
    collection: name => ({ doc: (id = "generated") => ref(`${name}/${id}`) }),
    runTransaction: fn => fn(tx),
  };
  const mocks = {
    "@/lib/firebase/admin": { adminDb },
    "next/server": { NextResponse: { json: (data, init) => Response.json(data, init) } },
    "firebase-admin/auth": { getAuth: () => ({ verifyIdToken: async (_token, revoked) => {
      assert.equal(revoked, true); return { uid: "u" };
    } }) },
    "firebase-admin/firestore": { FieldValue: { serverTimestamp: () => "server-time" } },
    "@/lib/observability/logger": { appLogger: { warning() {} } },
  };
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    if (!compiled.has(file)) compiled.set(file, ts.transpileModule(readFileSync(new URL(file, root), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText);
    const exports = {};
    cache.set(file, exports);
    runInNewContext(compiled.get(file), { exports, Date: { now: () => 1000 },
      require(specifier) {
        if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
        if (specifier === "zod") return require("zod");
        const local = specifier.startsWith("@/") ? `src/${specifier.slice(2)}.ts`
          : path.posix.normalize(`${path.posix.dirname(file)}/${specifier}.ts`);
        assert.ok(local.startsWith("src/lib/auth/") || local === "src/lib/geo/distance.ts"
          || local === "src/lib/validators/assignment.ts" || local === "src/app/api/_utils/withTenant.ts", `Unexpected import ${specifier}`);
        return load(local);
      },
    }, { filename: file });
    return exports;
  }
  const req = { method, headers: new Headers({ authorization: "Bearer fixture" }), json: async () => ({ latitude: 48, longitude: 2 }) };
  return { rows, reads, writes, tx, req, load };
}

for (const mode of ["none", "commercial", "security", "invalid"]) {
  for (const method of ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"]) {
    test(`main guard ${mode} ${method}`, async () => {
      const f = fixture({ mode, method });
      const result = await f.load("src/app/api/_utils/withTenant.ts").requireTenantUser(f.req);
      const allowed = mode === "none" || (mode === "commercial" && ["GET", "HEAD"].includes(method));
      assert.equal(result.ok, allowed);
      if (!allowed) { assert.equal(result.res.status, 403); assert.equal(result.res.headers.get("cache-control"), "no-store"); }
      assert.equal(f.writes.length, 0);
    });
  }
}
test("missing tenant fails closed", async () => {
  const f = fixture({ method: "GET", tenantExists: false });
  assert.equal((await f.load("src/app/api/_utils/withTenant.ts").requireTenantUser(f.req)).ok, false);
});
for (const role of ["agent", "owner", "admin", "super_admin", "viewer"]) {
  test(`commercial mission pre-gate role ${role}`, async () => {
    const f = fixture({ mode: "commercial", role });
    const result = await f.load("src/app/api/_utils/withTenant.ts").requireTenantUser(f.req, { access: "mission" });
    assert.equal(result.ok, role === "agent");
  });
}
test("platform recovery requires current active platform super administrator", async () => {
  const f = fixture({ role: "super_admin" });
  f.rows.set("tenantUsers/u", { role: "super_admin", tenantId: "platform", status: "active" });
  f.rows.delete("tenants/t");
  assert.equal((await f.load("src/app/api/_utils/withTenant.ts").requireTenantUser(f.req)).ok, true);
});

const changes = {
  future: f => { f.rows.get("vacations/v").startAt = at(1500); },
  "started after suspension": f => { f.rows.get("vacations/v").startAt = at(600); },
  "at end": f => { f.rows.get("vacations/v").endAt = at(1000); },
  "after end": f => { f.rows.get("vacations/v").endAt = at(999); },
  "missing cutoff": f => { delete f.rows.get("tenants/t").suspendedAt; },
  "invalid date": f => { f.rows.get("vacations/v").startAt = "yesterday"; },
  cancelled: f => { f.rows.get("vacations/v").status = "cancelled"; },
  absence: f => { f.rows.get("vacations/v").isAbsence = true; },
  reassigned: f => { f.rows.get("vacations/v").assignedAgentIds = ["other"]; },
  "foreign mission": f => { f.rows.get("vacations/v").tenantId = "other"; },
  "wrong site": f => { f.rows.get("vacations/v").siteId = "other"; },
  "foreign assignment": f => { f.rows.get("assignments/x").tenantId = "other"; },
  "foreign site": f => { f.rows.get("sites/s").tenantId = "other"; },
  "wrong assignment agent": f => { f.rows.get("assignments/x").agentId = "u"; },
};
for (const direction of ["in", "out"]) {
  test(`commercial current mission ${direction} succeeds with linked agentId`, async () => {
    const f = fixture({ mode: "commercial" });
    if (direction === "out") f.rows.get("assignments/x").status = "present";
    const res = await f.load("src/app/api/assignments/_pointage.ts").pointage(f.req, Promise.resolve({ id: "x" }), direction);
    assert.equal(res.status, 200); assert.equal(f.writes.length, 2);
    assert.equal(f.writes[0].data.status, direction === "in" ? "present" : "completed");
    assert.equal(f.writes[1].path, "activity/generated");
  });
  for (const [label, change] of Object.entries(changes)) test(`pointage ${direction} denies ${label}`, async () => {
    const f = fixture({ mode: "commercial" });
    if (direction === "out") f.rows.get("assignments/x").status = "present";
    change(f);
    assert.equal((await f.load("src/app/api/assignments/_pointage.ts").pointage(f.req, Promise.resolve({ id: "x" }), direction)).status, 403);
    assert.equal(f.writes.length, 0);
  });
}
test("transaction rechecks current membership and suspension, not only initial guard", async () => {
  const f = fixture({ mode: "commercial" });
  const auth = await f.load("src/app/api/_utils/withTenant.ts").requireTenantUser(f.req, { access: "mission" });
  f.rows.get("tenants/t").suspensionMode = "security";
  const check = f.load("src/lib/auth/mission-access.ts").authorizeMissionWrite;
  assert.equal(await check(f.tx, auth, "v", "s"), false);
  f.rows.get("tenants/t").suspensionMode = "commercial";
  f.rows.get("tenantUsers/u").agentId = "changed";
  assert.equal(await check(f.tx, auth, "v", "s"), false);
  f.rows.get("tenantUsers/u").status = "disabled";
  assert.equal(await check(f.tx, auth, "v", "s"), false);
});

for (const status of [undefined, null, "disabled", "pending"]) {
  test(`me diagnostic refuses inactive or missing member status ${status}`, async () => {
    const f = fixture({ method: "GET" });
    f.rows.get("tenantUsers/u").status = status;
    const response = await f.load("src/app/api/me/route.ts").GET(f.req);
    assert.equal(response.status, 403);
    assert.equal(f.reads.includes("tenants/t"), false);
  });
}
for (const mode of ["security", "invalid"]) {
  test(`me ${mode} diagnostic does not expose business tenant data`, async () => {
    const f = fixture({ mode, method: "GET" });
    f.rows.get("tenants/t").agencyProfile = { fixturePrivateData: "not-for-diagnostic" };
    const response = await f.load("src/app/api/me/route.ts").GET(f.req);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data.tenant, { id: "t", status: "suspended", suspensionMode: "security" });
  });
}
