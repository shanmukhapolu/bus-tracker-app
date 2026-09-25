import { useEffect, useState } from "react";
import {
  LogIn,
  LogOut,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react";
import { SchoolLogo } from "../components/SchoolLogo";
import {
  loadAdminProfile,
  signInAdmin,
  signOutAdmin,
  signUpAdmin,
  type AdminProfile,
} from "../services/adminAuthService";
import {
  addFleetBus,
  assignDriverToBus,
  deleteFleetBus,
  subscribeFleet,
  type FleetBus,
  type FleetDriver,
} from "../services/fleetService";

export function AdminPage() {
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const [buses, setBuses] = useState<FleetBus[]>([]);
  const [drivers, setDrivers] = useState<FleetDriver[]>([]);
  const [busNumber, setBusNumber] = useState("");
  const [route, setRoute] = useState("");
  const [fleetMessage, setFleetMessage] = useState("");
  const [fleetError, setFleetError] = useState("");
  const [savingBus, setSavingBus] = useState(false);
  const [deletingBusId, setDeletingBusId] = useState("");

  useEffect(() => {
    if (!signedIn) return;

    const stop = subscribeFleet(
      setDrivers,
      setBuses,
      setFleetError,
    );

    return stop;
  }, [signedIn]);

  const switchMode = (mode: "login" | "signup") => {
    setAuthMode(mode);
    setEmail("");
    setPassword("");
    setDisplayName("");
    setMessage("");
    setStatus("idle");
  };

  const login = async () => {
    setStatus("loading");
    setMessage("");

    try {
      const result = await signInAdmin(email, password);
      const nextProfile = await loadAdminProfile(result.user.uid);

      if (
        !nextProfile ||
        nextProfile.role !== "admin" ||
        nextProfile.enabled !== true
      ) {
        await signOutAdmin();
        throw new Error("This admin account is waiting for approval.");
      }

      setProfile(nextProfile);
      setSignedIn(true);
      setPassword("");
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not sign in as an administrator.",
      );
    }
  };

  const signup = async () => {
    const name = displayName.trim();
    const normalizedEmail = email.trim();

    if (name.length < 2) {
      setStatus("error");
      setMessage("Enter your name.");
      return;
    }

    if (!normalizedEmail) {
      setStatus("error");
      setMessage("Enter your email address.");
      return;
    }

    if (password.length < 6) {
      setStatus("error");
      setMessage("Password must be at least 6 characters.");
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      await signUpAdmin(name, normalizedEmail, password);
      await signOutAdmin();
      setDisplayName("");
      setPassword("");
      setAuthMode("login");
      setStatus("idle");
      setMessage(
        "Account created. An administrator must enable this account before you can log in.",
      );
    } catch (error) {
      try {
        await signOutAdmin();
      } catch {
        // Best-effort cleanup if Firebase signup already created a session.
      }

      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not create the administrator account.",
      );
    }
  };

  const addBus = async () => {
    const normalizedBusNumber = busNumber.trim();
    const normalizedRoute = route.trim();

    if (!normalizedBusNumber || !normalizedRoute) {
      setFleetError("Enter a bus number and route.");
      setFleetMessage("");
      return;
    }

    setSavingBus(true);
    setFleetError("");
    setFleetMessage("");

    try {
      await addFleetBus(normalizedBusNumber, normalizedRoute);
      setBusNumber("");
      setRoute("");
      setFleetMessage(`Bus ${normalizedBusNumber} added.`);
    } catch (error) {
      setFleetError(
        error instanceof Error ? error.message : "Could not add the bus.",
      );
    } finally {
      setSavingBus(false);
    }
  };

  const deleteBus = async (bus: FleetBus) => {
    const confirmed = window.confirm(
      `Delete Bus ${bus.busNumber} on Route ${bus.route}? Any driver assigned to it will be unassigned.`,
    );

    if (!confirmed) return;

    setDeletingBusId(bus.id);
    setFleetError("");
    setFleetMessage("");

    try {
      await deleteFleetBus(bus.busNumber);
      setFleetMessage(`Bus ${bus.busNumber} deleted.`);
    } catch (error) {
      setFleetError(
        error instanceof Error
          ? error.message
          : "Could not delete the bus.",
      );
    } finally {
      setDeletingBusId("");
    }
  };

  const assignBus = async (driverUid: string, value: string) => {
    setFleetError("");
    setFleetMessage("");

    if (!value) {
      setFleetError("Select a bus to assign.");
      return;
    }

    try {
      await assignDriverToBus(driverUid, value);
      const driver = drivers.find((item) => item.uid === driverUid);
      setFleetMessage(
        `Bus ${value} assigned to ${driver?.displayName ?? "driver"}.`,
      );
    } catch (error) {
      setFleetError(
        error instanceof Error
          ? error.message
          : "Could not assign the bus.",
      );
    }
  };

  const logout = async () => {
    await signOutAdmin();
    setSignedIn(false);
    setProfile(null);
    setBuses([]);
    setDrivers([]);
    setFleetMessage("");
    setFleetError("");
  };

  if (!signedIn) {
    return (
      <main className="admin-auth-page">
        <section className="admin-auth-card">
          <div className="portal-logo-wrap">
            <SchoolLogo className="portal-logo" />
          </div>
          <div className="simple-driver-auth-switch" aria-label="Admin account">
            <button
              className={authMode === "login" ? "active" : ""}
              type="button"
              onClick={() => switchMode("login")}
            >
              Log in
            </button>
            <button
              className={authMode === "signup" ? "active" : ""}
              type="button"
              onClick={() => switchMode("signup")}
            >
              Sign up
            </button>
          </div>

          <p className="admin-auth-eyebrow">ADMIN PORTAL</p>
          <h1>
            {authMode === "login" ? "Admin sign in" : "Create admin account"}
          </h1>
          <p className="admin-auth-description">
            {authMode === "login"
              ? "Sign in with an approved administrator account."
              : "Create an administrator account. It must be manually enabled before login is allowed."}
          </p>

          <div className="admin-auth-form">
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
              Email
              <input
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

          {message && (
            <div
              className={
                status === "error"
                  ? "simple-driver-status error"
                  : "simple-driver-status"
              }
              role={status === "error" ? "alert" : "status"}
            >
              <span
                className={
                  status === "error" ? "status-dot error" : "status-dot"
                }
              />
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
              status === "loading"
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
            {status === "loading"
              ? authMode === "login"
                ? "Signing in…"
                : "Creating account…"
              : authMode === "login"
                ? "Sign in"
                : "Create account"}
          </button>

          <div className="simple-driver-note">
            <ShieldCheck size={15} />
            Administrator access is controlled by Firebase.
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-dashboard-page">
      <section className="admin-dashboard">
        <header className="admin-dashboard-header">
          <div className="portal-identity">
            <SchoolLogo className="portal-logo compact" />
            <div>
              <p className="admin-auth-eyebrow">ADMIN PORTAL</p>
              <h1>Welcome {profile?.displayName ?? "Admin"}</h1>
            </div>
          </div>
          <button
            className="admin-logout-button"
            type="button"
            onClick={() => void logout()}
          >
            <LogOut size={16} />
            Sign out
          </button>
        </header>

        <div className="admin-dashboard-grid">
          <section className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <span className="admin-panel-label">FLEET</span>
                <h2>Bus list</h2>
              </div>
              <span className="admin-panel-count">{buses.length}</span>
            </div>

            <div className="admin-add-bus-form">
              <input
                type="text"
                inputMode="numeric"
                placeholder="Bus number"
                value={busNumber}
                onChange={(event) => setBusNumber(event.target.value)}
              />
              <input
                type="text"
                placeholder="Route"
                value={route}
                onChange={(event) => setRoute(event.target.value)}
              />
              <button
                type="button"
                onClick={() => void addBus()}
                disabled={savingBus}
              >
                <Plus size={16} />
                {savingBus ? "Adding…" : "Add bus"}
              </button>
            </div>

            <div className="admin-list">
              {buses.length === 0 ? (
                <div className="admin-empty">No buses have been created yet.</div>
              ) : (
                buses.map((bus) => (
                  <div className="admin-list-row" key={bus.id}>
                    <div>
                      <strong>Bus {bus.busNumber}</strong>
                      <span>Route {bus.route}</span>
                    </div>
                    <div className="admin-bus-actions">
                      <span className="admin-status-pill">
                        {bus.enabled ? "Enabled" : "Disabled"}
                      </span>
                      <button
                        className="admin-delete-button"
                        type="button"
                        onClick={() => void deleteBus(bus)}
                        disabled={Boolean(deletingBusId)}
                        aria-label={`Delete bus ${bus.busNumber}`}
                        title="Delete bus"
                      >
                        <Trash2 size={15} />
                        {deletingBusId === bus.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <span className="admin-panel-label">DRIVERS</span>
                <h2>Bus drivers</h2>
              </div>
              <span className="admin-panel-count">{drivers.length}</span>
            </div>

            <div className="admin-list">
              {drivers.length === 0 ? (
                <div className="admin-empty">
                  No driver accounts have been created yet.
                </div>
              ) : (
                drivers.map((driver) => (
                  <div className="admin-driver-row" key={driver.uid}>
                    <div className="admin-driver-copy">
                      <strong>{driver.displayName}</strong>
                      <span>{driver.enabled ? "Enabled" : "Awaiting approval"}</span>
                    </div>
                    <div className="admin-driver-assignment">
                      <span>Assigned bus</span>
                      <select
                        value={driver.assignedBus}
                        onChange={(event) =>
                          void assignBus(driver.uid, event.target.value)
                        }
                        disabled={buses.length === 0}
                      >
                        <option value="">No bus assigned</option>
                        {buses.map((bus) => (
                          <option key={bus.id} value={bus.busNumber}>
                            Bus {bus.busNumber} · Route {bus.route}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {(fleetMessage || fleetError) && (
          <div
            className={
              fleetError
                ? "simple-driver-status error"
                : "simple-driver-status"
            }
            role={fleetError ? "alert" : "status"}
          >
            <span
              className={
                fleetError ? "status-dot error" : "status-dot"
              }
            />
            {fleetError || fleetMessage}
          </div>
        )}
      </section>
    </main>
  );
}
