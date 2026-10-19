import { afterEach, expect, it, vi } from "vitest";
import { GpsDiagnostics } from "./gpsDiagnostics";
afterEach(() => vi.useRealTimers());
it("measures native response delay separately from Firebase upload delay", () => {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  const d = new GpsDiagnostics();
  d.requestStarted();
  vi.advanceTimersByTime(6000);
  expect(d.snapshot().requestPendingMs).toBe(6000);
  d.requestFinished();
  d.fix(100000, true);
  d.uploadStarted();
  vi.advanceTimersByTime(50);
  d.uploadFinished(true);
  expect(d.snapshot()).toMatchObject({
    lastRequestMs: 6000,
    lastUploadMs: 50,
    gpsCaptureAgeMs: 6050,
    gpsUploadsAcknowledged: 1,
  });
});
it("does not advance capture age for repeated fixes or reports and exposes only allowlisted counters", () => {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  const d = new GpsDiagnostics();
  d.fix(100000, true);
  vi.advanceTimersByTime(6000);
  d.fix(100000, false);
  d.reportAcknowledged();
  expect(d.snapshot()).toMatchObject({
    freshFixes: 1,
    repeatedOrOlderFixes: 1,
    gpsCaptureAgeMs: 6000,
    lastReportAgeMs: 0,
  });
  expect(
    Object.entries(d.snapshot())
      .filter(([key]) => key !== "delivery")
      .map(([, value]) => value)
      .every(
        (v) => v === null || typeof v === "number" || typeof v === "boolean",
      ),
  ).toBe(true);
  expect(Object.keys(d.snapshot())).toEqual([
    "diagnosticVersion",
    "recoveryEnabled",
    "delivery",
    "elapsedMs",
    "stopped",
    "firebaseConnected",
    "requestsStarted",
    "requestsCompleted",
    "requestPendingMs",
    "lastRequestMs",
    "lastGpsErrorCode",
    "freshFixes",
    "repeatedOrOlderFixes",
    "gpsCaptureAgeMs",
    "gpsUploadsAcknowledged",
    "gpsUploadErrors",
    "uploadPendingMs",
    "lastUploadMs",
    "reportsAcknowledged",
    "lastReportAgeMs",
  ]);
});
it("freezes collection on stop and normalizes untrusted error codes", () => {
  vi.useFakeTimers();
  const d = new GpsDiagnostics();
  d.requestStarted();
  d.requestFinished(999);
  expect(d.snapshot().lastGpsErrorCode).toBe(0);
  d.stop();
  const frozen = d.snapshot();
  vi.advanceTimersByTime(10000);
  d.requestStarted();
  d.requestFinished(3);
  d.fix(Date.now(), true);
  d.uploadStarted();
  d.uploadFinished(true);
  d.reportAcknowledged();
  d.connection(true);
  expect(d.snapshot()).toEqual(frozen);
});
