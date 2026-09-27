import { useCallback, useEffect, useState } from "react";
import adminStyles from "../admin-reference.css?raw";
import { AdminLogin } from "../admin/AdminLogin";
import { AdminLayout, type AdminPageKey } from "../admin/AdminLayout";
import { AdminDashboard } from "../admin/AdminDashboard";
import { AdminLiveMap } from "../admin/AdminLiveMap";
import { AdminBuses } from "../admin/AdminBuses";
import { AdminGeofences } from "../admin/AdminGeofences";
import { AdminDrivers } from "../admin/AdminDrivers";
import { AdminBusDetails } from "../admin/AdminBusDetails";
import { AdminGeofenceMonitor, type GeofenceAlert } from "../admin/AdminGeofenceMonitor";
import { useAdminFleet } from "../admin/adminData";
import { useGeofences } from "../services/geofenceService";
import { loadAdminProfile, signOutAdmin } from "../services/adminAuthService";
import { getFirebaseRuntime } from "../config/firebase";

function busIdFromPath(pathname: string) {
  const match = pathname.match(/^\/bus\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : "";
}

function routeFromPath(pathname: string) {
  return { page: pageFromPath(pathname), busId: busIdFromPath(pathname) };
}

function pageFromPath(pathname: string): AdminPageKey {
  if (pathname === "/admin/map") return "map";
  if (pathname === "/admin/buses" || pathname === "/admin/devices") return "buses";
  if (pathname === "/admin/geofences") return "geofences";
  if (pathname === "/admin/drivers") return "drivers";
  return "dashboard";
}

export function AdminPage() {
  const [route, setRoute] = useState(() => routeFromPath(window.location.pathname));
  const page = route.page;
  const [authLoading, setAuthLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [authError, setAuthError] = useState("");
  const [alerts, setAlerts] = useState<GeofenceAlert[]>([]);

  const fleet = useAdminFleet(signedIn);
  const geofenceState = useGeofences(signedIn);

  useEffect(() => {
    const style = document.createElement("style");
    style.id = "admin-reference-styles";
    style.textContent = adminStyles;
    document.getElementById(style.id)?.remove();
    document.head.appendChild(style);
    return () => document.getElementById(style.id)?.remove();
  }, []);

  useEffect(() => {
    const currentPath = window.location.pathname;
    if (!currentPath.startsWith("/admin") && !/^\/bus\/[^/]+$/.test(currentPath)) return;

    const onPopState = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    let stopped = false;
    let unsubscribe: (() => void) | undefined;

    void getFirebaseRuntime()
      .then((runtime) => {
        if (stopped) return;
        unsubscribe = runtime.onAuthStateChanged(runtime.auth, async (user) => {
          if (!user) {
            if (!stopped) {
              setSignedIn(false);
              setDisplayName("");
              setAuthLoading(false);
            }
            return;
          }

          try {
            const profile = await loadAdminProfile(user.uid);
            if (!profile || profile.role !== "admin" || profile.enabled !== true) {
              await signOutAdmin();
              if (!stopped) {
                setSignedIn(false);
                setDisplayName("");
                setAuthError("This account is not an enabled administrator.");
              }
              return;
            }

            if (!stopped) {
              setSignedIn(true);
              setDisplayName(profile.displayName ?? user.email ?? "Admin");
              setAuthError("");
            }
          } catch (error) {
            if (!stopped) {
              setSignedIn(false);
              setDisplayName("");
              setAuthError(error instanceof Error ? error.message : "Could not verify administrator access.");
            }
          } finally {
            if (!stopped) setAuthLoading(false);
          }
        });
      })
      .catch((error) => {
        if (!stopped) {
          setAuthLoading(false);
          setAuthError(error instanceof Error ? error.message : "Could not connect to Firebase.");
        }
      });

    return () => {
      stopped = true;
      unsubscribe?.();
    };
  }, []);

  const dismissAlert = useCallback((id: string) => {
    setAlerts((current) => current.filter((alert) => alert.id !== id));
  }, []);

  const handleGeofenceEntry = useCallback((alert: GeofenceAlert) => {
    setAlerts((current) => [alert, ...current].slice(0, 4));
    window.setTimeout(() => dismissAlert(alert.id), 7000);
  }, [dismissAlert]);

  const navigate = (next: AdminPageKey) => {
    const paths: Record<AdminPageKey, string> = {
      dashboard: "/admin",
      map: "/admin/map",
      buses: "/admin/buses",
      geofences: "/admin/geofences",
      drivers: "/admin/drivers",
    };
    window.history.pushState({}, "", paths[next]);
    setRoute({ page: next, busId: "" });
  };

  const handleSignedIn = (name: string) => {
    setSignedIn(true);
    setDisplayName(name);
    setAuthError("");
    const requested = routeFromPath(window.location.pathname);
    if (requested.busId) {
      setRoute(requested);
      return;
    }
    navigate(requested.page);
  };

  const openBus = (busId: string) => {
    window.history.pushState({}, "", "/bus/" + encodeURIComponent(busId));
    setRoute({ page: "buses", busId });
  };

  const signOut = async () => {
    await signOutAdmin();
    setSignedIn(false);
    setDisplayName("");
    setAlerts([]);
    setRoute({ page: "dashboard", busId: "" });
    window.history.replaceState({}, "", "/admin");
  };

  if (authLoading) return <div className="empty">Checking administrator access…</div>;

  if (!signedIn) {
    return (
      <div className="admin-ui">
        <AdminLogin onSignedIn={handleSignedIn} sessionMessage={authError} />
      </div>
    );
  }

  return (
    <div className="admin-ui">
      <AdminGeofenceMonitor
        buses={fleet.buses}
        geofences={geofenceState.geofences}
        onEnter={handleGeofenceEntry}
      />

      <AdminLayout
        page={page}
        onNavigate={navigate}
        onSignOut={() => void signOut()}
        displayName={displayName}
        buses={fleet.buses}
      >
        {route.busId ? (
          <AdminBusDetails
            busId={route.busId}
            buses={fleet.buses}
            drivers={fleet.drivers}
            connected={fleet.connected}
            error={fleet.connectionError}
            onBack={() => navigate("buses")}
          />
        ) : page === "dashboard" ? (
          <AdminDashboard
            buses={fleet.buses}
            drivers={fleet.drivers}
            connected={fleet.connected}
            error={fleet.connectionError || fleet.driverError}
            onRefreshHint={() => navigate("map")}
            onOpenBus={openBus}
          />
        ) : page === "map" ? (
          <AdminLiveMap
            buses={fleet.buses}
            drivers={fleet.drivers}
            connected={fleet.connected}
            error={fleet.connectionError}
          />
        ) : page === "buses" ? (
          <AdminBuses
            buses={fleet.buses}
            drivers={fleet.drivers}
            geofences={geofenceState.geofences}
            connected={fleet.connected}
            error={fleet.connectionError || geofenceState.error}
            onOpenBus={openBus}
          />
        ) : page === "geofences" ? (
          <AdminGeofences
            geofences={geofenceState.geofences}
            connected={fleet.connected}
            error={geofenceState.error}
          />
        ) : (
          <AdminDrivers
            drivers={fleet.drivers}
            buses={fleet.buses.map((bus) => ({
              id: bus.id,
              busNumber: bus.busNumber,
              route: bus.route,
              enabled: true,
            }))}
            error={fleet.driverError}
          />
        )}
      </AdminLayout>

      <div className="geofence-toast-stack">
        {alerts.map((alert) => (
          <div key={alert.id} className="geofence-toast-shell">
            <div className="geofence-toast" role="status" aria-live="polite">
              <div className="geofence-toast-icon"><span>!</span></div>
              <div className="geofence-toast-copy">
                <strong>Geofence entry</strong>
                <p>Bus {alert.busNumber} entered {alert.geofenceName}.</p>
                <span>{new Date(alert.timestamp).toLocaleTimeString()}</span>
              </div>
              <button type="button" onClick={() => dismissAlert(alert.id)} aria-label="Dismiss notification">×</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
