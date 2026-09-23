import { CARMEL_CENTER } from "../config/map";
import { firebaseConfigured, getFirebaseRuntime } from "../config/firebase";
import { createMockBuses } from "../data/mockBuses";
import { normalizeFleetBuses } from "./fleetService";
import type { Bus, BusSnapshot } from "../types/bus";
import type { BusService } from "./busService";

const LIVE_UPDATE_INTERVAL_MS = 1000;
const BASE_BUSES = createMockBuses();

interface LiveBusRecord {
  busNumber?: string;
  route?: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  speedMps?: number | null;
  headingDeg?: number | null;
  active?: boolean;
  lastUpdated?: number | null;
  startedAt?: number | null;
  endedAt?: number | null;
}

interface FleetBusRecord {
  busNumber?: string;
  route?: string;
  enabled?: boolean;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function createOfflineFleetBus(
  id: string,
  busNumber: string,
  route: string,
): Bus {
  return {
    id,
    busNumber,
    route,
    latitude: CARMEL_CENTER[1],
    longitude: CARMEL_CENTER[0],
    status: "offline",
    trackingActive: false,
    currentLocation: "Not tracking",
    lastUpdated: new Date(),
  };
}

function mergeLiveBuses(
  data: Record<string, LiveBusRecord> | null,
  fleetData: Record<string, FleetBusRecord> | null,
): Bus[] {
  const fleetBuses = normalizeFleetBuses(fleetData);
  const fleetById = new Map(fleetBuses.map((bus) => [bus.id, bus]));
  const merged = new Map<string, Bus>();

  for (const base of BASE_BUSES) {
    const fleet = fleetById.get(base.id);

    if (fleet?.enabled === false) continue;

    merged.set(base.id, {
      ...base,
      ...(fleet
        ? {
            busNumber: fleet.busNumber,
            route: fleet.route,
          }
        : {}),
    });
  }

  for (const fleet of fleetBuses) {
    if (!fleet.enabled || merged.has(fleet.id)) continue;

    merged.set(
      fleet.id,
      createOfflineFleetBus(fleet.id, fleet.busNumber, fleet.route),
    );
  }

  for (const [busId, live] of Object.entries(data ?? {})) {
    if (merged.has(busId)) continue;

    const fleet = fleetById.get(busId);
    if (fleet?.enabled === false) continue;

    merged.set(
      busId,
      createOfflineFleetBus(
        busId,
        live.busNumber ?? fleet?.busNumber ?? busId,
        live.route ?? fleet?.route ?? "",
      ),
    );
  }

  return Array.from(merged.values()).map((base) => {
    const live = data?.[base.id];

    if (!live) {
      return {
        ...base,
        trackingActive: false,
        status: "offline",
        etaMinutes: undefined,
        speed: undefined,
        heading: undefined,
        currentLocation: "Not tracking",
        lastUpdated: base.lastUpdated,
      };
    }

    const active =
      live.active === true &&
      isFiniteNumber(live.latitude) &&
      isFiniteNumber(live.longitude);

    const firebaseLastUpdated = isFiniteNumber(live.lastUpdated)
      ? new Date(live.lastUpdated)
      : isFiniteNumber(live.endedAt)
        ? new Date(live.endedAt)
        : base.lastUpdated;

    if (!active) {
      return {
        ...base,
        busNumber: live.busNumber ?? base.busNumber,
        route: live.route ?? base.route,
        trackingActive: false,
        status: "offline",
        etaMinutes: undefined,
        speed: undefined,
        heading: undefined,
        currentLocation: "Not tracking",
        lastUpdated: firebaseLastUpdated,
      };
    }

    return {
      ...base,
      busNumber: live.busNumber ?? base.busNumber,
      route: live.route ?? base.route,
      latitude: live.latitude!,
      longitude: live.longitude!,
      speed: isFiniteNumber(live.speedMps) ? live.speedMps! * 3.6 : undefined,
      heading: isFiniteNumber(live.headingDeg) ? live.headingDeg! : undefined,
      trackingActive: true,
      status: "on-time",
      delayMinutes: undefined,
      etaMinutes: undefined,
      nextStop: undefined,
      currentLocation: "Live GPS",
      locationAccuracyMeters: isFiniteNumber(live.accuracyMeters)
        ? live.accuracyMeters
        : undefined,
      lastUpdated: firebaseLastUpdated,
    };
  });
}

export function createFirebaseBusService(): BusService {
  let snapshot: BusSnapshot = {
    buses: mergeLiveBuses(null, null),
    mode: "live",
    connected: false,
    updateIntervalMs: LIVE_UPDATE_INTERVAL_MS,
  };

  const listeners = new Set<() => void>();
  let started = false;
  let stopLiveListener: (() => void) | undefined;
  let stopFleetListener: (() => void) | undefined;
  let stopConnectionListener: (() => void) | undefined;
  let liveData: Record<string, LiveBusRecord> | null = null;
  let fleetData: Record<string, FleetBusRecord> | null = null;

  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  const start = async () => {
    if (started) return;
    started = true;

    try {
      const runtime = await getFirebaseRuntime();
      const liveBusesRef = runtime.ref(runtime.db, "liveBuses");
      const fleetRef = runtime.ref(runtime.db, "buses");
      const connectedRef = runtime.ref(runtime.db, ".info/connected");

      stopLiveListener = runtime.onValue(
        liveBusesRef,
        (dataSnapshot) => {
          const value = dataSnapshot.val();
          liveData =
            value && typeof value === "object"
              ? (value as Record<string, LiveBusRecord>)
              : null;

          snapshot = {
            ...snapshot,
            buses: mergeLiveBuses(liveData, fleetData),
            connectionError: undefined,
            lastSyncAt: new Date(),
          };
          notify();
        },
        (error) => {
          snapshot = {
            ...snapshot,
            connected: false,
            connectionError:
              error instanceof Error
                ? error.message
                : "Firebase denied access to live bus data.",
          };
          notify();
        },
      );

      stopFleetListener = runtime.onValue(
        fleetRef,
        (dataSnapshot) => {
          const value = dataSnapshot.val();
          fleetData =
            value && typeof value === "object"
              ? (value as Record<string, FleetBusRecord>)
              : null;

          snapshot = {
            ...snapshot,
            buses: mergeLiveBuses(liveData, fleetData),
            lastSyncAt: new Date(),
          };
          notify();
        },
        (error) => {
          snapshot = {
            ...snapshot,
            connectionError:
              error instanceof Error
                ? error.message
                : "Could not load bus fleet data.",
          };
          notify();
        },
      );

      stopConnectionListener = runtime.onValue(
        connectedRef,
        (dataSnapshot) => {
          snapshot = {
            ...snapshot,
            connected: dataSnapshot.val() === true,
          };
          notify();
        },
        (error) => {
          snapshot = {
            ...snapshot,
            connected: false,
            connectionError:
              error instanceof Error
                ? error.message
                : "Could not connect to Firebase Realtime Database.",
          };
          notify();
        },
      );
    } catch (error) {
      snapshot = {
        ...snapshot,
        connected: false,
        connectionError:
          error instanceof Error
            ? error.message
            : "Could not initialize Firebase Realtime Database.",
      };
      notify();
    }
  };

  const stop = () => {
    stopLiveListener?.();
    stopFleetListener?.();
    stopConnectionListener?.();
    stopLiveListener = undefined;
    stopFleetListener = undefined;
    stopConnectionListener = undefined;
    started = false;
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      void start();

      return () => {
        listeners.delete(listener);

        if (listeners.size === 0) {
          stop();
        }
      };
    },
  };
}

export const firebaseBusService = firebaseConfigured
  ? createFirebaseBusService()
  : null;
