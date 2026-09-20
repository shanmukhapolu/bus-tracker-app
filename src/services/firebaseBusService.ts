import { createMockBuses } from "../data/mockBuses";
import type { Bus, BusSnapshot } from "../types/bus";
import {
  firebaseConfigured,
  getFirebaseRuntime,
} from "../config/firebase";
import type { BusService } from "./busService";

const LIVE_UPDATE_INTERVAL_MS = 1000;
const BASE_BUSES = createMockBuses(new Date("2026-09-20T00:00:00Z"));

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
    const active =
      live?.active === true &&
      isFiniteNumber(live.latitude) &&
      isFiniteNumber(live.longitude);

    if (!active) {
      return {
        ...base,
        trackingActive: false,
        status: "offline",
        etaMinutes: undefined,
        speed: undefined,
        heading: undefined,
        currentLocation: "Not tracking",
      };
    }

    return {
      ...base,
      busNumber: live.busNumber ?? base.busNumber,
      route: live.route ?? base.route,
      latitude: live.latitude!,
      longitude: live.longitude!,
      speed: isFiniteNumber(live.speedMps ?? undefined)
        ? live.speedMps! * 3.6
        : undefined,
      heading: isFiniteNumber(live.headingDeg ?? undefined)
        ? live.headingDeg!
        : undefined,
      trackingActive: true,
      status: "on-time",
      delayMinutes: undefined,
      etaMinutes: undefined,
      nextStop: undefined,
      currentLocation: "Live GPS",
      locationAccuracyMeters: isFiniteNumber(live.accuracyMeters)
        ? live.accuracyMeters
        : undefined,
      lastUpdated: isFiniteNumber(live.lastUpdated)
        ? new Date(live.lastUpdated)
        : new Date(),
    };
  });
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
  let stopLiveListener: (() => void) | undefined;
  let stopConnectionListener: (() => void) | undefined;

  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  async function start() {
    if (started) return;
    started = true;

    try {
      const runtime = await getFirebaseRuntime();
      const liveBusesRef = runtime.ref(runtime.db, "liveBuses");
      const connectedRef = runtime.ref(runtime.db, ".info/connected");

      stopLiveListener = runtime.onValue(
        liveBusesRef,
        (dataSnapshot) => {
          const value = dataSnapshot.val();
          snapshot = {
            ...snapshot,
            buses: mergeLiveBuses(
              value && typeof value === "object"
                ? (value as Record<string, LiveBusRecord>)
                : null,
            ),
          };
          notify();
        },
        () => {
          snapshot = { ...snapshot, connected: false };
          notify();
        },
      );

      stopConnectionListener = runtime.onValue(connectedRef, (dataSnapshot) => {
        snapshot = {
          ...snapshot,
          connected: dataSnapshot.val() === true,
        };
        notify();
      });
    } catch {
      snapshot = { ...snapshot, connected: false };
      notify();
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      void start();

      return () => {
        listeners.delete(listener);

        if (listeners.size === 0) {
          stopLiveListener?.();
          stopConnectionListener?.();
          stopLiveListener = undefined;
          stopConnectionListener = undefined;
          started = false;
        }
      };
    },
  };
}

export const firebaseBusService = firebaseConfigured
  ? createFirebaseBusService()
  : null;
