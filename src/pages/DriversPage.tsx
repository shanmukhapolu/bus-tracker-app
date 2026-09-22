import { useMemo, useRef, useState } from "react";
import { LogIn, MapPin, Radio, ShieldCheck, UserPlus } from "lucide-react";
import { createMockBuses } from "../data/mockBuses";
import {
  loadDriverProfile,
  signInDriver,
  signOutDriver,
  signUpDriver,
  type DriverProfile,
} from "../services/driverAuthService";
import {
  getLocationSupportMessage,
  startDriverTracking,
  type DriverLocation,
  type DriverTrackingSession,
} from "../services/driverTrackingService";

const buses = createMockBuses();

function formatAccuracy(value: number | null) {
  return value === null ? "—" : `±${Math.round(value)} m`;
}

function getDriverBusIds(profile: DriverProfile | null) {
  const rawAssignedBus = profile?.assignedBus;
  const assignedBus =
    rawAssignedBus === null || rawAssignedBus === undefined
      ? ""
      : String(rawAssignedBus).trim();

  const legacyBusIds = Object.entries(profile?.allowedBuses ?? {})
    .filter(([, allowed]) => allowed)
    .map(([busId]) => busId);

  return Array.from(
    new Set([...(assignedBus ? [assignedBus] : []), ...legacyBusIds]),
  );
}

export function DriversPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [selectedBusId, setSelectedBusId] = useState("");
  const [session, setSession] = useState<DriverTrackingSession | null>(null);
  const [position, setPosition] = useState<DriverLocation | null>(null);
  const [status, setStatus] = useState<
    "idle" | "signing-in" | "signing-up" | "requesting" | "tracking" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const [loginError, setLoginError] = useState("");

  const emailInputRef = useRef<HTMLInputElement>(null);

  const allowedBusIds = useMemo(() => getDriverBusIds(profile), [profile]);

  const allowedBuses = useMemo(
    () => buses.filter((bus) => allowedBusIds.includes(bus.id)),
    [allowedBusIds],
  );

  const selectedBus = buses.find((bus) => bus.id === selectedBusId);

  const switchAuthMode = (mode: "login" | "signup") => {
    setAuthMode(mode);
    setEmail("");
    setPassword("");
    setDisplayName("");
    setLoginError("");
    setMessage("");
    setStatus("idle");
  };

  const login = async () => {
    setLoginError("");
    setMessage("");
    setStatus("signing-in");

    try {
      const result = await signInDriver(email, password);
      const nextProfile = await loadDriverProfile(result.user.uid);

      if (!nextProfile?.enabled) {
        await signOutDriver();
        throw new Error(
          "This driver account is waiting for administrator approval.",
        );
      }

      const nextBusIds = getDriverBusIds(nextProfile);
      const configuredBusIds = nextBusIds.filter((busId) =>
        buses.some((bus) => bus.id === busId),
      );

      setProfile(nextProfile);
      setSelectedBusId((current) =>
        current && configuredBusIds.includes(current)
          ? current
          : configuredBusIds[0] ?? "",
      );
      setSignedIn(true);
      setPassword("");
      setStatus("idle");

      if (configuredBusIds.length === 0) {
        setMessage(
          "Signed in. No bus is assigned to your account yet. Contact the administrator before starting tracking.",
        );
      } else {
        setMessage("");
      }
    } catch (error) {
      setStatus("error");
      setLoginError(
        error instanceof Error
          ? error.message
          : "Could not sign in as a driver.",
      );
    }
  };

  const signup = async () => {
    const name = displayName.trim();
    const normalizedEmail = email.trim();

    setLoginError("");
    setMessage("");

    if (name.length < 2) {
      setStatus("error");
      setLoginError("Enter your name.");
      return;
    }

    if (!normalizedEmail) {
      setStatus("error");
      setLoginError("Enter your email address.");
      return;
    }

    if (password.length < 6) {
      setStatus("error");
      setLoginError("Password must be at least 6 characters.");
      return;
    }

    setStatus("signing-up");

    try {
      await signUpDriver(name, normalizedEmail, password);
      await signOutDriver();

      setDisplayName("");
      setPassword("");
      setAuthMode("login");
      setStatus("idle");
      setMessage(
        "Account created. An administrator must enable your account and assign a bus before you can start tracking.",
      );
    } catch (error) {
      try {
        await signOutDriver();
      } catch {
        // Best-effort cleanup if Firebase signup already created a session.
      }

      setStatus("error");
      setLoginError(
        error instanceof Error
          ? error.message
          : "Could not create your driver account.",
      );
    }
  };

  const stopTracking = async () => {
    if (!session) return;

    await session.stop();
    setSession(null);
    setPosition(null);
    setStatus("idle");
    setMessage("Tracking stopped. The live bus location was removed.");
  };

  const startTracking = async () => {
    if (!selectedBus) return;

    const supportMessage = getLocationSupportMessage();
    if (supportMessage) {
      setStatus("error");
      setMessage(supportMessage);
      return;
    }

    setMessage("");
    setLoginError("");
    setPosition(null);
    setStatus("requesting");

    try {
      const nextSession = await startDriverTracking({
        busId: selectedBus.id,
        busNumber: selectedBus.busNumber,
        route: selectedBus.route,
        onPosition: setPosition,
        onError: setMessage,
      });

      setSession(nextSession);
      setStatus("tracking");
      setMessage(
        `Bus ${selectedBus.busNumber} is live. Firebase is saving the latest GPS position every second.`,
      );
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not start live tracking.",
      );
    }
  };

  const logout = async () => {
    if (session) {
      await stopTracking();
    }

    await signOutDriver();
    setSignedIn(false);
    setProfile(null);
    setSelectedBusId("");
    setEmail("");
    setPassword("");
    setDisplayName("");
    setStatus("idle");
    setMessage("");
    setLoginError("");
  };

  if (!signedIn) {
    return (
      <main className="simple-driver-page">
        <section className="simple-driver-card">
          <div className="simple-driver-auth-switch" aria-label="Driver account">
            <button
              className={authMode === "login" ? "active" : ""}
              type="button"
              onClick={() => switchAuthMode("login")}
            >
              Log in
            </button>
            <button
              className={authMode === "signup" ? "active" : ""}
              type="button"
              onClick={() => switchAuthMode("signup")}
            >
              Sign up
            </button>
          </div>

          <p className="simple-driver-eyebrow">DRIVER CONTROL</p>
          <h1>
            {authMode === "login" ? "Driver sign in" : "Create driver account"}
          </h1>
          <p className="simple-driver-description">
            {authMode === "login"
              ? "Sign in with your approved driver account."
              : "Create your driver account. An administrator must approve the account before you can sign in."}
          </p>

          <div className="simple-driver-form">
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
              Driver email
              <input
                ref={emailInputRef}
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

          {loginError && (
            <div className="simple-driver-status error" role="alert">
              <span className="status-dot error" />
              {loginError}
            </div>
          )}

          {message && !loginError && (
            <div className="simple-driver-status">
              <span className="status-dot" />
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
              status === "signing-in" ||
              status === "signing-up"
            }
            onClick={() =>
              void (authMode === "login" ? login() : signup())
            }
          >
            {authMode === "login" ? (
              <LogIn size={18} />
            ) : (
              <UserPlus size={18} />
            )}
            {status === "signing-in"
              ? "Signing in…"
              : status === "signing-up"
                ? "Creating account…"
                : authMode === "login"
                  ? "Sign in"
                  : "Create account"}
          </button>

          <div className="simple-driver-note">
            <ShieldCheck size={15} />
            Driver access is controlled by Firebase.
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="simple-driver-page">
      <section className="simple-driver-card">
        <div className="simple-driver-header">
          <div>
            <p className="simple-driver-eyebrow">DRIVER CONTROL</p>
            <h1>Live location</h1>
            <p className="simple-driver-description">
              {profile?.displayName ?? email}
            </p>
          </div>

          <button
            className="simple-driver-link-button"
            type="button"
            onClick={() => void logout()}
            disabled={status === "requesting"}
          >
            Sign out
          </button>
        </div>

        <label className="simple-driver-bus">
          Bus
          <select
            value={selectedBusId}
            disabled={Boolean(session) || allowedBuses.length === 0}
            onChange={(event) => setSelectedBusId(event.target.value)}
          >
            {allowedBuses.length === 0 ? (
              <option value="">No bus assigned</option>
            ) : (
              allowedBuses.map((bus) => (
                <option key={bus.id} value={bus.id}>
                  Bus {bus.busNumber} · Route {bus.route}
                </option>
              ))
            )}
          </select>
        </label>

        <button
          className="simple-driver-button"
          type="button"
          onClick={() =>
            session ? void stopTracking() : void startTracking()
          }
          disabled={!selectedBus || status === "requesting"}
        >
          {session ? (
            <>
              <Radio size={18} />
              Stop Tracking
            </>
          ) : (
            <>
              <MapPin size={18} />
              {status === "requesting"
                ? "Requesting location…"
                : "Start Tracking"}
            </>
          )}
        </button>

        <div
          className={
            status === "error"
              ? "simple-driver-status error"
              : "simple-driver-status"
          }
        >
          <span
            className={
              status === "tracking"
                ? "status-dot live"
                : status === "error"
                  ? "status-dot error"
                  : "status-dot"
            }
          />
          {status === "idle" && "Ready to request location"}
          {status === "requesting" && "Requesting your location…"}
          {status === "tracking" && (message || "Live tracking is active")}
          {status === "error" && loginError
            ? loginError
            : status === "error"
              ? message
              : ""}
          {status === "idle" && message}
        </div>

        {session && position && (
          <div className="simple-driver-coordinates">
            <div>
              <span>GPS</span>
              <strong>Connected</strong>
            </div>
            <div>
              <span>Accuracy</span>
              <strong>{formatAccuracy(position.accuracyMeters)}</strong>
            </div>
            <div>
              <span>Database</span>
              <strong>Saving every second</strong>
            </div>
            <div>
              <span>Bus</span>
              <strong>{selectedBus?.busNumber ?? selectedBusId}</strong>
            </div>
          </div>
        )}

        {!session && (
          <div className="simple-driver-empty">
            {allowedBuses.length === 0
              ? "No bus is assigned to this account yet. You can sign in, but tracking will remain unavailable until an administrator assigns a bus."
              : "Your coordinates are sent to Firebase only while tracking is active. They are not shown on this page."}
          </div>
        )}

        <div className="simple-driver-note">
          <ShieldCheck size={15} />
          Live location is protected by the Firebase driver rules.
        </div>
      </section>
    </main>
  );
}
