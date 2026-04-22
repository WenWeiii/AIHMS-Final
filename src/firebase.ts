import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase SDK
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Use named database if provided, otherwise default
const dbId = firebaseConfig.firestoreDatabaseId || undefined;

// Enable long polling for better reliability in some sandboxed/iframe environments
let dbInstance;
try {
  // Try initializing with settings and databaseId
  dbInstance = initializeFirestore(app, {
    experimentalForceLongPolling: true,
  }, dbId as string);
} catch (e) {
  // If already initialized, get the existing instance
  dbInstance = getFirestore(app, dbId as string);
}

export const db = dbInstance;
export const auth = getAuth(app);

console.log('[Firebase] Initialized App:', app.name);
console.log('[Firebase] Firestore DB ID:', dbId || '(default)');
console.log('[Firebase] Firestore Instance:', db ? 'OK' : 'NULL');

if (!db) {
  console.error("Firestore initialization failed. 'db' is undefined.");
}

// Validate Connection to Firestore on boot
async function testConnection() {
  try {
    const testDoc = doc(db, '_internal', 'connection_test');
    await getDocFromServer(testDoc);
    console.log('[Firebase] Connection test: OK');
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("[Firebase] Please check your Firebase configuration or internet connection. Client is offline.");
    } else {
      // Missing permissions is fine for a test doc that doesn't exist/is blocked
      console.log('[Firebase] Connection test triggered');
    }
  }
}
testConnection();

// Error Handling for Firestore
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  
  // Suppress throwing unhandled exceptions if the listener disconnected due to auth state loss
  if (
    errInfo.error.toLowerCase().includes('missing or insufficient permissions') &&
    auth.currentUser === null &&
    (operationType === OperationType.GET || operationType === OperationType.LIST)
  ) {
    return;
  }

  throw new Error(JSON.stringify(errInfo));
}
