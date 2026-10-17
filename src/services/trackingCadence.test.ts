import { FreshLocationRecovery } from "./freshLocationRecovery";
import { afterEach, expect, it, vi } from "vitest";
import { TrackingHeartbeat } from "./trackingHeartbeat";

// Browser-like scheduler: callbacks may run late; intervals retain their original
// schedule. A deadline timer can instead wake for the remaining few milliseconds.
function browserClock() {
  let now = 0,
    id = 0;
  const timers = new Map<
    number,
    { due: number; repeat: number; callback: () => void }
  >();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const add = (callback: () => void, delay: number, repeat: number) => {
    timers.set(++id, { due: now + delay, repeat, callback });
    return id;
  };
  vi.stubGlobal("setTimeout", (cb: () => void, delay = 0) => add(cb, delay, 0));
  vi.stubGlobal("setInterval", (cb: () => void, delay: number) =>
    add(cb, delay, delay),
  );
  vi.stubGlobal("clearTimeout", (timer: number) => timers.delete(timer));
  vi.stubGlobal("clearInterval", (timer: number) => timers.delete(timer));
  return {
    now: () => now,
    advance: async (time: number) => {
      now = time;
      for (const [key, timer] of [...timers]) {
        if (timer.due > now) continue;
        if (timer.repeat) timer.due += timer.repeat;
        else timers.delete(key);
        timer.callback();
      }
      for (let i = 0; i < 10; i++) await Promise.resolve();
    },
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("does not drop whole report intervals after a callback is five milliseconds late", async () => {
  const clock = browserClock();
  const sends: number[] = [];
  const heartbeat = new TrackingHeartbeat(async () => {
    sends.push(clock.now());
  }, vi.fn());
  await heartbeat.start();
  for (let second = 1; second <= 64; second++) {
    await clock.advance(second * 1000);
    await clock.advance(second * 1000 + 5);
  }
  await heartbeat.stop();
  // The first callback is genuinely delayed in the separate test below; this
  // also checks an uninterrupted one-second timeline.
  expect(sends).toHaveLength(65);
});
it("recovers the remaining milliseconds instead of skipping the next second", async () => {
  const clock = browserClock();
  const sends: number[] = [];
  const heartbeat = new TrackingHeartbeat(async () => {
    sends.push(clock.now());
  }, vi.fn());
  await heartbeat.start();
  await clock.advance(1005); // first timer fires five ms late
  for (let second = 2; second <= 64; second++) {
    if (second % 2 === 0) await clock.advance(second * 1000); // alternating jitter
    await clock.advance(second * 1000 + 5);
  }
  await heartbeat.stop();
  expect(sends).toHaveLength(65);
  expect(sends.slice(1).every((time, i) => time - sends[i] >= 1000)).toBe(true);
});

it("does not skip fresh GPS requests due to a few milliseconds of timer jitter", async () => {
  const clock = browserClock();
  vi.stubGlobal("document", { visibilityState: "visible" });
  const request = vi.fn((ok: PositionCallback) =>
    ok({ timestamp: clock.now() } as GeolocationPosition),
  );
  const recovery = new FreshLocationRecovery(
    { getCurrentPosition: request } as unknown as Geolocation,
    () => true,
    vi.fn(),
  );
  recovery.tick();
  for (let second = 1; second <= 64; second++) {
    if (second % 2 === 0) {
      await clock.advance(second * 1000);
      recovery.tick();
    }
    await clock.advance(second * 1000 + 5);
    recovery.tick();
  }
  recovery.stop();
  expect(request).toHaveBeenCalledTimes(65);
  await clock.advance(66000);
  expect(request).toHaveBeenCalledTimes(65);
});
it("never bursts missed reports after suspension and ignores wall clock changes", async () => {
  const clock = browserClock();
  const send = vi.fn(async () => {});
  const heartbeat = new TrackingHeartbeat(send, vi.fn());
  await heartbeat.start();
  await clock.advance(60000);
  expect(send).toHaveBeenCalledTimes(2);
  vi.spyOn(Date, "now").mockReturnValue(-1000000);
  await clock.advance(61000);
  expect(send).toHaveBeenCalledTimes(3);
  await heartbeat.stop();
  await clock.advance(62000);
  expect(send).toHaveBeenCalledTimes(3);
});
