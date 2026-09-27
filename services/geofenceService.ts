import { useEffect, useState } from "react";
import { getFirebaseRuntime } from "../config/firebase";

export interface GeofencePoint {
  latitude: number;
  longitude: number;
}

export interface Geofence {
  id: string;
  name: string;
  points: GeofencePoint[];
  enabled: boolean;
  createdAt?: number;
  updatedAt?: number;
}

function normalizePoint(value: unknown): GeofencePoint | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const latitude = Number(record.latitude);
  const longitude = Number(record.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function normalizeGeofence(value: unknown, id: string): Geofence | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const name = String(record.name ?? "").trim();
  const rawPoints = Array.isArray(record.points) ? record.points : [];
  const points = rawPoints.flatMap((point) => {
    const normalized = normalizePoint(point);
    return normalized ? [normalized] : [];
  });

  if (!name || points.length < 3) return null;

  return {
    id,
    name,
    points,
    enabled: record.enabled !== false,
    createdAt: typeof record.createdAt === "number" ? record.createdAt : undefined,
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : undefined,
  };
}

export function normalizeGeofences(value: unknown): Geofence[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([id, raw]) => {
    const geofence = normalizeGeofence(raw, id);
    return geofence ? [geofence] : [];
  });
}

function createId(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return (slug || "geofence") + "-" + Date.now().toString(36);
}

export async function saveGeofence(
  geofence: Omit<Geofence, "id"> & { id?: string },
): Promise<Geofence> {
  const runtime = await getFirebaseRuntime();
  const name = geofence.name.trim();
  const points = geofence.points.filter(
    (point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
  );

  if (!name) throw new Error("Enter a geofence name.");
  if (points.length < 3) throw new Error("A geofence needs at least three points.");

  const id = geofence.id || createId(name);
  const now = Date.now();
  const saved: Geofence = {
    id,
    name,
    points,
    enabled: geofence.enabled !== false,
    createdAt: geofence.createdAt ?? now,
    updatedAt: now,
  };

  await runtime.update(runtime.ref(runtime.db, `geofences/${id}`), {
    name: saved.name,
    points: saved.points,
    enabled: saved.enabled,
    createdAt: saved.createdAt,
    updatedAt: saved.updatedAt,
  });

  return saved;
}

export async function deleteGeofence(id: string): Promise<void> {
  const runtime = await getFirebaseRuntime();
  if (!id || /[.#$\[\]\/]/.test(id)) throw new Error("Invalid geofence.");

  const busesSnapshot = await runtime.get(runtime.ref(runtime.db, "buses"));
  const buses = busesSnapshot.val();

  const updates: Record<string, unknown> = {
    [`geofences/${id}`]: null,
  };

  if (buses && typeof buses === "object") {
    Object.entries(buses as Record<string, unknown>).forEach(([busId, value]) => {
      if (value && typeof value === "object" && (value as Record<string, unknown>).geofenceId === id) {
        updates[`buses/${busId}/geofenceId`] = null;
      }
    });
  }

  await runtime.update(runtime.db, updates);
}

export async function assignGeofenceToBus(busId: string, geofenceId: string): Promise<void> {
  const runtime = await getFirebaseRuntime();
  if (!busId) throw new Error("Bus is required.");
  await runtime.update(runtime.ref(runtime.db, `buses/${busId}`), {
    geofenceId: geofenceId || null,
  });
}

export function useGeofences(enabled = true) {
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) {
      setGeofences([]);
      setError("");
      return;
    }

    let stopped = false;
    let unsubscribe: (() => void) | undefined;

    void getFirebaseRuntime()
      .then((runtime) => {
        if (stopped) return;

        unsubscribe = runtime.onValue(
          runtime.ref(runtime.db, "geofences"),
          (snapshot) => {
            if (!stopped) {
              setGeofences(normalizeGeofences(snapshot.val()));
              setError("");
            }
          },
          (firebaseError) => {
            if (!stopped) setError(firebaseError instanceof Error ? firebaseError.message : "Could not load geofences.");
          },
        );
      })
      .catch((firebaseError) => {
        if (!stopped) setError(firebaseError instanceof Error ? firebaseError.message : "Could not connect to Firebase.");
      });

    return () => {
      stopped = true;
      unsubscribe?.();
    };
  }, [enabled]);

  return { geofences, error };
}
