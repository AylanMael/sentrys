import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, describe, test } from "node:test";

// Parent owns emulator startup. Run this file in its own process, sequentially
// on the dedicated demo project: never concurrently with another suite.
// No Admin SDK, ADC, dotenv, implicit host discovery or production app.
const PROJECT_ID = "demo-sentrys-accounts";
const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
assert.equal(typeof endpoint, "string", "Explicit loopback FIRESTORE_EMULATOR_HOST required; no fallback");
const match = /^(localhost|127\.0\.0\.1):([0-9]{1,5})$/.exec(endpoint);
assert.ok(match, "Only localhost or 127.0.0.1 is allowed");
const host = match[1];
const port = Number(match[2]);
assert.ok(port > 0 && port <= 65535, "Invalid emulator port");
for (const key of ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"]) {
  assert.ok(!process.env[key] || process.env[key] === PROJECT_ID,
    `${key} must be unset or ${PROJECT_ID}`);
}
delete process.env.FIRESTORE_EMULATOR_HOST;
delete process.env.FIREBASE_EMULATOR_HUB;

// Validate the destination before importing Firebase or opening a connection.
const { initializeTestEnvironment, assertSucceeds } = await import("@firebase/rules-unit-testing");
const { doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, writeBatch, Timestamp, setLogLevel } =
  await import("firebase/firestore");
setLogLevel("silent");
const rules = await readFile(new URL("../../firestore.rules", import.meta.url), "utf8");
let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { host, port, rules } });
});
after(async () => { await env?.cleanup(); });

const ACTORS = [
  ...["agent", "client", "viewer", "manager", "admin", "owner", "super_admin", "unknown", "support"]
    .map(role => ({ role, platform: false })),
  { role: "super_admin", platform: true },
];
const CREATED = Timestamp.fromMillis(Date.UTC(2026, 0, 1));
const tenant = () => ({
  name: "Fixture agency", status: "active", planId: "starter", plan: "starter",
  billing: { plan: "starter", limits: { agents: 5 } },
  subscription: { planId: "starter", status: "trialing" },
  onboarding: { status: "pending_setup" }, provisioning: { status: "pending" },
  limits: { agents: 5 }, createdAt: CREATED, createdBy: "fixture-server",
});
const REPLACEMENTS = {
  status: "suspended", planId: "growth", plan: "growth",
  billing: { plan: "growth", limits: { agents: 999999 } },
  subscription: { planId: "growth", status: "active" },
  onboarding: { status: "active" }, provisioning: { status: "complete" },
  limits: { agents: 999999 }, name: "Browser rename",
  createdAt: Timestamp.fromMillis(Date.UTC(2026, 0, 2)), createdBy: "browser",
};

async function denied(operation) {
  await assert.rejects(operation, error => {
    assert.equal(error.code, "permission-denied", "Infrastructure errors must not pass as rules denials");
    return true;
  });
}

async function fixture(t, actor, { missingField, tenantStatus = "active" } = {}) {
  const id = `sec03-${randomUUID()}`;
  const uid = `${id}-actor`;
  const tenantId = actor.platform ? "platform" : `${id}-agency`;
  const foreignTenantId = `${id}-foreign`;
  const data = tenant();
  data.status = tenantStatus;
  if (missingField) delete data[missingField];
  const rows = new Map([
    [`tenantUsers/${uid}`, { uid, tenantId, role: actor.role, status: "active" }],
    [`tenants/${tenantId}`, data],
    [`tenants/${foreignTenantId}`, tenant()],
  ]);
  const owned = new Set();
  const own = path => { owned.add(path); return path; };
  t.after(async () => {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      const batch = writeBatch(db);
      for (const path of owned) batch.delete(doc(db, path));
      await batch.commit();
    });
  });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    // Refuse to overwrite a pre-existing fixture, including tenants/platform.
    for (const path of rows.keys()) {
      assert.equal((await getDoc(doc(db, path))).exists(), false, `Fixture collision: ${path}`);
    }
    const batch = writeBatch(db);
    for (const [path, value] of rows) batch.set(doc(db, own(path)), value);
    await batch.commit();
  });
  const db = env.authenticatedContext(uid).firestore();
  return { db, uid, tenantId, foreignTenantId, data, own, ref: doc(db, `tenants/${tenantId}`) };
}

async function unchanged(f) {
  await env.withSecurityRulesDisabled(async context => {
    assert.deepEqual((await getDoc(doc(context.firestore(), `tenants/${f.tenantId}`))).data(), f.data);
  });
}

describe("SEC-03: tenant documents are server-owned", { concurrency: false }, () => {
  for (const actor of ACTORS) {
    const label = `${actor.role}/${actor.platform ? "platform" : "agency"}`;
    for (const [field, value] of Object.entries(REPLACEMENTS)) {
      for (const operation of ["add", "remove", "replace"]) {
        test(`${label}: deny ${operation} ${field}`, async t => {
          const f = await fixture(t, actor, { missingField: operation === "add" ? field : undefined });
          assert.equal(Object.hasOwn(f.data, field), operation !== "add");
          await denied(updateDoc(f.ref, { [field]: operation === "remove" ? deleteField() : value }));
          await unchanged(f);
        });
      }
    }
    for (const field of ["billing.limits.agents", "subscription.status", "onboarding.status", "provisioning.status"]) {
      test(`${label}: deny nested ${field} update`, async t => {
        const f = await fixture(t, actor);
        await denied(updateDoc(f.ref, { [field]: field.endsWith("agents") ? 999999 : "active" }));
        await unchanged(f);
      });
    }
    for (const operation of ["overwrite", "merge", "delete", "create"]) {
      test(`${label}: deny document ${operation}`, async t => {
        const f = await fixture(t, actor);
        const newRef = doc(f.db, f.own(`tenants/${f.uid}-new`));
        const actions = {
          overwrite: () => setDoc(f.ref, { name: "Replacement", status: "active" }),
          merge: () => setDoc(f.ref, { status: "suspended" }, { merge: true }),
          delete: () => deleteDoc(f.ref),
          create: () => setDoc(newRef, tenant()),
        };
        await denied(actions[operation]());
        await unchanged(f);
        await env.withSecurityRulesDisabled(async context => {
          assert.equal((await getDoc(doc(context.firestore(), newRef.path))).exists(), false);
        });
      });
    }
    test(`${label}: active member same-tenant read remains allowed`, async t => {
      const f = await fixture(t, actor);
      assert.deepEqual((await assertSucceeds(getDoc(f.ref))).data(), f.data);
    });
    test(`${label}: active agency also denies browser mutations`, async t => {
      const f = await fixture(t, actor, { tenantStatus: "active" });
      await denied(updateDoc(f.ref, { status: "suspended" }));
      await denied(updateDoc(f.ref, { name: "Browser rename" }));
      await denied(updateDoc(f.ref, { "billing.limits.agents": 999999 }));
      await denied(setDoc(f.ref, { name: "Replacement", status: "active" }));
      await denied(deleteDoc(f.ref));
      await unchanged(f);
      assert.deepEqual((await assertSucceeds(getDoc(f.ref))).data(), f.data);
    });
    test(`${label}: cannot provision own missing tenant document`, async t => {
      const f = await fixture(t, actor, { tenantStatus: "active" });
      // Keep the active membership, remove only this test's tenant fixture.
      await env.withSecurityRulesDisabled(async context => {
        await deleteDoc(doc(context.firestore(), f.ref.path));
      });
      await denied(setDoc(f.ref, f.data));
      await env.withSecurityRulesDisabled(async context => {
        assert.equal((await getDoc(doc(context.firestore(), f.ref.path))).exists(), false);
      });
    });
    test(`${label}: foreign tenant read and write remain denied`, async t => {
      const f = await fixture(t, actor);
      const ref = doc(f.db, `tenants/${f.foreignTenantId}`);
      await denied(getDoc(ref));
      await denied(updateDoc(ref, { status: "active" }));
    });
  }

  for (const identity of ["unauthenticated", "missing-account"]) {
    test(`${identity}: deny read and browser mutations`, async t => {
      const f = await fixture(t, { role: "viewer", platform: false });
      const db = identity === "unauthenticated" ? env.unauthenticatedContext().firestore()
        : env.authenticatedContext(`${f.uid}-missing`).firestore();
      const ref = doc(db, `tenants/${f.tenantId}`);
      await denied(getDoc(ref));
      await denied(updateDoc(ref, { status: "active" }));
      await denied(setDoc(ref, { name: "Replacement" }));
      await denied(deleteDoc(ref));
      await denied(setDoc(doc(db, f.own(`tenants/${f.uid}-new`)), tenant()));
      await unchanged(f);
    });
  }

  test("backend fixture bypass can provision, modify and delete a tenant", async t => {
    const f = await fixture(t, { role: "owner", platform: false });
    const path = f.own(`tenants/${f.uid}-backend`);
    await env.withSecurityRulesDisabled(async context => {
      const ref = doc(context.firestore(), path);
      await assertSucceeds(setDoc(ref, tenant()));
      await assertSucceeds(updateDoc(ref, REPLACEMENTS));
      assert.deepEqual((await getDoc(ref)).data(), { ...tenant(), ...REPLACEMENTS });
      await assertSucceeds(deleteDoc(ref));
      assert.equal((await getDoc(ref)).exists(), false);
    });
  });
});
