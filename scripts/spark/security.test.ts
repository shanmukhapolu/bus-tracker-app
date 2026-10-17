import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  get,
  ref,
  set,
  update,
  onDisconnect,
  goOffline,
  goOnline,
  serverTimestamp,
} from "firebase/database";
import { sparkGpsUpdate } from "../../src/services/sparkGps";
import { emulatorOnly } from "./guard";
let env: RulesTestEnvironment;
const bus = { busId: "SYN-1", busNumber: "1", route: "Synthetic" };
const point = (t = Date.now()) => ({
  latitude: 39.95,
  longitude: -86.12,
  speedMps: 10,
  headingDeg: 90,
  accuracyMeters: 8,
  capturedAt: t,
});
const client = () => env.authenticatedContext("driver").database();
const publish = (d: any, p = point(), b = bus) =>
  update(ref(d), sparkGpsUpdate(b, "driver", p, serverTimestamp()));
const inactive = () => ({
  "activeDrivers/SYN-1": null,
  "liveBuses/SYN-1/active": false,
  "liveBuses/SYN-1/lastUpdated": serverTimestamp(),
  "liveBuses/SYN-1/endedAt": serverTimestamp(),
  "publicBuses/SYN-1/active": false,
  "publicBuses/SYN-1/lastUpdated": serverTimestamp(),
  "publicBuses/SYN-1/endedAt": serverTimestamp(),
});
async function privileged(path: string) {
  let value: any;
  await env.withSecurityRulesDisabled(async (c) => {
    value = (await get(ref(c.database(), path))).val();
  });
  return value;
}
beforeAll(async () => {
  emulatorOnly();
  env = await initializeTestEnvironment({
    projectId: "demo-ccs-staging",
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: readFileSync("scripts/spark/fixtures/database.rules.json", "utf8"),
    },
  });
});
beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled((c) =>
    set(ref(c.database()), {
      drivers: {
        driver: {
          displayName: "Synthetic Driver",
          enabled: true,
          assignedBus: "SYN-1",
          approvalStatus: "approved",
        },
        other: {
          displayName: "Other Test",
          enabled: true,
          assignedBus: "SYN-1",
          approvalStatus: "approved",
        },
      },
      buses: {
        "SYN-1": { busNumber: "1", route: "Synthetic", enabled: true },
        "SYN-2": { busNumber: "2", route: "Synthetic", enabled: true },
      },
      activeDrivers: { "SYN-1": "driver" },
      tripHistory: { preserved: true },
      safetyEvents: { preserved: true },
      auditLogs: { preserved: true },
    }),
  );
});
afterAll(async () => {
  await env?.cleanup();
});
it("permits only assigned authorized GPS writes and denies protected public reads", async () => {
  const d = client();
  await assertSucceeds(publish(d));
  const anon = env.unauthenticatedContext().database();
  await assertSucceeds(get(ref(anon, "publicBuses")));
  for (const path of [
    "liveBuses",
    "drivers",
    "tripHistory",
    "safetyEvents",
    "auditLogs",
  ])
    await assertFails(get(ref(anon, path)));
  await assertFails(publish(anon));
  await assertFails(
    publish(d, point(), { ...bus, busId: "SYN-2", busNumber: "2" }),
  );
});
it("denies disabled drivers and inactive buses", async () => {
  const d = client();
  await env.withSecurityRulesDisabled((c) =>
    update(ref(c.database()), { "drivers/driver/enabled": false }),
  );
  await assertFails(publish(d));
  await env.withSecurityRulesDisabled((c) =>
    update(ref(c.database()), {
      "drivers/driver/enabled": true,
      "buses/SYN-1/enabled": false,
    }),
  );
  await assertFails(publish(d));
});
it("rejects older, altered duplicate, future and expired packets atomically", async () => {
  const d = client(),
    p = point();
  await publish(d, p);
  await assertSucceeds(publish(d, p)); // identical uncertain acknowledgement retry is safe
  for (const candidate of [
    { ...p, capturedAt: p.capturedAt - 1 },
    { ...p, latitude: 40 },
    { ...p, speedMps: 20 },
    { ...p, capturedAt: Date.now() + 120000 },
    { ...p, capturedAt: Date.now() - 360000 },
  ])
    await assertFails(publish(d, candidate));
  expect((await privileged("liveBuses/SYN-1")).latitude).toBe(p.latitude);
  expect((await privileged("publicBuses/SYN-1")).capturedAt).toBe(p.capturedAt);
});
it("concurrent old/new writes cannot regress the live timestamp", async () => {
  const d = client(),
    t = Date.now();
  const results = await Promise.allSettled([
    publish(d, { ...point(t), latitude: 39.96 }),
    publish(d, point(t - 1)),
  ]);
  expect(results[0].status).toBe("fulfilled");
  expect((await privileged("liveBuses/SYN-1")).capturedAt).toBe(t);
});
it("malformed or privacy-breaking writes leave both projections unchanged", async () => {
  const d = client();
  await publish(d);
  const before = await privileged("publicBuses/SYN-1");
  await assertFails(publish(d, { ...point(), latitude: 91 }));
  await assertFails(
    update(ref(d), { "publicBuses/SYN-1/driverUid": "driver" }),
  );
  expect(await privileged("publicBuses/SYN-1")).toEqual(before);
  for (const path of ["tripHistory", "safetyEvents", "auditLogs"])
    await assertFails(set(ref(d, path), { unauthorized: true }));
});
it("stops projections and releases the owning lock in one atomic update", async () => {
  const d = client();
  await publish(d);
  await assertSucceeds(update(ref(d), inactive()));
  expect(await privileged("activeDrivers/SYN-1")).toBeNull();
  expect((await privileged("liveBuses/SYN-1")).active).toBe(false);
  expect((await privileged("publicBuses/SYN-1")).active).toBe(false);
  for (const path of ["tripHistory", "safetyEvents", "auditLogs"])
    expect(await privileged(path)).toEqual({ preserved: true });
});
it("an obsolete session cannot stop a replacement driver's bus or release its lock", async () => {
  const d = client();
  await publish(d);
  await env.withSecurityRulesDisabled((c) =>
    set(ref(c.database(), "activeDrivers/SYN-1"), "other"),
  );
  await assertFails(update(ref(d), inactive()));
  expect(await privileged("activeDrivers/SYN-1")).toBe("other");
  expect((await privileged("liveBuses/SYN-1")).active).toBe(true);
});
it("actual disconnect atomically cleans up and a new authorized connection can restart", async () => {
  const d = client();
  await publish(d);
  await onDisconnect(ref(d)).update(inactive());
  goOffline(d);
  for (
    let i = 0;
    i < 100 && (await privileged("activeDrivers/SYN-1")) !== null;
    i++
  )
    await new Promise((r) => setTimeout(r, 20));
  expect(await privileged("activeDrivers/SYN-1")).toBeNull();
  expect((await privileged("publicBuses/SYN-1")).active).toBe(false);
  goOnline(d);
  await assertFails(publish(d));
  await assertSucceeds(set(ref(d, "activeDrivers/SYN-1"), "driver"));
  await assertSucceeds(publish(d));
});

it("heartbeats remain private and never refresh stale GPS captures or receipts", async () => {
  const d = client();
  await publish(d);
  const before = await privileged("liveBuses/SYN-1");
  const beat = () =>
    update(ref(d), {
      "trackerHeartbeats/SYN-1": {
        driverUid: "driver",
        lastSeenAt: serverTimestamp(),
        gpsAvailable: true,
        intervalMs: 15000,
      },
    });
  await assertSucceeds(beat());
  expect(await privileged("liveBuses/SYN-1")).toEqual(before);
  await assertFails(
    get(ref(env.unauthenticatedContext().database(), "trackerHeartbeats")),
  );
  await assertFails(
    update(ref(env.unauthenticatedContext().database()), {
      "trackerHeartbeats/SYN-1": {
        driverUid: "driver",
        lastSeenAt: serverTimestamp(),
        gpsAvailable: true,
        intervalMs: 15000,
      },
    }),
  );
  for (const change of [
    { latitude: 40 },
    { lastSeenAt: 1 },
    { gpsAvailable: "yes" },
    { intervalMs: 1000 },
    { driverUid: "other" },
  ])
    await assertFails(
      set(ref(d, "trackerHeartbeats/SYN-1"), {
        driverUid: "driver",
        lastSeenAt: serverTimestamp(),
        gpsAvailable: true,
        intervalMs: 15000,
        ...change,
      }),
    );
  await assertFails(
    set(ref(d, "trackerHeartbeats/SYN-2"), {
      driverUid: "driver",
      lastSeenAt: serverTimestamp(),
      gpsAvailable: true,
      intervalMs: 15000,
    }),
  );
  await update(ref(d), inactive());
  await assertFails(beat());
});
it("heartbeat authorization is revoked on disable, reassignment, removal or lock handover", async () => {
  const d = client();
  await publish(d);
  const beat = () =>
    set(ref(d, "trackerHeartbeats/SYN-1"), {
      driverUid: "driver",
      lastSeenAt: serverTimestamp(),
      gpsAvailable: true,
      intervalMs: 15000,
    });
  const changes = [
    ["drivers/driver/enabled", false],
    ["drivers/driver/assignedBus", "SYN-2"],
    ["activeDrivers/SYN-1", "other"],
    ["drivers/driver", null],
  ] as const;
  for (const [path, value] of changes) {
    const previous = await privileged(path);
    await env.withSecurityRulesDisabled((c) =>
      set(ref(c.database(), path), value),
    );
    await assertFails(beat());
    await env.withSecurityRulesDisabled((c) =>
      set(ref(c.database(), path), previous),
    );
  }
});
