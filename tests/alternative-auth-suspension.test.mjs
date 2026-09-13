import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = new URL("../", import.meta.url);
const compiled = new Map();
// Execute real handlers/guards; all external imports are explicit mocks.
// Never initialize Firebase, read credentials or use a network connection.
function load(file, mocks) {
  if (!compiled.has(file)) compiled.set(file, ts.transpileModule(
    readFileSync(new URL(file, root), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText);
  const exports = {};
  runInNewContext(compiled.get(file), {
    exports, URL, console: { error() {}, warn() {} },
    require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      const permitted = ["@/app/api/_utils/withTenant", "@/lib/auth/role", "@/lib/auth/tenant-suspension", "@/lib/api/admin-auth"];
      assert.ok(permitted.includes(name), `Unmocked dependency: ${name}`);
      return load(`${name.replace("@/", "src/")}.ts`, mocks);
    },
  });
  return exports;
}

const handlers = [
  ["clients/route.ts", "GET"], ["clients/route.ts", "POST"],
  ["clients/[id]/route.ts", "GET"],
  ["billing/reconcile/route.ts", "POST"], ["quotes/generate-advanced/route.ts", "POST"],
];
function apiFixture(method, { role = "manager", tenant = { status: "active" }, status = "active" } = {}) {
  const calls = [];
  const query = {
    where() { return this; }, orderBy() { return this; }, limit() { return this; },
    startAfter() { return this; }, doc() { return this; },
    async get() { calls.push("business.get"); return { exists: false, docs: [] }; },
  };
  const mocks = {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "firebase-admin/auth": { getAuth: () => ({ verifyIdToken: async (token, revoked) => {
      assert.equal(token, "fixture"); assert.equal(revoked, true); calls.push("verify");
      return { uid: "actor", tenantId: "stale-claim" };
    } }) },
    "@/lib/firebase/admin": { adminDb: { collection(name) {
      if (["tenantUsers", "tenants"].includes(name)) return { doc(id) {
        calls.push(`${name}:${id}`);
        return { get: async () => ({ exists: name === "tenantUsers" || tenant !== null,
          data: () => name === "tenantUsers" ? { role, status, tenantId: "agency" } : tenant }) };
      } };
      calls.push(`business:${name}`); return query;
    } } },
    "firebase-admin/firestore": { FieldValue: {}, Timestamp: {} },
    "@/lib/api/cursor": { decodeCursor: () => null, encodeCursor: () => null },
    "@/lib/api/text": { norm: value => String(value ?? "").trim(), normLower: value => String(value ?? "").trim().toLowerCase() },
    "@/lib/billing/segmentation": {}, "@/lib/billing/counters": {}, "@/lib/billing/helpers": {},
  };
  const req = { method, headers: new Headers({ authorization: "Bearer fixture" }),
    url: "https://example.invalid/", async json() { calls.push("body"); return {}; } };
  const context = { get params() { calls.push("params"); return Promise.resolve({ id: "client" }); } };
  return { calls, mocks, req, context };
}
for (const [file, method] of handlers) {
  test(`${file} ${method}: real guard blocks security and invalid suspension modes before business`, async () => {
    for (const mode of ["security", undefined, "invalid", null]) {
      const f = apiFixture(method, { tenant: { status: "suspended", suspensionMode: mode } });
      const res = await load(`src/app/api/${file}`, f.mocks)[method](f.req, f.context);
      assert.equal(res.status, 403);
      assert.equal((await res.json()).code, "TENANT_SUSPENDED");
      assert.deepEqual(f.calls, ["verify", "tenantUsers:actor", "tenants:agency"]);
    }
  });
  test(`${file} ${method}: commercial suspension follows read/write policy`, async () => {
    const f = apiFixture(method, { tenant: { status: "suspended", suspensionMode: "commercial" } });
    const res = await load(`src/app/api/${file}`, f.mocks)[method](f.req, f.context);
    if (method === "POST") {
      assert.equal(res.status, 403);
      assert.deepEqual(f.calls, ["verify", "tenantUsers:actor", "tenants:agency"]);
    } else {
      assert.equal(res.status, file.includes("[id]") ? 404 : 200);
      assert.ok(f.calls.includes("business:clients"));
    }
  });
  test(`${file} ${method}: existing role allowlist remains enforced`, async () => {
    for (const role of ["agent", "client", "viewer", "manager", "admin", "owner", "super_admin"]) {
      const f = apiFixture(method, { role });
      const res = await load(`src/app/api/${file}`, f.mocks)[method](f.req, f.context);
      const allowed = file.startsWith("clients/") ? ["manager", "admin", "owner", "super_admin"] : ["manager", "admin"];
      if (!allowed.includes(role)) {
        assert.equal(res.status, 403);
        assert.deepEqual(f.calls, ["verify", "tenantUsers:actor", "tenants:agency"]);
      } else {
        assert.equal(res.status, method === "POST" ? 400 : file.includes("[id]") ? 404 : 200);
      }
    }
  });
}

function functionFixture({ member = { status: "active", tenantId: "current-agency" },
  tenant = { status: "active" }, failure, method = "GET" } = {}) {
  const calls = [];
  const db = { collection(name) {
    if (["tenantUsers", "tenants"].includes(name)) return { doc(id) {
      calls.push(`${name}:${id}`);
      return { get: async () => {
        if (failure === name) throw new Error("Fixture store failure");
        const value = name === "tenantUsers" ? member : tenant;
        return { exists: value !== null, data: () => value };
      } };
    } };
    calls.push(`business:${name}`);
    return { where(field, op, value) {
      if (field === "tenantId") assert.equal(value, "current-agency");
      return this;
    }, async get() { return { docs: [], size: 0 }; } };
  } };
  const mocks = {
    "firebase-functions/v2": { setGlobalOptions() {} },
    "firebase-functions/v2/https": { onRequest: callback => callback },
    "firebase-functions/logger": { error() {} },
    "firebase-admin/app": { initializeApp() {} },
    "firebase-admin/auth": { getAuth: () => ({ verifyIdToken: async (token, revoked) => {
      assert.equal(token, "fixture"); assert.equal(revoked, true); calls.push("verify");
      if (failure === "token") throw new Error("Invalid token");
      return { uid: "actor", tenantId: "stale-claim" };
    } }) },
    "firebase-admin/firestore": { getFirestore: () => db, Timestamp: { fromDate: date => date } },
  };
  const req = { method, headers: { authorization: "Bearer fixture" },
    query: { from: "2026-01-01", to: "2026-01-02" } };
  const res = { set() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  return { calls, mocks, req, res };
}
test("agentsAvailable: current membership and tenant required, failures never reach business", async () => {
  for (const options of [
    { member: null }, { member: { tenantId: "current-agency" } },
    { member: { status: "disabled", tenantId: "current-agency" } },
    { member: { status: "active" } }, { tenant: null },
    ...["security", undefined, null, "invalid", "COMMERCIAL"].map(suspensionMode => ({ tenant: { status: "suspended", suspensionMode } })),
    ...["token", "tenantUsers", "tenants"].map(failure => ({ failure })),
  ]) {
    const f = functionFixture(options);
    await load("functions/src/index.ts", f.mocks).agentsAvailable(f.req, f.res);
    assert.equal(f.res.code, options.failure ? 500 : 403);
    assert.equal(f.calls.some(call => call.startsWith("business:")), false);
  }
});
test("agentsAvailable: active and commercial reads use current tenant, including POST", async () => {
  for (const method of ["GET", "POST"]) for (const tenant of [{ status: "active" }, { status: "suspended", suspensionMode: "commercial" }]) {
    const f = functionFixture({ tenant, method });
    await load("functions/src/index.ts", f.mocks).agentsAvailable(f.req, f.res);
    assert.equal(f.res.code, 200);
    assert.equal(f.res.body.tenantId, "current-agency");
    assert.equal(f.res.body.agents.length, 0);
    assert.deepEqual(f.calls, ["verify", "tenantUsers:actor", "tenants:current-agency", "business:agents", "business:vacations"]);
  }
});

function adminFixture({ claims = ["tenant_admin"], claimTenant = "agency", platform = false,
  method = "GET", ...options } = {}) {
  const f = apiFixture(method, { role: platform ? "super_admin" : "admin", ...options });
  const collection = f.mocks["@/lib/firebase/admin"].adminDb.collection;
  if (platform) {
    f.mocks["@/lib/firebase/admin"].adminDb.collection = name => name === "tenantUsers"
      ? { doc(id) { f.calls.push(`tenantUsers:${id}`); return { get: async () => ({ exists: true,
        data: () => ({ role: options.role ?? "super_admin", status: options.status ?? "active", tenantId: "platform" }) }) }; } }
      : collection(name);
  }
  f.mocks["@/lib/firebase/admin"].adminAuth = { verifyIdToken: async (token, revoked) => {
    assert.equal(token, "fixture"); assert.equal(revoked, true); f.calls.push("claims.verify");
    return { uid: "actor", tenantId: claimTenant, rôles: claims };
  } };
  return f;
}

test("legacy admin: claims and current agency privilege/tenant/explicit target are all required", async () => {
  for (const [setup, options, expected] of [
    [{}, { targetTenantId: "agency" }, 200],
    [{ role: "owner" }, { targetTenantId: "agency" }, 200],
    [{ role: "super_admin" }, { targetTenantId: "agency" }, 200],
    ...["manager", "agent", "viewer", "client"].map(role => [{ role }, { targetTenantId: "agency" }, 403]),
    [{ claimTenant: "old-agency" }, { targetTenantId: "agency" }, 403],
    [{}, { targetTenantId: "foreign" }, 403],
    [{}, {}, 403],
    [{}, { allowedRoles: ["global_admin"], targetTenantId: "agency" }, 403],
    [{ claims: [] }, { targetTenantId: "agency" }, 403],
    [{ status: "disabled" }, { targetTenantId: "agency" }, 401],
    [{ status: null }, { targetTenantId: "agency" }, 401],
    [{ tenant: null }, { targetTenantId: "agency" }, 403],
    [{ tenant: { status: "suspended", suspensionMode: "commercial" } }, { targetTenantId: "agency" }, 200],
    [{ method: "POST", tenant: { status: "suspended", suspensionMode: "commercial" } }, { targetTenantId: "agency" }, 403],
    ...["security", undefined, "invalid"].map(suspensionMode => [
      { tenant: { status: "suspended", suspensionMode } }, { targetTenantId: "agency" }, 403,
    ]),
  ]) {
    const f = adminFixture(setup);
    const result = await load("src/lib/api/admin-auth.ts", f.mocks).requireAdmin(f.req, options);
    assert.equal(result.error?.status ?? 200, expected, JSON.stringify({ setup, options }));
    assert.equal(f.calls.some(call => call.startsWith("business:")), false);
  }
});

test("legacy admin: global/support recovery requires active platform membership and preserves restrictions", async () => {
  for (const claim of ["global_admin", "support"]) {
    for (const role of ["admin", "super_admin"]) {
      const f = adminFixture({ claims: [claim], role }); // Agency membership, despite elevated claim.
      const result = await load("src/lib/api/admin-auth.ts", f.mocks).requireAdmin(f.req);
      assert.equal(result.error.status, 403);
    }
    for (const [options, expected] of [
      [{ allowedRoles: [claim] }, 200],
      [{ allowedRoles: ["tenant_admin"] }, 403],
      [{ targetTenantId: "foreign" }, claim === "global_admin" ? 200 : 403],
      [{ targetTenantId: "foreign", allowSupportCrossTenant: true }, 200],
    ]) {
      const f = adminFixture({ claims: [claim], platform: true, method: "POST", tenant: null });
      const result = await load("src/lib/api/admin-auth.ts", f.mocks).requireAdmin(f.req, options);
      assert.equal(result.error?.status ?? 200, expected);
      assert.equal(f.calls.some(call => call.startsWith("tenants:")), false);
    }
    const disabled = adminFixture({ claims: [claim], platform: true, status: "disabled" });
    const result = await load("src/lib/api/admin-auth.ts", disabled.mocks).requireAdmin(disabled.req);
    assert.equal(result.error.status, 401);
  }
});

test("legacy bootstrap rejects a claim-only account before any provisioning", async () => {
  const f = adminFixture({ claims: ["global_admin"], method: "POST" });
  f.mocks["@/lib/firebase/admin"].adminDb.collection = name => {
    assert.equal(name, "tenantUsers");
    return { doc: () => ({ get: async () => ({ exists: false }) }) };
  };
  const res = await load("src/app/api/admin/bootstrap/route.ts", f.mocks).POST(f.req);
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, "No tenant user");
  assert.equal(f.calls.includes("body"), false);
});

for (const file of ["notifications/route.ts", "compliance-overrides/summary/route.ts"]) {
  test(`${file} GET: commercial reads skip reminders, active reads retain them, security blocks both`, async () => {
    for (const mode of ["none", "commercial", "security", "invalid"]) {
      const f = apiFixture("GET", { tenant: mode === "none" ? { status: "active" }
        : { status: "suspended", suspensionMode: mode } });
      f.mocks["@/lib/notifications/compliance-reminders"] = {
        ensureComplianceReminderNotifications: async tenantId => {
          assert.equal(tenantId, "agency"); f.calls.push("reminder.write");
        },
      };
      const res = await load(`src/app/api/${file}`, f.mocks).GET(f.req);
      assert.equal(res.status, ["security", "invalid"].includes(mode) ? 403 : 200);
      assert.equal(f.calls.includes("reminder.write"), mode === "none");
      assert.equal(f.calls.some(call => call.startsWith("business:")), ["none", "commercial"].includes(mode));
      if (res.status === 200) assert.equal((await res.json()).ok, true);
    }
  });
}
