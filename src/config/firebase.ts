export const FIREBASE_SDK_VERSION = "12.19.0";

const env = import.meta.env;

export const firebaseConfig = {
  // Firebase web configuration values are non-secret project identifiers.
  // Environment variables can override them for another project/environment.
  apiKey:
    (env.VITE_FIREBASE_API_KEY as string | undefined) ??
    "AIzaSyCmAOZY6xyCtXDh8nu8qdG4YcAd4_hiz0k",
  authDomain:
    (env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) ??
    "chsbustracker2.firebaseapp.com",
  projectId:
    (env.VITE_FIREBASE_PROJECT_ID as string | undefined) ?? "chsbustracker2",
  storageBucket:
    (env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined) ??
    "chsbustracker2.firebasestorage.app",
  messagingSenderId:
    (env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined) ?? "343059758295",
  appId:
    (env.VITE_FIREBASE_APP_ID as string | undefined) ??
    "1:343059758295:web:0ac65d6cf2ddb389a0c492",
  measurementId:
    (env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined) ?? "G-R4GTR1CDC3",
  databaseURL:\n    (env.VITE_FIREBASE_DATABASE_URL as string | undefined) ??\n    "https://chsbustracker2-default-rtdb.firebaseio.com",
};

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId &&
    firebaseConfig.databaseURL,
);

export interface FirebaseRuntime {
  app: any;
  auth: any;
  db: any;
  initializeApp: (config: object) => any;
  getAuth: (app: any) => any;
  getDatabase: (app: any, url?: string) => any;
  onAuthStateChanged: (
    auth: any,
    callback: (user: any) => void,
  ) => () => void;
  signInWithEmailAndPassword: (
    auth: any,
    email: string,
    password: string,
  ) => Promise<{ user: any }>;
  signOut: (auth: any) => Promise<void>;
  get: (reference: any) => Promise<any>;
  ref: (db: any, path: string) => any;
  onValue: (
    query: any,
    callback: (snapshot: any) => void,
    cancelCallback?: (error: Error) => void,
  ) => () => void;
  onDisconnect: (reference: any) => any;
  update: (reference: any, values: object) => Promise<void>;
  remove: (reference: any) => Promise<void>;
  runTransaction: (
    reference: any,
    transactionUpdate: (currentData: any) => any,
  ) => Promise<{ committed: boolean; snapshot: any }>;
  serverTimestamp: () => unknown;
}

let runtimePromise: Promise<FirebaseRuntime> | null = null;

async function loadFirebaseModule(service: string) {
  return import(
    /* @vite-ignore */
    `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-${service}.js`
  );
}

export async function getFirebaseRuntime(): Promise<FirebaseRuntime> {
  if (!firebaseConfigured) {
    throw new Error(
      "Firebase Realtime Database is not configured. Create the database and set VITE_FIREBASE_DATABASE_URL.",
    );
  }

  if (!runtimePromise) {
    runtimePromise = Promise.all([
      loadFirebaseModule("app"),
      loadFirebaseModule("auth"),
      loadFirebaseModule("database"),
    ]).then(([appModule, authModule, databaseModule]) => {
      const app = appModule.initializeApp(firebaseConfig);
      const auth = authModule.getAuth(app);
      const db = databaseModule.getDatabase(
        app,
        firebaseConfig.databaseURL,
      );

      return {
        app,
        auth,
        db,
        initializeApp: appModule.initializeApp,
        getAuth: authModule.getAuth,
        getDatabase: databaseModule.getDatabase,
        onAuthStateChanged: authModule.onAuthStateChanged,
        signInWithEmailAndPassword: authModule.signInWithEmailAndPassword,
        signOut: authModule.signOut,
        get: databaseModule.get,
        ref: databaseModule.ref,
        onValue: databaseModule.onValue,
        onDisconnect: databaseModule.onDisconnect,
        update: databaseModule.update,
        remove: databaseModule.remove,
        runTransaction: databaseModule.runTransaction,
        serverTimestamp: databaseModule.serverTimestamp,
      };
    });
  }

  return runtimePromise;
}
