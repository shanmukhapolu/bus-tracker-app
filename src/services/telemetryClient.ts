import type { FirebaseRuntime } from "../config/firebase";
import type { DriverLocation } from "./driverTrackingService";

export interface TrustedTripSession {
  tripId: string;
  uploadIntervalMs: number;
}

export interface TelemetryClient {
  startTrip(busId: string): Promise<TrustedTripSession>;
  sendTelemetry(
    busId: string,
    tripId: string,
    sequence: number,
    location: DriverLocation,
  ): Promise<void>;
  stopTrip(busId: string, tripId: string): Promise<void>;
}

type Endpoint = "startTrip" | "telemetry" | "stopTrip";

async function authorization(runtime: FirebaseRuntime) {
  const user = runtime.auth.currentUser;
  if (!user) throw new Error("Driver authentication is no longer active.");
  return `Bearer ${await user.getIdToken()}`;
}

export class BackendTelemetryClient implements TelemetryClient {
  constructor(
    private readonly runtime: FirebaseRuntime,
    private readonly baseUrl: string,
  ) {}

  private async post<T>(endpoint: Endpoint, body: unknown): Promise<T> {
    const response = await fetch(
      `${this.baseUrl.replace(/\/$/, "")}/${endpoint}`,
      {
        method: "POST",
        headers: {
          authorization: await authorization(this.runtime),
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    const value = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(
        value.error?.message ??
          `The telemetry service returned ${response.status}.`,
      );
    }
    return value as T;
  }

  startTrip(busId: string) {
    return this.post<TrustedTripSession>("startTrip", {
      busId,
      simulation: false,
    });
  }

  async sendTelemetry(
    busId: string,
    tripId: string,
    sequence: number,
    location: DriverLocation,
  ) {
    await this.post("telemetry", {
      busId,
      tripId,
      sequence,
      clientTimestamp: location.capturedAt,
      latitude: location.latitude,
      longitude: location.longitude,
      speedMps: location.speedMps,
      headingDegrees: location.headingDeg,
      accuracyMeters: location.accuracyMeters,
      batteryPercent: null,
      charging: null,
      networkStatus: navigator.onLine ? "connected" : "disconnected",
    });
  }

  async stopTrip(busId: string, tripId: string) {
    await this.post("stopTrip", { busId, tripId });
  }
}

export function trustedTelemetryEnabled() {
  return (
    import.meta.env.VITE_TELEMETRY_MODE === "backend" &&
    Boolean(import.meta.env.VITE_TELEMETRY_API_BASE_URL)
  );
}

export function createBackendTelemetryClient(runtime: FirebaseRuntime) {
  const baseUrl = import.meta.env.VITE_TELEMETRY_API_BASE_URL as
    | string
    | undefined;
  if (!baseUrl) throw new Error("The telemetry service URL is not configured.");
  return new BackendTelemetryClient(runtime, baseUrl);
}
