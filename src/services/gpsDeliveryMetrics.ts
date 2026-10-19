export type GpsSource = "initial" | "watch" | "request";
export type GpsDecision =
  "queued" | "duplicate" | "older" | "invalid" | "overflow";
type Timing = {
  id: number;
  source: GpsSource;
  callbackOffsetMs: number;
  captureAgeAtCallbackMs: number | null;
  decision: GpsDecision | null;
  attempts: number;
  queueWaitMs: number | null;
  uploadMs: number | null;
  callbackToAckMs: number | null;
  acknowledged: boolean;
};
const sourceStats = () => ({
  callbacks: 0,
  newerTimestamps: 0,
  repeatedTimestamps: 0,
  olderTimestamps: 0,
  invalidTimestamps: 0,
  lastCallbackGapMs: null as number | null,
  maxCallbackGapMs: 0,
});
/** Bounded, in-memory staging evidence. No coordinates, identity, tokens or raw errors. */
export class GpsDeliveryMetrics {
  private start = performance.now();
  private sources = {
    initial: sourceStats(),
    watch: sourceStats(),
    request: sourceStats(),
  };
  private sourceLast: Partial<Record<GpsSource, number>> = {};
  private sourceCapture: Partial<Record<GpsSource, number>> = {};
  private newest = -Infinity;
  private rawNewer = 0;
  private decisions = {
    queued: 0,
    duplicate: 0,
    older: 0,
    invalid: 0,
    overflow: 0,
  };
  private rows: Timing[] = [];
  private pending = new Map<number, Timing>();
  private rowCapture = new Map<number, number>();
  private serial = 0;
  private active: { row: Timing; at: number } | null = null;
  private stopped = false;
  private acknowledged = 0;
  observe(source: GpsSource, capturedAt: number) {
    if (this.stopped) return -1;
    const now = performance.now(),
      stats = this.sources[source];
    stats.callbacks++;
    const last = this.sourceLast[source];
    if (last !== undefined) {
      stats.lastCallbackGapMs = now - last;
      stats.maxCallbackGapMs = Math.max(stats.maxCallbackGapMs, now - last);
    }
    this.sourceLast[source] = now;
    const validTime = Number.isFinite(capturedAt) && capturedAt >= 0;
    if (!validTime) stats.invalidTimestamps++;
    else {
      const previous = this.sourceCapture[source] ?? -Infinity;
      if (capturedAt > previous) {
        stats.newerTimestamps++;
        this.sourceCapture[source] = capturedAt;
      } else if (capturedAt === previous) stats.repeatedTimestamps++;
      else stats.olderTimestamps++;
      if (capturedAt > this.newest) {
        this.rawNewer++;
        this.newest = capturedAt;
      }
    }
    const row: Timing = {
      id: ++this.serial,
      source,
      callbackOffsetMs: now - this.start,
      captureAgeAtCallbackMs: validTime ? Date.now() - capturedAt : null,
      decision: null,
      attempts: 0,
      queueWaitMs: null,
      uploadMs: null,
      callbackToAckMs: null,
      acknowledged: false,
    };
    this.rows.push(row);
    this.rowCapture.set(row.id, capturedAt);
    if (this.rows.length > 256) {
      const oldest = this.rows.shift()!;
      this.rowCapture.delete(oldest.id);
    }
    return row.id;
  }
  decision(id: number, decision: GpsDecision) {
    if (this.stopped) return;
    const row = this.rows.find((r) => r.id === id);
    if (!row || row.decision !== null) return;
    row.decision = decision;
    this.decisions[decision]++;
    if (decision === "queued") this.pending.set(this.rowCapture.get(id)!, row);
  }
  uploadStarted(capturedAt: number) {
    if (this.stopped) return;
    const row = this.pending.get(capturedAt);
    if (!row) return;
    row.attempts++;
    row.queueWaitMs = performance.now() - this.start - row.callbackOffsetMs;
    this.active = { row, at: performance.now() };
  }
  uploadFinished(success: boolean) {
    if (this.stopped || !this.active) return;
    const { row, at } = this.active;
    row.uploadMs = performance.now() - at;
    if (success) {
      row.acknowledged = true;
      this.acknowledged++;
      row.callbackToAckMs =
        performance.now() - this.start - row.callbackOffsetMs;
      for (const [capture, pending] of this.pending)
        if (pending === row) this.pending.delete(capture);
    }
    this.active = null;
  }
  stop() {
    this.stopped = true;
  }
  snapshot(includeFixTimings = true) {
    const summarize = (key: "queueWaitMs" | "uploadMs" | "callbackToAckMs") => {
      const values = this.rows
        .filter((r) => r.acknowledged)
        .map((r) => r[key])
        .filter((v): v is number => v !== null)
        .sort((a, b) => a - b);
      return {
        samples: values.length,
        p95Ms: values.length
          ? values[Math.ceil(values.length * 0.95) - 1]
          : null,
        maxMs: values.length ? values[values.length - 1] : null,
      };
    };
    return {
      sources: structuredClone(this.sources),
      rawNewerTimestamps: this.rawNewer,
      decisions: { ...this.decisions },
      acknowledgedFixes: this.acknowledged,
      pendingAcceptedFixes: this.pending.size,
      queueWait: summarize("queueWaitMs"),
      firebaseAck: summarize("uploadMs"),
      callbackToAck: summarize("callbackToAckMs"),
      timingWindowCallbacks: this.rows.length,
      ...(includeFixTimings
        ? { fixTimings: this.rows.map((r) => ({ ...r })) }
        : {}),
    };
  }
}
