import { auditedAdminUpdate } from "./adminAudit";
import { getFirebaseRuntime } from "../config/firebase";

export interface FleetBus {
  id: string;
  busNumber: string;
  route: string;
  enabled: boolean;
  geofenceId?: string;
}

export interface FleetDriver {
  uid: string;
  displayName: string;
  email?: string;
  enabled: boolean;
  assignedBus: string;
  approvalStatus: "pending" | "approved";
}

export function mergeFleetBuses(buses: FleetBus[]) {
  return buses;
}

export function normalizeBus(value: unknown, id: string): FleetBus | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const busNumber = String(record.busNumber ?? id).trim();
  const route = String(record.route ?? "").trim();

  if (!busNumber || !route) return null;

  return {
    id,
    busNumber,
    route,
    enabled: record.enabled !== false,
    geofenceId:
      typeof record.geofenceId === "string" ? record.geofenceId.trim() : "",
  };
}

export function normalizeFleetBuses(value: unknown): FleetBus[] {
  if (!value || typeof value !== "object") return [];

  return Object.entries(value as Record<string, unknown>).flatMap(
    ([id, raw]) => {
      const bus = normalizeBus(raw, id);
      return bus ? [bus] : [];
    },
  );
}

export function normalizeFleetDrivers(value: unknown): FleetDriver[] {
  if (!value || typeof value !== "object") return [];

  return Object.entries(value as Record<string, unknown>).flatMap(
    ([uid, raw]) => {
      if (!raw || typeof raw !== "object") return [];

      const record = raw as Record<string, unknown>;
      const displayName = String(record.displayName ?? "").trim();

      return [
        {
          uid,
          displayName: displayName || "Unnamed driver",
          email: typeof record.email === "string" ? record.email : undefined,
          enabled: record.enabled === true,
          assignedBus:
            record.assignedBus === null || record.assignedBus === undefined
              ? ""
              : String(record.assignedBus).trim(),
          approvalStatus:
            record.approvalStatus === "approved" ||
            record.enabled === true ||
            (record.enabled === false &&
              typeof record.assignedBus === "string" &&
              record.assignedBus.trim() !== "")
              ? "approved"
              : "pending",
        },
      ];
    },
  );
}

export async function loadFleetBuses(): Promise<FleetBus[]> {
  const runtime = await getFirebaseRuntime();
  const snapshot = await runtime.get(runtime.ref(runtime.db, "buses"));
  return mergeFleetBuses(normalizeFleetBuses(snapshot.val()));
}

export async function loadFleetDrivers(): Promise<FleetDriver[]> {
  const runtime = await getFirebaseRuntime();
  const snapshot = await runtime.get(runtime.ref(runtime.db, "drivers"));
  return normalizeFleetDrivers(snapshot.val());
}

function validateBusKey(busNumber: string) {
  if (
    !busNumber ||
    busNumber.length > 20 ||
    [".", "#", "$", "[", "]", "/"].some((character) =>
      busNumber.includes(character),
    ) ||
    /[\\x00-\\x1f\\x7f]/.test(busNumber)
  ) {
    throw new Error(
      "Bus number must be 1–20 characters and cannot contain . # $ [ ] or /.",
    );
  }
}

export async function addFleetBus(
  busNumber: string,
  route: string,
  geofenceId = "",
): Promise<FleetBus> {
  const runtime = await getFirebaseRuntime();
  const normalizedNumber = String(busNumber ?? "").trim();
  const normalizedRoute = String(route ?? "").trim();
  const normalizedGeofence = String(geofenceId ?? "").trim();

  validateBusKey(normalizedNumber);
  if (!normalizedRoute || normalizedRoute.length > 100) {
    throw new Error("Route is required and must be 100 characters or fewer.");
  }

  const existing = await runtime.get(
    runtime.ref(runtime.db, `buses/${normalizedNumber}`),
  );
  if (existing.exists()) {
    throw new Error(`Bus ${normalizedNumber} already exists.`);
  }

  if (normalizedGeofence) {
    const geofence = await runtime.get(
      runtime.ref(runtime.db, `geofences/${normalizedGeofence}`),
    );
    if (!geofence.exists()) {
      throw new Error("The selected geofence no longer exists. Refresh and choose another.");
    }
  }

  const now = Date.now();
  const busRecord = {
    busNumber: normalizedNumber,
    route: normalizedRoute,
    enabled: true,
    lifecycleStatus: "active",
    createdAt: now,
    updatedAt: now,
    ...(normalizedGeofence ? { geofenceId: normalizedGeofence } : {}),
  };

  // The public map reads a sanitized projection rather than the private
  // fleet record. Write both records and the audit event atomically.
  await auditedAdminUpdate(
    runtime,
    "bus_created",
    `buses/${normalizedNumber}`,
    {
      [`buses/${normalizedNumber}`]: busRecord,
      [`publicBuses/${normalizedNumber}`]: {
        busNumber: normalizedNumber,
        route: normalizedRoute,
        enabled: true,
        active: false,
      },
    },
  );

  return {
    id: normalizedNumber,
    busNumber: normalizedNumber,
    route: normalizedRoute,
    enabled: true,
    geofenceId: normalizedGeofence,
  };
}

export async function assignDriverToBus(
  driverUid: string,
  busNumber: string,
): Promise<void> {
  const runtime = await getFirebaseRuntime();
  const normalizedUid = String(driverUid ?? "").trim();
  const normalizedBusNumber = String(busNumber ?? "").trim();

  if (
    !normalizedUid ||
    [".", "#", "$", "[", "]", "/"].some((character) =>
      normalizedUid.includes(character),
    )
  ) {
    throw new Error("Select a valid driver account.");
  }

  const driverSnapshot = await runtime.get(
    runtime.ref(runtime.db, `drivers/${normalizedUid}`),
  );
  if (!driverSnapshot.exists()) {
    throw new Error("Driver account not found.");
  }

  const selectedDriver = normalizeFleetDrivers({
    [normalizedUid]: driverSnapshot.val(),
  })[0];
  if (!selectedDriver) {
    throw new Error("The selected driver profile is invalid.");
  }

  if (!normalizedBusNumber) {
    if (selectedDriver.assignedBus) {
      const active = await runtime.get(
        runtime.ref(runtime.db, `activeDrivers/${selectedDriver.assignedBus}`),
      );
      const live = await runtime.get(
        runtime.ref(runtime.db, `liveBuses/${selectedDriver.assignedBus}`),
      );
      const liveValue = live.val() as Record<string, unknown> | null;
      if (
        active.val() === normalizedUid ||
        (liveValue?.active === true && liveValue.driverUid === normalizedUid)
      ) {
        throw new Error("Stop this driver's live tracking before unassigning them.");
      }
    }

    await auditedAdminUpdate(
      runtime,
      "bus_assignment_changed",
      `drivers/${normalizedUid}`,
      { [`drivers/${normalizedUid}/assignedBus`]: "" },
    );
    return;
  }

  validateBusKey(normalizedBusNumber);

  const busSnapshot = await runtime.get(
    runtime.ref(runtime.db, `buses/${normalizedBusNumber}`),
  );
  if (!busSnapshot.exists() || busSnapshot.val()?.enabled !== true) {
    throw new Error("Choose an active, registered bus.");
  }
  if (!selectedDriver.enabled) {
    throw new Error("Approve and enable this driver in the Drivers section before assigning a bus.");
  }

  const driversSnapshot = await runtime.get(
    runtime.ref(runtime.db, "drivers"),
  );
  const otherDriver = normalizeFleetDrivers(driversSnapshot.val()).find(
    (driver) =>
      driver.uid !== normalizedUid &&
      driver.assignedBus === normalizedBusNumber,
  );
  if (otherDriver) {
    throw new Error(
      `Bus ${normalizedBusNumber} is already assigned to ${otherDriver.displayName}. Unassign them first.`,
    );
  }

  if (
    selectedDriver.assignedBus &&
    selectedDriver.assignedBus !== normalizedBusNumber
  ) {
    const oldBus = selectedDriver.assignedBus;
    const [active, live] = await Promise.all([
      runtime.get(runtime.ref(runtime.db, `activeDrivers/${oldBus}`)),
      runtime.get(runtime.ref(runtime.db, `liveBuses/${oldBus}`)),
    ]);
    const liveValue = live.val() as Record<string, unknown> | null;
    if (
      active.val() === normalizedUid ||
      (liveValue?.active === true && liveValue.driverUid === normalizedUid)
    ) {
      throw new Error("Stop this driver's live tracking before changing their assignment.");
    }
  }

  await auditedAdminUpdate(
    runtime,
    "bus_assignment_changed",
    `drivers/${normalizedUid}`,
    { [`drivers/${normalizedUid}/assignedBus`]: normalizedBusNumber },
  );
}

export async function deleteFleetBus(busNumber: string): Promise<void> {
  const runtime = await getFirebaseRuntime();
  const normalizedBusNumber = String(busNumber ?? "").trim();

  if (!normalizedBusNumber) {
    throw new Error("Bus number is required.");
  }

  const liveRef = runtime.ref(runtime.db, `liveBuses/${normalizedBusNumber}`);
  const liveSnapshot = await runtime.get(liveRef);

  if (liveSnapshot.exists()) {
    const liveValue = liveSnapshot.val() as Record<string, unknown>;
    if (liveValue.active === true) {
      throw new Error("Stop tracking on this bus before deleting it.");
    }
  }

  const updates: Record<string, unknown> = {
    [`buses/${normalizedBusNumber}`]: null,
    [`publicBuses/${normalizedBusNumber}`]: null,
  };

  const driversSnapshot = await runtime.get(runtime.ref(runtime.db, "drivers"));
  const drivers = normalizeFleetDrivers(driversSnapshot.val());

  drivers.forEach((driver) => {
    if (driver.assignedBus === normalizedBusNumber) {
      updates[`drivers/${driver.uid}/assignedBus`] = "";
    }
  });

  await runtime.update(runtime.db, updates);
}

export function subscribeFleet(
  onDrivers: (drivers: FleetDriver[]) => void,
  onBuses: (buses: FleetBus[]) => void,
  onError: (message: string) => void,
) {
  let cancelled = false;
  let stopDrivers: (() => void) | undefined;
  let stopBuses: (() => void) | undefined;

  void getFirebaseRuntime()
    .then((runtime) => {
      if (cancelled) return;

      stopDrivers = runtime.onValue(
        runtime.ref(runtime.db, "drivers"),
        (snapshot) => onDrivers(normalizeFleetDrivers(snapshot.val())),
        (error) => {
          onError(
            error instanceof Error
              ? error.message
              : "Could not load driver accounts.",
          );
        },
      );

      stopBuses = runtime.onValue(
        runtime.ref(runtime.db, "buses"),
        (snapshot) =>
          onBuses(mergeFleetBuses(normalizeFleetBuses(snapshot.val()))),
        (error) => {
          onError(
            error instanceof Error
              ? error.message
              : "Could not load bus records.",
          );
        },
      );
    })
    .catch((error) => {
      if (!cancelled) {
        onError(
          error instanceof Error
            ? error.message
            : "Could not connect to Firebase.",
        );
      }
    });

  return () => {
    cancelled = true;
    stopDrivers?.();
    stopBuses?.();
  };
}

export function subscribeFleetBuses(
  onBuses: (buses: FleetBus[]) => void,
  onError: (message: string) => void,
) {
  let cancelled = false;
  let stop: (() => void) | undefined;

  void getFirebaseRuntime()
    .then((runtime) => {
      if (cancelled) return;

      stop = runtime.onValue(
        runtime.ref(runtime.db, "buses"),
        (snapshot) =>
          onBuses(mergeFleetBuses(normalizeFleetBuses(snapshot.val()))),
        (error) => {
          onError(
            error instanceof Error
              ? error.message
              : "Could not load bus records.",
          );
        },
      );
    })
    .catch((error) => {
      if (!cancelled) {
        onError(
          error instanceof Error
            ? error.message
            : "Could not connect to Firebase.",
        );
      }
    });

  return () => {
    cancelled = true;
    stop?.();
  };
}

export function subscribeDriverProfile(
  uid: string,
  onProfile: (profile: FleetDriver | null) => void,
  onError: (message: string) => void,
) {
  let cancelled = false;
  let stop: (() => void) | undefined;

  void getFirebaseRuntime()
    .then((runtime) => {
      if (cancelled) return;

      stop = runtime.onValue(
        runtime.ref(runtime.db, `drivers/${uid}`),
        (snapshot) => {
          if (!snapshot.exists()) {
            onProfile(null);
            return;
          }

          const normalized = normalizeFleetDrivers({
            [uid]: snapshot.val(),
          });
          onProfile(normalized[0] ?? null);
        },
        (error) => {
          onError(
            error instanceof Error
              ? error.message
              : "Could not load your driver assignment.",
          );
        },
      );
    })
    .catch((error) => {
      if (!cancelled) {
        onError(
          error instanceof Error
            ? error.message
            : "Could not connect to Firebase.",
        );
      }
    });

  return () => {
    cancelled = true;
    stop?.();
  };
}
