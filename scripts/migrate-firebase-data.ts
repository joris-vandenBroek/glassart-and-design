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

async function migrateInstellingen() {
  const snapshot = await firestore.doc('instellingen/bedrijfsgegevens').get();
  if (!snapshot.exists) {
    console.log('No instellingen/bedrijfsgegevens document found, skipping.');
    return;
  }
  await getPool().query(
    'INSERT INTO instellingen (id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
    ['bedrijfsgegevens', JSON.stringify(snapshot.data())]
  );
  console.log('Migrated instellingen/bedrijfsgegevens.');
}

async function migrateMedewerkers() {
  const snapshot = await firestore.collection('medewerkers').get();
  for (const doc of snapshot.docs) {
    const data = doc.data();
    await getPool().query(
      'INSERT INTO medewerkers (id, email, wachtwoordHash, naam) VALUES (?, ?, ?, ?)',
      [randomUUID(), data.email, 'MIGRATED_NEEDS_RESET', data.naam ?? data.email]
    );
  }
  console.log(
    `Migrated ${snapshot.docs.length} medewerkers (passwords not carried over — each must use the wachtwoord-vergeten flow).`
  );
}

async function main() {
  await migrateInstellingen();
  await migrateMedewerkers();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
