import { getFirebaseRuntime } from "../config/firebase";

export interface FleetBus {
  id: string;
  busNumber: string;
  route: string;
  enabled: boolean;
}

export interface FleetDriver {
  uid: string;
  displayName: string;
  email?: string;
  enabled: boolean;
  assignedBus: string;
}

function normalizeBus(value: unknown, id: string): FleetBus | null {
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
  };
}

function normalizeDrivers(value: unknown): FleetDriver[] {
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
          email:
            typeof record.email === "string" ? record.email : undefined,
          enabled: record.enabled === true,
          assignedBus:
            record.assignedBus === null ||
            record.assignedBus === undefined
              ? ""
              : String(record.assignedBus).trim(),
        },
      ];
    },
  );
}

export async function loadFleetBuses(): Promise<FleetBus[]> {
  const runtime = await getFirebaseRuntime();
  const snapshot = await runtime.get(runtime.ref(runtime.db, "buses"));
  const value = snapshot.val();

  if (!value || typeof value !== "object") return [];

  return Object.entries(value as Record<string, unknown>).flatMap(
    ([id, raw]) => {
      const bus = normalizeBus(raw, id);
      return bus ? [bus] : [];
    },
  );
}

export async function loadFleetDrivers(): Promise<FleetDriver[]> {
  const runtime = await getFirebaseRuntime();
  const snapshot = await runtime.get(runtime.ref(runtime.db, "drivers"));
  return normalizeDrivers(snapshot.val());
}

export async function addFleetBus(
  busNumber: string,
  route: string,
): Promise<FleetBus> {
  const runtime = await getFirebaseRuntime();
  const normalizedBusNumber = String(busNumber ?? "").trim();
  const normalizedRoute = String(route ?? "").trim();

  if (!normalizedBusNumber || !normalizedRoute) {
    throw new Error("Bus number and route are required.");
  }

  const id = normalizedBusNumber;
  const busRef = runtime.ref(runtime.db, `buses/${id}`);
  const existing = await runtime.get(busRef);

  if (existing.exists()) {
    throw new Error(`Bus ${normalizedBusNumber} already exists.`);
  }

  await runtime.update(busRef, {
    busNumber: normalizedBusNumber,
    route: normalizedRoute,
    enabled: true,
  });

  return {
    id,
    busNumber: normalizedBusNumber,
    route: normalizedRoute,
    enabled: true,
  };
}

export async function assignDriverToBus(
  driverUid: string,
  busNumber: string,
): Promise<void> {
  const runtime = await getFirebaseRuntime();
  const normalizedBusNumber = String(busNumber ?? "").trim();

  if (!normalizedBusNumber) {
    throw new Error("Choose a bus before assigning it.");
  }

  const busSnapshot = await runtime.get(
    runtime.ref(runtime.db, `buses/${normalizedBusNumber}`),
  );

  if (!busSnapshot.exists()) {
    throw new Error("That bus does not exist.");
  }

  await runtime.update(runtime.ref(runtime.db, `drivers/${driverUid}`), {
    assignedBus: normalizedBusNumber,
  });
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
        (snapshot) => onDrivers(normalizeDrivers(snapshot.val())),
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
        (snapshot) => {
          const value = snapshot.val();
          const buses =
            value && typeof value === "object"
              ? Object.entries(value as Record<string, unknown>).flatMap(
                  ([id, raw]) => {
                    const bus = normalizeBus(raw, id);
                    return bus ? [bus] : [];
                  },
                )
              : [];
          onBuses(buses);
        },
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
