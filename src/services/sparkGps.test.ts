import { expect, it, vi } from "vitest";
import { SparkGpsQueue, sparkGpsUpdate } from "./sparkGps";
const point = (capturedAt = 1) => ({
  capturedAt,
  latitude: 39.9,
  longitude: -86.1,
  accuracyMeters: 8,
  speedMps: 10,
  headingDeg: 90,
});
it("publishes each distinct fix once despite repeated timer/visibility requests", async () => {
  const send = vi.fn().mockResolvedValue(undefined),
    q = new SparkGpsQueue(send);
  q.enqueue(point());
  await q.flush();
  for (let i = 0; i < 10; i++) {
    q.enqueue(point());
    await q.flush();
  }
  expect(send).toHaveBeenCalledTimes(1);
});
it("preserves intermediate fixes arriving during an outstanding upload in order", async () => {
  let release!: () => void;
  const send = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          release = r;
        }),
    )
    .mockResolvedValue(undefined);
  const q = new SparkGpsQueue(send);
  q.enqueue(point());
  const done = q.flush();
  q.enqueue(point(2));
  q.enqueue(point(3));
  q.enqueue(point(4));
  expect(q.flush()).toBe(done);
  release();
  await done;
  expect(send.mock.calls.map((c) => c[0].capturedAt)).toEqual([1, 2, 3, 4]);
  expect(q.size).toBe(0);
});
it("retries the identical uncertain packet before newer fixes", async () => {
  const send = vi
      .fn()
      .mockRejectedValueOnce(Error("offline"))
      .mockResolvedValue(undefined),
    q = new SparkGpsQueue(send);
  const p = point();
  q.enqueue(p);
  p.latitude = 1;
  await expect(q.flush()).rejects.toThrow("offline");
  q.enqueue(point(2));
  await q.flush();
  expect(send.mock.calls.map((c) => c[0].capturedAt)).toEqual([1, 1, 2]);
  expect(send.mock.calls[0][0]).toEqual(send.mock.calls[1][0]);
  expect(send.mock.calls[0][0].latitude).toBe(39.9);
});
it("ignores outdated and duplicate captures without replacing speed or coordinates", async () => {
  const send = vi.fn().mockResolvedValue(undefined),
    q = new SparkGpsQueue(send);
  q.enqueue(point(10));
  expect(q.enqueue({ ...point(10), speedMps: 60 })).toBe(false);
  expect(q.enqueue(point(9))).toBe(false);
  await q.flush();
  expect(send).toHaveBeenCalledExactlyOnceWith(point(10));
});
it("pauses pending writes and resumes without losing queued fixes", async () => {
  const send = vi.fn().mockResolvedValue(undefined),
    q = new SparkGpsQueue(send);
  q.setPaused(true);
  q.enqueue(point());
  q.enqueue(point(2));
  await q.flush();
  expect(send).not.toHaveBeenCalled();
  q.setPaused(false);
  await q.flush();
  expect(send).toHaveBeenCalledTimes(2);
});
it("reports overflow without evicting queued positions", async () => {
  const send = vi.fn().mockResolvedValue(undefined),
    q = new SparkGpsQueue(send, 2);
  q.enqueue(point());
  q.enqueue(point(2));
  expect(() => q.enqueue(point(3))).toThrow("buffer is full");
  await q.flush();
  expect(send.mock.calls.map((c) => c[0].capturedAt)).toEqual([1, 2]);
  expect(q.enqueue(point(3))).toBe(true);
});
it.each([
  { latitude: NaN },
  { longitude: 181 },
  { accuracyMeters: 10001 },
  { speedMps: -1 },
  { headingDeg: 360 },
  { capturedAt: Infinity },
])("rejects malformed fixes %j", (patch) => {
  const q = new SparkGpsQueue(vi.fn());
  expect(() => q.enqueue({ ...point(), ...patch })).toThrow("invalid GPS");
  expect(q.size).toBe(0);
});
it("writes only the existing small projections with no protected fields in public", () => {
  const patch = sparkGpsUpdate(
    { busId: "SYN-1", busNumber: "1", route: "Test" },
    "driver",
    point(),
    123,
  );
  expect(Object.keys(patch)).toEqual(["liveBuses/SYN-1", "publicBuses/SYN-1"]);
  expect(patch["publicBuses/SYN-1"]).not.toHaveProperty("driverUid");
  expect(patch["publicBuses/SYN-1"]).not.toHaveProperty("speedMps");
  expect(patch["liveBuses/SYN-1"]).toMatchObject({
    driverUid: "driver",
    speedMps: 10,
    capturedAt: 1,
  });
});
