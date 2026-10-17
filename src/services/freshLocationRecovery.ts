/** Recover a quiet foreground watch without inventing capture times.
 * tick() uses the existing upload timer. Only one native request can be pending;
 * the browser owns its timeout/cancellation. Late callbacks after Stop are ignored.
 */
export class FreshLocationRecovery {
  private lastWatchAt = Date.now();
  private nextRequestAt = 0;
  private pending = false;
  private stopped = false;
  private paused = false;
  constructor(
    private readonly geolocation: Geolocation,
    private readonly onPosition: (position: GeolocationPosition) => boolean,
    private readonly onError: (error: GeolocationPositionError) => void,
  ) {}
  watchReceivedFreshFix() {
    this.lastWatchAt = Date.now();
  }
  pause(value: boolean) {
    this.paused = value;
  }
  stop() {
    this.stopped = true;
  }
  tick() {
    const now = Date.now();
    if (
      this.stopped ||
      this.paused ||
      this.pending ||
      document.visibilityState !== "visible" ||
      now - this.lastWatchAt < 3000 ||
      now < this.nextRequestAt
    )
      return;
    this.pending = true;
    const failed = (error: GeolocationPositionError) => {
      this.pending = false;
      this.nextRequestAt = Date.now() + 5000;
      if (
        !this.stopped &&
        !this.paused &&
        Date.now() - this.lastWatchAt >= 3000
      )
        this.onError(error);
    };
    try {
      this.geolocation.getCurrentPosition(
        (position) => {
          this.pending = false;
          if (this.stopped || this.paused) return;
          // Duplicate/out-of-order readings are rejected by the same upload queue.
          const fresh = this.onPosition(position);
          this.nextRequestAt = Date.now() + (fresh ? 1000 : 5000);
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
