import { useEffect, useState } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck, UserPlus } from "lucide-react";
import modernAdminStyles from "../../admin-modern.css?raw";
import { SchoolLogo } from "../components/SchoolLogo";
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

  useEffect(() => {
    const style = document.createElement("style");
    style.id = "admin-reference-styles";
    style.textContent = modernAdminStyles + `
        .admin-ui .success-box {
          border: 1px solid var(--ui-success);
          background: var(--ui-success-soft);
          color: var(--ui-success);
          border-radius: 12px;
          padding: 1rem;
          overflow-wrap: anywhere;
        }
        .admin-ui .success-box p { margin: .75rem 0 0; }
      `;
    document.getElementById(style.id)?.remove();
    document.head.appendChild(style);
    return () => document.getElementById(style.id)?.remove();
  }, []);

  const submit = async () => {
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const result = await signUpAdmin(displayName, email, password);
      setRequest(result);
      setPassword("");
      setConfirmPassword("");
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
    <div className="admin-ui">
      <main className="login">
        <section className="login-story">
          <div className="admin-brand-logo">
            <SchoolLogo className="admin-school-logo" alt="" />
            <strong>Admin Panel</strong>
          </div>
          <div>
            <span className="eyebrow">CARMEL CLAY SCHOOLS</span>
            <h1>
              Request access.
              <br />
              Approval comes first.
            </h1>
            <p>
              Create an account for administrator review. Registration does not
              grant access to the fleet or private records.
            </p>
            <div className="login-points">
              <span>
                <ShieldCheck />
                Administrator approval required
              </span>
              <span>
                <LockKeyhole />
                Disabled until approved
              </span>
            </div>
          </div>
          <small>CCS-inspired prototype · Not an official district product</small>
        </section>

        <section className="login-form">
          <span className="demo-label">ADMIN ACCESS REQUEST</span>
          {request ? (
            <div role="status" aria-live="polite">
              <h2>{request.alreadyPending ? "Request already pending" : "Account created"}</h2>
              <p>
                {request.alreadyPending
                  ? "A disabled administrator request already exists for this account."
                  : "Your Authentication account and Realtime Database profile have been created."}
              </p>
              <div className="success-box">
                <strong>Access is not enabled.</strong>
                <p>
                  Ask the Firebase project owner to open Realtime Database and
                  set <code>admins/{request.uid}/enabled</code> to <code>true</code>.
                  The profile is stored with <code>enabled: false</code>; this
                  account cannot enable itself.
                </p>
                <p>Account: {request.email}</p>
              </div>
              <p>
                <a href="/admin">Return to administrator sign in</a>
              </p>
            </div>
          ) : (
            <>
              <h2>Create an account</h2>
              <p>
                New accounts remain disabled until an existing project owner
                explicitly enables them.
              </p>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit();
                }}
              >
                <label htmlFor="admin-signup-name">Full name</label>
                <input
                  id="admin-signup-name"
                  type="text"
                  autoComplete="name"
                  minLength={2}
                  maxLength={100}
                  required
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />

                <label htmlFor="admin-signup-email">Email</label>
                <input
                  id="admin-signup-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />

                <label htmlFor="admin-signup-password">Password</label>
                <input
                  id="admin-signup-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />

                <label htmlFor="admin-signup-confirm">Confirm password</label>
                <input
                  id="admin-signup-confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />

                {error && (
                  <div className="error-box" role="alert">
                    {error}
                  </div>
                )}

                <button className="primary" type="submit" disabled={busy}>
                  {busy ? "Creating account…" : "Create account"}
                  <UserPlus size={18} />
                  <ArrowRight size={18} />
                </button>
              </form>
              <p>
                Already have an account? <a href="/admin">Sign in</a>
              </p>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
