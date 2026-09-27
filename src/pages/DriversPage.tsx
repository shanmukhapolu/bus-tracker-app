import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  LogIn,
  MapPin,
  Navigation,
  Radio,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { DriverNavigationMap } from "../components/DriverNavigationMap";
import { SchoolLogo } from "../components/SchoolLogo";
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
import {
  subscribeDriverProfile,
  subscribeFleetBuses,
  type FleetBus,
} from "../services/fleetService";
import { subscribeDriverRoutes } from "../services/routeService";
import type { DriverRoute } from "../types/route";

function formatAccuracy(value: number | null) {
  return value === null ? "—" : `±${Math.round(value)} m`;
}

function distanceMiles(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const startLatitude = radians(a.latitude);
  const endLatitude = radians(b.latitude);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function fallbackRoute(routeId: string): DriverRoute {
  return {
    id: routeId,
    name: `Route ${routeId}`,
    school: "",
    enabled: true,
    stops: [],
  };
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
  const [fleetError, setFleetError] = useState("");
  const [routes, setRoutes] = useState<DriverRoute[]>([]);
  const [routeError, setRouteError] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [selectedBusId, setSelectedBusId] = useState("");
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [session, setSession] = useState<DriverTrackingSession | null>(null);
  const [position, setPosition] = useState<DriverLocation | null>(null);
  const [nextStopIndex, setNextStopIndex] = useState(0);
  const [status, setStatus] = useState<
    "idle" | "signing-in" | "signing-up" | "requesting" | "tracking" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const [loginError, setLoginError] = useState("");

  const emailInputRef = useRef<HTMLInputElement>(null);
  const stopInitialized = useRef(false);

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
  const availableRoutes = useMemo(() => {
    const map = new Map(routes.map((route) => [route.id, route]));
    driverBuses.forEach((bus) => {
      if (bus.route && !map.has(bus.route)) {
        map.set(bus.route, fallbackRoute(bus.route));
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
  }, [driverBuses, routes]);
  const selectedRoute = availableRoutes.find(
    (route) => route.id === selectedRouteId,
  );
  const nextStop = selectedRoute?.stops[nextStopIndex] ?? null;
  const nextStopDistance =
    position && nextStop ? distanceMiles(position, nextStop) : null;

  useEffect(() => {
    if (!signedIn || !driverUid) return;

    const stopBuses = subscribeFleetBuses(setFleetBuses, setFleetError);
    const stopRoutes = subscribeDriverRoutes(setRoutes, setRouteError);
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
      stopRoutes();
    };
  }, [signedIn, driverUid, session]);

  useEffect(() => {
    if (session) return;
    const bus = driverBuses.find((item) => item.id === selectedBusId);
    if (bus?.route) setSelectedRouteId(bus.route);
  }, [driverBuses, selectedBusId, session]);

  useEffect(() => {
    stopInitialized.current = false;
    setNextStopIndex(0);
  }, [selectedRouteId, session]);

  useEffect(() => {
    if (!session || !position || !selectedRoute?.stops.length) return;
    if (!stopInitialized.current) {
      const nearest = selectedRoute.stops.reduce(
        (best, stop, index) => {
          const distance = distanceMiles(position, stop);
          return distance < best.distance ? { index, distance } : best;
        },
        { index: 0, distance: Number.POSITIVE_INFINITY },
      );
      setNextStopIndex(nearest.index);
      stopInitialized.current = true;
      return;
    }
    const current = selectedRoute.stops[nextStopIndex];
    if (
      current &&
      distanceMiles(position, current) <= 0.05 &&
      nextStopIndex < selectedRoute.stops.length - 1
    ) {
      setNextStopIndex((index) => index + 1);
    }
  }, [nextStopIndex, position, selectedRoute, session]);

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

      setProfile(nextProfile);
      setDriverUid(result.user.uid);
      setSelectedBusId((current) =>
        current && nextBusIds.includes(current)
          ? current
          : (nextBusIds[0] ?? ""),
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
    setNextStopIndex(0);
    setStatus("idle");
    setMessage("Tracking stopped. The bus remains on the map at its last known location.");
  };

  const startTracking = async () => {
    if (!selectedBus || !selectedRoute) return;

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
        route: selectedRoute.id,
        onPosition: setPosition,
        onError: setMessage,
      });

      setSession(nextSession);
      setStatus("tracking");
      setMessage(
        `Bus ${selectedBus.busNumber} is live on ${selectedRoute.name}.`,
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
    setSelectedRouteId("");
    setDriverUid("");
    setFleetBuses([]);
    setRoutes([]);
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

          <div className="simple-driver-note">
            <ShieldCheck size={15} />
            Driver access is controlled by Firebase.
          </div>
        </section>
      </main>
    );
  }

  if (session && selectedBus && selectedRoute) {
    const routeFinished =
      selectedRoute.stops.length > 0 &&
      nextStopIndex === selectedRoute.stops.length - 1 &&
      nextStopDistance !== null &&
      nextStopDistance <= 0.05;
    return (
      <main className="driver-navigation-page">
        <DriverNavigationMap
          busNumber={selectedBus.busNumber}
          position={position}
          route={selectedRoute}
          nextStop={nextStop}
        />
        <header className="driver-navigation-header">
          <div className="driver-navigation-brand">
            <SchoolLogo className="portal-logo compact" />
            <div>
              <strong>Bus {selectedBus.busNumber}</strong>
              <span>{selectedRoute.name}</span>
            </div>
          </div>
          <div className="driver-navigation-live">
            <i /> Tracking live
          </div>
        </header>

        <section className="driver-next-stop-card" aria-live="polite">
          <div className="driver-next-stop-label">
            <Navigation size={16} />
            {routeFinished ? "Route complete" : "Next stop"}
          </div>
          {nextStop ? (
            <>
              <div className="driver-next-stop-main">
                <span className="driver-stop-sequence">
                  {nextStopIndex + 1}
                </span>
                <div>
                  <h1>
                    {routeFinished ? "Final stop reached" : nextStop.name}
                  </h1>
                  <p>
                    {nextStop.address ||
                      selectedRoute.school ||
                      selectedRoute.name}
                  </p>
                </div>
                <strong className="driver-stop-distance">
                  {nextStopDistance === null
                    ? "Locating…"
                    : nextStopDistance < 0.1
                      ? `${Math.max(0, Math.round(nextStopDistance * 5280))} ft`
                      : `${nextStopDistance.toFixed(1)} mi`}
                </strong>
              </div>
              {!routeFinished &&
                nextStopIndex < selectedRoute.stops.length - 1 && (
                  <button
                    className="driver-next-stop-button"
                    type="button"
                    onClick={() => setNextStopIndex((index) => index + 1)}
                  >
                    Mark stop complete <ArrowRight size={17} />
                  </button>
                )}
            </>
          ) : (
            <div className="driver-route-unconfigured">
              <strong>Stops have not been configured for this route.</strong>
              <span>Your live bus position is still shown on the map.</span>
            </div>
          )}
          <div className="driver-navigation-meta">
            <span>
              GPS {position ? "connected" : "locating"}
              {position ? ` · ${formatAccuracy(position.accuracyMeters)}` : ""}
            </span>
            <span>
              Stop {selectedRoute.stops.length ? nextStopIndex + 1 : 0} of{" "}
              {selectedRoute.stops.length}
            </span>
          </div>
          <div className="driver-screen-warning">
            Keep this screen open while driving. A mobile browser cannot track
            after the website is fully closed.
          </div>
          <button
            className="driver-stop-tracking"
            type="button"
            onClick={() => void stopTracking()}
          >
            <Radio size={17} /> Stop tracking
          </button>
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
                  Bus {bus.busNumber} · Route {bus.route}
                </option>
              ))
            )}
          </select>
        </label>

        <label className="simple-driver-bus">
          Route
          <select
            value={selectedRouteId}
            disabled={Boolean(session) || availableRoutes.length === 0}
            onChange={(event) => setSelectedRouteId(event.target.value)}
          >
            {availableRoutes.length === 0 ? (
              <option value="">No route configured</option>
            ) : (
              availableRoutes.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.name}
                  {route.stops.length ? ` · ${route.stops.length} stops` : ""}
                </option>
              ))
            )}
          </select>
        </label>

        {(fleetError || routeError) && (
          <div className="simple-driver-status error" role="alert">
            <span className="status-dot error" />
            {fleetError || routeError}
          </div>
        )}

        <button
          className="simple-driver-button"
          type="button"
          onClick={() => (session ? void stopTracking() : void startTracking())}
          disabled={!selectedBus || !selectedRoute || status === "requesting"}
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
              : "Choose the bus and route for this trip. The live map opens after tracking starts."}
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
