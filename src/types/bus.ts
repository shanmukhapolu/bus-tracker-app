export interface Bus {
  id: string;
  busNumber: string;
  route: string;
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  status: "on-time" | "late" | "offline";
  delayMinutes?: number;
  etaMinutes?: number;
  nextStop?: string;
  currentLocation?: string;
  lastUpdated: Date;
}

export type Coordinate = readonly [longitude: number, latitude: number];

export interface BusSnapshot {
  buses: Bus[];
  mode: "demo" | "live";
  connected: boolean;
  /** Typical cadence of server updates, used for presentation interpolation. */
  updateIntervalMs: number;
}
