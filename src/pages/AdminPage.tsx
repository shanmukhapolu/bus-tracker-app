import { useEffect, useState } from "react";
import adminStyles from "../admin-reference.css?raw";
import { AdminLogin } from "../admin/AdminLogin";
import { AdminLayout, type AdminPageKey } from "../admin/AdminLayout";
import { AdminDashboard } from "../admin/AdminDashboard";
import { AdminLiveMap } from "../admin/AdminLiveMap";
import { AdminDevices } from "../admin/AdminDevices";
import { AdminDrivers } from "../admin/AdminDrivers";
import { useAdminFleet } from "../admin/adminData";
import {
  loadAdminProfile,
  signOutAdmin,
} from "../services/adminAuthService";
import { getFirebaseRuntime } from "../config/firebase";

function pageFromPath(pathname: string): AdminPageKey {
  if (pathname === "/admin/map") return "map";
  if (pathname === "/admin/devices") return "devices";
  if (pathname === "/admin/drivers") return "drivers";
  return "dashboard";
}

export function AdminPage() {
  const [page, setPage] = useState<AdminPageKey>(() =>
    pageFromPath(window.location.pathname),
  );
  const [authLoading, setAuthLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [authError, setAuthError] = useState("");

  const fleet = useAdminFleet(signedIn);

  useEffect(() => {
    const style = document.createElement("style");
    style.id = "admin-reference-styles";
    style.textContent = adminStyles;

    const existing = document.getElementById(style.id);
    existing?.remove();
    document.head.appendChild(style);

    return () => {
      document.getElementById(style.id)?.remove();
    };
  }, []);

  useEffect(() => {
    if (!window.location.pathname.startsWith("/admin")) return;

    const onPopState = () => {
      setPage(pageFromPath(window.location.pathname));
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

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
            } catch (error) {
              if (!stopped) {
                setSignedIn(false);
                setDisplayName("");
                setAuthError(
                  error instanceof Error
                    ? error.message
                    : "Could not verify administrator access.",
                );
              }
            } finally {
              if (!stopped) setAuthLoading(false);
            }
          },
        );
      })
      .catch((error) => {
        if (!stopped) {
          setAuthLoading(false);
          setAuthError(
            error instanceof Error
              ? error.message
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
      devices: "/admin/devices",
      drivers: "/admin/drivers",
    };
    window.history.pushState({}, "", paths[next]);
    setPage(next);
  };

  const handleSignedIn = (name: string) => {
    setSignedIn(true);
    setDisplayName(name);
    setAuthError("");
    const requested = pageFromPath(window.location.pathname);
    navigate(requested);
  };

  const signOut = async () => {
    await signOutAdmin();
    setSignedIn(false);
    setDisplayName("");
    setPage("dashboard");
    window.history.replaceState({}, "", "/admin");
  };

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
        lastSyncAt={fleet.lastSyncAt}
        connected={fleet.connected}
      >
        {page === "dashboard" && (
          <AdminDashboard
            buses={fleet.buses}
            drivers={fleet.drivers}
            connected={fleet.connected}
            error={fleet.connectionError || fleet.driverError}
            onRefreshHint={() => navigate("map")}
          />
        )}
        {page === "map" && (
          <AdminLiveMap
            buses={fleet.buses}
            drivers={fleet.drivers}
            connected={fleet.connected}
            error={fleet.connectionError}
          />
        )}
        {page === "devices" && (
          <AdminDevices
            buses={fleet.buses}
            drivers={fleet.drivers}
            connected={fleet.connected}
            error={fleet.connectionError}
          />
        )}
        {page === "drivers" && (
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
    </div>
  );
}
