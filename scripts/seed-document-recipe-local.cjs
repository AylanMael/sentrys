// Fixed loopback emulator; create-only fixture, never loads production credentials.
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8091';
const admin = require('firebase-admin');
const app = admin.initializeApp({ projectId: 'demo-sentrys-accounts' }, 'document-recipe');
const id = 'qa-documents-20260911';
async function main() {
  const db = app.firestore();
  const tenant = await db.doc('tenants/recette').get();
  if (!tenant.exists) throw new Error('Local recette tenant missing; no changes made');
  const ref = db.doc(`agents/${id}`);
  if ((await ref.get()).exists) {
    console.log('Fixture already exists, left unchanged: ' + id);
    return;
  }
  await ref.create({
    tenantId: 'recette', firstName: 'Recette', lastName: 'Documents fictifs', status: 'active',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    profile: { documents: [
      { id: 'valid-local', label: 'TEST — fichier privé valide', kind: 'other', url: '',
        path: `tenants/recette/agents/${id}/documents/recette.txt`, fileName: 'recette.txt', mimeType: 'text/plain', expiresAt: '2027-09-11' },
      { id: 'legacy-local', label: 'TEST — ancienne référence conservée', kind: 'other',
        url: 'https://example.invalid/recette.pdf', fileName: 'ancienne-reference.pdf', expiresAt: '2027-09-11' },
    ] },
  });
  console.log('Created local fixture: http://127.0.0.1:9002/dashboard/agents/' + id);
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => app.delete());
