import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { LogIn, LogOut, ShieldCheck } from "lucide-react";
import { getFirebaseRuntime, type FirebaseRuntime } from "../config/firebase";

export function AdminPage() {
  const [runtime, setRuntime] = useState<FirebaseRuntime | null>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let stop: (() => void) | undefined;
    let active = true;

    void getFirebaseRuntime()
      .then((nextRuntime) => {
        if (!active) return;
        setRuntime(nextRuntime);
        stop = nextRuntime.onAuthStateChanged(nextRuntime.auth, (user) => {
          if (!active) return;
          setSignedInEmail(user?.email ?? null);
          setLoading(false);
        });
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof Error
            ? err.message
            : "Firebase could not initialize.",
        );
        setLoading(false);
      });

    return () => {
      active = false;
      stop?.();
    };
  }, []);

  const signIn = async () => {
    if (!runtime || !email.trim() || !password) return;

    setBusy(true);
    setError("");

    try {
      const result = await runtime.signInWithEmailAndPassword(
        runtime.auth,
        email.trim(),
        password,
      );
      setSignedInEmail(result.user?.email ?? email.trim());
      setPassword("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not sign in.",
      );
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    if (!runtime) return;
    await runtime.signOut(runtime.auth);
    setSignedInEmail(null);
  };

  if (loading) {
    return (
      <main style={pageStyle}>
        <section style={cardStyle}>Loading administration…</section>
      </main>
    );
  }

  if (!signedInEmail) {
    return (
      <main style={pageStyle}>
        <section style={cardStyle}>
          <div style={iconStyle}>
            <ShieldCheck size={26} />
          </div>
          <p style={eyebrowStyle}>TRANSPORTATION ADMINISTRATION</p>
          <h1 style={titleStyle}>Admin portal</h1>
          <p style={descriptionStyle}>
            Sign in with your administration account to continue.
          </p>

          <div style={formStyle}>
            <label style={labelStyle}>
              Email
              <input
                style={inputStyle}
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>

            <label style={labelStyle}>
              Password
              <input
                style={inputStyle}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void signIn();
                }}
              />
            </label>
          </div>

          {error && <div style={errorStyle}>{error}</div>}

          <button
            style={buttonStyle}
            disabled={busy || !email.trim() || !password}
            onClick={() => void signIn()}
          >
            <LogIn size={18} />
            {busy ? "Signing in…" : "Sign in"}
          </button>

          <a href="/" style={backStyle}>
            Return to public tracker
          </a>
        </section>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <div style={iconStyle}>
          <ShieldCheck size={26} />
        </div>
        <p style={eyebrowStyle}>TRANSPORTATION ADMINISTRATION</p>
        <h1 style={titleStyle}>Admin portal</h1>
        <p style={descriptionStyle}>
          Signed in as <strong>{signedInEmail}</strong>.
        </p>

        <div style={portalStyle}>
          <strong>Administration access granted</strong>
          <span>
            The portal is intentionally limited for now. No fleet or driver
            controls have been added.
          </span>
        </div>

        <button style={buttonStyle} onClick={() => void signOut()}>
          <LogOut size={18} />
          Sign out
        </button>
      </section>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  display: "grid",
  placeItems: "center",
  padding: 24,
  background: "#edf1ef",
  color: "#142f50",
};

const cardStyle: CSSProperties = {
  width: "min(520px, 100%)",
  padding: 32,
  border: "1px solid #dfe6e4",
  borderRadius: 18,
  background: "#fff",
  boxShadow: "0 18px 60px #142f5014",
};

const iconStyle: CSSProperties = {
  width: 46,
  height: 46,
  display: "grid",
  placeItems: "center",
  marginBottom: 18,
  borderRadius: 12,
  background: "#eef4fb",
  color: "#2464b8",
};

const eyebrowStyle: CSSProperties = {
  margin: "0 0 8px",
  color: "#2464b8",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.12em",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontFamily: "Manrope, sans-serif",
  fontSize: 31,
  letterSpacing: "-0.8px",
};

const descriptionStyle: CSSProperties = {
  margin: "12px 0 24px",
  color: "#6c7c8a",
  fontSize: 14,
  lineHeight: 1.65,
};

const formStyle: CSSProperties = {
  display: "grid",
  gap: 14,
  marginBottom: 14,
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 7,
  color: "#536878",
  fontSize: 12,
  fontWeight: 700,
};

const inputStyle: CSSProperties = {
  width: "100%",
  height: 48,
  padding: "0 13px",
  border: "1px solid #dce4e4",
  borderRadius: 10,
  outline: "none",
  background: "#fbfcfc",
  color: "#142f50",
  font: "inherit",
};

const buttonStyle: CSSProperties = {
  width: "100%",
  minHeight: 50,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  border: 0,
  borderRadius: 10,
  background: "#142f50",
  color: "#fff",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};

const errorStyle: CSSProperties = {
  marginBottom: 14,
  padding: 12,
  border: "1px solid #eed7d2",
  borderRadius: 10,
  background: "#fff6f4",
  color: "#8d463c",
  fontSize: 13,
  lineHeight: 1.5,
};

const portalStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  marginBottom: 18,
  padding: 16,
  border: "1px solid #e1e7e6",
  borderRadius: 10,
  background: "#f8faf9",
  color: "#617484",
  fontSize: 13,
  lineHeight: 1.5,
};

const backStyle: CSSProperties = {
  display: "block",
  marginTop: 16,
  textAlign: "center",
  color: "#2464b8",
  fontSize: 13,
  textDecoration: "none",
};
