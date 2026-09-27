import { useEffect, useMemo, useState } from "react";
import { useBuses } from "../hooks/useBuses";
import { getFirebaseRuntime } from "../config/firebase";
import { normalizeFleetDrivers, type FleetDriver } from "../services/fleetService";
import type { Bus } from "../types/bus";

export interface AdminDevice {
  id: string;
  busId: string;
  status: "online" | "offline";
  gpsStatus: "good" | "unavailable";
  accuracyMeters: number | null;
  speedMph: number | null;
  headingDegrees: number | null;
  lastUpdated: Date;
  driverName: string;
}

export function useAdminDrivers() {
  const [drivers, setDrivers] = useState<FleetDriver[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let stopped = false;
    let unsubscribe: (() => void) | undefined;

    void getFirebaseRuntime()
      .then((runtime) => {
        if (stopped) return;
        unsubscribe = runtime.onValue(
          runtime.ref(runtime.db, "drivers"),
          (snapshot) => {
            if (!stopped) {
              setDrivers(normalizeFleetDrivers(snapshot.val()));
              setError("");
            }
          },
          (firebaseError) => {
            if (!stopped) {
              setError(
                firebaseError instanceof Error
                  ? firebaseError.message
                  : "Could not load driver accounts.",
              );
            }
          },
        );
      })
      .catch((firebaseError) => {
        if (!stopped) {
          setError(
            firebaseError instanceof Error
              ? firebaseError.message
              : "Could not connect to Firebase.",
          );
        }
      });

    return () => {
      stopped = true;
      unsubscribe?.();
    };
  }, []);

  return { drivers, error };
}

export function useAdminFleet() {
  const snapshot = useBuses();
  const driversState = useAdminDrivers();

  const driverByBus = useMemo(() => {
    const map = new Map<string, string>();
    for (const driver of driversState.drivers) {
      if (driver.assignedBus) map.set(driver.assignedBus, driver.displayName);
    }
    return map;
  }, [driversState.drivers]);

  const devices = useMemo<AdminDevice[]>(
    () =>
      snapshot.buses.map((bus) => ({
        id: "Driver phone tracker",
        busId: bus.id,
        status: bus.trackingActive ? "online" : "offline",
        gpsStatus: bus.trackingActive ? "good" : "unavailable",
        accuracyMeters: bus.locationAccuracyMeters ?? null,
        speedMph:
          typeof bus.speed === "number" ? Math.round(bus.speed * 0.621371) : null,
        headingDegrees:
          typeof bus.heading === "number" ? Math.round(bus.heading) : null,
        lastUpdated: bus.lastUpdated,
        driverName: driverByBus.get(bus.id) ?? "Not assigned",
      })),
    [snapshot.buses, driverByBus],
  );

  return {
    buses: snapshot.buses,
    devices,
    drivers: driversState.drivers,
    connected: snapshot.connected,
    connectionError: snapshot.connectionError,
    lastSyncAt: snapshot.lastSyncAt,
    driverError: driversState.error,
  };
}

export async function updateAdminDriverAccess(
  driverId: string,
  assignedBus: string,
  enabled: boolean,
) {
  const runtime = await getFirebaseRuntime();
  const normalizedBus = String(assignedBus ?? "").trim();

  if (!driverId || /[.#$\[\]\/]/.test(driverId)) {
    throw new Error("Invalid driver account.");
  }

  const driverSnapshot = await runtime.get(
    runtime.ref(runtime.db, `drivers/${driverId}`),
  );
  if (!driverSnapshot.exists()) {
    throw new Error("Driver account not found.");
  }

  if (enabled) {
    if (!normalizedBus) {
      throw new Error("Assign a bus before approving the driver.");
    }

    const busSnapshot = await runtime.get(
      runtime.ref(runtime.db, `buses/${normalizedBus}`),
    );
    if (!busSnapshot.exists() || busSnapshot.val()?.enabled === false) {
      throw new Error("Choose an active registered bus.");
    }
  }

  await runtime.update(
    runtime.ref(runtime.db, `drivers/${driverId}`),
    {
      assignedBus: normalizedBus,
      enabled,
    },
  );
}
