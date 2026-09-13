import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, describe, test } from "node:test";

// Parent coordinates the emulator and runs this file in a separate Node process:
// node --test --experimental-test-isolation=none tests/emulator/immutable-fields.test.mjs
// Requires Node 22, Firebase 10, rules-unit-testing 3.0.4 and the local emulator.
// No production SDK, credentials, dotenv, global data purge or suspension policy.
const PROJECT_ID = "demo-sentrys-accounts";
const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
assert.equal(typeof endpoint, "string", "FIRESTORE_EMULATOR_HOST is REQUIRED; no skip/fallback");
const match = /^(localhost|127\.0\.0\.1):([0-9]{1,5})$/.exec(endpoint);
assert.ok(match, "Only explicit localhost or 127.0.0.1:<port> is allowed");
const host = match[1];
const port = Number(match[2]);
assert.ok(port > 0 && port <= 65535, "Invalid local Firestore emulator port");
for (const key of ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"]) {
  assert.ok(!process.env[key] || process.env[key] === PROJECT_ID,
    `${key} must be unset or demo-sentrys-accounts`);
}
// Explicit validated configuration only; no second implicit SDK/hub connection.
delete process.env.FIRESTORE_EMULATOR_HOST;
delete process.env.FIREBASE_EMULATOR_HUB;

const { initializeTestEnvironment, assertSucceeds } = await import("@firebase/rules-unit-testing");
const { doc, getDoc, updateDoc, deleteField, writeBatch, Timestamp, setLogLevel } =
  await import("firebase/firestore");
setLogLevel("silent"); // Assertions, including unexpected error codes, remain visible.
const rules = await readFile(new URL("../../firestore.rules", import.meta.url), "utf8");
let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { host, port, rules } });
});
after(async () => { await env?.cleanup(); });

const CREATED = Timestamp.fromMillis(Date.UTC(2026, 0, 1));
const CHANGED = Timestamp.fromMillis(Date.UTC(2026, 0, 2));
const COMMON = ["tenantId", "createdAt", "createdBy"];
// Explicit expected contracts, not extracted from rules: deleting a protection
// in the implementation must not also delete its regression test.
const BRANCHES = [
  { collection: "sites", role: "manager", branch: "manager", fields: COMMON, patch: { name: "Updated site" } },
  { collection: "agents", role: "manager", branch: "manager", fields: COMMON, patch: { firstName: "Updated" } },
  { collection: "incidents", role: "manager", branch: "manager", fields: [...COMMON, "siteId"], patch: { description: "Updated incident" } },
  { collection: "incidents", role: "agent", branch: "agent", fields: [...COMMON, "siteId", "severity", "siteName"], patch: { description: "Updated incident" } },
  { collection: "vacations", role: "manager", branch: "manager", fields: COMMON, patch: { requiredAgents: 2 } },
  { collection: "assignments", role: "manager", branch: "manager", fields: [...COMMON, "agentId", "vacationId"], patch: { status: "confirmed" } },
  { collection: "assignments", role: "agent", branch: "self", fields: [...COMMON, "agentId", "vacationId", "siteId"], patch: { status: "confirmed" } },
];

async function denied(operation) {
  await assert.rejects(operation, error => {
    assert.equal(error.code, "permission-denied", "Infrastructure failures are not rules denials");
    return true;
  });
}

async function fixture(t, spec, { missingField, foreign = false } = {}) {
  const id = `sec03-${randomUUID()}`;
  const uid = `${id}-actor`;
  const tenantId = `${id}-tenant`;
  const otherTenantId = `${id}-other-tenant`;
  const resourceTenantId = foreign ? otherTenantId : tenantId;
  const siteId = `${id}-site`;
  const alternateSiteId = `${id}-alternate-site`;
  const targetPath = `${spec.collection}/${id}-target`;
  const common = { tenantId: resourceTenantId, createdAt: CREATED, createdBy: "fixture-server" };
  const site = {
    ...common, name: "Fixture site", isActive: true,
    managerIds: spec.role === "manager" ? [uid] : [],
    agentIds: spec.role === "agent" ? [uid] : [], accessUids: [uid],
  };
  const data = {
    sites: { ...site },
    agents: { ...common, firstName: "Fixture", lastName: "Agent", status: "active" },
    incidents: { ...common, siteId, siteName: "Fixture site", description: "Fixture incident", severity: "faible", status: "ouvert" },
    vacations: { ...common, siteId, startAt: CREATED, endAt: CHANGED, requiredAgents: 1 },
    assignments: {
      ...common, siteId, vacationId: `${id}-vacation`, status: "planned",
      // Manager must not qualify for the self branch (even for malformed rows).
      agentId: spec.branch === "self" ? uid : `${id}-different-agent`,
    },
  }[spec.collection];
  if (missingField) delete data[missingField];
  const rows = new Map([
    [`tenantUsers/${uid}`, { uid, tenantId, role: spec.role, status: "active", name: "Fixture actor" }],
    [`tenants/${tenantId}`, { name: "Active fixture agency", status: "active" }],
    [`tenants/${otherTenantId}`, { name: "Foreign fixture agency", status: "active" }],
    [`sites/${siteId}`, site],
    // Replacing siteId uses a real, assigned site in the same resource tenant,
    // so a missing-site failure cannot conceal a broken immutable-field rule.
    [`sites/${alternateSiteId}`, { ...site, name: "Alternate fixture site" }],
    [targetPath, data],
  ]);
  t.after(async () => {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      const batch = writeBatch(db);
      for (const path of rows.keys()) batch.delete(doc(db, path));
      await batch.commit();
    });
  });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const batch = writeBatch(db);
    for (const [path, value] of rows) batch.set(doc(db, path), value);
    await batch.commit();
  });
  const db = env.authenticatedContext(uid).firestore();
  return {
    ref: doc(db, targetPath), data, targetPath,
    replacement: {
      tenantId: otherTenantId, createdAt: CHANGED, createdBy: "changed-creator",
      siteId: alternateSiteId, severity: "elevee", siteName: "Changed site name",
      agentId: `${id}-changed-agent`, vacationId: `${id}-changed-vacation`,
    },
  };
}

describe("SEC-03: immutable fields on actual repository rules", { concurrency: false }, () => {
  for (const spec of BRANCHES) {
    const label = `${spec.collection}/${spec.branch}`;
    for (const field of spec.fields) {
      for (const operation of ["add", "remove", "replace"]) {
        test(`${label}: deny ${operation} ${field}`, async t => {
          const f = await fixture(t, spec, { missingField: operation === "add" ? field : undefined });
          assert.equal(Object.hasOwn(f.data, field), operation !== "add");
          if (operation === "replace") assert.notDeepEqual(f.data[field], f.replacement[field]);
          // Missing tenantId, agent-incident siteId, or self-assignment agentId
          // also invalidates the existing authorization predicate. Those add
          // cases establish end-to-end denial, not isolation of forbidChange.
          await denied(updateDoc(f.ref, {
            [field]: operation === "remove" ? deleteField() : f.replacement[field],
          }));
          await env.withSecurityRulesDisabled(async context => {
            assert.deepEqual((await getDoc(doc(context.firestore(), f.targetPath))).data(), f.data);
          });
        });
      }
    }
    test(`${label}: active authorized actor can update a nonprotected business field`, async t => {
      const f = await fixture(t, spec);
      await assertSucceeds(updateDoc(f.ref, spec.patch));
      assert.deepEqual((await assertSucceeds(getDoc(f.ref))).data(), { ...f.data, ...spec.patch });
    });
    test(`${label}: deny cross-tenant nonprotected update`, async t => {
      // Keep site assignment/self identity satisfied to exercise tenant isolation.
      const f = await fixture(t, spec, { foreign: true });
      await denied(updateDoc(f.ref, spec.patch));
      await env.withSecurityRulesDisabled(async context => {
        assert.deepEqual((await getDoc(doc(context.firestore(), f.targetPath))).data(), f.data);
      });
    });
  }
});
