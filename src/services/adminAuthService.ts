import { getFirebaseRuntime } from "../config/firebase";

export interface AdminProfile {
  displayName?: string;
  role?: string;
  enabled?: boolean;
}

export async function signInAdmin(email: string, password: string) {
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

export async function signUpAdmin(
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

  await runtime.update(runtime.ref(runtime.db, `admins/${result.user.uid}`), {
    displayName: normalizedName,
    role: "admin",
    enabled: false,
  });

  return result;
}

export async function signOutAdmin() {
  const runtime = await getFirebaseRuntime();
  await runtime.signOut(runtime.auth);
}

export async function loadAdminProfile(
  uid: string,
): Promise<AdminProfile | null> {
  const runtime = await getFirebaseRuntime();
  const snapshot = await runtime.get(
    runtime.ref(runtime.db, `admins/${uid}`),
  );

  return snapshot.exists() ? (snapshot.val() as AdminProfile) : null;
}
