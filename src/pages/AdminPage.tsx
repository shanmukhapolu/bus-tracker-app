import { useState } from "react";
import { LogIn, ShieldCheck, UserPlus } from "lucide-react";
import {
  loadAdminProfile,
  signInAdmin,
  signOutAdmin,
  signUpAdmin,
  type AdminProfile,
} from "../services/adminAuthService";

export function AdminPage() {
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  const switchMode = (mode: "login" | "signup") => {
    setAuthMode(mode);
    setEmail("");
    setPassword("");
    setDisplayName("");
    setMessage("");
    setStatus("idle");
  };

  const login = async () => {
    setStatus("loading");
    setMessage("");

    try {
      const result = await signInAdmin(email, password);
      const nextProfile = await loadAdminProfile(result.user.uid);

      if (
        !nextProfile ||
        nextProfile.role !== "admin" ||
        nextProfile.enabled !== true
      ) {
        await signOutAdmin();
        throw new Error("This admin account is waiting for approval.");
      }

      setProfile(nextProfile);
      setSignedIn(true);
      setPassword("");
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not sign in as an administrator.",
      );
    }
  };

  const signup = async () => {
    const name = displayName.trim();
    const normalizedEmail = email.trim();

    if (name.length < 2) {
      setStatus("error");
      setMessage("Enter your name.");
      return;
    }

    if (!normalizedEmail) {
      setStatus("error");
      setMessage("Enter your email address.");
      return;
    }

    if (password.length < 6) {
      setStatus("error");
      setMessage("Password must be at least 6 characters.");
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      await signUpAdmin(name, normalizedEmail, password);
      // The new account starts disabled, so keep it signed out until it is approved.
      await signOutAdmin();

      // Avoid keeping the newly created credential in the form.
      setDisplayName("");
      setPassword("");
      setAuthMode("login");
      setStatus("idle");
      setMessage(
        "Account created. An administrator must enable this account before you can log in.",
      );
    } catch (error) {
      try {
        await signOutAdmin();
      } catch {
        // Best-effort cleanup if Firebase signup already created a session.
      }

      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not create the administrator account.",
      );
    }
  };

  if (signedIn) {
    return (
      <main className="admin-auth-page">
        <section className="admin-auth-card admin-welcome-card">
          <p className="admin-auth-eyebrow">ADMIN PORTAL</p>
          <h1>Welcome {profile?.displayName ?? "Admin"}</h1>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-auth-page">
      <section className="admin-auth-card">
        <div className="simple-driver-auth-switch" aria-label="Admin account">
          <button
            className={authMode === "login" ? "active" : ""}
            type="button"
            onClick={() => switchMode("login")}
          >
            Log in
          </button>
          <button
            className={authMode === "signup" ? "active" : ""}
            type="button"
            onClick={() => switchMode("signup")}
          >
            Sign up
          </button>
        </div>

        <p className="admin-auth-eyebrow">ADMIN PORTAL</p>
        <h1>{authMode === "login" ? "Admin sign in" : "Create admin account"}</h1>
        <p className="admin-auth-description">
          {authMode === "login"
            ? "Sign in with an approved administrator account."
            : "Create an administrator account. It must be manually enabled before login is allowed."}
        </p>

        <div className="admin-auth-form">
          {authMode === "signup" && (
            <label>
              Name
              <input
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label>
            Password
            <input
              type="password"
              autoComplete={
                authMode === "signup" ? "new-password" : "current-password"
              }
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        </div>

        {message && (
          <div
            className={
              status === "error"
                ? "simple-driver-status error"
                : "simple-driver-status"
            }
            role={status === "error" ? "alert" : "status"}
          >
            <span
              className={
                status === "error" ? "status-dot error" : "status-dot"
              }
            />
            {message}
          </div>
        )}

        <button
          className="simple-driver-button"
          type="button"
          disabled={
            !email.trim() ||
            !password ||
            (authMode === "signup" && !displayName.trim()) ||
            status === "loading"
          }
          onClick={() => void (authMode === "login" ? login() : signup())}
        >
          {authMode === "login" ? (
            <LogIn size={18} />
          ) : (
            <UserPlus size={18} />
          )}
          {status === "loading"
            ? authMode === "login"
              ? "Signing in…"
              : "Creating account…"
            : authMode === "login"
              ? "Sign in"
              : "Create account"}
        </button>

        <div className="simple-driver-note">
          <ShieldCheck size={15} />
          Administrator access is controlled by Firebase.
        </div>
      </section>
    </main>
  );
}
