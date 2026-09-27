import { useState } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { SchoolLogo } from "../components/SchoolLogo";
import {
  loadAdminProfile,
  signInAdmin,
  signOutAdmin,
} from "../services/adminAuthService";

export function AdminLogin({
  onSignedIn,
  sessionMessage = "",
}: {
  onSignedIn: (displayName: string) => void;
  sessionMessage?: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");

    try {
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
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to sign in. Check your credentials and connection.",
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
          <strong>BUS SAFETY ADMIN</strong>
        </div>
        <div>
          <span className="eyebrow">TRANSPORTATION OPERATIONS</span>
          <h1>
            A clearer view.
            <br />A safer journey.
          </h1>
          <p>
            Fleet awareness, driver management, and device health in one
            focused workspace.
          </p>
          <div className="login-points">
            <span>
              <ShieldCheck />
              Monitor the live fleet in context
            </span>
            <span>
              <LockKeyhole />
              Authenticated administrative access
            </span>
          </div>
        </div>
        <small>
          Independent CCS-inspired prototype · Not an official district product
        </small>
      </section>

      <section className="login-form">
        <span className="demo-label">AUTHORIZED ACCESS</span>
        <h2>Sign in to transportation operations</h2>
        <p>Use an enabled administrator account from the shared Firebase project.</p>

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
            {busy ? "Signing in…" : "Sign in"}
            <ArrowRight size={18} />
          </button>
        </form>

        <p className="login-policy">
          Access requires Firebase Authentication and an enabled admin profile.
          Credentials are handled by Firebase and are not stored by this app.
        </p>
      </section>
    </main>
  );
}
