import type { DriverLocation } from "./driverTrackingService";

/** Existing bounded live projections. Never write history or private fields publicly. */
export function sparkGpsUpdate(
  bus: { busId: string; busNumber: string; route: string },
  uid: string,
  p: DriverLocation,
  timestamp: unknown,
) {
  const common = {
    busNumber: bus.busNumber,
    route: bus.route,
    latitude: p.latitude,
    longitude: p.longitude,
    accuracyMeters: p.accuracyMeters,
    active: true,
    lastUpdated: timestamp,
    capturedAt: p.capturedAt,
  };
  return {
    [`liveBuses/${bus.busId}`]: {
      ...common,
      speedMps: p.speedMps,
      headingDeg: p.headingDeg,
      driverUid: uid,
    },
    [`publicBuses/${bus.busId}`]: { ...common, enabled: true },
  };
}

/** Single-flight FIFO: every distinct fix, no timer-generated copies or coalescing.
 * The bounded in-memory queue is not durable trip storage. Fail visibly on overflow.
 */
export class SparkGpsQueue {
  private readonly pending: DriverLocation[] = [];
  private newestAt = -1;
  private active: Promise<void> | null = null;
  private paused = false;
  constructor(
    private readonly send: (p: DriverLocation) => Promise<void>,
    private readonly capacity = 120,
  ) {}
  get size() {
    return this.pending.length;
  }
  setPaused(value: boolean) {
    this.paused = value;
  }
  enqueue(p: DriverLocation) {
    if (
      !Number.isFinite(p.capturedAt) ||
      p.capturedAt < 0 ||
      !Number.isFinite(p.latitude) ||
      Math.abs(p.latitude) > 90 ||
      !Number.isFinite(p.longitude) ||
      Math.abs(p.longitude) > 180 ||
      !Number.isFinite(p.accuracyMeters) ||
      p.accuracyMeters < 0 ||
      p.accuracyMeters > 10000 ||
      (p.speedMps !== null &&
        (!Number.isFinite(p.speedMps) || p.speedMps < 0 || p.speedMps > 90)) ||
      (p.headingDeg !== null &&
        (!Number.isFinite(p.headingDeg) ||
          p.headingDeg < 0 ||
          p.headingDeg >= 360))
    )
      throw new Error("The device returned an invalid GPS fix.");
    if (p.capturedAt <= this.newestAt) return false;
    if (this.pending.length >= this.capacity)
      throw new Error(
        "GPS upload buffer is full. Stop tracking and restore the connection before restarting; the new fix could not be queued.",
      );
    this.pending.push({ ...p });
    this.newestAt = p.capturedAt;
    return true;
  }
  flush(): Promise<void> {
    if (this.active) return this.active;
    this.active = this.drain().finally(() => {
      this.active = null;
    });
    return this.active;
  }
  private async drain() {
    while (!this.paused && this.pending.length) {
      // Keep the exact pending payload after a failed/uncertain acknowledgement.
      await this.send({ ...this.pending[0] });
      this.pending.shift();
    }
  }
}
