import { it, expect, vi, afterEach } from "vitest";
import { TrackingHeartbeat, heartbeatInterval } from "./trackingHeartbeat";
import { startDriverTracking } from "./driverTrackingService";
const state = vi.hoisted(() => ({ runtime: null as any }));
vi.mock("../config/firebase", () => ({
  getFirebaseRuntime: async () => state.runtime,
}));
vi.mock("./telemetryClient", () => ({ trustedTelemetryEnabled: () => false }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("keeps a stationary tracker alive for five minutes without inventing GPS fixes, then stops", async () => {
  vi.useFakeTimers();
  const capturedAt = Date.now();
  const fix = {
    timestamp: capturedAt,
    coords: {
      latitude: 39.97,
      longitude: -86.12,
      accuracy: 5,
      speed: 0,
      heading: null,
    },
  };
  vi.stubGlobal("window", { isSecureContext: true });
  vi.stubGlobal("document", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("navigator", {
    geolocation: {
      getCurrentPosition: (ok: any) => ok(fix),
      watchPosition: () => 1,
      clearWatch: vi.fn(),
    },
  });
  const writes: any[] = [];
  state.runtime = {
    auth: { currentUser: { uid: "synthetic" } },
    db: {},
    ref: (_: any, p: string) => p,
    serverTimestamp: () => ({ ".sv": "timestamp" }),
    runTransaction: async () => ({ committed: true }),
    update: async (_: any, v: any) => {
      writes.push(v);
    },
    remove: async () => {},
    onDisconnect: () => ({
      remove: async () => {},
      update: async () => {},
      cancel: async () => {},
    }),
    onValue: () => () => {},
  };
  const session = await startDriverTracking({
    busId: "SYN-12",
    busNumber: "12",
    route: "Synthetic",
    onPosition: vi.fn(),
    onError: vi.fn(),
  });
  await vi.advanceTimersByTimeAsync(300000);
  expect(writes.filter((w) => w["liveBuses/SYN-12"])).toHaveLength(1);
  expect(
    writes.filter((w) => w["trackerHeartbeats/SYN-12"]).length,
  ).toBeGreaterThanOrEqual(20);
  expect(
    writes.find((w) => w["liveBuses/SYN-12"])["liveBuses/SYN-12"].capturedAt,
  ).toBe(capturedAt);
  await session.stop();
  const count = writes.length;
  await vi.advanceTimersByTimeAsync(60000);
  expect(writes).toHaveLength(count);
});

it("has bounded configurable frequency, one in-flight write, and pauses during disconnection", async () => {
  vi.useFakeTimers();
  let resolve!: () => void;
  const send = vi.fn(() => new Promise<void>((r) => (resolve = r)));
  const heartbeat = new TrackingHeartbeat(send, vi.fn(), 5000);
  void heartbeat.start();
  await vi.advanceTimersByTimeAsync(30000);
  expect(send).toHaveBeenCalledTimes(1);
  resolve();
  await Promise.resolve();
  await Promise.resolve();
  heartbeat.pause(true);
  await vi.advanceTimersByTimeAsync(30000);
  expect(send).toHaveBeenCalledTimes(1);
  heartbeat.pause(false);
  void heartbeat.flush();
  await Promise.resolve();
  expect(send).toHaveBeenCalledTimes(2);
  resolve();
  await heartbeat.stop();
  await vi.advanceTimersByTimeAsync(30000);
  expect(send).toHaveBeenCalledTimes(2);
  expect(heartbeatInterval(undefined)).toBe(15000);
  expect(heartbeatInterval(1000)).toBe(15000);
  expect(heartbeatInterval(60000)).toBe(60000);
});
it("sends 60 fresh GPS fixes without throttling them to heartbeat cadence", async () => {
  vi.useFakeTimers();
  let watch!: (v: any) => void;
  const errors = vi.fn();
  const position = () => ({
    timestamp: Date.now(),
    coords: {
      latitude: 39.97,
      longitude: -86.12,
      accuracy: 5,
      speed: 8,
      heading: 0,
    },
  });
  vi.stubGlobal("window", { isSecureContext: true });
  vi.stubGlobal("document", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("navigator", {
    geolocation: {
      getCurrentPosition: (cb: any) => cb(position()),
      watchPosition: (cb: any) => {
        watch = cb;
        return 1;
      },
      clearWatch: vi.fn(),
    },
  });
  const writes: any[] = [];
  state.runtime = {
    auth: { currentUser: { uid: "synthetic" } },
    db: {},
    ref: (_: any, p: string) => p,
    serverTimestamp: () => ({ ".sv": "timestamp" }),
    runTransaction: async () => ({ committed: true }),
    update: async (_: any, v: any) => {
      writes.push(v);
    },
    onDisconnect: () => ({
      remove: async () => {},
      update: async () => {},
      cancel: async () => {},
    }),
    onValue: () => () => {},
  };
  const session = await startDriverTracking({
    busId: "SYN-12",
    busNumber: "12",
    route: "Synthetic",
    onPosition: vi.fn(),
    onError: errors,
  });
  for (let n = 0; n < 60; n++) {
    await vi.advanceTimersByTimeAsync(1000);
    watch(position());
    await Promise.resolve();
    await Promise.resolve();
  }
  await vi.advanceTimersByTimeAsync(1);
  expect(writes.filter((w) => w["liveBuses/SYN-12"])).toHaveLength(61);
  expect(writes.filter((w) => w["trackerHeartbeats/SYN-12"])).toHaveLength(5);
  expect(errors).not.toHaveBeenCalled();
  await session.stop();
});

it("reports GPS unavailable and recovery without changing coordinates in a heartbeat", async () => {
  vi.useFakeTimers();
  const sent: boolean[] = [];
  const heartbeat = new TrackingHeartbeat(async (available) => {
    sent.push(available);
  }, vi.fn());
  await heartbeat.start();
  heartbeat.gpsAvailable = false;
  await vi.advanceTimersByTimeAsync(15000);
  heartbeat.gpsAvailable = true;
  await vi.advanceTimersByTimeAsync(15000);
  expect(sent).toEqual([true, false, true]);
  await heartbeat.stop();
});
