import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = new URL("../", import.meta.url);
const compiled = new Map();
function load(file, mocks) {
  if (!compiled.has(file)) compiled.set(file, ts.transpileModule(
    readFileSync(new URL(file, root), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText);
  const exports = {};
  // Explicit offline boundaries: no Firebase initialization, credentials or network.
  runInNewContext(compiled.get(file), {
    exports, process: { env: {} }, console: { error() {} },
    require(name) {
      assert.ok(Object.hasOwn(mocks, name), `Unexpected dependency: ${name}`);
      return mocks[name];
    },
  });
  return exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const defaults = { agents: 0, sites: 0, activeTenants: 1 };

function fixture({ usage, failure, suspension = "none" } = {}) {
  const calls = [];
  const writes = [];
  const mocks = {
    "@/lib/firebase/admin": { adminDb: { collection(collection) {
      assert.ok(["usage", "plans", "subscriptions"].includes(collection));
      return { doc(id) {
        assert.equal(id, collection === "plans" ? "free" : "agency");
        return {
          async get() {
            calls.push(`read:${collection}`);
            if (failure && collection === "usage") throw failure;
            return { exists: collection === "usage" && usage !== undefined, data: () => usage };
          },
          async set(value, options) {
            assert.equal(collection, "usage");
            writes.push({ path: `${collection}/${id}`, value: plain(value), options: plain(options) });
          },
        };
      } };
    } } },
    "firebase-admin/firestore": { FieldValue: { serverTimestamp() {
      calls.push("timestamp"); return "fixture-server-timestamp";
    } } },
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/app/api/_utils/withTenant": { requireTenantUser: async () => ({
      ok: true, uid: "actor", tenantId: "agency", role: "admin", suspension,
    }) },
  };
  const limits = load("src/lib/billing/limits.ts", mocks);
  mocks["@/lib/billing/limits"] = limits;
  return { calls, writes, mocks, limits };
}

test("getUsage default and explicit writable calls initialize a missing usage document", async () => {
  for (const args of [["agency"], ["agency", false]]) {
    const f = fixture();
    assert.deepEqual(plain(await f.limits.getUsage(...args)), defaults);
    assert.deepEqual(f.writes, [{ path: "usage/agency",
      value: { ...defaults, updatedAt: "fixture-server-timestamp" }, options: { merge: true } }]);
  }
});
test("getUsage read-only returns missing-document defaults without writes or timestamp creation", async () => {
  const f = fixture();
  assert.deepEqual(plain(await f.limits.getUsage("agency", true)), defaults);
  assert.deepEqual(f.calls, ["read:usage"]);
  assert.deepEqual(f.writes, []);
});
test("getUsage preserves existing normalized usage in both modes without writes", async () => {
  for (const readOnly of [false, true]) {
    const f = fixture({ usage: { agents: 3.8, sites: 2, activeTenants: 1, updatedAt: "existing" } });
    assert.deepEqual(plain(await f.limits.getUsage("agency", readOnly)), {
      agents: 3, sites: 2, activeTenants: 1, updatedAt: "existing",
    });
    assert.deepEqual(f.writes, []);
  }
});
test("getUsage read failures are not treated as absent documents", async () => {
  for (const readOnly of [false, true]) {
    const failure = new Error("Fixture read unavailable");
    const f = fixture({ failure });
    await assert.rejects(f.limits.getUsage("agency", readOnly), error => error === failure);
    assert.deepEqual(f.writes, []);
  }
});
test("billing GET with actual limits helper returns defaults: active initializes, commercial does not", async () => {
  for (const suspension of ["none", "commercial"]) {
    const f = fixture({ suspension });
    const res = await load("src/app/api/billing/usage/route.ts", f.mocks).GET({ method: "GET" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.deepEqual(body.usage, { ...defaults, tenants: 1, updatedAt: null });
    assert.equal(f.writes.length, suspension === "commercial" ? 0 : 1);
  }
});
