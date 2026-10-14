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

      if (!profile || profile.role !== "admin" || profile.enabled !== true) {
        await signOutAdmin();
        throw new Error("This admin account is waiting for approval.");
      }

      onSignedIn(profile.displayName ?? result.user.email ?? "Admin");
    } catch (caught) {
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
            <br />
            Keep every route in view.
          </h1>
          <p>View buses, devices, and driver access from one place.</p>
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
        <h2>Legacy admin sign in</h2>
        <p>
          Use an approved administrator account. New administrator access is
          managed outside this public application.
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
      </section>
    </main>
  );
}
