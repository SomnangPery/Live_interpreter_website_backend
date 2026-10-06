import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import { config } from './env.js';

let app;
let hasServiceAccount = false;

const apps = getApps();

if (apps.length === 0) {
  let serviceAccount = null;

  // 1. Try loading from JSON string env var (best for Render/Railway/cloud deployments)
  if (config.firebaseServiceAccountJson) {
    try {
      serviceAccount = JSON.parse(config.firebaseServiceAccountJson);
      console.log('Firebase Admin: loaded service account from FIREBASE_SERVICE_ACCOUNT_JSON env var.');
    } catch (e) {
      console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', e.message);
    }
  }

  // 2. Fallback: load from file path (for local development)
  if (!serviceAccount && config.firebaseServiceAccountPath && fs.existsSync(config.firebaseServiceAccountPath)) {
    try {
      serviceAccount = JSON.parse(fs.readFileSync(config.firebaseServiceAccountPath, 'utf8'));
      console.log('Firebase Admin: loaded service account from file path.');
    } catch (e) {
      console.warn('Failed to parse service account file:', e.message);
    }
  }

  if (serviceAccount) {
    app = initializeApp({
      credential: cert(serviceAccount),
      projectId: config.firebaseProjectId,
    });
    hasServiceAccount = true;
    console.log('Firebase Admin initialized with service account certificate.');
  } else {
    // 3. Project ID only — Auth REST API still works, but Firestore Admin SDK won't
    app = initializeApp({
      projectId: config.firebaseProjectId,
    });
    console.warn(
      'Firebase Admin initialized WITHOUT a service account. ' +
      'Firestore Admin operations will be disabled. ' +
      'Set FIREBASE_SERVICE_ACCOUNT_JSON on your deployment platform to enable them.'
    );
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

