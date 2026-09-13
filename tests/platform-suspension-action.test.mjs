import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const ts = createRequire(import.meta.url)("typescript");
const root = new URL("../", import.meta.url);
const route = "src/app/api/platform/tenants/[id]/route.ts";
const guard = "src/lib/auth/platform.ts";
const ui = "src/app/platform/tenants/[id]/components/support-tab.tsx";
const compiled = new Map();
function load(file, mocks) {
  if (!compiled.has(file)) compiled.set(file, ts.transpileModule(readFileSync(new URL(file, root), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText);
  const exports = {};
  runInNewContext(compiled.get(file), { exports, console: { error() {}, warn() {} }, require(name) {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === "@/lib/auth/platform") return load(guard, mocks);
    throw new Error(`Unmocked dependency: ${name}`);
  } }, { filename: file });
  return exports;
}

const actor = { ok: true, uid: "platform-user", tenantId: "platform", role: "super_admin", email: "test@example.invalid" };
const payload = { status: "suspended", reason: "Motif de suspension vérifié", confirmation: "SUSPENDRE" };
const NOW = "server-timestamp";
const DELETE = "delete-field";
function fixture(data = { status: "active" }, auth = actor, transactionData = data) {
  const calls = [];
  const writes = [];
  const refs = name => ({ id: name === "platformAuditLog" ? "audit-id" : "agency", name });
  function query(name) {
    return { ...refs(name),
      doc() { return this; }, where() { return this; }, limit() { return this; },
      count() { return { get: async () => ({ data: () => ({ count: 1 }) }) }; },
      async get() { return { exists: name === "tenants" && data !== null, data: () => data,
        docs: name === "tenantUsers" ? [{ id: "owner", data: () => ({ role: "owner", status: "active", email: "owner@example.invalid" }) }] : [],
      }; },
    };
  }
  const mocks = {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "firebase-admin/firestore": { FieldValue: { serverTimestamp: () => NOW, delete: () => DELETE } },
    "@/app/api/_utils/withTenant": {
      async requireTenantUser() { calls.push("auth"); return auth; },
      forbidden: error => Response.json({ ok: false, error }, { status: 403 }),
    },
    "@/lib/firebase/admin": { adminDb: {
      collection(name) { calls.push(`collection:${name}`); return query(name); },
      async runTransaction(callback) {
        calls.push("transaction");
        await callback({
          async get() { return { exists: transactionData !== null, data: () => transactionData }; },
          update(ref, patch) { writes.push({ kind: "update", ref, patch }); },
          set(ref, patch) { writes.push({ kind: "set", ref, patch }); },
        });
      },
    } },
    "@/lib/billing/limits": {
      getSubscription: async () => ({ planId: "starter", status: "active" }),
      getPlan: async () => ({ id: "starter", name: "Starter", active: true }),
      computeEffectiveLimits: () => ({ agents: 5, sites: 5, tenants: 1 }),
    },
    "@/lib/platform/audit-log": { listPlatformAuditEvents: async () => [] },
  };
  return { calls, writes, async get() {
    const response = await load(route, mocks).GET({}, { params: Promise.resolve({ id: "agency" }) });
    return { status: response.status, body: await response.json() };
  }, async patch(body = payload) {
    const response = await load(route, mocks).PATCH({ async json() { calls.push("body"); return body; } }, {
      get params() { calls.push("params"); return Promise.resolve({ id: "agency" }); },
    });
    return { status: response.status, body: await response.json() };
  } };
}

for (const mode of [undefined, "commercial", "security"]) {
  test(`new suspension ${mode ?? "default"}: timestamp, mode and audit`, async () => {
    const f = fixture();
    const response = await f.patch({ ...payload, ...(mode === undefined ? {} : { suspensionMode: mode }) });
    assert.equal(response.status, 200);
    const patch = f.writes[0].patch;
    assert.equal(patch.status, "suspended");
    assert.equal(patch.suspensionMode, mode ?? "commercial");
    assert.equal(patch.suspendedAt, NOW);
    assert.equal(patch.suspendedBy, actor.uid);
    const audit = f.writes[1].patch;
    assert.equal(audit.action, "tenant.suspend");
    assert.equal(audit.actor.uid, actor.uid);
    assert.equal(audit.reason, payload.reason);
    assert.equal(audit.metadata.previousSuspensionMode, null);
    assert.equal(audit.metadata.nextSuspensionMode, mode ?? "commercial");
  });
}

for (const [previous, next] of [["commercial", "security"], ["security", "commercial"], [undefined, "commercial"], ["invalid", "commercial"]]) {
  for (const cutoff of ["original-cutoff", undefined]) {
    test(`switch ${previous ?? "missing"} -> ${next}, cutoff ${cutoff ?? "missing"}: no timestamp refresh`, async () => {
      const data = { status: "suspended", suspensionMode: previous, ...(cutoff ? { suspendedAt: cutoff } : {}) };
      const f = fixture(data);
      const response = await f.patch({ ...payload, suspensionMode: next });
      assert.equal(response.status, 200);
      assert.equal(Object.hasOwn(f.writes[0].patch, "suspendedAt"), false);
      assert.equal(f.writes[0].patch.suspensionMode, next);
      assert.equal(data.suspendedAt, cutoff);
      const audit = f.writes[1].patch;
      assert.equal(audit.action, "tenant.suspension_mode.change");
      assert.equal(audit.metadata.previousSuspensionMode, previous === "commercial" ? "commercial" : "security");
      assert.equal(audit.metadata.nextSuspensionMode, next);
      assert.equal(response.body.result.suspensionMode, next);
    });
  }
}

for (const mode of ["commercial", "security", undefined, "invalid"]) {
  test(`same effective mode ${mode ?? "missing"}: 409, no implicit downgrade`, async () => {
    const f = fixture({ status: "suspended", suspensionMode: mode });
    assert.equal((await f.patch()).status, 409);
    assert.equal(f.writes.length, 0);
  });
  test(`reactivate ${mode ?? "missing"}: clears mode and cutoff with audit`, async () => {
    const f = fixture({ status: "suspended", suspensionMode: mode, suspendedAt: "original-cutoff" });
    const response = await f.patch({ ...payload, status: "active", confirmation: "REACTIVER" });
    assert.equal(response.status, 200);
    const patch = f.writes[0].patch;
    for (const field of ["suspensionMode", "suspendedAt", "suspendedBy", "suspensionReason"]) assert.equal(patch[field], DELETE);
    assert.equal(patch.reactivatedAt, NOW);
    assert.equal(f.writes[1].patch.action, "tenant.reactivate");
    assert.equal(f.writes[1].patch.metadata.previousSuspensionMode, mode === "commercial" ? "commercial" : "security");
    assert.equal(f.writes[1].patch.metadata.nextSuspensionMode, null);
  });
}

test("invalid mode, reason and confirmation never write", async () => {
  for (const override of [{ suspensionMode: "invalid" }, { suspensionMode: null }, { suspensionMode: "Commercial" },
    { reason: "short" }, { confirmation: "wrong" }]) {
    const f = fixture();
    assert.equal((await f.patch({ ...payload, ...override })).status, 400);
    assert.equal(f.writes.length, 0);
    assert.equal(f.calls.includes("transaction"), false);
  }
});

test("platform guard denies agency super_admin and non-super_admin before resources", async () => {
  for (const auth of [{ ...actor, tenantId: "agency" }, { ...actor, role: "owner" }, { ...actor, role: "support" }]) {
    const f = fixture(undefined, auth);
    assert.equal((await f.patch()).status, 403);
    assert.deepEqual(f.calls, ["auth"]);
  }
  const f = fixture(undefined, { ok: false, res: Response.json({ error: "missing" }, { status: 401 }) });
  assert.equal((await f.patch()).status, 401);
  assert.deepEqual(f.calls, ["auth"]);
});

test("missing tenant remains 404 without writes", async () => {
  const f = fixture(null);
  assert.equal((await f.patch()).status, 404);
  assert.equal(f.writes.length, 0);
});

test("activate_tenant audits the status read in transaction, not the earlier snapshot", async () => {
  const f = fixture({ name: "Agency", status: "pending_setup" }, actor,
    { name: "Agency", status: "suspended", suspensionMode: "security" });
  const response = await f.patch({ action: "activate_tenant", reason: payload.reason, confirmation: "ACTIVER AGENCE" });
  assert.equal(response.status, 200);
  const audit = f.writes.find(write => write.ref.name === "platformAuditLog").patch;
  assert.equal(audit.metadata.previousStatus, "suspended");
  assert.equal(audit.metadata.previousSuspensionMode, "security");
  assert.equal(response.body.result.previousStatus, "suspended");
});

test("activate_tenant rejects an agency concurrently activated without another audit", async () => {
  const f = fixture({ name: "Agency", status: "pending_setup" }, actor, { status: "active" });
  const response = await f.patch({ action: "activate_tenant", reason: payload.reason, confirmation: "ACTIVER AGENCE" });
  assert.equal(response.status, 409);
  assert.equal(f.writes.length, 0);
});

for (const mode of ["commercial", "security", undefined, "invalid"]) {
  test(`GET exposes effective ${mode ?? "missing"} mode and original cutoff`, async () => {
    const f = fixture({ status: "suspended", suspensionMode: mode, suspendedAt: "2026-09-08T10:00:00.000Z" });
    const response = await f.get();
    assert.equal(response.status, 200);
    assert.equal(response.body.tenant.suspensionMode, mode === "commercial" ? "commercial" : "security");
    assert.equal(response.body.tenant.suspendedAtIso, "2026-09-08T10:00:00.000Z");
  });
  test(`existing activate_tenant path clears ${mode ?? "missing"} mode and audits it`, async () => {
    const f = fixture({ name: "Agency", status: "suspended", suspensionMode: mode, suspendedAt: "original-cutoff" });
    const response = await f.patch({ action: "activate_tenant", reason: payload.reason, confirmation: "ACTIVER AGENCE" });
    assert.equal(response.status, 200);
    const tenantWrite = f.writes.find(write => write.ref.name === "tenants");
    assert.equal(tenantWrite.patch.suspensionMode, DELETE);
    assert.equal(tenantWrite.patch.suspendedAt, DELETE);
    const audit = f.writes.find(write => write.ref.name === "platformAuditLog").patch;
    assert.equal(audit.metadata.previousSuspensionMode, mode === "commercial" ? "commercial" : "security");
    assert.equal(audit.metadata.nextSuspensionMode, null);
  });
}

// Execute the real stateless UI component with a lightweight JSX tree renderer.
// These interaction checks do not assert visual layout or browser integration.
function render(overrides = {}) {
  const element = (type, props) => ({ type, props });
  const component = load(ui, {
    "react/jsx-runtime": { jsx: element, jsxs: element },
    "lucide-react": {},
    "@/components/ui/badge": { Badge: "badge" },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/card": {},
    "@/components/ui/input": { Input: "input" },
    "@/components/ui/textarea": { Textarea: "textarea" },
    "@/lib/utils": { cn: (...values) => values.filter(Boolean).join(" ") },
    "../format": { formatTime: value => value },
  }).StatusGovernanceAction;
  const props = { tenant: { status: "suspended", suspensionMode: "commercial" }, open: true,
    targetStatus: "suspended", suspensionMode: "security", reason: payload.reason, confirmation: "SUSPENDRE",
    submitting: false, onOpenChange() {}, onTargetChange() {}, onModeChange() {},
    onReasonChange() {}, onConfirmationChange() {}, async onSubmit() {}, ...overrides };
  const nodes = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    nodes.push(node);
    visit(node.props?.children);
  }
  visit(component(props));
  return nodes;
}

test("UI offers both modes and submits commercial -> security without reactivation", async () => {
  let submitted;
  const nodes = render({ async onSubmit(...args) { submitted = args; } });
  assert.equal(nodes.filter(node => node.type === "input" && node.props.type === "radio").length, 2);
  const button = nodes.find(node => node.type === "button" && node.props.children === "Changer le mode de suspension");
  assert.equal(button.props.disabled, false);
  await button.props.onClick();
  assert.deepEqual(submitted, ["suspended", "security"]);
});

test("UI blocks unchanged mode and requires reactivation confirmation", () => {
  for (const overrides of [{ suspensionMode: "commercial" }, { targetStatus: "active", confirmation: "SUSPENDRE" }]) {
    const nodes = render(overrides);
    const submit = nodes.filter(node => node.type === "button").at(-1);
    assert.equal(submit.props.disabled, true);
  }
  const nodes = render({ targetStatus: "active", confirmation: "REACTIVER" });
  assert.equal(nodes.filter(node => node.type === "button").at(-1).props.disabled, false);
});
