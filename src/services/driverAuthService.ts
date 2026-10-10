import { getFirebaseRuntime } from "../config/firebase";

export interface DriverProfile {
  enabled?: boolean;
  displayName?: string;
  email?: string;
  assignedBus?: string | number | null;
  allowedBuses?: Record<string, boolean>;
  approvalStatus?: "pending" | "approved";
}

interface FirebaseDriverUser {
  uid: string;
  displayName?: string | null;
  email?: string | null;
}

interface FirebaseAuthError {
  code?: string;
}

function firebaseAuthErrorCode(error: unknown) {
  return typeof error === "object" && error !== null
    ? String((error as FirebaseAuthError).code ?? "")
    : "";
}

function driverDisplayName(user: FirebaseDriverUser, preferredName = "") {
  const value =
    preferredName.trim() ||
    String(user.displayName ?? "").trim() ||
    String(user.email ?? "")
      .split("@")[0]
      ?.trim() ||
    "Driver account";
  return value.length >= 2 ? value.slice(0, 100) : "Driver account";
}

export async function ensureDriverProfile(
  user: FirebaseDriverUser,
  preferredName = "",
): Promise<DriverProfile> {
  const runtime = await getFirebaseRuntime();
  const reference = runtime.ref(runtime.db, `drivers/${user.uid}`);
  const pendingProfile: DriverProfile = {
    displayName: driverDisplayName(user, preferredName),
    enabled: false,
    assignedBus: "",
    approvalStatus: "pending",
  };
  if (user.email) pendingProfile.email = user.email;
  const result = await runtime.runTransaction(
    reference,
    (current) => current ?? pendingProfile,
  );
  return result.snapshot.val() as DriverProfile;
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

export async function signInDriverWithGoogle() {
  const runtime = await getFirebaseRuntime();
  const provider = new runtime.GoogleAuthProvider();
  provider.setCustomParameters?.({ prompt: "select_account" });
  return runtime.signInWithPopup(runtime.auth, provider);
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

  let recoveredExistingAccount = false;
  let result;

  try {
    result = await runtime.createUserWithEmailAndPassword(
      runtime.auth,
      normalizedEmail,
      normalizedPassword,
    );
  } catch (error) {
    if (firebaseAuthErrorCode(error) !== "auth/email-already-in-use") {
      throw error;
    }

    // A previous registration can create the Firebase Auth user before the
    // pending driver profile is written. Re-authenticate that same account and
    // finish the pending request instead of leaving the driver stuck.
    try {
      result = await runtime.signInWithEmailAndPassword(
        runtime.auth,
        normalizedEmail,
        normalizedPassword,
      );
      recoveredExistingAccount = true;
    } catch (signInError) {
      const code = firebaseAuthErrorCode(signInError);
      if (
        code === "auth/invalid-credential" ||
        code === "auth/wrong-password" ||
        code === "auth/user-not-found"
      ) {
        throw new Error(
          "This email already has an account, but that password did not match. Use Log in with the existing password or Continue with Google.",
        );
      }
      throw signInError;
    }
  }

  const profile = await ensureDriverProfile(result.user, normalizedName);

  return { ...result, profile, recoveredExistingAccount };
}

export async function signOutDriver() {
  const runtime = await getFirebaseRuntime();
  await runtime.signOut(runtime.auth);
}

export async function loadDriverProfile(
  uid: string,
): Promise<DriverProfile | null> {
  const runtime = await getFirebaseRuntime();
  const snapshot = await runtime.get(runtime.ref(runtime.db, `drivers/${uid}`));

  return snapshot.exists() ? (snapshot.val() as DriverProfile) : null;
}
