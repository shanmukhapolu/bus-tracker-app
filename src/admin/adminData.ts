import { useEffect, useMemo, useState } from "react";
import { useBuses } from "../hooks/useBuses";
import { getFirebaseRuntime } from "../config/firebase";
import { normalizeFleetDrivers, type FleetDriver } from "../services/fleetService";

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

export function useAdminDrivers(enabled = true) {
  const [drivers, setDrivers] = useState<FleetDriver[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) {
      setDrivers([]);
      setError("");
      return;
    }
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
  }, [enabled]);

  return { drivers, error };
}

export function useAdminFleet(enabled = true) {
  const snapshot = useBuses();
  const driversState = useAdminDrivers(enabled);

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
      approvalStatus:
        enabled || driverSnapshot.val()?.approvalStatus === "approved"
          ? "approved"
          : "pending",
    },
  );
}

export async function deleteDriverAccount(driverId: string) {
  const normalizedUid = String(driverId ?? "").trim();

  if (!normalizedUid) {
    throw new Error("Driver account is required.");
  }

  if (!/^[A-Za-z0-9_-]{10,128}$/.test(normalizedUid)) {
    throw new Error("Invalid driver account.");
  }

  const runtime = await getFirebaseRuntime();
  const driverRef = runtime.ref(runtime.db, `drivers/${normalizedUid}`);
  const driverSnapshot = await runtime.get(driverRef);

  if (!driverSnapshot.exists()) {
    throw new Error("Driver account not found.");
  }

  const driver = driverSnapshot.val() as Record<string, unknown>;
  const assignedBus =
    driver.assignedBus === null || driver.assignedBus === undefined
      ? ""
      : String(driver.assignedBus).trim();

  if (assignedBus) {
    const activeDriverSnapshot = await runtime.get(
      runtime.ref(runtime.db, `activeDrivers/${assignedBus}`),
    );
    const liveSnapshot = await runtime.get(
      runtime.ref(runtime.db, `liveBuses/${assignedBus}`),
    );
    const activeDriverUid = activeDriverSnapshot.val();
    const live = liveSnapshot.val() as Record<string, unknown> | null;

    if (
      activeDriverUid === normalizedUid ||
      (live?.active === true && live.driverUid === normalizedUid)
    ) {
      throw new Error("Stop tracking for this driver before deleting the account.");
    }
  }

  await runtime.remove(
    runtime.ref(runtime.db, `drivers/${normalizedUid}`),
  );

  if (assignedBus) {
    const activeDriverSnapshot = await runtime.get(
      runtime.ref(runtime.db, `activeDrivers/${assignedBus}`),
    );

    if (activeDriverSnapshot.val() === normalizedUid) {
      await runtime.remove(
        runtime.ref(runtime.db, `activeDrivers/${assignedBus}`),
      );
    }
  }
}
