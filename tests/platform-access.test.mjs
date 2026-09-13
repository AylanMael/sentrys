import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = new URL("../", import.meta.url);
const platform = "src/app/api/platform/";
const guard = "src/lib/auth/platform.ts";
const tenantAuth = "src/app/api/_utils/withTenant.ts";
const rolePolicy = "src/lib/auth/role.ts";
const compiled = new Map();

// Execute the actual TypeScript guard and handler bodies. Only external
// boundaries are replaced: no Firebase initialization, credentials or network.
function load(file, mocks, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  if (!compiled.has(file)) {
    compiled.set(file, ts.transpileModule(readFileSync(new URL(file, root), "utf8"), {
      fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText);
  }
  const exports = {};
  cache.set(file, exports);
  runInNewContext(compiled.get(file), {
    exports,
    require(specifier) {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      const local = `${specifier.replace(/^@\//, "src/")}.ts`;
      assert.ok([guard, tenantAuth, rolePolicy, "src/lib/auth/tenant-suspension.ts"].includes(local), `Unmocked import: ${specifier}`);
      return load(local, mocks, cache);
    },
    console: { error() {}, warn() {} },
    process: { env: {} },
  }, { filename: file });
  return exports;
}

const next = { NextResponse: { json: (body, init) => Response.json(body, init) } };
function forbidden(message) {
  return Response.json({ ok: false, error: message }, {
    status: 403, headers: { "Cache-Control": "no-store" },
  });
}
const principal = { ok: true, uid: "test-user", role: "super_admin", tenantId: "platform", status: "active",
  email: "test@example.invalid", name: null, agentId: null };

function fixture(auth = principal, { realAuth = false, tokenFailure = false, lookupFailure = false,
  missingToken = false, missingUser = false } = {}) {
  const calls = [];
  const touch = (name) => { calls.push(name); };
  const snapshot = { exists: false, docs: [], data: () => ({ count: 0 }) };
  const query = {
    id: "test-id",
    orderBy() { return this; }, limit() { return this; }, where() { return this; },
    doc() { return this; }, count() { return this; },
    async get() { touch("db.get"); return snapshot; },
    async create() { touch("db.create"); },
  };
  const mocks = {
    "next/server": next,
    "@/app/api/_utils/withTenant": {
      forbidden,
      async requireTenantUser(req) {
        assert.equal(req, request);
        touch("authenticate");
        if (auth instanceof Error) throw auth;
        return auth;
      },
    },
    "@/lib/firebase/admin": {
      adminDb: { collection(name) {
        if (realAuth && name === "tenantUsers") {
          touch("identity.lookup");
          return { doc: () => ({ get: async () => {
            if (lookupFailure) throw new Error("Identity store unavailable");
            return { exists: !missingUser, data: () => auth };
          } }) };
        }
        touch(`db.collection:${name}`);
        return query;
      } },
      adminBucket: { get name() { touch("storage"); return "test-bucket"; } },
      adminAuth: new Proxy({}, { get() { touch("adminAuth"); throw new Error("Unexpected auth mutation"); } }),
    },
    "firebase-admin/firestore": { FieldValue: { serverTimestamp: () => "timestamp" } },
    "firebase-admin/auth": { getAuth: () => ({ verifyIdToken: async (token, revoked) => {
      touch("token.verify");
      assert.equal(token, "test-token");
      assert.equal(revoked, true);
      if (tokenFailure) throw new Error("Token verification failed");
      return { uid: principal.uid };
    } }) },
    "@/lib/platform/audit-log": {
      async listPlatformAuditEvents() { touch("audit.read"); return []; },
      async writePlatformAuditEvent(event) { touch("audit.write"); return event; },
    },
    "@/lib/blog": {
      async listManagedPosts() { touch("articles.read"); return []; },
      slugifyArticle: () => "test-article", buildArticleDescription: () => "description",
      readingTimeMinutes: () => 1, articleGuidance: () => [],
    },
    "@/lib/billing/limits": new Proxy({}, { get() { return () => {
      touch("billing"); throw new Error("Unexpected billing call");
    }; } }),
    "@/lib/observability/logger": { appLogger: { error() {} } },
  };
  if (realAuth) delete mocks["@/app/api/_utils/withTenant"];
  const request = {
    headers: new Headers(missingToken ? {} : { authorization: "Bearer test-token" }),
    get nextUrl() { touch("request.url"); return new URL("https://example.invalid/?tenantId=agency"); },
    async json() {
      touch("request.body");
      return { reason: "Test support note", title: "Test article", content: "A sufficiently long article body for this test." };
    },
  };
  const context = { get params() { touch("request.params"); return Promise.resolve({ id: "agency" }); } };
  return { calls, mocks, request, context };
}

const routes = readdirSync(new URL(platform, root), { recursive: true })
  .map((file) => file.replaceAll("\\", "/"))
  .filter((file) => file === "route.ts" || file.endsWith("/route.ts"))
  .map((file) => platform + file);
const handlers = routes.flatMap((file) => Object.entries(load(file, fixture().mocks))
  .filter(([name]) => /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(name))
  .map(([method]) => ({ file, method })));

test("platform route inventory includes all 11 current handlers", () => {
  assert.equal(routes.length, 7);
  assert.equal(handlers.length, 11);
});

const denied = ["agent", "owner", "admin", "manager", "viewer", "client", "unknown", "support"]
  .flatMap((role) => ["agency", "platform"].map((tenantId) => ({ ...principal, role, tenantId })));
for (const tenantId of ["agency", "", undefined, null, "Platform", "platform-other"]) {
  denied.push({ ...principal, tenantId });
}
denied.push({ ...principal, role: undefined }, { ...principal, role: "superadmin" });

test("guard requires super_admin on the normalized authenticated platform principal", async () => {
  for (const auth of denied) {
    const f = fixture(auth);
    const result = await load(guard, f.mocks).requirePlatformUser(f.request);
    assert.equal(result.ok, false, JSON.stringify(auth));
    assert.equal(result.res.status, 403);
    assert.deepEqual(f.calls, ["authenticate"]);
  }
  const f = fixture();
  assert.equal(await load(guard, f.mocks).requirePlatformUser(f.request), principal);
});

test("real requireTenantUser normalizes the superadmin alias before the platform guard", async () => {
  const f = fixture({ ...principal, role: "superadmin" }, { realAuth: true });
  const result = await load(guard, f.mocks).requirePlatformUser(f.request);
  assert.equal(result.ok, true);
  assert.equal(result.role, "super_admin");
  assert.deepEqual(f.calls, ["token.verify", "identity.lookup"]);
});

test("real requireTenantUser rejects missing status", async () => {
  const account = { ...principal };
  delete account.status;
  const f = fixture(account, { realAuth: true });
  const result = await load(tenantAuth, f.mocks).requireTenantUser(f.request);
  assert.equal(result.ok, false);
  assert.equal(result.res.status, 401);
  assert.deepEqual(await result.res.json(), { ok: false, error: "User disabled", status: "" });
  assert.deepEqual(f.calls, ["token.verify", "identity.lookup"]);
});

test("real requireTenantUser accepts an explicitly active account", async () => {
  const f = fixture(principal, { realAuth: true });
  const result = await load(tenantAuth, f.mocks).requireTenantUser(f.request);
  assert.equal(result.ok, true);
  assert.equal(result.uid, principal.uid);
  assert.equal(result.role, "super_admin");
  assert.equal(result.tenantId, "platform");
  assert.deepEqual(f.calls, ["token.verify", "identity.lookup"]);
});

for (const { file, method } of handlers) {
  const label = `${file.slice(platform.length)} ${method}`;
  test(`${label}: denies every non-platform principal before resources, body or params`, async () => {
    for (const auth of denied) {
      const f = fixture(auth);
      const response = await load(file, f.mocks)[method](f.request, f.context);
      assert.equal(response.status, 403, JSON.stringify(auth));
      const message = file.includes("overview/") ? "Super admin SaaS platform required"
        : /\/(tenants|audit)\//.test(file) ? "Super admin SaaS required"
          : "Super administrateur plateforme requis";
      assert.deepEqual(await response.json(), { ok: false, error: message });
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.deepEqual(f.calls, ["authenticate"]);
    }
  });

  test(`${label}: preserves auth errors and propagates auth exceptions`, async () => {
    for (const status of [401, 403, 500]) {
      const res = Response.json({ ok: false, error: "Original auth failure", detail: "test" }, { status });
      const f = fixture({ ok: false, res });
      assert.equal(await load(file, f.mocks)[method](f.request, f.context), res);
      assert.deepEqual(f.calls, ["authenticate"]);
    }
    const failure = new Error("Authentication unavailable");
    const f = fixture(failure);
    await assert.rejects(load(file, f.mocks)[method](f.request, f.context), (error) => error === failure);
    assert.deepEqual(f.calls, ["authenticate"]);
  });

  test(`${label}: real requireTenantUser fails closed on token and identity-store failures`, async () => {
    for (const options of [{ tokenFailure: true }, { lookupFailure: true }]) {
      const f = fixture(principal, { realAuth: true, ...options });
      const response = await load(file, f.mocks)[method](f.request, f.context);
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { ok: false, error: "Invalid token" });
      assert.deepEqual(f.calls, options.tokenFailure ? ["token.verify"] : ["token.verify", "identity.lookup"]);
    }
  });

  test(`${label}: real auth rejects missing token, missing tenant user and disabled user`, async () => {
    for (const [options, status, error, calls] of [
      [{ missingToken: true }, "active", "Missing token", []],
      [{ missingUser: true }, "active", "No tenant user", ["token.verify", "identity.lookup"]],
      [{}, "disabled", "User disabled", ["token.verify", "identity.lookup"]],
    ]) {
      const f = fixture({ ...principal, status }, { realAuth: true, ...options });
      const response = await load(file, f.mocks)[method](f.request, f.context);
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), {
        ok: false, error, ...(status === "disabled" ? { status } : {}),
      });
      assert.deepEqual(f.calls, calls);
    }
  });

  test(`${label}: real auth rejects missing status before business access`, async () => {
    const account = { ...principal };
    delete account.status;
    const f = fixture(account, { realAuth: true });
    const response = await load(file, f.mocks)[method](f.request, f.context);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: "User disabled", status: "" });
    assert.deepEqual(f.calls, ["token.verify", "identity.lookup"]);
  });

  // 400/404 cases prove guard traversal, not full business acceptance coverage.
  test(`${label}: platform super_admin passes the guard to an existing business response`, async () => {
    const f = fixture(principal, { realAuth: true });
    const response = await load(file, f.mocks)[method](f.request, f.context);
    const body = await response.json();
    const key = `${file.slice(platform.length)}:${method}`;
    const expected = {
      "articles/route.ts:GET": [200, { ok: true, articles: [] }],
      "articles/route.ts:POST": [201, { ok: true, id: "test-article", slug: "test-article", status: "draft", guidance: [] }],
      "articles/[id]/route.ts:PATCH": [404, { ok: false, error: "Article introuvable." }],
      "contact-requests/route.ts:GET": [200, { ok: true, items: [] }],
      "contact-requests/route.ts:PATCH": [400, { ok: false, error: "Demande ou statut invalide." }],
      "tenants/route.ts:POST": [400, { ok: false, error: "Nom d'agence obligatoire." }],
      "tenants/[id]/route.ts:GET": [404, { ok: false, error: "Agence SaaS introuvable." }],
      "tenants/[id]/route.ts:PATCH": [400, { ok: false, error: "Statut cible invalide. Utilisez active ou suspended." }],
    }[key];
    if (expected) {
      assert.equal(response.status, expected[0]);
      assert.deepEqual(body, expected[1]);
    } else {
      assert.equal(response.status, method === "POST" ? 201 : 200);
      assert.equal(body.ok, true);
      if (key === "audit/route.ts:GET") assert.deepEqual(body.events, []);
      if (key === "audit/route.ts:POST") assert.equal(body.event.actorUid, principal.uid);
      if (key === "overview/route.ts:GET") {
        assert.deepEqual(body.tenants, []);
        assert.equal(body.requester.uid, principal.uid);
      }
    }
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(f.calls.slice(0, 2), ["token.verify", "identity.lookup"]);
    assert.ok(f.calls.length > 2);
  });
}
