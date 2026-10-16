import { it, expect, vi } from "vitest";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import * as db from "firebase/database";
import { emulatorOnly } from "./guard";
const shared = vi.hoisted(() => ({ runtime: null as any }));
vi.mock("../../src/config/firebase", () => ({
  getFirebaseRuntime: async () => shared.runtime,
}));
vi.mock("../../src/services/telemetryClient", () => ({
  trustedTelemetryEnabled: () => false,
  createBackendTelemetryClient: vi.fn(),
  TelemetryApiError: Error,
}));
import { startDriverTracking } from "../../src/services/driverTrackingService";
// @ts-expect-error loaded from the frozen pre-change source by the benchmark-only plugin
import { startDriverTracking as startBaseline } from "virtual:spark-baseline";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
it.skipIf(process.env.RUN_SPARK_LOAD !== "1")(
  "188 real driver-service instances at one distinct fix per second",
  async () => {
    emulatorOnly();
    const mode = process.env.SPARK_VARIANT,
      mb = Number(process.env.SPARK_HISTORY_MB);
    if (!["before", "after"].includes(mode!) || ![0, 100].includes(mb))
      throw Error("Invalid benchmark case");
    const env = await initializeTestEnvironment({
      projectId: "demo-ccs-staging",
      database: {
        host: "127.0.0.1",
        port: 9000,
        rules: readFileSync("scripts/spark/fixtures/database.rules.json", "utf8"),
      },
    });
    const drivers = Array.from({ length: 188 }, (_, i) => ({
      uid: `spark-driver-${i}`,
      id: `SYN-${i + 1}`,
      watch: null as any,
      session: null as any,
      runtime: null as any,
    }));
    let selected = drivers[0],
      measuring = false,
      peakRss = 0,
      historyBytes = 0;
    let writes = 0,
      reads = 0,
      transactions = 0,
      bytes = 0;
    const durations: number[] = [],
      errors: string[] = [],
      counts = new Map<string, number>(),
      paths = new Set<string>();
    const freshLatencies: number[] = [];
    const distinct = new Set<string>(),
      seen = new Set<string>(),
      sampleCounts = new Map<string, number>();
    const sample = () => {
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
    };
    let memoryTimer: ReturnType<typeof setInterval> | undefined;
    const rulesHash = createHash("sha256")
      .update(readFileSync("scripts/spark/fixtures/database.rules.json"))
      .digest("hex");
    vi.stubGlobal("window", { isSecureContext: true });
    vi.stubGlobal("document", {
      visibilityState: "visible",
      addEventListener() {},
      removeEventListener() {},
    });
    const position = (i: number, t = Date.now()) => ({
      timestamp: t,
      coords: {
        latitude: 39.95 + i * 0.000001,
        longitude: -86.12,
        accuracy: 8,
        speed: 10,
        heading: 90,
      },
    });
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition(cb: any) {
          cb(position(0));
        },
        watchPosition(cb: any) {
          selected.watch = cb;
          return drivers.indexOf(selected);
        },
        clearWatch(i: number) {
          drivers[i].watch = null;
        },
      },
    });
    try {
      await env.clearDatabase();
      await env.withSecurityRulesDisabled(async (c) => {
        const patch: Record<string, unknown> = {
          "tripHistory/old/sentinel": { preserve: "old-history" },
          "auditLogs/old": { preserve: true },
          "safetyEvents/old": { preserve: true },
        };
        for (const d of drivers) {
          patch[`drivers/${d.uid}`] = {
            enabled: true,
            displayName: "Synthetic Driver",
            assignedBus: d.id,
            approvalStatus: "approved",
          };
          patch[`buses/${d.id}`] = {
            busNumber: d.id,
            route: "Synthetic",
            enabled: true,
          };
        }
        await db.update(db.ref(c.database()), patch);
        // Point-shaped retained history; seeded separately from timed GPS work.
        const points = Object.fromEntries(
          Array.from({ length: 1000 }, (_, i) => [
            String(i).padStart(8, "0"),
            {
              timestamp: 1609459200000 + i * 1000,
              latitude: 39.95 + i * 0.000001,
              longitude: -86.12,
              speedMph: 22.37,
              heading: 90,
              gpsAccuracy: 8,
              simulation: true,
              source: "synthetic-retained-history",
              quality: "accepted",
            },
          ]),
        );
        const payload = {
          busId: "old",
          startTime: 1609459200000,
          endTime: 1609460200000,
          points,
        };
        const size = Buffer.byteLength(JSON.stringify(payload));
        for (let i = 0; historyBytes < mb * 1024 * 1024; i++) {
          await db.set(
            db.ref(c.database(), `tripHistory/old/2021-01-01/trip-${i}`),
            payload,
          );
          historyBytes += size;
        }
      });
      for (const d of drivers) {
        const database = env.authenticatedContext(d.uid).database();
        d.runtime = {
          ...db,
          // Baseline-only compatibility shim: empty root paths fail in the SDK.
          ref: (database: any, path?: string) =>
            db.ref(
              database,
              mode === "before" && path === "" ? undefined : path,
            ),
          db: database,
          auth: { currentUser: { uid: d.uid } },
          get: async (r: any) => {
            if (measuring) {
              reads++;
              paths.add(r.toString());
            }
            return db.get(r);
          },
          runTransaction: async (r: any, fn: any) => {
            if (measuring) transactions++;
            return db.runTransaction(r, fn);
          },
          update: async (r: any, p: any) => {
            const timed = measuring,
              record = p[`liveBuses/${d.id}`],
              key = record ? `${d.id}:${record.capturedAt}` : null;
            const began = performance.now();
            if (timed) {
              writes++;
              bytes += Buffer.byteLength(JSON.stringify(p));
              Object.keys(p).forEach((k) => paths.add(k));
            }
            try {
              await db.update(r, p);
              if (timed && key) {
                if (distinct.has(key) && !seen.has(key))
                  freshLatencies.push(Date.now() - record.capturedAt);
                seen.add(key);
                counts.set(d.id, (counts.get(d.id) ?? 0) + 1);
                sampleCounts.set(key, (sampleCounts.get(key) ?? 0) + 1);
              }
            } catch (e) {
              if (timed) errors.push(String(e));
              throw e;
            } finally {
              if (timed) durations.push(performance.now() - began);
            }
          },
        };
        selected = d;
        shared.runtime = d.runtime;
        d.session = await (
          mode === "before" ? startBaseline : startDriverTracking
        )({
          busId: d.id,
          busNumber: d.id,
          route: "Synthetic",
          onPosition() {},
          onError(m: string) {
            errors.push(m);
          },
        });
      }
      await sleep(500);
      measuring = true;
      memoryTimer = setInterval(sample, 50);
      sample();
      const started = performance.now(),
        expected = new Map<string, number>();
      let maxLag = 0;
      for (let wave = 0; wave < 60; wave++) {
        await sleep(Math.max(0, started + wave * 1000 - performance.now()));
        maxLag = Math.max(maxLag, performance.now() - started - wave * 1000);
        const captured = Date.now();
        for (const d of drivers) {
          distinct.add(`${d.id}:${captured}`);
          expected.set(d.id, captured);
          d.watch(position(wave, captured));
        }
        if (wave % 10 === 0)
          console.log(`${mode} ${mb}MiB: ${wave + 1}/60 waves`);
      }
      await sleep(Math.max(0, started + 60000 - performance.now()));
      const windowWrites = writes,
        windowBytes = bytes,
        windowDurations = [...durations];
      // Allow acknowledgements to settle without offering additional distinct samples.
      const deadline = Date.now() + 15000;
      while ([...distinct].some((k) => !seen.has(k)) && Date.now() < deadline)
        await sleep(100);
      measuring = false;
      clearInterval(memoryTimer);
      sample();
      const elapsed = performance.now() - started;
      const invalid: string[] = [];
      await env.withSecurityRulesDisabled(async (c) => {
        for (const d of drivers) {
          const live = (
            await db.get(db.ref(c.database(), `liveBuses/${d.id}`))
          ).val();
          const pub = (
            await db.get(db.ref(c.database(), `publicBuses/${d.id}`))
          ).val();
          if (
            live?.capturedAt !== expected.get(d.id) ||
            pub?.capturedAt !== expected.get(d.id)
          )
            invalid.push(d.id + ": final timestamp");
          if (pub?.driverUid || pub?.speedMps !== undefined)
            invalid.push(d.id + ": privacy");
        }
        if (
          (await db.get(db.ref(c.database(), "tripHistory/old/sentinel"))).val()
            ?.preserve !== "old-history"
        )
          invalid.push("old history changed");
        for (const name of ["auditLogs/old", "safetyEvents/old"])
          if (!(await db.get(db.ref(c.database(), name))).val()?.preserve)
            invalid.push(name + " changed");
      });
      const sorted = durations.sort((a, b) => a - b),
        pct = (p: number) =>
          Math.round(sorted[Math.floor(sorted.length * p)] ?? 0);
      const percentile = (items: number[], p: number) => {
        const values = [...items].sort((a, b) => a - b);
        return Math.round(values[Math.floor(values.length * p)] ?? 0);
      };
      const result = {
        offeredWindowSeconds: 60,
        offeredWindowWrites: windowWrites,
        offeredWindowSerializedBytes: windowBytes,
        offeredWindowWriteP95Ms: percentile(windowDurations, 0.95),
        uniqueFixCaptureToAckP95Ms: percentile(freshLatencies, 0.95),
        mode,
        historyBytes,
        buses: 188,
        intervalMs: 1000,
        waves: 60,
        distinctOffered: distinct.size,
        distinctAcknowledged: [...distinct].filter((k) => seen.has(k)).length,
        duplicateWrites: [...sampleCounts.values()].reduce(
          (n, c) => n + Math.max(0, c - 1),
          0,
        ),
        writes,
        reads,
        transactions,
        serializedWriteBytes: bytes,
        p50Ms: pct(0.5),
        p95Ms: pct(0.95),
        p99Ms: pct(0.99),
        elapsedMs: Math.round(elapsed),
        maxScheduleLagMs: Math.round(maxLag),
        peakClientProcessRss: peakRss,
        errorCount: errors.length,
        errors: errors.slice(0, 5),
        integrityErrors: invalid,
        historyPathsAccessed: [...paths].filter((p) =>
          /tripHistory|safetyEvents|auditLogs/.test(p),
        ),
        rulesHash,
      };
      mkdirSync("scripts/spark/results", { recursive: true });
      writeFileSync(
        `scripts/spark/results/${mode}-${mb}mb.json`,
        JSON.stringify(result, null, 2) + "\n",
      );
      console.log(JSON.stringify(result));
      expect(result.errorCount).toBe(0);
      expect(result.distinctAcknowledged).toBe(11280);
      expect(invalid).toEqual([]);
      expect(result.historyPathsAccessed).toEqual([]);
      if (mode === "after") expect(result.writes).toBe(11280);
    } finally {
      measuring = false;
      if (memoryTimer) clearInterval(memoryTimer);
      await Promise.allSettled(drivers.map((d) => d.session?.stop()));
      await env.cleanup();
      vi.unstubAllGlobals();
    }
  },
);
