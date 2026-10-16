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
async function start() {
  session = await startDriverTracking({
    busId: "SYN-1",
    busNumber: "1",
    route: "Synthetic",
    onPosition: vi.fn(),
    onError: errors,
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
  expect(fixture.runtime.update).toHaveBeenCalledTimes(1);
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
it("uses a valid root reference and sends no duplicate timer heartbeats", async () => {
  await start();
  await vi.advanceTimersByTimeAsync(5000);
  expect(fixture.runtime.update).toHaveBeenCalledTimes(1);
  expect(fixture.runtime.update.mock.calls[0][0]).toBe("/");
  watch(pos(2000));
  await settle();
  expect(fixture.runtime.update).toHaveBeenCalledTimes(2);
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
  release();
  await settle();
  expect(
    fixture.runtime.update.mock.calls.map(
      (c: any) => c[1]["liveBuses/SYN-1"].capturedAt,
    ),
  ).toEqual([1000, 2000, 3000, 4000]);
});
it("fails closed after reconnect when the session lock was released", async () => {
  await start();
  connection({ val: () => false });
  watch(pos(2000));
  await settle();
  expect(fixture.runtime.update).toHaveBeenCalledTimes(1);
  fixture.runtime.get.mockResolvedValueOnce({ val: () => null });
  connection({ val: () => true });
  await settle();
  await vi.advanceTimersByTimeAsync(3000);
  expect(errors).toHaveBeenCalledWith(
    expect.stringContaining("connection ended"),
  );
  expect(fixture.runtime.update).toHaveBeenCalledTimes(1);
  expect(fixture.runtime.runTransaction).toHaveBeenCalledTimes(1);
});
it("rearms disconnect handling before resuming a still-owned connection", async () => {
  await start();
  connection({ val: () => false });
  watch(pos(2000));
  connection({ val: () => true });
  await settle();
  expect(fixture.runtime.update).toHaveBeenCalledTimes(2);
  expect(errors).not.toHaveBeenCalled();
  expect(fixture.runtime.onDisconnect).toHaveBeenCalledWith("/");
});
it("permission denial stops retry traffic and location collection", async () => {
  await start();
  fixture.runtime.update.mockRejectedValueOnce(Error("PERMISSION_DENIED"));
  watch(pos(2000));
  await settle();
  await vi.advanceTimersByTimeAsync(5000);
  expect(fixture.runtime.update).toHaveBeenCalledTimes(2);
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
