import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, describe, test } from "node:test";

// Parent starts Firestore AND Storage on explicit loopback ports. Separate Node
// process, sequential with the other suites; no emulator invocation in this file.
const PROJECT_ID = "demo-sentrys-accounts";
function endpoint(key) {
  const value = process.env[key];
  assert.equal(typeof value, "string", `${key} required; no skip/fallback`);
  const match = /^(localhost|127\.0\.0\.1):([0-9]{1,5})$/.exec(value);
  assert.ok(match, `${key} must be explicit localhost or 127.0.0.1:<port>`);
  const port = Number(match[2]);
  assert.ok(port > 0 && port <= 65535, `Invalid ${key} port`);
  return { host: match[1], port };
}
const firestoreEndpoint = endpoint("FIRESTORE_EMULATOR_HOST");
const storageEndpoint = endpoint("FIREBASE_STORAGE_EMULATOR_HOST");
for (const key of ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"]) {
  assert.ok(!process.env[key] || process.env[key] === PROJECT_ID, `${key} must match demo-sentrys-accounts`);
}
delete process.env.FIRESTORE_EMULATOR_HOST;
delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;
delete process.env.FIREBASE_EMULATOR_HUB;
const { initializeTestEnvironment, assertSucceeds } = await import("@firebase/rules-unit-testing");
const { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, Timestamp, setLogLevel } = await import("firebase/firestore");
setLogLevel("silent");
const firestoreRules = await readFile(new URL("../../firestore.rules", import.meta.url), "utf8");
const storageRules = await readFile(new URL("../../storage.rules", import.meta.url), "utf8");
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { ...firestoreEndpoint, rules: firestoreRules },
    storage: { ...storageEndpoint, rules: storageRules },
  });
});
after(async () => { await env?.cleanup(); });
async function denied(operation, code = "permission-denied") {
  await assert.rejects(operation, error => {
    assert.equal(error.code, code, "Expected authorization denial, not infrastructure failure");
    return true;
  });
}
const STATES = [
  { key: "active", data: { status: "active" }, read: true, write: true },
  { key: "pending_setup", data: { status: "pending_setup" }, read: true, write: true },
  { key: "legacy-inactive", data: { status: "inactive" }, read: true, write: true },
  { key: "legacy-no-status", data: {}, read: true, write: true },
  { key: "commercial", data: { status: "suspended", suspensionMode: "commercial" }, read: true, write: false },
  { key: "security", data: { status: "suspended", suspensionMode: "security" }, read: false, write: false },
  { key: "missing-mode", data: { status: "suspended" }, read: false, write: false },
  { key: "invalid-mode", data: { status: "suspended", suspensionMode: "typo" }, read: false, write: false },
  { key: "null-mode", data: { status: "suspended", suspensionMode: null }, read: false, write: false },
  { key: "missing-tenant", data: null, read: false, write: false },
];
const state = key => STATES.find(value => value.key === key);

async function fixture(t, policy, { role = "admin", platform = false, fallbackUid = false,
  memberStatus = "active", vacationPatch = {}, tenantPatch = {}, incidentPatch = {}, storage = false } = {}) {
  const id = `sec03b-${randomUUID()}`;
  const uid = `${id}-user`;
  const tenantId = platform ? "platform" : `${id}-tenant`;
  const agentId = fallbackUid ? uid : `${id}-agent`;
  const now = Date.now();
  // Broad margins avoid wall-clock races; equality is tested at suspension time.
  const ts = delta => Timestamp.fromMillis(now + delta);
  const account = { uid, tenantId, role, status: memberStatus, name: "Fixture user", updatedAt: ts(-1000) };
  if (!fallbackUid) account.agentId = agentId;
  if (memberStatus === "missing") delete account.status;
  const tenant = { name: "Fixture agency", ...policy.data, suspendedAt: ts(-1800000), ...tenantPatch };
  const common = { tenantId, createdAt: ts(-7200000), createdBy: "fixture-server" };
  const siteId = `${id}-site`;
  const vacationId = `${id}-vacation`;
  const incidentId = `${id}-incident`;
  const assignmentId = `${id}-assignment`;
  const site = { ...common, name: "Fixture site", isActive: true, managerIds: [uid], agentIds: [], accessUids: [uid] };
  const vacation = { ...common, siteId, startAt: ts(-3600000), endAt: ts(3600000),
    assignedAgentIds: [agentId], status: "planned", requiredAgents: 1, ...vacationPatch };
  const incident = { ...common, createdBy: uid, siteId, vacationId, description: "Fixture report", status: "ouvert", severity: "faible", ...incidentPatch };
  const paths = {
    tenant: `tenants/${tenantId}`, profile: `tenantUsers/${uid}`, peer: `tenantUsers/${id}-peer`,
    sites: `sites/${siteId}`, agents: `agents/${agentId}`, vacations: `vacations/${vacationId}`,
    incidents: `incidents/${incidentId}`, assignments: `assignments/${assignmentId}`,
    comments: `incidents/${incidentId}/comments/existing`,
  };
  const data = {
    sites: site, agents: { ...common, firstName: "Fixture", lastName: "Agent", status: "active" },
    vacations: vacation, incidents: incident,
    assignments: { ...common, siteId, vacationId, agentId, status: "planned" },
    comments: { text: "Fixture comment" },
  };
  const rows = new Map([[paths.profile, account], [paths.peer, { ...account, uid: `${id}-peer` }]]);
  if (policy.data !== null) rows.set(paths.tenant, tenant);
  for (const [key, value] of Object.entries(data)) rows.set(paths[key], value);
  const owned = new Set();
  const objects = new Set();
  const own = path => { owned.add(path); return path; };
  t.after(async () => {
    await env.withSecurityRulesDisabled(async context => {
      if (objects.size) {
        const bucket = context.storage();
        for (const path of objects) await bucket.ref(path).delete().catch(error => {
          if (error.code !== "storage/object-not-found") throw error;
        });
      }
      const db = context.firestore();
      const batch = writeBatch(db);
      for (const path of owned) batch.delete(doc(db, path));
      await batch.commit();
    });
  });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const path of rows.keys()) assert.equal((await getDoc(doc(db, path))).exists(), false, `Fixture collision: ${path}`);
    const batch = writeBatch(db);
    for (const [path, value] of rows) batch.set(doc(db, own(path)), value);
    await batch.commit();
  });
  const context = env.authenticatedContext(uid);
  const db = context.firestore();
  let bucket;
  const filePaths = {};
  if (storage) {
    bucket = context.storage();
    await env.withSecurityRulesDisabled(async bypass => {
      const adminBucket = bypass.storage();
      for (const kind of ["photo", "documents"]) {
        const path = `tenants/${tenantId}/agents/${agentId}/${kind}/${id}.png`;
        objects.add(path);
        await adminBucket.ref(path).put(new Uint8Array([1, 2, 3]), { contentType: "image/png" });
        filePaths[kind] = path;
      }
    });
  }
  return { db, uid, tenantId, agentId, paths, data, account, tenant, vacation, ts, own, bucket, filePaths,
    newFile: kind => {
      const path = `tenants/${tenantId}/agents/${agentId}/${kind}/${id}-new.png`;
      objects.add(path); return bucket.ref(path);
    },
  };
}

describe("SEC-03B tenant suspension, actual Firestore and Storage rules", { concurrency: false }, () => {
  for (const policy of STATES) {
    for (const role of ["admin", "agent"]) {
      test(`${policy.key}/${role}: business reads and diagnostic self profile`, async t => {
        const f = await fixture(t, policy, { role });
        await assertSucceeds(getDoc(doc(f.db, f.paths.profile)));
        for (const key of ["tenant", "sites", "agents", "vacations", "incidents", "assignments", "comments"]) {
          const operation = getDoc(doc(f.db, f.paths[key]));
          if (policy.read) await assertSucceeds(operation); else await denied(operation);
        }
        if (role === "admin") {
          const readPeer = getDoc(doc(f.db, f.paths.peer));
          if (policy.read) await assertSucceeds(readPeer); else await denied(readPeer);
        }
      });
    }
    for (const collection of ["sites", "agents", "vacations", "incidents", "assignments"]) {
      test(`${policy.key}: browser CRUD gates ${collection}`, async t => {
        const f = await fixture(t, policy);
        const fresh = doc(f.db, f.own(`${collection}/${f.uid}-new`));
        const ref = doc(f.db, f.paths[collection]);
        const patch = {
          sites: { name: "Changed site" }, agents: { firstName: "Changed" }, vacations: { requiredAgents: 2 },
          incidents: { description: "Changed" }, assignments: { status: "confirmed" },
        }[collection];
        for (const action of [() => setDoc(fresh, f.data[collection]), () => updateDoc(ref, patch), () => deleteDoc(ref)]) {
          if (policy.write) await assertSucceeds(action()); else await denied(action());
        }
      });
    }
    test(`${policy.key}: profile and comment write gates`, async t => {
      const f = await fixture(t, policy);
      for (const action of [
        () => updateDoc(doc(f.db, f.paths.profile), { name: "Changed profile" }),
        () => setDoc(doc(f.db, f.own(`incidents/${f.paths.incidents.split("/")[1]}/comments/new`)), { text: "New comment" }),
      ]) {
        if (policy.write) await assertSucceeds(action()); else await denied(action());
      }
    });
    for (const role of ["admin", "agent"]) {
      test(`${policy.key}/${role}: Storage existing reads, upload/update/delete gates`, async t => {
        const f = await fixture(t, policy, { role, storage: true });
        for (const kind of ["photo", "documents"]) {
          const ref = f.bucket.ref(f.filePaths[kind]);
          if (policy.read && (role !== "agent" || kind === "photo")) await assertSucceeds(ref.getMetadata());
          else await denied(ref.getMetadata(), "storage/unauthorized");
          for (const action of [
            () => f.newFile(kind).put(new Uint8Array([4]), { contentType: "image/png" }),
            () => ref.put(new Uint8Array([5]), { contentType: "image/png" }), () => ref.delete(),
          ]) {
            // Direct SDK writes are server-only, even for an active agency.
            await denied(action(), "storage/unauthorized");
          }
        }
      });
    }
  }
  for (const fallbackUid of [false, true]) {
    test(`commercial incident exception: ${fallbackUid ? "UID fallback" : "mapped agent ID"}`, async t => {
      const f = await fixture(t, state("commercial"), { role: "agent", fallbackUid });
      await assertSucceeds(setDoc(doc(f.db, f.own(`incidents/${f.uid}-report`)), f.data.incidents));
      // Exception never authorizes pointage, editing incidents, or comments.
      await denied(updateDoc(doc(f.db, f.paths.assignments), { status: "confirmed" }));
      await denied(updateDoc(doc(f.db, f.paths.incidents), { description: "Edit" }));
      await denied(setDoc(doc(f.db, f.own(`${f.paths.incidents}/comments/new`)), { text: "New" }));
      await denied(updateDoc(doc(f.db, f.paths.profile), { name: "Changed" }));
    });
  }
  const INVALID = [
    ["forged author", "incident", "createdBy", "forged-user"],
    ["missing author", "incident", "createdBy", undefined],
    ["missing vacationId", "incident", "vacationId", undefined],
    ["unknown vacationId", "incident", "vacationId", "missing-vacation"],
    ["invalid path vacationId", "incident", "vacationId", "bad/path"],
    ["foreign vacation", "vacation", "tenantId", "foreign"],
    ["different site", "vacation", "siteId", "different-site"],
    ["unassigned agent", "vacation", "assignedAgentIds", []],
    ["missing assignments", "vacation", "assignedAgentIds", undefined],
    ["missing suspendedAt", "tenant", "suspendedAt", undefined],
    ["invalid suspendedAt", "tenant", "suspendedAt", "invalid"],
    ["cancelled", "vacation", "status", "cancelled"],
    ["closed", "vacation", "status", "closed"],
    ["completed", "vacation", "status", "completed"],
    ["absence status", "vacation", "status", "absence"],
    ["absence flag", "vacation", "isAbsence", true],
    ["absence type", "vacation", "type", "absence"],
    ["absence kind", "vacation", "kind", "absence"],
    ["absence title", "vacation", "title", "Congé"],
    ["absence multiline notes", "vacation", "notes", "ligne 1\nabsence"],
    ["absence missionType", "vacation", "missionType", "absence"],
    ["missing startAt", "vacation", "startAt", undefined],
    ["invalid endAt", "vacation", "endAt", "invalid"],
  ];
  for (const [label, entity, field, value] of INVALID) {
    test(`commercial exception refuses ${label}`, async t => {
      const f = await fixture(t, state("commercial"), { role: "agent" });
      const incident = { ...f.data.incidents };
      if (entity === "incident") {
        if (value === undefined) delete incident[field]; else incident[field] = value;
      } else {
        await env.withSecurityRulesDisabled(async context => {
          const target = entity === "vacation" ? { ...f.vacation } : { ...f.tenant };
          if (value === undefined) delete target[field]; else target[field] = value;
          await setDoc(doc(context.firestore(), entity === "vacation" ? f.paths.vacations : f.paths.tenant), target);
        });
      }
      await denied(setDoc(doc(f.db, f.own(`incidents/${f.uid}-report`)), incident));
    });
  }
  for (const timing of ["future", "ended", "started-after-suspension", "equal-suspension"]) {
    test(`commercial exception time: ${timing}`, async t => {
      const f = await fixture(t, state("commercial"), { role: "agent" });
      const changes = {
        future: { startAt: f.ts(3600000), endAt: f.ts(7200000) },
        ended: { endAt: f.ts(-60000) },
        "started-after-suspension": { startAt: f.ts(-600000) },
        "equal-suspension": { startAt: f.tenant.suspendedAt },
      }[timing];
      await env.withSecurityRulesDisabled(async context => { await updateDoc(doc(context.firestore(), f.paths.vacations), changes); });
      const operation = setDoc(doc(f.db, f.own(`incidents/${f.uid}-report`)), f.data.incidents);
      if (timing === "equal-suspension") await assertSucceeds(operation); else await denied(operation);
    });
  }
  test("commercial exception never falls back to UID when agentId is present", async t => {
    const f = await fixture(t, state("commercial"), { role: "agent" });
    await env.withSecurityRulesDisabled(async context => {
      await updateDoc(doc(context.firestore(), f.paths.vacations), { assignedAgentIds: [f.uid] });
    });
    await denied(setDoc(doc(f.db, f.own(`incidents/${f.uid}-report`)), f.data.incidents));
  });
  test("commercial exception follows vacation assignment without requiring site accessUids", async t => {
    const f = await fixture(t, state("commercial"), { role: "agent" });
    await env.withSecurityRulesDisabled(async context => {
      await updateDoc(doc(context.firestore(), f.paths.sites), { managerIds: [], agentIds: [], accessUids: [] });
    });
    await assertSucceeds(setDoc(doc(f.db, f.own(`incidents/${f.uid}-report`)), f.data.incidents));
    await denied(getDoc(doc(f.db, f.paths.sites))); // Existing read RBAC stays unchanged.
  });
  for (const memberStatus of ["disabled", "missing"]) {
    test(`${memberStatus} member cannot use commercial exception or Storage`, async t => {
      const f = await fixture(t, state("commercial"), { role: "agent", memberStatus, storage: true });
      await denied(setDoc(doc(f.db, f.own(`incidents/${f.uid}-report`)), f.data.incidents));
      await denied(getDoc(doc(f.db, f.paths.sites)));
      await denied(f.bucket.ref(f.filePaths.photo).getMetadata(), "storage/unauthorized");
      await assertSucceeds(getDoc(doc(f.db, f.paths.profile)));
    });
  }
  for (const policy of [state("commercial"), state("security")]) {
    test(`agency super_admin cannot bypass ${policy.key}`, async t => {
      const f = await fixture(t, policy, { role: "super_admin", storage: true });
      await denied(updateDoc(doc(f.db, f.paths.sites), { name: "Not recovery" }));
      await denied(f.newFile("photo").put(new Uint8Array([1]), { contentType: "image/png" }), "storage/unauthorized");
      if (!policy.read) await denied(getDoc(doc(f.db, f.paths.tenant)));
    });
    test(`platform super_admin recovery under ${policy.key} preserves original RBAC`, async t => {
      const f = await fixture(t, policy, { role: "super_admin", platform: true, storage: true });
      await assertSucceeds(getDoc(doc(f.db, f.paths.tenant)));
      await assertSucceeds(updateDoc(doc(f.db, f.paths.sites), { name: "Recovery site" }));
      await assertSucceeds(updateDoc(doc(f.db, f.paths.profile), { name: "Recovery profile" }));
      await assertSucceeds(f.bucket.ref(f.filePaths.photo).getMetadata());
      await denied(f.newFile("photo").put(new Uint8Array([1]), { contentType: "image/png" }), "storage/unauthorized");
      await denied(updateDoc(doc(f.db, f.paths.tenant), { status: "active" })); // Still server-owned.
      await denied(getDoc(doc(f.db, `tenants/${f.uid}-foreign`)));
    });
  }
  for (const scenario of [
    { label: "platform admin", role: "admin", memberStatus: "active", policy: "security" },
    { label: "disabled platform super_admin", role: "super_admin", memberStatus: "disabled", policy: "security" },
    { label: "platform super_admin with missing tenant", role: "super_admin", memberStatus: "active", policy: "missing-tenant" },
  ]) {
    test(`${scenario.label}: recovery bypass is unavailable`, async t => {
      const f = await fixture(t, state(scenario.policy), { ...scenario, platform: true, storage: true });
      await denied(getDoc(doc(f.db, f.paths.sites)));
      await denied(updateDoc(doc(f.db, f.paths.sites), { name: "Not recovery" }));
      await denied(f.bucket.ref(f.filePaths.photo).getMetadata(), "storage/unauthorized");
      await assertSucceeds(getDoc(doc(f.db, f.paths.profile)));
    });
  }
  for (const policy of [state("active"), state("commercial")]) {
    test(`${policy.key}: viewer RBAC and foreign actor are not broadened`, async t => {
      const f = await fixture(t, policy, { role: "viewer", storage: true });
      await denied(getDoc(doc(f.db, f.paths.agents)));
      await denied(f.bucket.ref(f.filePaths.photo).getMetadata(), "storage/unauthorized");
      const outsider = `${f.uid}-outsider`;
      const outsiderPath = f.own(`tenantUsers/${outsider}`);
      const foreignTenant = f.own(`tenants/${outsider}`);
      await env.withSecurityRulesDisabled(async context => {
        const db = context.firestore();
        await setDoc(doc(db, foreignTenant), { status: "active" });
        await setDoc(doc(db, outsiderPath), { tenantId: outsider, status: "active", role: "admin" });
      });
      const other = env.authenticatedContext(outsider);
      await denied(getDoc(doc(other.firestore(), f.paths.sites)));
      await denied(other.storage().ref(f.filePaths.photo).getMetadata(), "storage/unauthorized");
    });
  }
});
