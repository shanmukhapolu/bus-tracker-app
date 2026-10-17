import type { GpsDiagnostics } from "./gpsDiagnostics";
/** Request fresh foreground GPS every second without inventing capture times.
 * tick() uses the existing upload timer. Only one native request can be pending;
 * the browser owns its timeout/cancellation. Late callbacks after Stop are ignored.
 */
export class FreshLocationRecovery {
  private lastWatchAt = performance.now();
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private nextRequestAt = 0;
  private pending = false;
  private stopped = false;
  private paused = false;
  constructor(
    private readonly geolocation: Geolocation,
    private readonly onPosition: (position: GeolocationPosition) => boolean,
    private readonly onError: (error: GeolocationPositionError) => void,
    private readonly diagnostics?: GpsDiagnostics,
  ) {}
  watchReceivedFreshFix() {
    this.lastWatchAt = performance.now();
  }
  pause(value: boolean) {
    this.paused = value;
    if (value) clearTimeout(this.retryTimer);
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
  }
  tick() {
    const now = performance.now();
    if (
      this.stopped ||
      this.paused ||
      this.pending ||
      document.visibilityState !== "visible"
    )
      return;
    if (now < this.nextRequestAt) {
      clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => this.tick(), this.nextRequestAt - now);
      return;
    }
    clearTimeout(this.retryTimer);
    this.pending = true;
    this.diagnostics?.requestStarted();
    // Schedule from request start, not callback completion (which would halve
    // the cadence when a normal location request takes a fraction of a second).
    this.nextRequestAt = now + 1000;
    const failed = (error: GeolocationPositionError) => {
      this.pending = false;
      this.diagnostics?.requestFinished(error.code);
      if (
        !this.stopped &&
        !this.paused &&
        (error.code === 1 || performance.now() - this.lastWatchAt >= 1000)
      )
        this.onError(error);
    };
    try {
      this.geolocation.getCurrentPosition(
        (position) => {
          this.pending = false;
          this.diagnostics?.requestFinished();
          if (this.stopped || this.paused) return;
          // Duplicate/out-of-order readings are rejected by the same upload queue.
          this.onPosition(position);
        },
        failed,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
      );
    } catch {
      failed({
        code: 2,
        POSITION_UNAVAILABLE: 2,
        PERMISSION_DENIED: 1,
        TIMEOUT: 3,
        message: "Fresh location request could not be started.",
      });
    }
  }
}
