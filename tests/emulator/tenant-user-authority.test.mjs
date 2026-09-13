import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, describe, test } from "node:test";

// Parent owns dependencies/config/emulator startup. Run only this suite against
// a dedicated local emulator (rules are shared by all clients of this project):
// npm run test:rules:accounts
// The parent CLI config supplies FIRESTORE_EMULATOR_HOST=127.0.0.1:8091.
// Requires Node 22, Java 21, firebase-tools, firebase 10 and
// @firebase/rules-unit-testing 3.0.4. No Admin SDK, ADC, dotenv or production app.
const PROJECT_ID = "demo-sentrys-accounts";
const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
assert.equal(typeof endpoint, "string", "FIRESTORE_EMULATOR_HOST=<loopback>:<port> is REQUIRED; no skip/fallback");
const match = /^(localhost|127\.0\.0\.1):([0-9]{1,5})$/.exec(endpoint);
assert.ok(match, "Only an explicit localhost or 127.0.0.1 Firestore emulator is allowed");
const host = match[1];
const port = Number(match[2]);
assert.ok(port > 0 && port <= 65535, "Invalid local Firestore emulator port");
for (const key of ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"]) {
  assert.ok(!process.env[key] || process.env[key] === PROJECT_ID,
    `${key} must be unset or demo-sentrys-accounts`);
}

// Capture and validate first, then use only explicit SDK configuration. This
// prevents implicit emulator discovery from also configuring client instances.
// This suite runs in its own Node process; no other suite shares its environment.
delete process.env.FIRESTORE_EMULATOR_HOST;
// Firestore is explicitly configured; no hub discovery/network hop is needed.
delete process.env.FIREBASE_EMULATOR_HUB;

// Guard above runs before importing Firebase or opening any connection.
const { initializeTestEnvironment, assertSucceeds } = await import("@firebase/rules-unit-testing");
const { doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, writeBatch, Timestamp, setLogLevel } =
  await import("firebase/firestore");
// Expected denials are assertions below; silence SDK diagnostics, not test failures.
setLogLevel("silent");
const rules = await readFile(new URL("../../firestore.rules", import.meta.url), "utf8");
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host, port, rules },
  });
});
after(async () => { await env?.cleanup(); });

const ACTORS = [
  ...["agent", "client", "viewer", "manager", "admin", "owner", "super_admin"].map(role => ({ role, platform: false })),
  { role: "super_admin", platform: true },
];
const AUTHORITY = ["role", "status", "tenantId", "agentId", "uid", "createdAt", "createdBy"];
const CREATED = Timestamp.fromMillis(Date.UTC(2026, 0, 1));
const UPDATED = Timestamp.fromMillis(Date.UTC(2026, 0, 2));
const label = actor => `${actor.role}/${actor.platform ? "platform" : "agency"}`;
const tenantUser = (uid, tenantId, role = "viewer") => ({
  uid, tenantId, role, status: "active", agentId: `${uid}-agent`,
  name: "Fixture account", createdAt: CREATED, createdBy: "fixture-server", updatedAt: CREATED,
});

// Assert the actual denial code: unavailable/timeouts/config errors cannot pass.
async function denied(operation) {
  await assert.rejects(operation, error => {
    assert.equal(error.code, "permission-denied", "Expected a rules denial, not an infrastructure failure");
    return true;
  });
}

async function fixture(t, actor, { status = "active", missingField, target = "self" } = {}) {
  const id = `sec01-${randomUUID()}`;
  const uid = `${id}-actor`;
  const peerUid = `${id}-peer`;
  const tenantId = actor.platform ? "platform" : `${id}-agency`;
  const foreignTenantId = `${id}-foreign`;
  const account = tenantUser(uid, tenantId, actor.role);
  if (status === "missing") delete account.status;
  else account.status = status;
  const peer = tenantUser(peerUid, tenantId);
  const targetUid = target === "self" ? uid : peerUid;
  const targetData = target === "self" ? account : peer;
  if (missingField) delete targetData[missingField];
  const siteId = `${id}-site`;
  const incidentId = `${id}-incident`;
  const assignmentId = `${id}-assignment`;
  const site = {
    tenantId, name: "Fixture site", isActive: true,
    managerIds: [uid], agentIds: [], accessUids: [uid],
    createdAt: CREATED, createdBy: "fixture-server",
  };
  const incident = {
    tenantId, siteId, description: "Fixture incident", status: "ouvert", severity: "faible",
    createdAt: CREATED, createdBy: uid,
  };
  const rows = new Map([
    [`tenantUsers/${uid}`, account], [`tenantUsers/${peerUid}`, peer],
    [`tenants/${tenantId}`, { name: "Active fixture agency", status: "active" }],
    [`tenants/${foreignTenantId}`, { name: "Foreign fixture" }],
    [`sites/${siteId}`, site], [`incidents/${incidentId}`, incident],
    [`assignments/${assignmentId}`, {
      tenantId, agentId: uid, vacationId: `${id}-vacation`, siteId,
      status: "planned", createdAt: CREATED, createdBy: "fixture-server",
    }],
  ]);
  const ownedPaths = new Set();
  const own = path => { ownedPaths.add(path); return path; };
  // Registered before seeding: partial fixture failures are cleaned too.
  t.after(async () => {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      const batch = writeBatch(db);
      for (const path of ownedPaths) batch.delete(doc(db, path));
      await batch.commit();
    });
  });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const path of rows.keys()) {
      assert.equal((await getDoc(doc(db, path))).exists(), false, `Fixture collision: ${path}`);
    }
    const batch = writeBatch(db);
    for (const [path, data] of rows) batch.set(doc(db, own(path)), data);
    await batch.commit();
  });
  const db = env.authenticatedContext(uid).firestore();
  return {
    db, uid, peerUid, tenantId, foreignTenantId, targetUid, targetData, site, incident,
    siteId, incidentId, assignmentId, own,
    targetRef: doc(db, `tenantUsers/${targetUid}`),
  };
}

function replacement(field, f) {
  return {
    role: f.targetData.role === "super_admin" ? "owner" : "super_admin",
    status: f.targetData.status === "disabled" ? "active" : "disabled",
    tenantId: f.foreignTenantId, agentId: "forged-agent", uid: "forged-uid",
    createdAt: UPDATED, createdBy: "forged-creator",
  }[field];
}

describe("SEC-01: tenantUsers authority is server-owned", { concurrency: false }, () => {
  for (const actor of ACTORS) {
    for (const target of ["self", "other"]) {
      for (const field of AUTHORITY) {
        for (const operation of ["add", "remove", "replace"]) {
          test(`${label(actor)} ${target}: deny ${operation} ${field}`, async t => {
            const f = await fixture(t, actor, { target, missingField: operation === "add" ? field : undefined });
            assert.equal(Object.hasOwn(f.targetData, field), operation !== "add");
            await denied(updateDoc(f.targetRef, {
              [field]: operation === "remove" ? deleteField() : replacement(field, f),
            }));
            // A rejected write must leave every field intact, checked server-side.
            await env.withSecurityRulesDisabled(async context => {
              const snapshot = await getDoc(doc(context.firestore(), `tenantUsers/${f.targetUid}`));
              assert.deepEqual(snapshot.data(), f.targetData);
            });
          });
        }
      }
      test(`${label(actor)} ${target}: deny full replacement omitting authority`, async t => {
        const f = await fixture(t, actor, { target });
        await denied(setDoc(f.targetRef, { name: "Replacement", updatedAt: UPDATED }));
      });
      test(`${label(actor)} ${target}: deny document deletion`, async t => {
        const f = await fixture(t, actor, { target });
        await denied(deleteDoc(f.targetRef));
      });
    }
    test(`${label(actor)}: deny direct account provisioning`, async t => {
      const f = await fixture(t, actor);
      const newUid = `${f.uid}-new`;
      await denied(setDoc(doc(f.db, f.own(`tenantUsers/${newUid}`)), tenantUser(newUid, f.tenantId)));
    });
    test(`${label(actor)}: active self read and name + updatedAt update succeed`, async t => {
      const f = await fixture(t, actor);
      assert.equal((await assertSucceeds(getDoc(f.targetRef))).data().uid, f.uid);
      // SEC-01 requested profile allowlist; parent owns final profile inventory.
      await assertSucceeds(updateDoc(f.targetRef, { name: "Updated fixture", updatedAt: UPDATED }));
      assert.deepEqual((await getDoc(f.targetRef)).data(), {
        ...f.targetData, name: "Updated fixture", updatedAt: UPDATED,
      });
    });
    test(`${label(actor)}: deny third-party profile update`, async t => {
      const f = await fixture(t, actor, { target: "other" });
      await denied(updateDoc(f.targetRef, { name: "Third party", updatedAt: UPDATED }));
    });
    for (const [field, value, type] of [
      ["name", 123, "number"], ["name", null, "null"],
      ["updatedAt", "2026-01-02", "string"], ["updatedAt", null, "null"],
    ]) {
      test(`${label(actor)}: deny invalid profile type ${field}=${type}`, async t => {
        const f = await fixture(t, actor);
        await denied(updateDoc(f.targetRef, { [field]: value }));
      });
    }
    for (const field of ["displayName", "phone", "photoURL", "permissions", "siteIds"]) {
      test(`${label(actor)}: deny profile field outside name/updatedAt: ${field}`, async t => {
        const f = await fixture(t, actor);
        await denied(updateDoc(f.targetRef, { [field]: field.endsWith("s") ? ["fixture"] : "fixture" }));
      });
    }
    test(`${label(actor)}: intertenant read canary`, async t => {
      const f = await fixture(t, actor);
      await denied(getDoc(doc(f.db, `tenants/${f.foreignTenantId}`)));
    });
    for (const status of ["disabled", "missing"]) {
      test(`${label(actor)} ${status}: self remains readable but profile is not writable`, async t => {
        const f = await fixture(t, actor, { status });
        await assertSucceeds(getDoc(f.targetRef));
        await denied(updateDoc(f.targetRef, { name: "Inactive edit", updatedAt: UPDATED }));
      });
      test(`${label(actor)} ${status}: cannot reactivate self`, async t => {
        const f = await fixture(t, actor, { status });
        await denied(updateDoc(f.targetRef, { status: "active" }));
      });
      // Each path has its own test/fixtures so one unexpected success cannot
      // prevent execution of the other business-write checks.
      for (const operation of ["incident-create", "comment-create", "assignment-update", "site-update"]) {
        test(`${label(actor)} ${status}: deny business ${operation}`, async t => {
          const f = await fixture(t, actor, { status });
          const actions = {
            "incident-create": () => setDoc(doc(f.db, f.own(`incidents/${f.uid}-new`)), f.incident),
            "comment-create": () => setDoc(doc(f.db, f.own(`incidents/${f.incidentId}/comments/new`)), { text: "Fixture comment" }),
            "assignment-update": () => updateDoc(doc(f.db, `assignments/${f.assignmentId}`), { status: "confirmed" }),
            "site-update": () => updateDoc(doc(f.db, `sites/${f.siteId}`), { name: "Changed site" }),
          };
          await denied(actions[operation]());
        });
      }
    }
    test(`${label(actor)} active: legitimate business incident creation succeeds`, async t => {
      const f = await fixture(t, actor);
      await assertSucceeds(setDoc(doc(f.db, f.own(`incidents/${f.uid}-positive`)), f.incident));
    });
    if (["manager", "admin", "owner", "super_admin"].includes(actor.role)) {
      test(`${label(actor)} active: same-agency account read and site management succeed`, async t => {
        const f = await fixture(t, actor);
        await assertSucceeds(getDoc(doc(f.db, `tenantUsers/${f.peerUid}`)));
        await assertSucceeds(updateDoc(doc(f.db, `sites/${f.siteId}`), { name: "Managed site" }));
        const path = f.own(`sites/${f.uid}-created`);
        await assertSucceeds(setDoc(doc(f.db, path), f.site));
      });
    }
  }

  // Profile boundaries are role-independent; keep these checks outside the
  // authority cross-product. Every role already has its own profile smoke test.
  for (const [description, patch] of [
    ["empty name", { name: "" }],
    ["121-character name", { name: "n".repeat(121) }],
    ["name deletion", { name: deleteField() }],
    ["updatedAt deletion", { updatedAt: deleteField() }],
  ]) {
    test(`active self profile: deny ${description}`, async t => {
      const f = await fixture(t, { role: "viewer", platform: false });
      await denied(updateDoc(f.targetRef, patch));
    });
  }
  for (const [description, patch] of [
    ["name alone at 120-character limit", { name: "n".repeat(120) }],
    ["updatedAt alone", { updatedAt: UPDATED }],
  ]) {
    test(`active self profile: allow ${description}`, async t => {
      const f = await fixture(t, { role: "viewer", platform: false });
      await assertSucceeds(updateDoc(f.targetRef, patch));
      assert.deepEqual((await getDoc(f.targetRef)).data(), { ...f.targetData, ...patch });
    });
  }

  for (const identity of ["unauthenticated", "authenticated-without-tenantUsers"]) {
    for (const operation of ["profile-update", "authority-update", "account-create", "incident-create"]) {
      test(`${identity}: deny ${operation}`, async t => {
        const f = await fixture(t, { role: "viewer", platform: false });
        const missingUid = `${f.uid}-missing`;
        const db = identity === "unauthenticated"
          ? env.unauthenticatedContext().firestore()
          : env.authenticatedContext(missingUid).firestore();
        // No account for missingUid is seeded; only its attempted create path
        // is registered for cleanup in case the rules unexpectedly allow it.
        const actions = {
          "profile-update": () => updateDoc(doc(db, `tenantUsers/${f.uid}`), { name: "Untrusted edit" }),
          "authority-update": () => updateDoc(doc(db, `tenantUsers/${f.uid}`), { role: "super_admin" }),
          "account-create": () => setDoc(doc(db, f.own(`tenantUsers/${missingUid}`)), tenantUser(missingUid, f.tenantId)),
          "incident-create": () => setDoc(doc(db, f.own(`incidents/${missingUid}`)), f.incident),
        };
        await denied(actions[operation]());
      });
    }
  }

  test("server fixture bypass can provision and update every authority field", async t => {
    const f = await fixture(t, { role: "admin", platform: false });
    const path = f.own(`tenantUsers/${f.uid}-provisioned`);
    await env.withSecurityRulesDisabled(async context => {
      const ref = doc(context.firestore(), path);
      const provisioned = tenantUser(`${f.uid}-provisioned`, f.tenantId, "agent");
      await assertSucceeds(setDoc(ref, provisioned));
      const changed = Object.fromEntries(AUTHORITY.map(field => [field, replacement(field, f)]));
      await assertSucceeds(updateDoc(ref, changed));
      assert.deepEqual((await getDoc(ref)).data(), { ...provisioned, ...changed });
    });
  });
});
