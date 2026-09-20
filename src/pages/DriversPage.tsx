import { useEffect, useMemo, useState } from "react";
import { LogOut, MapPin, Radio, ShieldCheck, Smartphone } from "lucide-react";
import type {
  DriverLocation,
  DriverProfile,
  DriverTrackingSession,
} from "../services/driverTrackingService";
import {
  listenForDriverAuth,
  loadDriverProfile,
  signInDriver,
  signOutDriver,
  startDriverTracking,
} from "../services/driverTrackingService";
import { firebaseConfigured } from "../config/firebase";
import { createMockBuses } from "../data/mockBuses";

const buses = createMockBuses();

function formatAccuracy(value: number | null) {
  return value === null ? "—" : `±${Math.round(value)} m`;
}

function formatSpeed(speedMps: number | null) {
  if (speedMps === null) return "—";
  return `${Math.round(speedMps * 3.6)} km/h`;
}

export function DriversPage() {
  const [user, setUser] = useState<any | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedBusId, setSelectedBusId] = useState("");
  const [session, setSession] = useState<DriverTrackingSession | null>(null);
  const [position, setPosition] = useState<DriverLocation | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!firebaseConfigured) {
      setAuthLoading(false);
      return;
    }

    let active = true;
    let unsubscribe: (() => void) | undefined;

    void listenForDriverAuth((nextUser) => {
      if (!active) return;

      setUser(nextUser);
      setProfile(null);
      setProfileLoading(Boolean(nextUser));

      if (!nextUser) {
        setProfileLoading(false);
        return;
      }

      void loadDriverProfile(nextUser.uid)
        .then((nextProfile) => {
          if (!active) return;
          setProfile(nextProfile);
          setSelectedBusId((current) => {
            if (current) return current;
            const allowed = Object.keys(nextProfile?.allowedBuses ?? {});
            return allowed[0] ?? "";
          });
        })
        .catch((loadError) => {
          if (!active) return;
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load the driver profile.",
          );
        })
        .finally(() => {
          if (active) setProfileLoading(false);
        });
    })
      .then((stop) => {
        if (!active) {
          stop();
          return;
        }
        unsubscribe = stop;
        setAuthLoading(false);
      })
      .catch((authError) => {
        if (!active) return;
        setError(
          authError instanceof Error
            ? authError.message
            : "Firebase Authentication could not initialize.",
        );
        setAuthLoading(false);
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

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

  const login = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    try {
      await signInDriver(email.trim(), password);
      setPassword("");
    } catch {
      setError(
        "Sign-in failed. Check the driver email/password and confirm that the account is enabled in Firebase Authentication.",
      );
    }
  };

  const stopTracking = async () => {
    if (!session) return;
    await session.stop();
    setSession(null);
    setPosition(null);
  };

  const startTracking = async () => {
    if (!selectedBus) return;

    setStarting(true);
    setError("");
    setPosition(null);

    try {
      const nextSession = await startDriverTracking({
        busId: selectedBus.id,
        busNumber: selectedBus.busNumber,
        route: selectedBus.route,
        onPosition: setPosition,
        onError: setError,
      });
      setSession(nextSession);
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "Could not start tracking.",
      );
    } finally {
      setStarting(false);
    }
  };

  const logout = async () => {
    if (session) {
      await stopTracking();
    }
    await signOutDriver();
  };

  if (!firebaseConfigured) {
    return (
      <main className="drivers-shell">
        <section className="drivers-card drivers-config-card">
          <div className="drivers-icon">
            <ShieldCheck size={28} />
          </div>
          <p className="eyebrow">DRIVER CONTROL</p>
          <h1>Firebase is not configured</h1>
          <p>
            Add the VITE_FIREBASE_* environment variables from the repository
            setup instructions before using the driver tracker.
          </p>
          <a href="/">Back to public tracker</a>
        </section>
      </main>
    );
  }

  if (authLoading) {
    return (
      <main className="drivers-shell">
        <section className="drivers-card">
          <p className="eyebrow">DRIVER CONTROL</p>
          <h1>Connecting…</h1>
          <p>Initializing secure driver access.</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="drivers-shell">
        <section className="drivers-card">
          <div className="drivers-icon">
            <Smartphone size={28} />
          </div>
          <p className="eyebrow">DRIVER CONTROL</p>
          <h1>Start phone tracking</h1>
          <p>
            Sign in with your assigned driver account. This page is intentionally
            not linked from the public tracker.
          </p>

          <form className="drivers-form" onSubmit={login}>
            <label>
              Driver email
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            {error && (
              <div className="drivers-error" role="alert">
                {error}
              </div>
            )}
            <button className="drivers-primary" type="submit">
              Sign in
            </button>
          </form>

          <a className="drivers-back" href="/">
            Back to public tracker
          </a>
        </section>
      </main>
    );
  }

  if (profileLoading) {
    return (
      <main className="drivers-shell">
        <section className="drivers-card">
          <p className="eyebrow">DRIVER CONTROL</p>
          <h1>Loading driver profile…</h1>
        </section>
      </main>
    );
  }

  if (!profile?.enabled) {
    return (
      <main className="drivers-shell">
        <section className="drivers-card">
          <div className="drivers-icon">
            <ShieldCheck size={28} />
          </div>
          <p className="eyebrow">DRIVER CONTROL</p>
          <h1>Access not enabled</h1>
          <p>
            This Firebase account is not configured as an active driver. An
            administrator needs to add your UID under the drivers node.
          </p>
          {error && <div className="drivers-error">{error}</div>}
          <button className="drivers-secondary" onClick={() => void logout()}>
            <LogOut size={17} />
            Sign out
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="drivers-shell">
      <section className="drivers-card drivers-wide-card">
        <header className="drivers-header">
          <div>
            <p className="eyebrow">DRIVER CONTROL</p>
            <h1>Live bus tracking</h1>
            <p>{profile.displayName ?? user.email ?? "Driver"}</p>
          </div>
          <button className="drivers-secondary" onClick={() => void logout()}>
            <LogOut size={17} />
            Sign out
          </button>
        </header>

        <div className="drivers-status">
          <span className={session ? "status-live" : "status-idle"}>
            <span />
            {session ? "TRACKING ACTIVE" : "NOT TRACKING"}
          </span>
          <span className="drivers-secure-label">
            <ShieldCheck size={15} />
            Firebase secured
          </span>
        </div>

        <div className="driver-control-grid">
          <label>
            Bus
            <select
              value={selectedBusId}
              disabled={Boolean(session)}
              onChange={(event) => setSelectedBusId(event.target.value)}
            >
              <option value="" disabled>
                Select a bus
              </option>
              {allowedBuses.map((bus) => (
                <option key={bus.id} value={bus.id}>
                  Bus {bus.busNumber} · Route {bus.route}
                </option>
              ))}
            </select>
          </label>

          <div className="driver-helper">
            <MapPin size={18} />
            <div>
              <strong>Phone location</strong>
              <span>High-accuracy GPS is used while tracking.</span>
            </div>
          </div>
        </div>

        {allowedBuses.length === 0 && (
          <div className="drivers-error" role="alert">
            Your account is enabled, but no buses are assigned to it yet.
          </div>
        )}

        {error && (
          <div className="drivers-error" role="alert">
            {error}
          </div>
        )}

        {!session ? (
          <button
            className="drivers-primary drivers-start"
            disabled={!selectedBus || starting}
            onClick={() => void startTracking()}
          >
            <Radio size={19} />
            {starting ? "Starting GPS…" : "Start tracking"}
          </button>
        ) : (
          <button
            className="drivers-stop"
            onClick={() => void stopTracking()}
          >
            Stop tracking
          </button>
        )}

        {position && session && (
          <div className="drivers-live-panel">
            <div>
              <span>Bus {selectedBus?.busNumber}</span>
              <strong>GPS connected</strong>
            </div>
            <div>
              <span>Accuracy</span>
              <strong>{formatAccuracy(position.accuracyMeters)}</strong>
            </div>
            <div>
              <span>Speed</span>
              <strong>{formatSpeed(position.speedMps)}</strong>
            </div>
            <div>
              <span>Coordinates</span>
              <strong>
                {position.latitude.toFixed(5)},{" "}
                {position.longitude.toFixed(5)}
              </strong>
            </div>
          </div>
        )}

        <div className="drivers-warning">
          Keep this page open and the phone where it can receive GPS. A secure
          HTTPS origin is required for browser geolocation, and phone browsers
          may throttle location updates when the page is backgrounded.
        </div>

        <footer className="drivers-footer">
          <a href="/">Public tracker</a>
          <span>Internal driver page</span>
        </footer>
      </section>
    </main>
  );
}
