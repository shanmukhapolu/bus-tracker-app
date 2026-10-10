import { useEffect, useMemo, useRef, useState } from "react";
import { LogIn, MapPin, Radio, ShieldCheck, UserPlus } from "lucide-react";
import { SchoolLogo } from "../components/SchoolLogo";
import {
  ensureDriverProfile,
  loadDriverProfile,
  signInDriver,
  signInDriverWithGoogle,
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
import {
  subscribeDriverProfile,
  subscribeFleetBuses,
  type FleetBus,
} from "../services/fleetService";

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
  const [driverUid, setDriverUid] = useState("");
  const [fleetBuses, setFleetBuses] = useState<FleetBus[]>([]);
  const [, setFleetError] = useState("");
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

  const driverBuses = useMemo(
    () =>
      fleetBuses
        .filter((bus) => bus.enabled)
        .map((bus) => ({
          id: bus.id,
          busNumber: bus.busNumber,
          route: bus.route,
        })),
    [fleetBuses],
  );

  const allowedBusIds = useMemo(() => getDriverBusIds(profile), [profile]);

  const allowedBuses = useMemo(
    () => driverBuses.filter((bus) => allowedBusIds.includes(bus.id)),
    [allowedBusIds, driverBuses],
  );

  const selectedBus = driverBuses.find((bus) => bus.id === selectedBusId);

  useEffect(() => {
    if (!signedIn || !driverUid) return;

    const stopBuses = subscribeFleetBuses(setFleetBuses, setFleetError);
    const stopProfile = subscribeDriverProfile(
      driverUid,
      (nextProfile) => {
        if (!nextProfile) return;

        setProfile((current) => ({
          ...(current ?? {}),
          displayName: nextProfile.displayName,
          enabled: nextProfile.enabled,
          assignedBus: nextProfile.assignedBus,
        }));

        if (!session) {
          setSelectedBusId(nextProfile.assignedBus || "");
        }
      },
      setFleetError,
    );

    return () => {
      stopBuses();
      stopProfile();
    };
  }, [signedIn, driverUid, session]);

  const switchAuthMode = (mode: "login" | "signup") => {
    setAuthMode(mode);
    setEmail("");
    setPassword("");
    setDisplayName("");
    setLoginError("");
    setMessage("");
    setStatus("idle");
  };

  const completeSignIn = async (user: {
    uid: string;
    displayName?: string | null;
    email?: string | null;
  }) => {
    let nextProfile = await loadDriverProfile(user.uid);
    if (!nextProfile) {
      nextProfile = await ensureDriverProfile(user);
    }

    if (!nextProfile.enabled) {
      await signOutDriver();
      throw new Error(
        "Your driver request was sent and is waiting for administrator approval.",
      );
    }

    const nextBusIds = getDriverBusIds(nextProfile);
    setProfile(nextProfile);
    setDriverUid(user.uid);
    setEmail(user.email ?? email);
    setSelectedBusId((current) =>
      current && nextBusIds.includes(current) ? current : (nextBusIds[0] ?? ""),
    );
    setSignedIn(true);
    setPassword("");
    setStatus("idle");

    if (nextBusIds.length === 0) {
      setMessage(
        "Signed in. No bus is assigned to your account yet. Contact the administrator before starting tracking.",
      );
    } else {
      setMessage("");
    }
  };

  const login = async () => {
    setLoginError("");
    setMessage("");
    setStatus("signing-in");

    try {
      const result = await signInDriver(email, password);
      await completeSignIn(result.user);
    } catch (error) {
      setStatus("error");
      setLoginError(
        error instanceof Error
          ? error.message
          : "Could not sign in as a driver.",
      );
    }
  };

  const loginWithGoogle = async () => {
    setLoginError("");
    setMessage("");
    setStatus("signing-in");

    try {
      const result = await signInDriverWithGoogle();
      await completeSignIn(result.user);
    } catch (error) {
      try {
        await signOutDriver();
      } catch {
        // Best-effort cleanup after a pending or interrupted Google sign-in.
      }
      setStatus("error");
      setLoginError(
        error instanceof Error
          ? error.message
          : "Could not sign in with Google.",
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
      const registration = await signUpDriver(
        name,
        normalizedEmail,
        password,
      );
      await signOutDriver();

      setDisplayName("");
      setPassword("");
      setAuthMode("login");
      setStatus("idle");
      setMessage(
        registration.profile.enabled
          ? "This driver account is already approved. Log in to start tracking."
          : registration.recoveredExistingAccount
            ? "We found your existing sign-in and completed its driver request. It is now waiting for administrator approval."
            : "Account created. An administrator must enable your account and assign a bus before you can start tracking.",
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
    setMessage(
      "Tracking stopped. The bus remains on the map at its last known location.",
    );
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
        nextSession.transport === "trusted_backend"
          ? `Bus ${selectedBus.busNumber} is live. The secure telemetry service is recording this trip.`
          : `Bus ${selectedBus.busNumber} is live. Firebase is saving the latest GPS position every second.`,
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
    setDriverUid("");
    setFleetBuses([]);
    setFleetError("");
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
          <div className="portal-logo-wrap">
            <SchoolLogo className="portal-logo" />
          </div>
          <div
            className="simple-driver-auth-switch"
            aria-label="Driver account"
          >
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
            onClick={() => void (authMode === "login" ? login() : signup())}
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

          <div className="simple-driver-auth-divider" aria-hidden="true">
            <span>or</span>
          </div>

          <button
            className="simple-driver-google-button"
            type="button"
            disabled={status === "signing-in" || status === "signing-up"}
            onClick={() => void loginWithGoogle()}
          >
            <span className="google-mark" aria-hidden="true">
              G
            </span>
            Continue with Google
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
          <div className="portal-identity">
            <SchoolLogo className="portal-logo compact" />
            <div>
              <p className="simple-driver-eyebrow">DRIVER CONTROL</p>
              <h1>Live location</h1>
              <p className="simple-driver-description">
                {profile?.displayName ?? email}
              </p>
            </div>
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
                  Bus {bus.busNumber}
                </option>
              ))
            )}
          </select>
        </label>

        <button
          className="simple-driver-button"
          type="button"
          onClick={() => (session ? void stopTracking() : void startTracking())}
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
              <strong>
                {session.transport === "trusted_backend"
                  ? `Trusted upload every ${Math.round(session.uploadIntervalMs / 1000)} sec`
                  : "Saving every second"}
              </strong>
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
