import { useState } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { SchoolLogo } from "../components/SchoolLogo";
import {
  loadAdminProfile,
  signInAdmin,
  signOutAdmin,
  signUpAdmin,
} from "../services/adminAuthService";

export function AdminLogin({
  onSignedIn,
  sessionMessage = "",
}: {
  onSignedIn: (displayName: string) => void;
  sessionMessage?: string;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      if (mode === "signup") {
        const name = displayName.trim();
        if (name.length < 2) throw new Error("Enter your name.");
        if (password.length < 6) {
          throw new Error("Password must be at least 6 characters.");
        }
        await signUpAdmin(name, email.trim(), password);
        await signOutAdmin();
        setMode("login");
        setDisplayName("");
        setPassword("");
        setMessage(
          "Account created. An administrator must enable your account before you can sign in.",
        );
        return;
      }

      const result = await signInAdmin(email, password);
      const profile = await loadAdminProfile(result.user.uid);

      if (
        !profile ||
        profile.role !== "admin" ||
        profile.enabled !== true
      ) {
        await signOutAdmin();
        throw new Error("This admin account is waiting for approval.");
      }

      onSignedIn(profile.displayName ?? result.user.email ?? "Admin");
    } catch (caught) {
      try {
        if (mode === "signup") await signOutAdmin();
      } catch {
        // Best-effort cleanup after signup creates a Firebase session.
      }
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to complete the request.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <section className="login-story">
        <div className="admin-brand-logo">
          <SchoolLogo className="admin-school-logo" alt="" />
          <strong>Admin Panel</strong>
        </div>

        <div>
          <span className="eyebrow">CARMEL CLAY SCHOOLS</span>
          <h1>
            Manage the fleet.
            <br />Keep every route in view.
          </h1>
          <p>
            View buses, devices, and driver access from one place.
          </p>
          <div className="login-points">
            <span>
              <ShieldCheck />
              Live fleet visibility
            </span>
            <span>
              <LockKeyhole />
              Protected administrator access
            </span>
          </div>
        </div>

        <small>CCS-inspired prototype · Not an official district product</small>
      </section>

      <section className="login-form">
        <span className="demo-label">ADMIN ACCESS</span>
        <h2>
          {mode === "login" ? "Admin sign in" : "Create admin account"}
        </h2>
        <p>
          {mode === "login"
            ? "Use an approved administrator account."
            : "Create an account. An administrator must enable it before access is allowed."}
        </p>

        {sessionMessage && (
          <div className="error-box" role="alert">
            {sessionMessage}
          </div>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {mode === "signup" && (
            <>
              <label htmlFor="admin-name">Name</label>
              <input
                id="admin-name"
                type="text"
                autoComplete="name"
                required
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </>
          )}

          <label htmlFor="admin-email">Email</label>
          <input
            id="admin-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <label htmlFor="admin-password">Password</label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}

          <button className="primary" disabled={busy}>
            {busy
              ? mode === "login"
                ? "Signing in…"
                : "Creating account…"
              : mode === "login"
                ? "Sign in"
                : "Create account"}
            <ArrowRight size={18} />
          </button>
        </form>

        {message && (
          <p className="login-policy" role="status">
            {message}
          </p>
        )}

        <button
          type="button"
          className="text-button"
          onClick={() => {
            setMode((current) => (current === "login" ? "signup" : "login"));
            setError("");
            setMessage("");
            setPassword("");
          }}
        >
          {mode === "login"
            ? "Create an administrator account"
            : "Back to administrator sign in"}
        </button>
      </section>
    </main>
  );
}
