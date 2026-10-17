/** Periodic reports repeat the last acknowledged fix without changing its capture time. */
export function heartbeatInterval(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1000 && n <= 60000 ? n : 1000;
}
export class TrackingHeartbeat {
  private timer: ReturnType<typeof setInterval> | undefined;
  private pending: Promise<void> | null = null;
  private stopped = false;
  private lastAttempt = -Infinity;
  private paused = false;
  gpsAvailable = true;
  constructor(
    private send: (gpsAvailable: boolean) => Promise<void>,
    private onError: (error: unknown) => void,
    readonly intervalMs = 1000,
  ) {}
  start() {
    this.timer = setInterval(() => void this.flush(), this.intervalMs);
    return this.flush();
  }
  pause(value: boolean) {
    this.paused = value;
  }
  flush(): Promise<void> {
    if (this.stopped || this.paused) return Promise.resolve();
    if (this.pending) return this.pending;
    if (Date.now() - this.lastAttempt < this.intervalMs)
      return Promise.resolve();
    this.lastAttempt = Date.now();
    this.pending = this.send(this.gpsAvailable)
      .catch(this.onError)
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }
  async stop() {
    this.stopped = true;
    clearInterval(this.timer);
    await this.pending;
  }
}
