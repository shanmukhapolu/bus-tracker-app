import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { get, ref, set, update } from "firebase/database";

let environment: RulesTestEnvironment;

const validInternalTelemetry = (uid = "driver-a") => ({
  busNumber: "12",
  route: "A",
  latitude: 39.98,
  longitude: -86.12,
  accuracyMeters: 12,
  speedMps: 9,
  headingDeg: 180,
  active: true,
  lastUpdated: Date.now(),
  capturedAt: Date.now(),
  driverUid: uid,
});

const validPublicTelemetry = () => ({
  busNumber: "12",
  route: "A",
  enabled: true,
  latitude: 39.98,
  longitude: -86.12,
  accuracyMeters: 12,
  active: true,
  lastUpdated: Date.now(),
  capturedAt: Date.now(),
});

beforeAll(async () => {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIREBASE_DATABASE_EMULATOR_HOST ?? "")) throw new Error("Loopback emulator required; production tests are forbidden.");
  environment = await initializeTestEnvironment({
    projectId: "demo-ccs-bus-security",
    database: { rules: readFileSync("scripts/spark/fixtures/database.rules.json", "utf8") },
  });
});

beforeEach(async () => {
  await environment.clearDatabase();
  await environment.withSecurityRulesDisabled(async (context) => {
    await set(ref(context.database()), {
      admins: {
        "admin-a": {
          displayName: "Security Admin",
          role: "admin",
          enabled: true,
        },
      },
      drivers: {
        "driver-a": {
          displayName: "Driver A",
          email: "driver-a@example.test",
          enabled: true,
          assignedBus: "12",
          approvalStatus: "approved",
        },
        "driver-b": {
          displayName: "Driver B",
          enabled: true,
          assignedBus: "45",
          approvalStatus: "approved",
        },
        disabled: {
          displayName: "Disabled Driver",
          enabled: false,
          assignedBus: "12",
          approvalStatus: "approved",
        },
      },
      buses: {
        "12": {
          busNumber: "12",
          route: "A",
          enabled: true,
          geofenceId: "internal-zone",
        },
        "45": { busNumber: "45", route: "B", enabled: true },
      },
      publicBuses: {
        "12": { busNumber: "12", route: "A", enabled: true, active: false },
        "45": { busNumber: "45", route: "B", enabled: true, active: false },
      },
      liveBuses: { "12": validInternalTelemetry() },
      activeDrivers: { "12": "driver-a" },
      safetyEvents: {
        event1: { status: "new", busId: "12", privateEvidence: "protected" },
      },
      tripHistory: {
        "12": { "2026-10-12": { trip1: { driverUid: "driver-a" } } },
      },
      devices: { "12": { status: "healthy", driverUid: "driver-a" } },
    });
  });
});

afterAll(async () => environment.cleanup());

describe("Realtime Database public and protected boundaries", () => {
  it("allows anonymous users to read only the public projection", async () => {
    const db = environment.unauthenticatedContext().database();
    await assertSucceeds(get(ref(db, "publicBuses")));
    await assertFails(get(ref(db, "buses")));
    await assertFails(get(ref(db, "liveBuses")));
    await assertFails(get(ref(db, "drivers")));
    await assertFails(get(ref(db, "safetyEvents")));
    await assertFails(get(ref(db, "tripHistory")));
    await assertFails(get(ref(db, "devices")));
    await assertFails(get(ref(db, "auditLogs")));
  });

  it("denies every anonymous write, including public projection writes", async () => {
    const db = environment.unauthenticatedContext().database();
    await assertFails(set(ref(db, "publicBuses/12"), validPublicTelemetry()));
    await assertFails(set(ref(db, "liveBuses/12"), validInternalTelemetry()));
  });

  it("allows an enabled assigned driver to publish only the assigned bus", async () => {
    const db = environment.authenticatedContext("driver-a").database();
    await assertSucceeds(
      set(ref(db, "liveBuses/12"), validInternalTelemetry()),
    );
    await assertSucceeds(
      set(ref(db, "publicBuses/12"), validPublicTelemetry()),
    );
    await assertFails(
      set(ref(db, "liveBuses/45"), {
        ...validInternalTelemetry(),
        busNumber: "45",
      }),
    );
    await assertFails(
      set(ref(db, "publicBuses/45"), {
        ...validPublicTelemetry(),
        busNumber: "45",
      }),
    );
  });

  it("denies disabled and wrong-bus drivers", async () => {
    const disabled = environment.authenticatedContext("disabled").database();
    const wrongDriver = environment.authenticatedContext("driver-b").database();
    await assertFails(
      set(ref(disabled, "liveBuses/12"), validInternalTelemetry("disabled")),
    );
    await assertFails(
      set(ref(wrongDriver, "liveBuses/12"), validInternalTelemetry("driver-b")),
    );
  });

  it("rejects malformed and unexpected telemetry fields", async () => {
    const db = environment.authenticatedContext("driver-a").database();
    await assertFails(
      set(ref(db, "liveBuses/12"), {
        ...validInternalTelemetry(),
        latitude: 100,
      }),
    );
    await assertFails(
      set(ref(db, "liveBuses/12"), {
        ...validInternalTelemetry(),
        speedMps: -1,
      }),
    );
    await assertFails(
      set(ref(db, "liveBuses/12"), {
        ...validInternalTelemetry(),
        headingDeg: 360,
      }),
    );
    await assertFails(
      set(ref(db, "liveBuses/12"), {
        ...validInternalTelemetry(),
        accuracyMeters: 20000,
      }),
    );
    await assertFails(
      set(ref(db, "liveBuses/12"), {
        ...validInternalTelemetry(),
        secret: "forbidden",
      }),
    );
    await assertFails(
      set(ref(db, "publicBuses/12"), {
        ...validPublicTelemetry(),
        driverUid: "driver-a",
      }),
    );
    await assertFails(
      set(ref(db, "publicBuses/12"), {
        ...validPublicTelemetry(),
        safetyStatus: "review",
      }),
    );
  });

  it("allows enabled admins protected reads but not telemetry impersonation", async () => {
    const db = environment
      .authenticatedContext("admin-a", { email: "admin@example.test" })
      .database();
    await assertSucceeds(get(ref(db, "buses")));
    await assertSucceeds(get(ref(db, "liveBuses")));
    await assertSucceeds(get(ref(db, "drivers")));
    await assertSucceeds(get(ref(db, "safetyEvents")));
    await assertFails(
      set(ref(db, "liveBuses/12"), validInternalTelemetry("admin-a")),
    );
  });

  it("stores append-only private audit records", async () => {
    const admin = environment
      .authenticatedContext("admin-a", { email: "admin@example.test" })
      .database();
    const driver = environment.authenticatedContext("driver-a").database();
    const entry = {
      actorUid: "admin-a",
      actorEmail: "admin@example.test",
      action: "driver_approved",
      resource: "drivers/driver-a",
      timestamp: Date.now(),
      result: "success",
    };
    await assertSucceeds(set(ref(admin, "auditLogs/log-1"), entry));
    await assertSucceeds(get(ref(admin, "auditLogs")));
    await assertFails(get(ref(driver, "auditLogs")));
    await assertFails(
      update(ref(admin, "auditLogs/log-1"), { result: "failure" }),
    );
    await assertFails(set(ref(admin, "auditLogs/log-1"), null));
  });
});
