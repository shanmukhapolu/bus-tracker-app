import { useState } from "react";
import "../../admin-modern.css";
import { signUpAdmin } from "../services/adminAuthService";

export function AdminSignupPage() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [request, setRequest] = useState<{
    uid: string;
    email: string;
    alreadyPending: boolean;
  } | null>(null);

  const submit = async () => {
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      setRequest(await signUpAdmin(displayName, email, password));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to create the account. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="admin-signup-page">
      <section className="admin-signup-card" aria-labelledby="admin-signup-title">
        <p className="admin-signup-eyebrow">ADMINISTRATOR ACCESS</p>
        <h1 id="admin-signup-title">
          {request
            ? request.alreadyPending
              ? "Request already pending"
              : "Account created"
            : "Create account"}
        </h1>
        <p className="admin-signup-description">
          {request
            ? "Your account request is recorded. Administrator approval is still required."
            : "Create an account to request administrator access. Your account stays disabled until the project owner approves it."}
        </p>

        {request && (
          <div className="admin-signup-success" role="status" aria-live="polite">
            <strong>Approval is still required.</strong>
            <p>
              Ask the Firebase project owner to set{" "}
              <code>admins/{request.uid}/enabled</code> to <code>true</code>{" "}
              in Realtime Database. New accounts cannot approve themselves.
            </p>
            <p>Account: {request.email}</p>
          </div>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label htmlFor="admin-signup-name">Full name</label>
          <input
            id="admin-signup-name"
            name="displayName"
            type="text"
            autoComplete="name"
            minLength={2}
            maxLength={100}
            required
            disabled={busy || Boolean(request)}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />

          <label htmlFor="admin-signup-email">Email</label>
          <input
            id="admin-signup-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={busy || Boolean(request)}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          
            data-bwignore="true"/>

          <label htmlFor="admin-signup-password">Password</label>
          <input
            id="admin-signup-password"
            name="new-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
            disabled={busy || Boolean(request)}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          
            data-bwignore="true"/>

          <label htmlFor="admin-signup-confirm">Confirm password</label>
          <input
            id="admin-signup-confirm"
            name="confirm-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
            disabled={busy || Boolean(request)}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          
            data-bwignore="true"/>

          {error && (
            <div className="admin-signup-error" role="alert">
              {error}
            </div>
          )}

          <button
            className="primary"
            type="submit"
            disabled={busy || Boolean(request)}
          >
            {busy
              ? "Creating account…"
              : request
                ? "Request submitted"
                : "Create account"}
          </button>
        </form>

        <p className="admin-signup-footer">
          <a href="/admin">Return to administrator sign in</a>
        </p>
      </section>
    </main>
  );
}
