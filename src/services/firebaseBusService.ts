import { createMockBuses } from "../data/mockBuses";
import type { Bus, BusSnapshot } from "../types/bus";
import { firebaseConfig, firebaseConfigured } from "../config/firebase";
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function mergeLiveBuses(
  data: Record<string, LiveBusRecord> | null,
): Bus[] {
  return BASE_BUSES.map((base) => {
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

function databaseUrl() {
  return firebaseConfig.databaseURL!.replace(/\/+$/, "");
}

export function createFirebaseBusService(): BusService {
  let snapshot: BusSnapshot = {
    buses: mergeLiveBuses(null),
    mode: "live",
    connected: false,
    updateIntervalMs: LIVE_UPDATE_INTERVAL_MS,
  };

  const listeners = new Set<() => void>();
  let started = false;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let refreshing = false;

  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  const refresh = async () => {
    if (refreshing) return;
    refreshing = true;

    try {
      const response = await fetch(`${databaseUrl()}/liveBuses.json`, {
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Firebase returned HTTP ${response.status}.`);
      }

      const value = await response.json();

      snapshot = {
        ...snapshot,
        buses: mergeLiveBuses(
          value && typeof value === "object"
            ? (value as Record<string, LiveBusRecord>)
            : null,
        ),
        connected: true,
        connectionError: undefined,
        lastSyncAt: new Date(),
      };
      notify();
    } catch (error) {
      snapshot = {
        ...snapshot,
        connected: false,
        connectionError:
          error instanceof Error
            ? error.message
            : "Could not read live bus data from Firebase.",
      };
      notify();
    } finally {
      refreshing = false;
    }
  };

  const start = () => {
    if (started) return;
    started = true;

    void refresh();
    pollTimer = setInterval(() => {
      void refresh();
    }, LIVE_UPDATE_INTERVAL_MS);
  };

  const stop = () => {
    if (!started) return;
    started = false;

    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      start();

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
