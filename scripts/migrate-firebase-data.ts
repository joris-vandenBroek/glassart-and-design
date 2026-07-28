import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';
import { getPool } from '../src/lib/server/db';

// Requires GOOGLE_APPLICATION_CREDENTIALS env var pointing at a Firebase
// service-account JSON key (download from Firebase Console > Project
// Settings > Service Accounts > Generate new private key).
initializeApp({ credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS!) });
const firestore = getFirestore();

async function migrateInstellingenDoc(docId: string) {
  const snapshot = await firestore.doc(`instellingen/${docId}`).get();
  if (!snapshot.exists) {
    console.log(`No instellingen/${docId} document found, skipping.`);
    return;
  }
  await getPool().query(
    'INSERT INTO instellingen (id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
    [docId, JSON.stringify(snapshot.data())]
  );
  console.log(`Migrated instellingen/${docId}.`);
}

async function migrateSimpleCollection(
  collectionName: string,
  tableName: string,
  columns: string[]
) {
  const snapshot = await firestore.collection(collectionName).get();
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const values = columns.map((column) => data[column] ?? null);
    const columnList = columns.map((column) => `\`${column}\``).join(', ');
    const placeholders = columns.map(() => '?').join(', ');
    const updateList = columns.map((column) => `\`${column}\` = VALUES(\`${column}\`)`).join(', ');
    await getPool().query(
      `INSERT INTO \`${tableName}\` (id, ${columnList}) VALUES (?, ${placeholders}) ON DUPLICATE KEY UPDATE ${updateList}`,
      [doc.id, ...values]
    );
  }
  console.log(`Migrated ${snapshot.docs.length} ${collectionName}.`);
}

async function migrateMedewerkers() {
  const snapshot = await firestore.collection('medewerkers').get();
  let inserted = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    // Safe to re-run: skip an email that already exists instead of failing on the
    // UNIQUE constraint, and never touch its wachtwoordHash -- a medewerker may have
    // already completed their real password reset since an earlier run of this script.
    const [existing] = await getPool().query('SELECT id FROM medewerkers WHERE email = ?', [
      data.email,
    ]);
    if ((existing as unknown[]).length > 0) continue;
    await getPool().query(
      'INSERT INTO medewerkers (id, email, wachtwoordHash, naam) VALUES (?, ?, ?, ?)',
      [randomUUID(), data.email, 'MIGRATED_NEEDS_RESET', data.naam ?? data.email]
    );
    inserted += 1;
  }
  console.log(
    `Migrated ${inserted} new medewerkers (${snapshot.docs.length - inserted} already existed, skipped). Passwords are never carried over — each must use the wachtwoord-vergeten flow.`
  );
}

async function main() {
  await migrateInstellingenDoc('bedrijfsgegevens');
  await migrateInstellingenDoc('bestelinstellingen');
  await migrateMedewerkers();
  // materiaalsoorten before materialen -- materialen.materiaalsoortId is a foreign key.
  await migrateSimpleCollection('segmenten', 'segmenten', ['omschrijving']);
  await migrateSimpleCollection('stijlen', 'stijlen', ['omschrijving']);
  await migrateSimpleCollection('onderwerpen', 'onderwerpen', ['omschrijving']);
  await migrateSimpleCollection('materiaalsoorten', 'materiaalsoorten', [
    'omschrijving',
    'staatEigenMaatToe',
    'maxBreedte',
    'maxHoogte',
    'levertijdMaandenEigenMaat',
  ]);
  await migrateSimpleCollection('materialen', 'materialen', [
    'materiaalsoortId',
    'materiaaldikte',
    'omschrijving',
  ]);
  await migrateSimpleCollection('maten', 'maten', ['breedte', 'hoogte']);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
