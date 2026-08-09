import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));

test("public signup cannot create Firebase accounts or tenant data", () => {
  const signup = read("src/app/(auth)/signup/page.tsx");
  assert.doesNotMatch(signup, /createUserWithEmailAndPassword|setDoc\s*\(/);
  assert.match(signup, /\/contact\?reason=demo/);
});

test("critical recovery and legal routes exist", () => {
  for (const route of ["forgot-password", "forbidden", "conditions", "confidentialite", "support"]) {
    assert.equal(exists(`src/app/${route}/page.tsx`), true, `missing /${route}`);
  }
});

test("contact requests are validated, rate-limited and visible to platform admins", () => {
  const publicApi = read("src/app/api/contact/route.ts");
  const platformApi = read("src/app/api/platform/contact-requests/route.ts");
  assert.match(publicApi, /runTransaction/);
  assert.match(publicApi, /RATE_LIMIT/);
  assert.match(publicApi, /contactRequests/);
  assert.match(platformApi, /isSuperAdmin/);
  assert.match(platformApi, /tenantId !== "platform"/);
});

test("billing page does not pretend Stripe checkout is active", () => {
  const billing = read("src/app/dashboard/billing/page.tsx");
  assert.doesNotMatch(billing, /alert\s*\(|Stripe Checkout en cours/);
  assert.match(billing, /contact\?reason=tarifs/);
});

test("security regression script keeps forbidden production surfaces covered", () => {
  const security = read("scripts/security-regression-check.mjs");
  assert.match(security, /debug\/token/);
  assert.match(security, /debug-admin-key/);
  assert.match(security, /seed/);
});
test("sensitive API failures do not expose internal error messages", () => {
  const me = read("src/app/api/me/route.ts");
  const templates = read("src/app/api/planning-templates/route.ts");
  const bulkVacations = read("src/app/api/vacations/bulk/route.ts");
  assert.doesNotMatch(me, /token\.slice\(|unauthorized\([\s\S]*error\.message/);
  assert.doesNotMatch(templates, /return (?:bad|json)\([\s\S]{0,120}error\.message/);
  assert.doesNotMatch(bulkVacations, /Batch commit failed.*err\.message/);
  assert.match(me, /appLogger\.warning/);
  assert.match(templates, /appLogger\.error/);
  assert.match(bulkVacations, /appLogger\.error/);
});
test("dashboard navigation stays task-oriented and searchable", () => {
  const layout = read("src/app/dashboard/layout.tsx");
  assert.match(layout, /label: "Quotidien"/);
  assert.match(layout, /label: "Répertoire"/);
  assert.match(layout, /Outils avancés/);
  assert.match(layout, /menuGroups\.slice\(0, 2\)/);
  assert.match(layout, /navigationResults/);
  assert.match(layout, /navigationSearchRef\.current\?\.focus/);
  assert.match(layout, /e\.key\.toLowerCase\(\) === "k"/);
  assert.match(layout, /process\.env\.NODE_ENV !== "production"/);
  assert.doesNotMatch(layout, /Recherche d'élite|Profil de commandement|Soutien logistique/);
});
test("dashboard shortcuts open the intended action, not only a list", () => {
  const dashboard = read("src/app/dashboard/page.tsx");
  const incidents = read("src/app/dashboard/incidents/page.tsx");
  assert.match(dashboard, /\/dashboard\/incidents\?new=1/);
  assert.match(dashboard, /Déclarer un incident/);
  assert.match(incidents, /params\.get\("new"\) === "1"/);
  assert.match(incidents, /setDialogOpen\(true\)/);
});
test("unfinished patrol actions stay out of the production experience", () => {
  const layout = read("src/app/dashboard/layout.tsx");
  const patrolsPage = read("src/app/dashboard/patrols/page.tsx");
  const patrolsApi = read("src/app/api/patrols/route.ts");
  const dailyBlock = layout.slice(layout.indexOf('label: "Quotidien"'), layout.indexOf('label: "Répertoire"'));
  assert.doesNotMatch(dailyBlock, /\/dashboard\/patrols/);
  assert.match(layout, /label: "Suivi des rondes"/);
  assert.doesNotMatch(patrolsPage, /seed-patrol|prochainement|Générer une Ronde de Démo|disabled>[^<]*Ouvrir/);
  assert.match(patrolsApi, /canWrite\(auth\.role\)/);
  assert.match(patrolsApi, /appLogger\.error/);
});
test("sites list uses bounded server pagination instead of a tenant-wide subscription", () => {
  const page = read("src/app/dashboard/sites/page.tsx");
  const api = read("src/app/api/sites/route.ts");
  assert.doesNotMatch(page, /onSnapshot|collection\(db, "sites"\)/);
  assert.match(page, /nextCursor/);
  assert.match(page, /Charger les 50 suivants/);
  assert.match(page, /URLSearchParams\(\{ limit: "50" \}\)/);
  assert.match(api, /decodeSiteCursor/);
  assert.match(api, /ref\.limit\(fetchLimit\)\.get\(\)/);
  assert.match(api, /nextCursor/);
  assert.match(api, /cursorSnap\.data\(\)\?\.tenantId !== auth\.tenantId/);
});
test("new vacation form uses searchable server pagination instead of tenant-wide subscriptions", () => {
  const page = read("src/app/dashboard/vacations/new/page.tsx");
  assert.doesNotMatch(page, /onSnapshot|collection\(db, "(?:sites|agents)"\)/);
  assert.match(page, /\/api\/sites\?/);
  assert.match(page, /\/api\/agents\?/);
  assert.match(page, /pageSize: "25"/);
  assert.match(page, /limit: "25"/);
  assert.match(page, /loadSites\(true, sitesCursor\)/);
  assert.match(page, /loadAgents\(true, agentsCursor\)/);
  assert.match(page, /setSiteQuery/);
  assert.match(page, /setAgentQuery/);
});
test("planning catalog selectors use shared searchable pagination", () => {
  const context = read("src/components/dashboard/planning/PlanningContext.tsx");
  const filters = read("src/components/dashboard/planning/PlanningFilters.tsx");
  assert.match(context, /limit: "50"/);
  assert.match(context, /pageSize: "50"/);
  assert.match(context, /sitesCursorRef/);
  assert.match(context, /agentsCursorRef/);
  assert.match(context, /new Map\(\[\.\.\.current, \.\.\.rows\]/);
  assert.match(filters, /loadSiteOptions\(siteSearch, true\)/);
  assert.match(filters, /loadAgentOptions\(agentSearch, true\)/);
  assert.match(filters, /Rechercher un site/);
  assert.match(filters, /Rechercher un agent/);
});
test("vacations list uses server filters and opaque cursor pagination", () => {
  const page = read("src/app/dashboard/vacations/page.tsx");
  const api = read("src/app/api/vacations/route.ts");
  assert.doesNotMatch(page, /qs\.set\("max", "500"\)/);
  assert.match(page, /qs\.set\("limit", String\(pageSize\)\)/);
  assert.match(page, /qs\.set\("q", debouncedSearch\)/);
  assert.match(page, /qs\.set\("coverage", coverage\)/);
  assert.match(page, /nextCursorRef/);
  assert.match(page, /Charger la suite/);
  assert.match(page, /api\/sites\?limit=50/);
  assert.match(api, /decodeVacationCursor/);
  assert.match(api, /cursorSnap\.data\(\)\?\.tenantId !== auth\.tenantId/);
  assert.match(api, /matchesListFilters/);
  assert.match(api, /nextCursor:/);
});
test("command stats uses aggregate counts and bounded map previews", () => {
  const api = read("src/app/api/command/stats/route.ts");
  assert.match(api, /sitesQuery\.count\(\)\.get\(\)/);
  assert.match(api, /activePatrolsQuery\.count\(\)\.get\(\)/);
  assert.match(api, /limit\(MAP_SITE_LIMIT\)/);
  assert.match(api, /limit\(MAP_PATROL_LIMIT\)/);
  assert.match(api, /limit\(INCIDENT_LIMIT\)/);
  assert.doesNotMatch(api, /where\("tenantId"[^\n]+\)\.get\(\)/);
  assert.match(api, /requireTenantUser/);
  assert.match(api, /canReadBackoffice/);
});
test("site incident history uses bounded API cursor pagination", () => {
  const page = read("src/app/dashboard/sites/[id]/page.tsx");
  const api = read("src/app/api/incidents/route.ts");
  assert.doesNotMatch(page, /collection\(db, "incidents"\)|onSnapshot\(\s*qy/);
  assert.match(page, /siteId: id, limit: "10"/);
  assert.match(page, /incidentsCursorRef/);
  assert.match(page, /loadIncidents\(true\)/);
  assert.match(page, /Charger 10 précédents/);
  assert.match(api, /decodeIncidentCursor/);
  assert.match(api, /orderBy\("createdAt", "desc"\)/);
  assert.match(api, /startAfter\(cursorSnap\)/);
  assert.match(api, /nextCursor:/);
  assert.match(api, /cursorSnap\.data\(\)\?\.tenantId !== auth\.tenantId/);
});
test("schedule risk analysis hydrates only referenced context", () => {
  const api = read("src/app/api/ai/schedule-risk/route.ts");
  assert.match(api, /MAX_RANGE_DAYS = 31/);
  assert.match(api, /MAX_VACATIONS = 100/);
  assert.match(api, /limit\(MAX_VACATIONS \+ 1\)/);
  assert.match(api, /vacations\.flatMap/);
  assert.match(api, /adminDb\.getAll/);
  assert.match(api, /Period too dense/);
  assert.match(api, /canReadBackoffice/);
  assert.doesNotMatch(api, /collection\("agents"\)[\s\S]{0,100}where\("tenantId"/);
  assert.doesNotMatch(api, /collection\("sites"\)[\s\S]{0,100}where\("tenantId"/);
  assert.doesNotMatch(api, /email:|phone:|documents:/);
});
test("client order duplicate preview uses bounded temporal windows", () => {
  const api = read("src/app/api/client-orders/[id]/route.ts");
  assert.doesNotMatch(api, /base\.limit\(2500\)|limit\(1500\)/);
  assert.match(api, /VACATION_WINDOW_LIMIT = 500/);
  assert.match(api, /VACATION_CANDIDATE_LIMIT = 2000/);
  assert.match(api, /windowQuery\(scanFrom, input\.to\)\.count\(\)\.get\(\)/);
  assert.match(api, /loadWindow\(windowFrom, middle/);
  assert.match(api, /loadWindow\(middle, windowTo/);
  assert.match(api, /orderBy\("startAt", "asc"\)\.limit\(VACATION_WINDOW_LIMIT\)/);
  assert.match(api, /Periode trop large pour verifier les doublons/);
});
test("incident comments keep bounded realtime and paginate older history", () => {
  const component = read("src/components/incidents/incident-comments.tsx");
  const api = read("src/app/api/incidents/[id]/comments/route.ts");
  assert.match(component, /RECENT_COMMENT_LIMIT = 20/);
  assert.match(component, /orderBy\("createdAt", "desc"\)/);
  assert.match(component, /limit\(RECENT_COMMENT_LIMIT\)/);
  assert.match(component, /\/comments\?\$\{params\}/);
  assert.match(component, /Charger 20 commentaires précédents/);
  assert.match(api, /decodeCursor/);
  assert.match(api, /orderBy\("createdAt", "desc"\)/);
  assert.match(api, /startAfter\(cursor\)/);
  assert.match(api, /limit\(limit \+ 1\)/);
  assert.match(api, /data\?\.tenantId !== auth\.tenantId/);
  assert.match(api, /nextCursor:/);
});
test("operations cockpit uses temporal windows, aggregates and referenced hydration", () => {
  const api = read("src/app/api/operations/cockpit/route.ts");
  assert.doesNotMatch(api, /collection\("vacations"\)[\s\S]{0,120}limit\(5000\)/);
  assert.doesNotMatch(api, /collection\("agents"\)[\s\S]{0,120}limit\(1000\)/);
  assert.doesNotMatch(api, /collection\("sites"\)[\s\S]{0,120}limit\(1000\)/);
  assert.doesNotMatch(api, /operationSignalStates[\s\S]{0,120}limit\(1000\)/);
  assert.match(api, /TODAY_VACATION_LIMIT = 500/);
  assert.match(api, /CARRYOVER_VACATION_LIMIT = 100/);
  assert.match(api, /where\("startAt", ">=", todayStart\)/);
  assert.match(api, /count\(\)\.get\(\)/);
  assert.match(api, /referencedSiteIds/);
  assert.match(api, /referencedAgentIds/);
  assert.match(api, /adminDb\.getAll/);
  assert.match(api, /operationSignalStateDocId/);
});
test("planning dispatch generation uses bounded temporal windows", () => {
  const window = read("src/app/api/planning-dispatches/_vacation-window.ts");
  const agents = read("src/app/api/planning-dispatches/route.ts");
  const sites = read("src/app/api/site-planning-dispatches/route.ts");
  assert.doesNotMatch(agents, /collection\("vacations"\)[\s\S]{0,100}limit\(1500\)/);
  assert.doesNotMatch(sites, /collection\("vacations"\)[\s\S]{0,100}limit\(2000\)/);
  assert.match(window, /MAX_RANGE_DAYS = 62/);
  assert.match(window, /MAX_CANDIDATES = 5000/);
  assert.match(window, /query\.count\(\)\.get\(\)/);
  assert.match(window, /loadStarts\(from, middle\)/);
  assert.match(window, /loadStarts\(middle, to\)/);
  assert.match(window, /where\("endAt", ">", input\.from\)/);
  assert.match(window, /adminDb\.getAll/);
  assert.match(agents, /vacationIds: \[\.\.\.requestedVacationIds\]/);
  assert.match(agents, /data\.tenantId !== auth\.tenantId/);
  assert.match(sites, /loadDispatchVacationWindow/);
});
test("agent availability uses bounded candidates and vacation windows", () => {
  const api = read("src/app/api/agents/available/route.ts");
  assert.doesNotMatch(api, /limit\(2000\)|MAX_VACATIONS_FETCH|missing_index_fallback/);
  assert.match(api, /MAX_AGENT_CANDIDATES = 500/);
  assert.match(api, /siteAgentIds\.length > MAX_AGENT_CANDIDATES/);
  assert.match(api, /adminDb\.getAll/);
  assert.match(api, /limit\(MAX_AGENT_CANDIDATES \+ 1\)/);
  assert.match(api, /data\.tenantId !== auth\.tenantId/);
  assert.match(api, /loadDispatchVacationWindow/);
  assert.match(api, /VacationWindowError/);
});
test("prepay uses exhaustive bounded vacation windows", () => {
  const api = read("src/app/api/prepay/route.ts");
  const window = read("src/app/api/planning-dispatches/_vacation-window.ts");
  assert.doesNotMatch(api, /limit\(5000\)/);
  assert.doesNotMatch(api, /vacationsSnap/);
  assert.match(api, /loadDispatchVacationWindow\(\{ tenantId: auth\.tenantId, from, to \}\)/);
  assert.match(api, /VacationWindowError/);
  assert.match(api, /prepaie exhaustive/);
  assert.match(api, /data\.tenantId !== auth\.tenantId/);
  assert.match(window, /where\("startAt", "<", input\.from\)/);
  assert.match(window, /where\("endAt", ">", input\.from\)/);
  assert.match(window, /PERIOD_TOO_DENSE/);
});
