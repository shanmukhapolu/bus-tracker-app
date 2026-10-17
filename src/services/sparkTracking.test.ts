import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ runtime: null as any }));
vi.mock("../config/firebase", () => ({
  getFirebaseRuntime: async () => fixture.runtime,
}));
vi.mock("./telemetryClient", () => ({
  trustedTelemetryEnabled: () => false,
  createBackendTelemetryClient: vi.fn(),
  TelemetryApiError: Error,
}));
import { startDriverTracking } from "./driverTrackingService";
let watch: (p: any) => void,
  connection: (s: any) => void,
  errors: ReturnType<typeof vi.fn<(message: string) => void>>,
  session: any;
const pos = (timestamp = 1000) => ({
  timestamp,
  coords: {
    latitude: 39.95,
    longitude: -86.12,
    accuracy: 8,
    speed: 10,
    heading: 90,
  },
});
const gpsWrites = () =>
  fixture.runtime.update.mock.calls.filter((c: any) => c[1]["liveBuses/SYN-1"]);
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
beforeEach(() => {
  vi.useFakeTimers();
  errors = vi.fn();
  session = null;
  const hooks = {
    remove: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
  };
  fixture.runtime = {
    auth: { currentUser: { uid: "driver" } },
    db: {},
    ref: (_: any, p: string) => p,
    update: vi.fn().mockResolvedValue(undefined),
    serverTimestamp: () => ({ ".sv": "timestamp" }),
    runTransaction: vi.fn().mockResolvedValue({ committed: true }),
    get: vi.fn().mockResolvedValue({ val: () => "driver" }),
    remove: vi.fn().mockResolvedValue(undefined),
    onDisconnect: vi.fn(() => hooks),
    onValue: vi.fn((_: any, cb: any) => {
      connection = cb;
      return vi.fn();
    }),
  };
  vi.stubGlobal("window", { isSecureContext: true });
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("navigator", {
    geolocation: {
      getCurrentPosition: (cb: any) => cb(pos()),
      watchPosition: (cb: any) => {
        watch = cb;
        return 1;
      },
      clearWatch: vi.fn(),
    },
  });
});
afterEach(async () => {
  await session?.stop().catch(() => {});
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function start(
  overrides: Partial<
    import("./driverTrackingService").DriverTrackingOptions
  > = {},
) {
  session = await startDriverTracking({
    busId: "SYN-1",
    busNumber: "1",
    route: "Synthetic",
    onPosition: vi.fn(),
    onError: errors,
    ...overrides,
  });
  await settle();
  return session;
}
it("a stale reconnect response cannot resume uploads after a later disconnect", async () => {
  await start();
  let release!: (value: any) => void;
  fixture.runtime.get.mockImplementationOnce(
    () =>
      new Promise((r) => {
        release = r;
      }),
  );
  connection({ val: () => true });
  connection({ val: () => false });
  watch(pos(2000));
  release({ val: () => "driver" });
  await settle();
  await vi.advanceTimersByTimeAsync(2000);
  expect(gpsWrites()).toHaveLength(1);
  expect(errors).not.toHaveBeenCalled();
});
it("does not announce a session when the mandatory initial write fails", async () => {
  fixture.runtime.update.mockRejectedValueOnce(Error("permission denied"));
  await expect(start()).rejects.toThrow("denied tracking access");
  expect(fixture.runtime.remove).toHaveBeenCalledWith("activeDrivers/SYN-1");
});
it("retains disconnect cleanup when an explicit stop write fails", async () => {
  await start();
  fixture.runtime.update.mockRejectedValueOnce(Error("offline"));
  await expect(session.stop()).rejects.toThrow("could not be saved");
  const hook = fixture.runtime.onDisconnect.mock.results[0].value;
  expect(hook.cancel).not.toHaveBeenCalled();
});
it("uses a valid root reference and sends no duplicate timer GPS fixes", async () => {
  await start();
  await vi.advanceTimersByTimeAsync(5000);
  expect(gpsWrites()).toHaveLength(1);
  expect(fixture.runtime.update.mock.calls[0][0]).toBe("/");
  watch(pos(2000));
  await settle();
  expect(gpsWrites()).toHaveLength(2);
});
it("keeps all intermediate captured fixes through a slow upload", async () => {
  await start();
  let release!: () => void;
  fixture.runtime.update.mockImplementationOnce(
    () => new Promise<void>((r) => (release = r)),
  );
  watch(pos(2000));
  watch(pos(3000));
  watch(pos(4000));
  await settle();
  release();
  await settle();
  expect(
    gpsWrites().map((c: any) => c[1]["liveBuses/SYN-1"].capturedAt),
  ).toEqual([1000, 2000, 3000, 4000]);
});
it("fails closed after reconnect when the session lock was released", async () => {
  await start();
  connection({ val: () => false });
  watch(pos(2000));
  await settle();
  expect(gpsWrites()).toHaveLength(1);
  fixture.runtime.get.mockResolvedValueOnce({ val: () => null });
  connection({ val: () => true });
  await settle();
  await vi.advanceTimersByTimeAsync(3000);
  expect(errors).toHaveBeenCalledWith(
    expect.stringContaining("connection ended"),
  );
  expect(gpsWrites()).toHaveLength(1);
  expect(fixture.runtime.runTransaction).toHaveBeenCalledTimes(1);
});
it("rearms disconnect handling before resuming a still-owned connection", async () => {
  await start();
  connection({ val: () => false });
  watch(pos(2000));
  connection({ val: () => true });
  await settle();
  expect(gpsWrites()).toHaveLength(2);
  expect(errors).not.toHaveBeenCalled();
  expect(fixture.runtime.onDisconnect).toHaveBeenCalledWith("/");
});
it("permission denial stops retry traffic and location collection", async () => {
  await start();
  fixture.runtime.update.mockRejectedValueOnce(Error("PERMISSION_DENIED"));
  watch(pos(2000));
  await settle();
  await vi.advanceTimersByTimeAsync(5000);
  expect(gpsWrites()).toHaveLength(2);
  expect(navigator.geolocation.clearWatch).toHaveBeenCalled();
  expect(errors).toHaveBeenCalledWith(
    expect.stringContaining("authorization changed"),
  );
});
it("stops both projections and the owning lock atomically before cancelling disconnect cleanup", async () => {
  await start();
  await session.stop();
  session = null;
  const stop = fixture.runtime.update.mock.calls.at(-1);
  expect(stop[1]).toMatchObject({
    "activeDrivers/SYN-1": null,
    "liveBuses/SYN-1/active": false,
    "publicBuses/SYN-1/active": false,
  });
  expect(fixture.runtime.remove).not.toHaveBeenCalled();
  const hook = fixture.runtime.onDisconnect.mock.results[0].value;
  expect(hook.cancel.mock.invocationCallOrder[0]).toBeGreaterThan(
    fixture.runtime.update.mock.invocationCallOrder.at(-1),
  );
});

it("recovers fresh one-second fixes when the foreground watch goes quiet", async () => {
  const request = vi.spyOn(navigator.geolocation, "getCurrentPosition");
  await start();
  let capture = 1000;
  request.mockImplementation((cb) =>
    cb(pos((capture += 1000)) as GeolocationPosition),
  );
  await vi.advanceTimersByTimeAsync(6000);
  expect(request).toHaveBeenCalledTimes(7); // initial plus one request each second
  expect(
    gpsWrites().map((c: any) => c[1]["liveBuses/SYN-1"].capturedAt),
  ).toEqual([1000, 2000, 3000, 4000, 5000, 6000, 7000]);
  expect(request.mock.calls.at(-1)?.[2]).toMatchObject({
    maximumAge: 0,
    enableHighAccuracy: true,
  });
});

it("requests once each second while deduplicating the normal one-second watcher", async () => {
  const request = vi.spyOn(navigator.geolocation, "getCurrentPosition");
  await start();
  for (let i = 1; i <= 60; i++) {
    watch(pos(1000 + i * 1000));
    await vi.advanceTimersByTimeAsync(1000);
  }
  expect(gpsWrites()).toHaveLength(61);
  expect(request).toHaveBeenCalledTimes(61);
});
it("ignores recovery callbacks after Stop and makes no further location requests", async () => {
  const request = vi.spyOn(navigator.geolocation, "getCurrentPosition");
  await start();
  let resolve!: PositionCallback;
  request.mockImplementation((cb) => {
    resolve = cb;
  });
  await vi.advanceTimersByTimeAsync(3000);
  await session.stop();
  const writes = fixture.runtime.update.mock.calls.length;
  resolve(pos(2000) as GeolocationPosition);
  await vi.advanceTimersByTimeAsync(60000);
  expect(fixture.runtime.update.mock.calls.length).toBe(writes);
  expect(request).toHaveBeenCalledTimes(2);
});
it("does not multiply pending native requests or upload repeated capture timestamps", async () => {
  const request = vi.spyOn(navigator.geolocation, "getCurrentPosition");
  await start();
  let resolve!: PositionCallback;
  request.mockImplementation((cb) => {
    resolve = cb;
  });
  await vi.advanceTimersByTimeAsync(300000);
  expect(request).toHaveBeenCalledTimes(2);
  resolve(pos() as GeolocationPosition);
  await vi.advanceTimersByTimeAsync(999);
  expect(request).toHaveBeenCalledTimes(2);
  expect(gpsWrites()).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(request).toHaveBeenCalledTimes(3);
});
it("retries failed requests at the next one-second tick", async () => {
  const request = vi.spyOn(navigator.geolocation, "getCurrentPosition");
  await start();
  request.mockImplementationOnce((_cb, error) =>
    error?.({ code: 3, TIMEOUT: 3 } as GeolocationPositionError),
  );
  request.mockImplementation((cb) => cb(pos(2000) as GeolocationPosition));
  await vi.advanceTimersByTimeAsync(1000);
  expect(gpsWrites()).toHaveLength(1);
  expect(request).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1000);
  expect(gpsWrites()).toHaveLength(2);
});
it("pauses recovery during disconnect and resumes only after session verification", async () => {
  const request = vi.spyOn(navigator.geolocation, "getCurrentPosition");
  await start();
  connection({ val: () => false });
  request.mockImplementation((cb) => cb(pos(2000) as GeolocationPosition));
  await vi.advanceTimersByTimeAsync(30000);
  expect(request).toHaveBeenCalledTimes(1);
  connection({ val: () => true });
  await settle();
  await vi.advanceTimersByTimeAsync(1000);
  expect(gpsWrites()).toHaveLength(2);
});
it("does not request recovery while hidden or after permission failure", async () => {
  const request = vi.spyOn(navigator.geolocation, "getCurrentPosition");
  await start();
  Object.assign(document, { visibilityState: "hidden" });
  await vi.advanceTimersByTimeAsync(30000);
  expect(request).toHaveBeenCalledTimes(1);
  Object.assign(document, { visibilityState: "visible" });
  fixture.runtime.update.mockRejectedValueOnce(Error("PERMISSION_DENIED"));
  watch(pos(2000));
  await settle();
  await vi.advanceTimersByTimeAsync(30000);
  expect(request).toHaveBeenCalledTimes(1);
});

it("does not report a failed recovery request after the normal watcher recovers", async () => {
  const request = vi.spyOn(navigator.geolocation, "getCurrentPosition");
  await start();
  let reject!: PositionErrorCallback;
  request.mockImplementation((_cb, error) => {
    reject = error!;
  });
  await vi.advanceTimersByTimeAsync(3000);
  watch(pos(2000));
  await settle();
  reject({ code: 3, TIMEOUT: 3 } as GeolocationPositionError);
  expect(errors).not.toHaveBeenCalled();
  expect(gpsWrites()).toHaveLength(2);
});

it("serializes reports behind slow GPS writes without copying an unacknowledged capture", async () => {
  await start();
  let release!: () => void;
  fixture.runtime.update.mockImplementationOnce(
    () =>
      new Promise<void>((r) => {
        release = r;
      }),
  );
  watch(pos(2000));
  await settle();
  await vi.advanceTimersByTimeAsync(1000);
  watch(pos(3000));
  expect(
    fixture.runtime.update.mock.calls.filter(
      (c: any) => c[1]["trackerHeartbeats/SYN-1"],
    ),
  ).toHaveLength(1);
  release();
  await settle();
  await settle();
  const reports = fixture.runtime.update.mock.calls.filter(
    (c: any) => c[1]["trackerHeartbeats/SYN-1"],
  );
  expect(
    reports.at(-1)[1]["trackerHeartbeats/SYN-1"].lastKnownLocation.capturedAt,
  ).toBe(2000);
  expect(
    gpsWrites().map((c: any) => c[1]["liveBuses/SYN-1"].capturedAt),
  ).toEqual([1000, 2000, 3000]);
});

it("keeps one-second request starts when device callbacks take 100 ms", async () => {
  const request = vi.spyOn(navigator.geolocation, "getCurrentPosition");
  await start();
  let capture = 1000;
  request.mockImplementation((cb) => {
    setTimeout(() => cb(pos((capture += 1000)) as GeolocationPosition), 100);
  });
  await vi.advanceTimersByTimeAsync(60100);
  expect(request).toHaveBeenCalledTimes(61);
  expect(gpsWrites()).toHaveLength(61);
});

it("exposes staging-only native timing without extra database operations", async () => {
  vi.stubEnv("MODE", "staging");
  try {
    const request = vi.spyOn(navigator.geolocation, "getCurrentPosition");
    await start();
    let answer!: PositionCallback;
    request.mockImplementation((cb) => {
      answer = cb;
    });
    await vi.advanceTimersByTimeAsync(7000);
    expect(session.diagnostics()).toMatchObject({
      requestsStarted: 1,
      requestsCompleted: 0,
      requestPendingMs: 6000,
      gpsUploadsAcknowledged: 1,
      reportsAcknowledged: 8,
    });
    const writes = fixture.runtime.update.mock.calls.length;
    const reads = fixture.runtime.get.mock.calls.length;
    for (let i = 0; i < 100; i++) session.diagnostics();
    expect(fixture.runtime.update.mock.calls.length).toBe(writes);
    expect(fixture.runtime.get.mock.calls.length).toBe(reads);
    answer(pos(1000) as GeolocationPosition);
    await settle();
    expect(session.diagnostics()).toMatchObject({
      requestsCompleted: 1,
      lastRequestMs: 6000,
      repeatedOrOlderFixes: 1,
      gpsUploadsAcknowledged: 1,
    });
    await session.stop();
    const frozen = session.diagnostics();
    await vi.advanceTimersByTimeAsync(60000);
    expect(session.diagnostics()).toEqual(frozen);
  } finally {
    vi.unstubAllEnvs();
  }
});
it("does not collect timing diagnostics in production", async () => {
  vi.stubEnv("MODE", "production");
  try {
    await start();
    expect(session.diagnostics).toBeUndefined();
  } finally {
    vi.unstubAllEnvs();
  }
});

it("keeps reporting through GPS timeouts and clears waiting only on a fresh fix", async () => {
  const gpsStatus = vi.fn(),
    failure = vi.fn();
  const request = vi.spyOn(navigator.geolocation, "getCurrentPosition");
  await start({ onGpsStatus: gpsStatus, onTrackingFailure: failure });
  request.mockImplementationOnce((_cb, error) =>
    error?.({ code: 3, TIMEOUT: 3 } as GeolocationPositionError),
  );
  await vi.advanceTimersByTimeAsync(1000);
  expect(gpsStatus).toHaveBeenLastCalledWith("waiting");
  expect(errors).not.toHaveBeenCalled();
  expect(failure).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1000); // default mock returns the old fix
  expect(gpsStatus).toHaveBeenLastCalledWith("waiting");
  expect(gpsWrites()).toHaveLength(1);
  expect(
    fixture.runtime.update.mock.calls.filter(
      (c: any) => c[1]["trackerHeartbeats/SYN-1"],
    ),
  ).toHaveLength(3);
  watch(pos(2000));
  await settle();
  expect(gpsStatus).toHaveBeenLastCalledWith("available");
  expect(gpsWrites()).toHaveLength(2);
  await session.stop();
  const calls = gpsStatus.mock.calls.length;
  await vi.advanceTimersByTimeAsync(30000);
  expect(gpsStatus).toHaveBeenCalledTimes(calls);
});
it("ignores a late watcher timeout after the explicit GPS requester recovers", async () => {
  const gpsStatus = vi.fn();
  let watchError!: PositionErrorCallback;
  vi.spyOn(navigator.geolocation, "watchPosition").mockImplementation(
    (ok, error) => {
      watch = ok;
      watchError = error!;
      return 1;
    },
  );
  await start({ onGpsStatus: gpsStatus });
  vi.spyOn(navigator.geolocation, "getCurrentPosition").mockImplementation(
    (cb) => cb(pos(2000) as GeolocationPosition),
  );
  await vi.advanceTimersByTimeAsync(1000);
  watchError({ code: 3, TIMEOUT: 3 } as GeolocationPositionError);
  expect(gpsStatus).toHaveBeenLastCalledWith("available");
  expect(errors).not.toHaveBeenCalled();
});
it("treats native permission denial as terminal even just after a fresh fix", async () => {
  const gpsStatus = vi.fn(),
    failure = vi.fn();
  const request = vi.spyOn(navigator.geolocation, "getCurrentPosition");
  await start({ onGpsStatus: gpsStatus, onTrackingFailure: failure });
  let reject!: PositionErrorCallback;
  request.mockImplementation((_cb, error) => {
    reject = error!;
  });
  await vi.advanceTimersByTimeAsync(1000);
  watch(pos(2000));
  await settle();
  reject({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError);
  await settle();
  expect(gpsStatus).toHaveBeenLastCalledWith("blocked");
  expect(failure).toHaveBeenCalledWith(
    expect.stringContaining("permission is blocked"),
  );
  const writes = fixture.runtime.update.mock.calls.length,
    requests = request.mock.calls.length;
  await vi.advanceTimersByTimeAsync(30000);
  expect(fixture.runtime.update.mock.calls).toHaveLength(writes);
  expect(request).toHaveBeenCalledTimes(requests);
});
