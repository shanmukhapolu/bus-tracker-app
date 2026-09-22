import { getFirebaseRuntime } from "../config/firebase";

export interface DriverProfile {
  enabled?: boolean;
  displayName?: string;
  assignedBus?: string | number | null;
  allowedBuses?: Record<string, boolean>;
}

export async function signInDriver(email: string, password: string) {
  const runtime = await getFirebaseRuntime();
  const normalizedEmail = String(email ?? "").trim();
  const normalizedPassword = String(password ?? "");

  if (!normalizedEmail) {
    throw new Error("Enter your email address.");
  }

  if (!normalizedPassword) {
    throw new Error("Enter your password.");
  }

  return runtime.signInWithEmailAndPassword(
    runtime.auth,
    normalizedEmail,
    normalizedPassword,
  );
}

export async function signUpDriver(
  displayName: string,
  email: string,
  password: string,
) {
  const runtime = await getFirebaseRuntime();
  const normalizedName = String(displayName ?? "").trim();
  const normalizedEmail = String(email ?? "").trim();
  const normalizedPassword = String(password ?? "");

  const result = await runtime.createUserWithEmailAndPassword(
    runtime.auth,
    normalizedEmail,
    normalizedPassword,
  );

  await runtime.update(runtime.ref(runtime.db, `drivers/${result.user.uid}`), {
    displayName: normalizedName,
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
