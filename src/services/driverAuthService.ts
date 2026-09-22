import { getFirebaseRuntime } from "../config/firebase";

export interface DriverProfile {
  enabled?: boolean;
  displayName?: string;
  assignedBus?: string;
  allowedBuses?: Record<string, boolean>;
}

export async function signInDriver(email: string, password: string) {
  const runtime = await getFirebaseRuntime();
  return runtime.signInWithEmailAndPassword(runtime.auth, email, password);
}

export async function signUpDriver(
  displayName: string,
  email: string,
  password: string,
) {
  const runtime = await getFirebaseRuntime();
  const result = await runtime.createUserWithEmailAndPassword(
    runtime.auth,
    email,
    password,
  );

  await runtime.update(runtime.ref(runtime.db, `drivers/${result.user.uid}`), {
    displayName,
    enabled: false,
    assignedBus: "",
  });

  return result;
}

export async function signOutDriver() {
  const runtime = await getFirebaseRuntime();
  await runtime.signOut(runtime.auth);
}

export async function loadDriverProfile(
  uid: string,
): Promise<DriverProfile | null> {
  const runtime = await getFirebaseRuntime();
  const snapshot = await runtime.get(
    runtime.ref(runtime.db, `drivers/${uid}`),
  );

  return snapshot.exists() ? (snapshot.val() as DriverProfile) : null;
}
