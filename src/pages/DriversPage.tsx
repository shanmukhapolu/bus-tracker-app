import { useMemo, useRef, useState } from "react";
import { LogIn, MapPin, Radio, ShieldCheck } from "lucide-react";
import { createMockBuses } from "../data/mockBuses";
import {
  getLocationSupportMessage,
  loadDriverProfile,
  signInDriver,
  signOutDriver,
  startDriverTracking,
  type DriverLocation,
  type DriverProfile,
  type DriverTrackingSession,
} from "../services/driverTrackingService";

const buses = createMockBuses();

function formatAccuracy(value: number | null) {
  return value === null ? "—" : `±${Math.round(value)} m`;
}

export function DriversPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [selectedBusId, setSelectedBusId] = useState("");
  const [session, setSession] = useState<DriverTrackingSession | null>(null);
  const [position, setPosition] = useState<DriverLocation | null>(null);
  const [status, setStatus] = useState<
    "idle" | "signing-in" | "requesting" | "tracking" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const [loginError, setLoginError] = useState("");

  const emailInputRef = useRef<HTMLInputElement>(null);

  const allowedBusIds = useMemo(
    () =>
      Object.entries(profile?.allowedBuses ?? {})
        .filter(([, allowed]) => allowed)
        .map(([busId]) => busId),
    [profile],
  );

  const allowedBuses = useMemo(
    () => buses.filter((bus) => allowedBusIds.includes(bus.id)),
    [allowedBusIds],
  );

  const selectedBus = buses.find((bus) => bus.id === selectedBusId);

  const login = async () => {
    setLoginError("");
    setMessage("");
    setStatus("signing-in");

    try {
      const result = await signInDriver(email.trim(), password);
      const nextProfile = await loadDriverProfile(result.user.uid);

      if (!nextProfile?.enabled) {
        await signOutDriver();
        throw new Error("This Firebase driver account is not enabled.");
      }

      const nextAllowedBusIds = Object.entries(nextProfile.allowedBuses ?? {})
        .filter(([, allowed]) => allowed)
        .map(([busId]) => busId);

      if (nextAllowedBusIds.length === 0) {
        await signOutDriver();
        throw new Error("This driver account has no assigned buses.");
      }

      setProfile(nextProfile);
      setSelectedBusId((current) =>
        current && nextAllowedBusIds.includes(current)
          ? current
          : nextAllowedBusIds[0],
      );
      setSignedIn(true);
      setPassword("");
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setLoginError(
        error instanceof Error
          ? error.message
          : "Could not sign in as a driver.",
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
      // startDriverTracking deliberately requests native GPS permission
      // before it performs any Firebase/database operation.
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
    setStatus("idle");
    setMessage("");
    setLoginError("");
  };

  if (!signedIn) {
    return (
      <main className="simple-driver-page">
        <section className="simple-driver-card">
          <p className="simple-driver-eyebrow">DRIVER CONTROL</p>
          <h1>Driver sign in</h1>
          <p className="simple-driver-description">
            Sign in first. Pressing Start Tracking then uses the exact browser
            GPS flow from the working location test page.
          </p>

          <div className="simple-driver-form">
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
                autoComplete="current-password"
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

          <button
            className="simple-driver-button"
            type="button"
            disabled={!email.trim() || !password || status === "signing-in"}
            onClick={() => void login()}
          >
            <LogIn size={18} />
            {status === "signing-in" ? "Signing in…" : "Sign in"}
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
            disabled={Boolean(session)}
            onChange={(event) => setSelectedBusId(event.target.value)}
          >
            {allowedBuses.map((bus) => (
              <option key={bus.id} value={bus.id}>
                Bus {bus.busNumber} · Route {bus.route}
              </option>
            ))}
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
          {status === "error" && message}
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
            Your coordinates are sent to Firebase only while tracking is active.
            They are not shown on this page.
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
