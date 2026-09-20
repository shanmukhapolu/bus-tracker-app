export const FIREBASE_SDK_VERSION = "12.19.0";

const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL as string | undefined,
};

export const firebaseConfigured = Object.values(firebaseConfig).every(
  (value) => typeof value === "string" && value.length > 0,
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
  set: (reference: any, value: unknown) => Promise<void>;
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
      "Firebase is not configured. Add the VITE_FIREBASE_* variables to your environment.",
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
        set: databaseModule.set,
        update: databaseModule.update,
        remove: databaseModule.remove,
        runTransaction: databaseModule.runTransaction,
        serverTimestamp: databaseModule.serverTimestamp,
      };
    });
  }

  return runtimePromise;
}
