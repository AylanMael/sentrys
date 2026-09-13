// Deliberately fixed to loopback emulators; never accepts a project argument.
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8091';
const admin = require('firebase-admin');
const app = admin.initializeApp({ projectId: 'demo-sentrys-accounts' }, 'local-recipe');
const password = 'Recette-Local-2026!';
async function main() {
  const db = app.firestore();
  // Create only: rerunning must not reactivate a suspended test agency.
  for (const [id, name] of [['platform', 'Plateforme locale'], ['recette', 'Agence de recette locale']]) {
    const ref = db.doc(`tenants/${id}`);
    if (!(await ref.get()).exists) await ref.create({ name, status: 'active', plan: 'pro', createdAt: admin.firestore.FieldValue.serverTimestamp() });
  }
  for (const [uid, role, tenantId] of [['plateforme', 'super_admin', 'platform'], ['responsable', 'owner', 'recette'], ['agent', 'agent', 'recette']]) {
    const email = `${uid}@sentrys.test`;
    try { await app.auth().getUser(uid); }
    catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
      await app.auth().createUser({ uid, email, password, emailVerified: true });
    }
    const ref = db.doc(`tenantUsers/${uid}`);
    if (!(await ref.get()).exists) await ref.create({ email, name: uid, role, tenantId, status: 'active', ...(role === 'agent' ? { agentId: 'agent-recette' } : {}) });
    console.log(`Compte local : ${email}`);
  }
  console.log('Comptes disponibles dans les émulateurs uniquement. Mot de passe : ' + password);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => app.delete());
