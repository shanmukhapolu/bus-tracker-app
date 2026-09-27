import { useCallback, useEffect, useState } from "react";
import adminStyles from "../admin-reference.css?raw";
import modernAdminStyles from "../../admin-modern.css?raw";
import { AdminLogin } from "../admin/AdminLogin";
import { AdminLayout, type AdminPageKey } from "../admin/AdminLayout";
import { AdminDashboard } from "../admin/AdminDashboard";
import { AdminLiveMap } from "../admin/AdminLiveMap";
import { AdminBuses } from "../admin/AdminBuses";
import { AdminDrivers } from "../admin/AdminDrivers";
import { AdminBusDetails } from "../admin/AdminBusDetails";
import { AdminGeofences } from "../admin/AdminGeofences";
import { AdminGeofenceDetail } from "../admin/AdminGeofenceDetail";
import {
  AdminGeofenceMonitor,
  type GeofenceEntryEvent,
} from "../admin/AdminGeofenceMonitor";
import { useAdminFleet } from "../admin/adminData";
import { loadAdminProfile, signOutAdmin } from "../services/adminAuthService";
import { getFirebaseRuntime } from "../config/firebase";
import {
  subscribeGeofences,
  subscribeGeofenceAlerts,
  subscribeGeofenceBusOrder,
  recordGeofenceEntry,
} from "../services/geofenceService";
import type { Geofence } from "../types/geofence";

interface AdminRoute {
  page: AdminPageKey;
  busId: string;
  geofenceId: string | null;
}

function busIdFromPath(pathname: string) {
  const match = pathname.match(/^\/bus\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : "";
}

function routeFromPath(pathname: string): AdminRoute {
  const geofenceMatch = pathname.match(/^\/admin\/geofences\/([^/]+)$/);

  return {
    page: pageFromPath(pathname),
    busId: busIdFromPath(pathname),
    geofenceId: geofenceMatch
      ? decodeURIComponent(geofenceMatch[1])
      : null,
  };
}

function pageFromPath(pathname: string): AdminPageKey {
  if (pathname === "/admin/map") return "map";
  if (pathname === "/admin/buses" || pathname === "/admin/devices") {
    return "buses";
  }
  if (pathname === "/admin/drivers") return "drivers";
  if (
    pathname === "/admin/geofences" ||
    pathname.startsWith("/admin/geofences/")
  ) {
    return "geofences";
  }
  return "dashboard";
}

export function AdminPage() {
  const [route, setRoute] = useState<AdminRoute>(() =>
    routeFromPath(window.location.pathname),
  );
  const [authLoading, setAuthLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [authError, setAuthError] = useState("");
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [geofenceError, setGeofenceError] = useState("");
  const [geofenceEvents, setGeofenceEvents] = useState<GeofenceEntryEvent[]>([]);
  const [geofenceOrder, setGeofenceOrder] = useState<Record<string, import("../services/geofenceService").GeofenceBusOrderEntry[]>>({});
  const [geofenceActivityError, setGeofenceActivityError] = useState("");

  const fleet = useAdminFleet(signedIn);
  const page = route.page;

  useEffect(() => {
    const style = document.createElement("style");
    style.id = "admin-reference-styles";
    style.textContent = adminStyles + "\n" + modernAdminStyles;
    document.getElementById(style.id)?.remove();
    document.head.appendChild(style);

    return () => document.getElementById(style.id)?.remove();
  }, []);

  useEffect(() => {
    const currentPath = window.location.pathname;
    if (
      !currentPath.startsWith("/admin") &&
      !/^\/bus\/[^/]+$/.test(currentPath)
    ) {
      return;
    }

    const onPopState = () =>
      setRoute(routeFromPath(window.location.pathname));

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);



  useEffect(() => {
    if (!signedIn) {
      setGeofences([]);
      setGeofenceError("");
      return;
    }

    return subscribeGeofences(
      (next) => {
        setGeofences(next);
        setGeofenceError("");
      },
      setGeofenceError,
    );
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) {
      setGeofenceEvents([]);
      setGeofenceOrder({});
      setGeofenceActivityError("");
      return;
    }

    const setError = (message: string) => setGeofenceActivityError(message);

    const stopAlerts = subscribeGeofenceAlerts(
      (next) => {
        setGeofenceEvents(next);
        setGeofenceActivityError("");
      },
      setError,
    );

    const stopOrder = subscribeGeofenceBusOrder(
      (next) => {
        setGeofenceOrder(next);
        setGeofenceActivityError("");
      },
      setError,
    );

    return () => {
      stopAlerts();
      stopOrder();
    };
  }, [signedIn]);

  useEffect(() => {
    let stopped = false;
    let unsubscribe: (() => void) | undefined;

    void getFirebaseRuntime()
      .then((runtime) => {
        if (stopped) return;

        unsubscribe = runtime.onAuthStateChanged(
          runtime.auth,
          async (user) => {
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

              if (
                !profile ||
                profile.role !== "admin" ||
                profile.enabled !== true
              ) {
                await signOutAdmin();
                if (!stopped) {
                  setSignedIn(false);
                  setDisplayName("");
                  setAuthError(
                    "This account is not an enabled administrator.",
                  );
                }
                return;
              }

              if (!stopped) {
                setSignedIn(true);
                setDisplayName(
                  profile.displayName ?? user.email ?? "Admin",
                );
                setAuthError("");
              }
            } catch (caught) {
              if (!stopped) {
                setSignedIn(false);
                setDisplayName("");
                setAuthError(
                  caught instanceof Error
                    ? caught.message
                    : "Could not verify administrator access.",
                );
              }
            } finally {
              if (!stopped) setAuthLoading(false);
            }
          },
        );
      })
      .catch((caught) => {
        if (!stopped) {
          setAuthLoading(false);
          setAuthError(
            caught instanceof Error
              ? caught.message
              : "Could not connect to Firebase.",
          );
        }
      });

    return () => {
      stopped = true;
      unsubscribe?.();
    };
  }, []);

  const navigate = (next: AdminPageKey) => {
    const paths: Record<AdminPageKey, string> = {
      dashboard: "/admin",
      map: "/admin/map",
      buses: "/admin/buses",
      geofences: "/admin/geofences",
      drivers: "/admin/drivers",
    };

    window.history.pushState({}, "", paths[next]);
    setRoute({
      page: next,
      busId: "",
      geofenceId: null,
    });
  };

  const openBus = (busId: string) => {
    window.history.pushState(
      {},
      "",
      "/bus/" + encodeURIComponent(busId),
    );
    setRoute({
      page: "buses",
      busId,
      geofenceId: null,
    });
  };

  const openGeofence = (geofenceId: string) => {
    window.history.pushState(
      {},
      "",
      "/admin/geofences/" + encodeURIComponent(geofenceId),
    );
    setRoute({
      page: "geofences",
      busId: "",
      geofenceId,
    });
  };

  const handleGeofenceEntry = useCallback((event: GeofenceEntryEvent) => {
    setGeofenceEvents((current) => {
      const withoutDuplicate = current.filter(
        (item) => item.id !== event.id,
      );
      return [...withoutDuplicate, event].slice(-300);
    });

    void recordGeofenceEntry(event).catch((caught) => {
      setGeofenceActivityError(
        caught instanceof Error
          ? caught.message
          : "Could not save the geofence entry alert.",
      );
    });
  }, []);

  const handleSignedIn = (name: string) => {
    setSignedIn(true);
    setDisplayName(name);
    setAuthError("");
    setRoute(routeFromPath(window.location.pathname));
  };

  const signOut = async () => {
    await signOutAdmin();
    setSignedIn(false);
    setDisplayName("");
    setRoute({
      page: "dashboard",
      busId: "",
      geofenceId: null,
    });
    window.history.replaceState({}, "", "/admin");
  };

  const selectedGeofence =
    route.geofenceId && route.geofenceId !== "new"
      ? geofences.find((item) => item.id === route.geofenceId) ?? null
      : null;

  if (authLoading) {
    return <div className="empty">Checking administrator access…</div>;
  }

  if (!signedIn) {
    return (
      <div className="admin-ui">
        <AdminLogin
          onSignedIn={handleSignedIn}
          sessionMessage={authError}
        />
      </div>
    );
  }

  return (
    <div className="admin-ui">
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
            geofences={geofences}
            geofenceError={geofenceError}
            connected={fleet.connected}
            error={fleet.connectionError}
            onOpenBus={openBus}
          />
        ) : page === "geofences" ? (
          route.geofenceId ? (
            <AdminGeofenceDetail
              geofence={selectedGeofence}
              buses={fleet.buses}
              events={
                route.geofenceId === "new"
                  ? []
                  : geofenceEvents.filter(
                      (event) => event.geofenceId === route.geofenceId,
                    )
              }
              order={
                route.geofenceId === "new"
                  ? []
                  : geofenceOrder[route.geofenceId] ?? []
              }
              connected={fleet.connected}
              error={geofenceError || geofenceActivityError}
              onBack={() => navigate("geofences")}
              onOpenGeofence={openGeofence}
            />
          ) : (
            <AdminGeofences
              geofences={geofences}
              buses={fleet.buses}
              onOpenGeofence={openGeofence}
            />
          )
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

      <AdminGeofenceMonitor
        buses={fleet.buses}
        geofences={geofences}
        onEntry={handleGeofenceEntry}
      />
    </div>
  );
}
