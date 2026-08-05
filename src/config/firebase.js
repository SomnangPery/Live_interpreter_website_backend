import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import { config } from './env.js';

let app;
let hasServiceAccount = false;

const apps = getApps();

if (apps.length === 0) {
  if (config.firebaseServiceAccountPath && fs.existsSync(config.firebaseServiceAccountPath)) {
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(config.firebaseServiceAccountPath, 'utf8'));
      app = initializeApp({
        credential: cert(serviceAccount),
        projectId: config.firebaseProjectId,
      });
      hasServiceAccount = true;
      console.log('Firebase Admin initialized with service account certificate.');
    } catch (e) {
      console.warn('Failed to parse service account JSON:', e.message);
    }
  }

  if (!app) {
    app = initializeApp({
      projectId: config.firebaseProjectId,
    });
    console.log(`Firebase Admin initialized with Project ID: ${config.firebaseProjectId} (REST Auth mode enabled).`);
  }
} else {
  app = apps[0];
}

let firestoreInstance;
if (hasServiceAccount || process.env.FIRESTORE_EMULATOR_HOST) {
  firestoreInstance = getFirestore(app);
} else {
  // Safe mock db to prevent gRPC ADC crashes when running without a Service Account JSON key file
  const dummyQuery = {
    get: async () => ({ exists: false, empty: true, docs: [], data: () => null }),
    set: async () => {},
    delete: async () => {},
    where: () => dummyQuery,
    orderBy: () => dummyQuery,
    limit: () => dummyQuery,
  };

  firestoreInstance = {
    collection: () => ({
      doc: () => dummyQuery,
      ...dummyQuery,
    }),
  };
}

export const db = firestoreInstance;
export const auth = getAuth(app);
export default app;
