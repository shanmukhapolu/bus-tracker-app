import { afterEach, expect, it, vi } from "vitest";
import { GpsDeliveryMetrics } from "./gpsDeliveryMetrics";
afterEach(() => vi.useRealTimers());
it("measures raw source callbacks before rejection and every phase of an accepted fix", () => {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  const m = new GpsDeliveryMetrics();
  const a = m.observe("watch", 99000);
  m.decision(a, "queued");
  vi.advanceTimersByTime(25);
  m.uploadStarted(99000);
  vi.advanceTimersByTime(95);
  m.uploadFinished(true);
  m.decision(m.observe("request", 99000), "duplicate");
  m.decision(m.observe("watch", 98000), "older");
  m.decision(m.observe("watch", 100000), "invalid");
  const s = m.snapshot();
  expect(s.sources.watch.callbacks).toBe(3);
  expect(s.sources.request.callbacks).toBe(1);
  expect(s.rawNewerTimestamps).toBe(2);
  expect(s.decisions).toEqual({
    queued: 1,
    duplicate: 1,
    older: 1,
    invalid: 1,
    overflow: 0,
  });
  expect(s.fixTimings![0]).toMatchObject({
    captureAgeAtCallbackMs: 1000,
    queueWaitMs: 25,
    uploadMs: 95,
    callbackToAckMs: 120,
    acknowledged: true,
  });
  expect(s.pendingAcceptedFixes).toBe(0);
  expect(s.callbackToAck.p95Ms).toBe(120);
});
it("retains failed fixes for retry, bounds diagnostic history and freezes on stop", () => {
  vi.useFakeTimers();
  const m = new GpsDeliveryMetrics();
  m.decision(m.observe("watch", 1), "queued");
  m.uploadStarted(1);
  vi.advanceTimersByTime(50);
  m.uploadFinished(false);
  expect(m.snapshot().pendingAcceptedFixes).toBe(1);
  m.uploadStarted(1);
  vi.advanceTimersByTime(30);
  m.uploadFinished(true);
  expect(m.snapshot().fixTimings![0]).toMatchObject({
    attempts: 2,
    callbackToAckMs: 80,
    acknowledged: true,
  });
  for (let n = 0; n < 1000; n++)
    m.decision(m.observe("watch", 2 + n), "invalid");
  expect(m.snapshot().fixTimings).toHaveLength(256);
  expect(JSON.stringify(m.snapshot())).not.toMatch(
    /latitude|longitude|password|driverUid|capturedAt/,
  );
  m.stop();
  const before = m.snapshot();
  m.observe("watch", 5000);
  m.uploadStarted(1);
  m.uploadFinished(true);
  expect(m.snapshot()).toEqual(before);
});
