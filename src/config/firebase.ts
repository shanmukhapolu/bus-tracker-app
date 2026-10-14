import { resolveFirebaseEnvironment } from "./deploymentEnvironment";
export const FIREBASE_SDK_VERSION = "12.19.0";
export const firebaseConfig = resolveFirebaseEnvironment(
  import.meta.env,
  import.meta.env.MODE,
  "public",
).config;

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
  setPersistence: (auth: any, persistence: any) => Promise<void>;
  browserSessionPersistence: any;
  getDatabase: (app: any, url?: string) => any;
  onAuthStateChanged: (auth: any, callback: (user: any) => void) => () => void;
  signInWithEmailAndPassword: (
    auth: any,
    email: string,
    password: string,
  ) => Promise<{ user: any }>;
  createUserWithEmailAndPassword: (
    auth: any,
    email: string,
    password: string,
  ) => Promise<{ user: any }>;
  GoogleAuthProvider: new () => {
    setCustomParameters?: (parameters: Record<string, string>) => void;
  };
  signInWithPopup: (auth: any, provider: any) => Promise<{ user: any }>;
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
  if (import.meta.env.MODE === "test")
    throw new Error(
      "Unit tests must mock Firebase; cloud access is forbidden.",
    );
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
    ]).then(async ([appModule, authModule, databaseModule]) => {
      const app = appModule.initializeApp(firebaseConfig);
      const auth = authModule.getAuth(app);
      await authModule.setPersistence(
        auth,
        authModule.browserSessionPersistence,
      );
      const db = databaseModule.getDatabase(app, firebaseConfig.databaseURL);

      return {
        app,
        auth,
        db,
        initializeApp: appModule.initializeApp,
        getAuth: authModule.getAuth,
        setPersistence: authModule.setPersistence,
        browserSessionPersistence: authModule.browserSessionPersistence,
        getDatabase: databaseModule.getDatabase,
        onAuthStateChanged: authModule.onAuthStateChanged,
        signInWithEmailAndPassword: authModule.signInWithEmailAndPassword,
        createUserWithEmailAndPassword:
          authModule.createUserWithEmailAndPassword,
        GoogleAuthProvider: authModule.GoogleAuthProvider,
        signInWithPopup: authModule.signInWithPopup,
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
