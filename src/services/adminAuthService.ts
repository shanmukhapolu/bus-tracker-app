import { getFirebaseRuntime } from "../config/firebase";

export interface AdminProfile {
  displayName?: string;
  email?: string;
  role?: string;
  enabled?: boolean;
}

interface FirebaseAuthError {
  code?: string;
}

function authErrorCode(error: unknown) {
  return typeof error === "object" && error !== null
    ? String((error as FirebaseAuthError).code ?? "")
    : "";
}

function readableAdminAuthError(error: unknown) {
  const code = authErrorCode(error);
  switch (code) {
    case "auth/operation-not-allowed":
      return "Email/password registration is disabled. In Firebase Console, open Authentication → Sign-in method and enable Email/Password.";
    case "auth/invalid-api-key":
    case "auth/api-key-not-valid":
      return "Firebase rejected the API key. Verify the web app configuration under the chsbusapp project settings.";
    case "auth/unauthorized-domain":
      return "This website is not authorized for Firebase Authentication. Add its hostname under Authentication → Settings → Authorized domains.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/weak-password":
      return "Choose a stronger password with at least 8 characters.";
    case "auth/email-already-in-use":
      return "An account already exists for this email. Sign in instead or use the account's existing password to recover a pending request.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes before trying again.";
    case "auth/network-request-failed":
      return "Firebase could not be reached. Check your connection and try again.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "The email or password is incorrect.";
    default:
      return code
        ? `Firebase Authentication rejected the request (${code}). Check Firebase Console settings and the browser Network response.`
        : error instanceof Error
          ? error.message
          : "Unable to complete the authentication request.";
  }
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

  try {
    return await runtime.signInWithEmailAndPassword(
      runtime.auth,
      normalizedEmail,
      normalizedPassword,
    );
  } catch (error) {
    throw new Error(readableAdminAuthError(error));
  }
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

  if (normalizedName.length < 2 || normalizedName.length > 100) {
    throw new Error("Name must be between 2 and 100 characters.");
  }
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error("Enter a valid email address.");
  }
  if (normalizedPassword.length < 8 || normalizedPassword.length > 128) {
    throw new Error("Password must be between 8 and 128 characters.");
  }

  let result: { user: any };
  let recovering = false;

  try {
    result = await runtime.createUserWithEmailAndPassword(
      runtime.auth,
      normalizedEmail,
      normalizedPassword,
    );
  } catch (error) {
    if (authErrorCode(error) !== "auth/email-already-in-use") {
      throw new Error(readableAdminAuthError(error));
    }

    // Recovery only finishes a missing, pending admin profile after the person
    // successfully authenticates. It never changes an existing profile's role
    // or enabled flag, and will not convert an existing driver account.
    try {
      result = await runtime.signInWithEmailAndPassword(
        runtime.auth,
        normalizedEmail,
        normalizedPassword,
      );
    } catch (signInError) {
      throw new Error(readableAdminAuthError(signInError));
    }
    recovering = true;
  }

  const uid = result.user.uid;
  const adminRef = runtime.ref(runtime.db, `admins/${uid}`);

  try {
    const existingAdmin = await runtime.get(adminRef);
    if (existingAdmin.exists()) {
      const current = existingAdmin.val() as AdminProfile;
      await runtime.signOut(runtime.auth).catch(() => undefined);
      if (current.role === "admin" && current.enabled === false) {
        return {
          uid,
          email: result.user.email ?? normalizedEmail,
          alreadyPending: true,
        };
      }
      throw new Error("An administrator profile already exists for this account. Use the administrator sign-in page.");
    }

    if (recovering) {
      const driverSnapshot = await runtime.get(
        runtime.ref(runtime.db, `drivers/${uid}`),
      );
      if (driverSnapshot.exists()) {
        await runtime.signOut(runtime.auth).catch(() => undefined);
        throw new Error("This email is already associated with a driver profile. Use a separate account for administrator access.");
      }
    }

    await runtime.update(adminRef, {
      displayName: normalizedName,
      email: result.user.email ?? normalizedEmail,
      role: "admin",
      enabled: false,
    });
  } catch (error) {
    await runtime.signOut(runtime.auth).catch(() => undefined);
    if (error instanceof Error && error.message.startsWith("An administrator profile")) {
      throw error;
    }
    if (error instanceof Error && error.message.startsWith("This email is already")) {
      throw error;
    }
    const code = authErrorCode(error);
    if (
      code === "PERMISSION_DENIED" ||
      /permission_denied|permission denied/i.test(error instanceof Error ? error.message : String(error))
    ) {
      throw new Error("Firebase created the Authentication account but could not save its pending profile. Deploy the updated Realtime Database rules, then submit this form again to finish setup.");
    }
    throw new Error(
      error instanceof Error
        ? error.message
        : "Could not save the administrator profile in Realtime Database.",
    );
  }

  await runtime.signOut(runtime.auth).catch(() => undefined);

  return {
    uid,
    email: result.user.email ?? normalizedEmail,
    alreadyPending: false,
  };
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
