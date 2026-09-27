import { getFirebaseRuntime } from "../config/firebase";
import type { Geofence, GeofenceCoordinate } from "../types/geofence";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeCoordinates(value: unknown): GeofenceCoordinate[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((point) => {
    if (!Array.isArray(point) || point.length < 2) return [];
    const longitude = Number(point[0]);
    const latitude = Number(point[1]);
    return isFiniteNumber(longitude) &&
      isFiniteNumber(latitude) &&
      longitude >= -180 &&
      longitude <= 180 &&
      latitude >= -90 &&
      latitude <= 90
      ? [[longitude, latitude] as GeofenceCoordinate]
      : [];
  });
}

export function normalizeGeofences(value: unknown): Geofence[] {
  if (!value || typeof value !== "object") return [];

  return Object.entries(value as Record<string, unknown>).flatMap(
    ([id, raw]) => {
      if (!raw || typeof raw !== "object") return [];

      const record = raw as Record<string, unknown>;
      const name = String(record.name ?? "").trim();
      const coordinates = normalizeCoordinates(record.coordinates);

      if (!name || coordinates.length < 3) return [];

      return [{
        id,
        name,
        coordinates,
        createdAt: isFiniteNumber(record.createdAt) ? record.createdAt : undefined,
        updatedAt: isFiniteNumber(record.updatedAt) ? record.updatedAt : undefined,
      }];
    },
  );
}

export function subscribeGeofences(
  onGeofences: (geofences: Geofence[]) => void,
  onError: (message: string) => void,
) {
  let cancelled = false;
  let stop: (() => void) | undefined;

  void getFirebaseRuntime()
    .then((runtime) => {
      if (cancelled) return;
      stop = runtime.onValue(
        runtime.ref(runtime.db, "geofences"),
        (snapshot) => onGeofences(normalizeGeofences(snapshot.val())),
        (error) => onError(error instanceof Error ? error.message : "Could not load geofences."),
      );
    })
    .catch((error) => {
      if (!cancelled) onError(error instanceof Error ? error.message : "Could not connect to Firebase.");
    });

  return () => {
    cancelled = true;
    stop?.();
  };
}

function createGeofenceId() {
  return "geo-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function validateGeofence(name: string, coordinates: GeofenceCoordinate[]) {
  const normalizedName = name.trim();
  if (normalizedName.length < 2) throw new Error("Enter a geofence name.");
  if (normalizedName.length > 80) throw new Error("Geofence names must be 80 characters or fewer.");
  if (coordinates.length < 3) throw new Error("Plot at least three points to create a polygon.");
  coordinates.forEach(([longitude, latitude]) => {
    if (!isFiniteNumber(longitude) || !isFiniteNumber(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
      throw new Error("One or more geofence points are invalid.");
    }
  });
  return normalizedName;
}

export async function saveGeofence(id: string | null, name: string, coordinates: GeofenceCoordinate[]) {
  const runtime = await getFirebaseRuntime();
  const normalizedName = validateGeofence(name, coordinates);
  const normalizedCoordinates = coordinates.map(([longitude, latitude]) => [longitude, latitude] as GeofenceCoordinate);
  const geofenceId = id?.trim() || createGeofenceId();
  const existing = await runtime.get(runtime.ref(runtime.db, "geofences/" + geofenceId));
  const existingValue = existing.val();

  await runtime.update(runtime.ref(runtime.db, "geofences/" + geofenceId), {
    name: normalizedName,
    coordinates: normalizedCoordinates,
    createdAt: isFiniteNumber(existingValue?.createdAt) ? existingValue.createdAt : Date.now(),
    updatedAt: Date.now(),
  });

  return geofenceId;
}

export async function deleteGeofence(geofenceId: string) {
  const runtime = await getFirebaseRuntime();
  const normalizedId = geofenceId.trim();
  if (!normalizedId) throw new Error("Geofence ID is required.");

  const busesSnapshot = await runtime.get(runtime.ref(runtime.db, "buses"));
  const updates: Record<string, unknown> = {};
  updates["geofences/" + normalizedId] = null;

  const buses = busesSnapshot.val();
  if (buses && typeof buses === "object") {
    Object.entries(buses as Record<string, unknown>).forEach(([busId, raw]) => {
      if (!raw || typeof raw !== "object") return;
      const record = raw as Record<string, unknown>;
      if (String(record.geofenceId ?? "") === normalizedId) {
        updates["buses/" + busId + "/geofenceId"] = "";
      }
    });
  }

  await runtime.update(runtime.db, updates);
}

export async function assignBusGeofence(busId: string, geofenceId: string) {
  const runtime = await getFirebaseRuntime();
  const normalizedBusId = busId.trim();
  const normalizedGeofenceId = geofenceId.trim();
  if (!normalizedBusId) throw new Error("Bus ID is required.");

  const busSnapshot = await runtime.get(runtime.ref(runtime.db, "buses/" + normalizedBusId));
  if (!busSnapshot.exists()) throw new Error("That bus does not exist.");

  if (normalizedGeofenceId) {
    const geofenceSnapshot = await runtime.get(runtime.ref(runtime.db, "geofences/" + normalizedGeofenceId));
    if (!geofenceSnapshot.exists()) throw new Error("That geofence does not exist.");
  }

  await runtime.update(runtime.ref(runtime.db, "buses/" + normalizedBusId), {
    geofenceId: normalizedGeofenceId,
  });
}

export interface GeofenceEntryEvent {
  id: string;
  busId: string;
  busNumber: string;
  geofenceId: string;
  geofenceName: string;
  createdAt: number;
}

export interface GeofenceBusOrderEntry {
  busId: string;
  busNumber: string;
  firstEntryAt: number;
}

function normalizeEntryEvents(value: unknown): GeofenceEntryEvent[] {
  if (!value || typeof value !== "object") return [];

  return Object.entries(value as Record<string, unknown>).flatMap(
    ([geofenceId, rawGeofence]) => {
      if (!rawGeofence || typeof rawGeofence !== "object") return [];

      return Object.entries(
        rawGeofence as Record<string, unknown>,
      ).flatMap(([eventId, rawEvent]) => {
        if (!rawEvent || typeof rawEvent !== "object") return [];

        const record = rawEvent as Record<string, unknown>;
        const busId = String(record.busId ?? "").trim();
        const busNumber = String(record.busNumber ?? "").trim();
        const eventGeofenceId = String(record.geofenceId ?? geofenceId).trim();
        const geofenceName = String(record.geofenceName ?? "").trim();
        const createdAt = Number(record.createdAt);

        if (
          !busId ||
          !busNumber ||
          !eventGeofenceId ||
          !geofenceName ||
          !Number.isFinite(createdAt)
        ) {
          return [];
        }

        return [{
          id: String(record.id ?? eventId),
          busId,
          busNumber,
          geofenceId: eventGeofenceId,
          geofenceName,
          createdAt,
        }];
      });
    },
  );
}

function normalizeBusOrder(
  value: unknown,
): Record<string, GeofenceBusOrderEntry[]> {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(
      ([geofenceId, rawGeofence]) => {
        if (!rawGeofence || typeof rawGeofence !== "object") return [];

        const entries = Object.entries(
          rawGeofence as Record<string, unknown>,
        ).flatMap(([busId, rawEntry]) => {
          if (!rawEntry || typeof rawEntry !== "object") return [];

          const record = rawEntry as Record<string, unknown>;
          const busNumber = String(record.busNumber ?? "").trim();
          const firstEntryAt = Number(record.firstEntryAt);

          if (!busNumber || !Number.isFinite(firstEntryAt)) return [];

          return [{
            busId,
            busNumber,
            firstEntryAt,
          }];
        });

        return entries.length ? [[geofenceId, entries]] : [];
      },
    ),
  );
}

export function subscribeGeofenceAlerts(
  onAlerts: (alerts: GeofenceEntryEvent[]) => void,
  onError: (message: string) => void,
) {
  let cancelled = false;
  let stop: (() => void) | undefined;

  void getFirebaseRuntime()
    .then((runtime) => {
      if (cancelled) return;

      stop = runtime.onValue(
        runtime.ref(runtime.db, "geofenceAlerts"),
        (snapshot) => onAlerts(normalizeEntryEvents(snapshot.val())),
        (error) =>
          onError(
            error instanceof Error
              ? error.message
              : "Could not load geofence alerts.",
          ),
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

export function subscribeGeofenceBusOrder(
  onOrder: (order: Record<string, GeofenceBusOrderEntry[]>) => void,
  onError: (message: string) => void,
) {
  let cancelled = false;
  let stop: (() => void) | undefined;

  void getFirebaseRuntime()
    .then((runtime) => {
      if (cancelled) return;

      stop = runtime.onValue(
        runtime.ref(runtime.db, "geofenceBusOrder"),
        (snapshot) => onOrder(normalizeBusOrder(snapshot.val())),
        (error) =>
          onError(
            error instanceof Error
              ? error.message
              : "Could not load geofence bus order.",
          ),
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

export async function recordGeofenceEntry(
  event: GeofenceEntryEvent,
): Promise<void> {
  const runtime = await getFirebaseRuntime();

  const alertPath =
    "geofenceAlerts/" +
    event.geofenceId +
    "/" +
    event.id;

  await runtime.update(runtime.ref(runtime.db, alertPath), {
    id: event.id,
    busId: event.busId,
    busNumber: event.busNumber,
    geofenceId: event.geofenceId,
    geofenceName: event.geofenceName,
    createdAt: event.createdAt,
  });

  const orderPath =
    "geofenceBusOrder/" +
    event.geofenceId +
    "/" +
    event.busId;

  await runtime.runTransaction(
    runtime.ref(runtime.db, orderPath),
    (currentData) => {
      if (
        currentData &&
        typeof currentData === "object" &&
        Number.isFinite(Number(currentData.firstEntryAt))
      ) {
        return currentData;
      }

      return {
        busId: event.busId,
        busNumber: event.busNumber,
        firstEntryAt: event.createdAt,
      };
    },
  );
}
