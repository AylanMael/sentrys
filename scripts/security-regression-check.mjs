import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

function filesUnder(directory) {
  const base = join(root, directory);
  const files = [];
  for (const entry of readdirSync(base)) {
    const path = join(base, entry);
    if (statSync(path).isDirectory()) files.push(...filesUnder(relative(root, path)));
    else files.push(path);
  }
  return files;
}

assert.equal(existsSync(join(root, "src/app/debug/token/page.tsx")), false, "debug token page must not exist");
assert.equal(existsSync(join(root, "src/app/api/debug-admin-key/route.ts")), false, "debug admin-key route must not exist");

for (const path of [
  "src/app/api/admin/seed/route.ts",
  "src/app/api/admin/seed-mvp/route.ts",
  "src/app/api/admin/seed-patrol/route.ts",
]) {
  const source = read(path);
  assert.match(source, /blockSeedInProduction\(\)/, `${path} must be blocked in production`);
}

const storageRules = read("storage.rules");
assert.match(storageRules, /role in \["super_admin", "owner", "admin", "manager"\]/);
assert.match(storageRules, /tenantUser\(\)\.role == "agent"/);
assert.match(storageRules, /tenantUser\(\)\.agentId == agentId/);
assert.match(storageRules, /size <= 5 \* 1024 \* 1024/);
assert.match(storageRules, /size <= 12 \* 1024 \* 1024/);
assert.match(storageRules, /allow read, write: if false/);
assert.doesNotMatch(storageRules, /"client"|"viewer"/);

const firestoreRules = read("firestore.rules");
assert.match(firestoreRules, /function isOwnAgent\(agentId\)/);
assert.match(firestoreRules, /canManagePlanning\(\)[\s\S]*isOwnAgent\(id\)/);

const uploadValidator = read("src/lib/uploads/file-validation.ts");
assert.match(uploadValidator, /%PDF-/);
assert.match(uploadValidator, /0xff, 0xd8, 0xff/);
assert.match(uploadValidator, /isAllowedAgentPhotoMimeType/);

const privateUploadSource = read("src/lib/uploads/tenant-files.ts");
assert.doesNotMatch(privateUploadSource, /firebaseStorageDownloadTokens/);
assert.doesNotMatch(privateUploadSource, /firebasestorage\.googleapis\.com/);
assert.match(privateUploadSource, /private, no-store/);
const authenticatedFileRoute = read("src/app/api/agents/[id]/files/[fileId]/route.ts");
assert.match(authenticatedFileRoute, /requireTenantUser\(req\)/);
assert.match(authenticatedFileRoute, /auth\.agentId \?\? auth\.uid/);
assert.match(authenticatedFileRoute, /private, no-store/);
const migrationSource = read("scripts/migrate-agent-file-tokens.cjs");
assert.match(migrationSource, /process\.argv\.includes\("--repair"\)/);
assert.match(migrationSource, /delete customMetadata\.firebaseStorageDownloadTokens/);
const agentDocumentsRoute = read("src/app/api/agents/[id]/documents/route.ts");
assert.match(agentDocumentsRoute, /export async function DELETE/);
assert.match(agentDocumentsRoute, /runTransaction/);
assert.match(agentDocumentsRoute, /deleteTenantFile/);
assert.match(agentDocumentsRoute, /storageCleanup/);
const tenantFilesSource = read("src/lib/uploads/tenant-files.ts");
assert.match(tenantFilesSource, /function deleteTenantFile/);
assert.match(tenantFilesSource, /Invalid tenant storage path/);
const agentDetailSource = read("src/app/dashboard/agents/[id]/page.tsx");
assert.match(agentDetailSource, /Supprimer ce document/);
assert.doesNotMatch(agentDetailSource, /documentUrl|Ajouter URL/);
for (const path of [
  "src/app/api/agents/[id]/documents/route.ts",
  "src/app/api/agents/[id]/photo/route.ts",
]) {
  assert.match(read(path), /hasExpectedFileSignature\(buffer, file\.type\)/);
}

const agentLinkSource = read("src/lib/users/agent-link.ts");
assert.match(agentLinkSource, /createHash\("sha256"\)/);
assert.match(agentLinkSource, /collection\("tenantAgentLinks"\)/);
assert.match(agentLinkSource, /AGENT_ALREADY_LINKED/);

const usersApiSource = read("src/app/api/users/route.ts");
assert.match(usersApiSource, /loadAgentLinkContext/);
assert.match(usersApiSource, /reserveAgentLink/);
assert.match(usersApiSource, /releaseAgentLink/);
assert.match(usersApiSource, /Agent requis pour ce role/);

const agentLinkAuditSource = read("scripts/audit-agent-user-links.cjs");
assert.match(agentLinkAuditSource, /process\.argv\.includes\("--repair"\)/);
assert.match(agentLinkAuditSource, /tenantAgentLinks/);
const quickAgentCreationSource = read("src/app/dashboard/agents/new/page.tsx");
assert.match(quickAgentCreationSource, /id="quick-agent-form"/);
assert.match(quickAgentCreationSource, /Seuls le prénom et le nom sont indispensables/);
assert.match(quickAgentCreationSource, /router\.push\(`\/dashboard\/agents\/\$\{response\.agent\.id\}`\)/);
assert.doesNotMatch(quickAgentCreationSource, /professionalCardNumber|birthDate|addressLine1|emergencyContactName/);
const paginatedAgentsApiSource = read("src/app/api/agents/route.ts");
assert.match(paginatedAgentsApiSource, /url\.searchParams\.has\("pageSize"\)/);
assert.match(paginatedAgentsApiSource, /encodeCursor/);
assert.match(paginatedAgentsApiSource, /startAfter\(scanCursor\.createdAt, scanCursor\.id\)/);
assert.match(paginatedAgentsApiSource, /maxScanBatches = 20/);
const operationalAgentsListSource = read("src/app/dashboard/agents/page.tsx");
assert.match(operationalAgentsListSource, /pageSize: String\(pageSize\)/);
assert.match(operationalAgentsListSource, /Action prioritaire/);
assert.match(operationalAgentsListSource, /Indicateurs de la page courante/);
assert.doesNotMatch(operationalAgentsListSource, /max", "200"|viewMode|pagination locale/);
const simplifiedAgentDetailSource = read("src/app/dashboard/agents/[id]/page.tsx");
assert.match(simplifiedAgentDetailSource, /Peut-il être planifié/);
assert.match(simplifiedAgentDetailSource, /Que manque-t-il/);
assert.match(simplifiedAgentDetailSource, /Action recommandée/);
assert.match(simplifiedAgentDetailSource, /Tabs value=\{activeTab\} onValueChange=\{setActiveTab\}/);
assert.match(simplifiedAgentDetailSource, /correctionTabForAlert/);
assert.doesNotMatch(simplifiedAgentDetailSource, /lg:grid-cols-12|passeport exploitation/);
const serverFiles = [
  ...filesUnder("src/app/api"),
  ...filesUnder("src/lib/api"),
  ...filesUnder("src/lib/auth"),
  ...filesUnder("functions/src"),
].filter((path) => /\.(ts|tsx)$/.test(path));

for (const path of serverFiles) {
  const source = readFileSync(path, "utf8");
  for (const match of source.matchAll(/verifyIdToken\(([^\n]+)\)/g)) {
    assert.match(match[0], /,\s*true\)/, `${relative(root, path)} must check revoked tokens: ${match[0]}`);
  }
  assert.doesNotMatch(
    source,
    /(?:json|NextResponse\.json)\([^\n]*(?:error:\s*(?:e|error)\.message|details:\s*(?:e|error).*message)/,
    `${relative(root, path)} exposes an internal error`
  );
}

console.log("Security regression checks passed.");