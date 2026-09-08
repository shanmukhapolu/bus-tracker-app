import { createMockBuses, demoRoute } from "../data/mockBuses";
import type { BusSnapshot } from "../types/bus";
import type { BusService } from "./busService";

export const MOCK_UPDATE_INTERVAL_MS = 10_000;

export function createMockBusService(): BusService {
  let snapshot: BusSnapshot = {
    buses: createMockBuses(),
    mode: "demo",
    connected: true,
    updateIntervalMs: MOCK_UPDATE_INTERVAL_MS,
  };
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let step = 0;

  function tick() {
    // Bounce at the endpoints: no teleport when the simulated route repeats.
    const period = (demoRoute.length - 1) * 2;
    step = (step + 1) % period;
    const index = step < demoRoute.length ? step : period - step;
    const [longitude, latitude] = demoRoute[index];
    snapshot = {
      ...snapshot,
      buses: snapshot.buses.map((bus) => ({
        ...bus,
        ...(bus.id === "218"
          ? {
              longitude,
              latitude,
              heading: step < demoRoute.length - 1 ? 0 : 180,
            }
          : {}),
        lastUpdated: new Date(),
      })),
    };
    listeners.forEach((listener) => listener());
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      if (!timer) timer = setInterval(tick, MOCK_UPDATE_INTERVAL_MS);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          clearInterval(timer);
          timer = undefined;
        }
      };
    },
  };
}

export const mockBusService = createMockBusService();
