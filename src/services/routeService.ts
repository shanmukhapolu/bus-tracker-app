import { getFirebaseRuntime } from "../config/firebase";
import type { DriverRoute, RouteStop } from "../types/route";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeStop(id: string, value: unknown): RouteStop | null {
  const raw = record(value);
  if (!finite(raw.latitude) || !finite(raw.longitude)) return null;

  return {
    id,
    name: String(raw.name ?? "Stop").trim() || "Stop",
    address: String(raw.address ?? "").trim(),
    latitude: raw.latitude,
    longitude: raw.longitude,
    order: finite(raw.order) ? raw.order : 0,
  };
}

export function normalizeRoutes(value: unknown): DriverRoute[] {
  return Object.entries(record(value))
    .flatMap(([id, value]) => {
      const raw = record(value);
      if (raw.enabled === false) return [];
      const stops = Object.entries(record(raw.stops))
        .flatMap(([stopId, stop]) => {
          const normalized = normalizeStop(stopId, stop);
          return normalized ? [normalized] : [];
        })
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

      return [
        {
          id,
          name: String(raw.name ?? id).trim() || id,
          school: String(raw.school ?? "").trim(),
          enabled: true,
          stops,
        },
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export function subscribeDriverRoutes(
  onRoutes: (routes: DriverRoute[]) => void,
  onError: (message: string) => void,
) {
  let cancelled = false;
  let stop: (() => void) | undefined;

  void getFirebaseRuntime()
    .then((runtime) => {
      if (cancelled) return;
      stop = runtime.onValue(
        runtime.ref(runtime.db, "routes"),
        (snapshot) => onRoutes(normalizeRoutes(snapshot.val())),
        (error) =>
          onError(
            error instanceof Error
              ? error.message
              : "Could not load assigned routes.",
          ),
      );
    })
    .catch((error) => {
      if (!cancelled) {
        onError(
          error instanceof Error
            ? error.message
            : "Could not connect to route data.",
        );
      }
    });

  return () => {
    cancelled = true;
    stop?.();
  };
}
