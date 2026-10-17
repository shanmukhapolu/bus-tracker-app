/** Periodic reports repeat the last acknowledged fix without changing its capture time. */
export function heartbeatInterval(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1000 && n <= 60000 ? n : 1000;
}
export class TrackingHeartbeat {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: Promise<void> | null = null;
  private stopped = false;
  private nextDue = -Infinity;
  private paused = false;
  gpsAvailable = true;
  constructor(
    private send: (gpsAvailable: boolean) => Promise<void>,
    private onError: (error: unknown) => void,
    readonly intervalMs = 1000,
  ) {}
  private schedule() {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.stopped || this.paused || this.pending) return;
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        void this.flush();
      },
      Math.max(0, this.nextDue - performance.now()),
    );
  }
  start() {
    return this.flush();
  }
  pause(value: boolean) {
    this.paused = value;
    this.schedule();
  }
  flush(): Promise<void> {
    if (this.stopped || this.paused) return Promise.resolve();
    if (this.pending) return this.pending;
    if (performance.now() < this.nextDue) {
      // A few milliseconds of timer jitter must not discard a whole interval.
      this.schedule();
      return Promise.resolve();
    }
    clearTimeout(this.timer);
    this.timer = undefined;
    // Monotonic clock: device wall-clock adjustments do not alter the cadence.
    // No catch-up burst after suspension or a slow network acknowledgement.
    this.nextDue = performance.now() + this.intervalMs;
    let attempt: Promise<void>;
    try {
      attempt = this.send(this.gpsAvailable);
    } catch (error) {
      attempt = Promise.reject(error);
    }
    this.pending = attempt.catch(this.onError).finally(() => {
      this.pending = null;
      this.schedule();
    });
    return this.pending;
  }
  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.pending;
  }
}
