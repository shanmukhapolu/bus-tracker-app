import type { FirebaseRuntime } from "../config/firebase";
import { getFirebaseRuntime } from "../config/firebase";
import {
  createBackendTelemetryClient,
  trustedTelemetryEnabled,
} from "./telemetryClient";

export interface DriverProfile {
  enabled?: boolean;
  displayName?: string;
  allowedBuses?: Record<string, boolean>;
}

export interface DriverLocation {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  speedMps: number | null;
  headingDeg: number | null;
  capturedAt: number;
}

export interface DriverTrackingSession {
  busId: string;
  transport: "trusted_backend" | "legacy_firebase";
  uploadIntervalMs: number;
  stop: () => Promise<void>;
}

export interface DriverTrackingOptions {
  busId: string;
  busNumber: string;
  route: string;
  onPosition: (position: DriverLocation) => void;
  onError: (message: string) => void;
}

const initialLocationOptions: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 15_000,
};

const fallbackLocationOptions: PositionOptions = {
  enableHighAccuracy: false,
  maximumAge: 120_000,
  timeout: 30_000,
};

const watchLocationOptions: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 1_000,
  timeout: 20_000,
};

function readableGeolocationError(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return "Permission denied by the browser for this website.";
  }

  if (error.code === error.POSITION_UNAVAILABLE) {
    return "Your device could not determine your location.";
  }

  if (error.code === error.TIMEOUT) {
    return "The location request timed out. Try again.";
  }

  return error.message || "Could not get your location.";
}

function toLocation(position: GeolocationPosition): DriverLocation {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyMeters: Math.max(0, position.coords.accuracy),
    speedMps:
      typeof position.coords.speed === "number" &&
      Number.isFinite(position.coords.speed)
        ? position.coords.speed
        : null,
    headingDeg:
      typeof position.coords.heading === "number" &&
      Number.isFinite(position.coords.heading)
        ? position.coords.heading
        : null,
    capturedAt: position.timestamp,
  };
}

/**
 * Keep this call extremely simple. It is deliberately the first async
 * operation in the tracking flow so the browser sees the same native
 * geolocation request as the working standalone HTML test.
 */
function getLocation(
  geolocation: Geolocation,
  options: PositionOptions,
): Promise<DriverLocation> {
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      (position) => resolve(toLocation(position)),
      reject,
      options,
    );
  });
}

export async function requestInitialLocation(
  geolocation: Geolocation = navigator.geolocation,
): Promise<DriverLocation> {
  try {
    return await getLocation(geolocation, initialLocationOptions);
  } catch (firstError) {
    const error = firstError as GeolocationPositionError;
    if (error.code === error.PERMISSION_DENIED) {
      throw new Error(readableGeolocationError(error));
    }

    try {
      return await getLocation(geolocation, fallbackLocationOptions);
    } catch (fallbackError) {
      const fallback = fallbackError as GeolocationPositionError;
      if (fallback.code === fallback.PERMISSION_DENIED) {
        throw new Error(readableGeolocationError(fallback));
      }
      throw new Error(
        "Could not get a location fix. Make sure Location Services and Precise Location are enabled, then try again near a window or outdoors.",
      );
    }
  }
}

function readableTrackingError(error: unknown, busNumber: string) {
  const message = error instanceof Error ? error.message : String(error);
  if (/permission[_ -]?denied/i.test(message)) {
    return `Firebase denied tracking access for Bus ${busNumber}. Sign out and back in after an administrator assigns this bus, then try again.`;
  }
  console.error("Driver tracking failed.", error);
  return "GPS update could not be saved. Check your connection and try again.";
}

export function getLocationSupportMessage() {
  if (!window.isSecureContext) {
    return "This page must be opened over HTTPS.";
  }

  if (!("geolocation" in navigator)) {
    return "This browser does not support geolocation.";
  }

  return "";
}

export async function signInDriver(email: string, password: string) {
  const runtime = await getFirebaseRuntime();
  return runtime.signInWithEmailAndPassword(runtime.auth, email, password);
}

export async function signOutDriver() {
  const runtime = await getFirebaseRuntime();
  await runtime.signOut(runtime.auth);
}

export async function loadDriverProfile(
  uid: string,
): Promise<DriverProfile | null> {
  const runtime = await getFirebaseRuntime();
  const snapshot = await runtime.get(runtime.ref(runtime.db, `drivers/${uid}`));

  return snapshot.exists() ? (snapshot.val() as DriverProfile) : null;
}

async function publishPosition(
  runtime: FirebaseRuntime,
  options: DriverTrackingOptions,
  position: DriverLocation,
) {
  const user = runtime.auth.currentUser;

  if (!user) {
    throw new Error("Driver authentication is no longer active.");
  }

  const internalRecord = {
    busNumber: options.busNumber,
    route: options.route,
    latitude: position.latitude,
    longitude: position.longitude,
    accuracyMeters: position.accuracyMeters,
    speedMps: position.speedMps,
    headingDeg: position.headingDeg,
    active: true,
    driverUid: user.uid,
    lastUpdated: runtime.serverTimestamp(),
    capturedAt: position.capturedAt,
  };
  const publicRecord = {
    busNumber: options.busNumber,
    route: options.route,
    enabled: true,
    latitude: position.latitude,
    longitude: position.longitude,
    accuracyMeters: position.accuracyMeters,
    active: true,
    lastUpdated: runtime.serverTimestamp(),
    capturedAt: position.capturedAt,
  };

  await runtime.update(runtime.ref(runtime.db, "/"), {
    [`liveBuses/${options.busId}`]: internalRecord,
    [`publicBuses/${options.busId}`]: publicRecord,
  });
}

async function startTrustedBackendTracking(
  runtime: FirebaseRuntime,
  options: DriverTrackingOptions,
  firstLocation: DriverLocation,
): Promise<DriverTrackingSession> {
  const client = createBackendTelemetryClient(runtime);
  const trip = await client.startTrip(options.busId);
  let latestPosition: DriverLocation | null = firstLocation;
  let sequence = 0;
  let activePublish: Promise<void> | null = null;
  let stopped = false;
  let publishTimer: ReturnType<typeof setInterval> | undefined;
  let watchId: number | undefined;
  let wakeLock: any = null;

  const publishLatest = () => {
    if (stopped || !latestPosition) return Promise.resolve();
    if (activePublish) return activePublish;
    const location = latestPosition;
    const nextSequence = sequence++;
    activePublish = client
      .sendTelemetry(options.busId, trip.tripId, nextSequence, location)
      .catch((error) => {
        options.onError(
          error instanceof Error
            ? `Telemetry upload failed: ${error.message}`
            : "The telemetry service could not save the latest position.",
        );
      })
      .finally(() => {
        activePublish = null;
      });
    return activePublish;
  };

  const requestWakeLock = async () => {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLock = await (
        navigator as Navigator & {
          wakeLock: { request: (type: "screen") => Promise<any> };
        }
      ).wakeLock.request("screen");
    } catch {
      // The backend continues to detect a missing heartbeat if the device sleeps.
    }
  };

  const onVisible = () => {
    if (!stopped && document.visibilityState === "visible") {
      void requestWakeLock();
      void publishLatest();
    }
  };

  try {
    await client.sendTelemetry(
      options.busId,
      trip.tripId,
      sequence++,
      firstLocation,
    );
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (stopped) return;
        latestPosition = toLocation(position);
        options.onPosition(latestPosition);
      },
      (error) => {
        if (!stopped) options.onError(readableGeolocationError(error));
      },
      watchLocationOptions,
    );
    publishTimer = setInterval(
      () => void publishLatest(),
      trip.uploadIntervalMs,
    );
    document.addEventListener("visibilitychange", onVisible);
    await requestWakeLock();

    return {
      busId: options.busId,
      transport: "trusted_backend",
      uploadIntervalMs: trip.uploadIntervalMs,
      stop: async () => {
        if (stopped) return;
        stopped = true;
        if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
        if (publishTimer) clearInterval(publishTimer);
        document.removeEventListener("visibilitychange", onVisible);
        try {
          await wakeLock?.release?.();
        } catch {
          // Wake locks may already be released by the browser.
        }
        await activePublish;
        await client.stopTrip(options.busId, trip.tripId);
      },
    };
  } catch (error) {
    stopped = true;
    if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
    if (publishTimer) clearInterval(publishTimer);
    document.removeEventListener("visibilitychange", onVisible);
    try {
      await client.stopTrip(options.busId, trip.tripId);
    } catch {
      // A scheduled backend check will close out an abandoned active session.
    }
    throw error;
  }
}

export async function startDriverTracking(
  options: DriverTrackingOptions,
): Promise<DriverTrackingSession> {
  const supportMessage = getLocationSupportMessage();

  if (supportMessage) {
    throw new Error(supportMessage);
  }

  // CRITICAL: this must stay before Firebase/database work.
  const firstLocation = await requestInitialLocation();
  options.onPosition(firstLocation);

  const runtime = await getFirebaseRuntime();
  const user = runtime.auth.currentUser;

  if (!user) {
    throw new Error("Sign in as a driver before starting tracking.");
  }

  if (trustedTelemetryEnabled()) {
    return startTrustedBackendTracking(runtime, options, firstLocation);
  }

  const lockRef = runtime.ref(runtime.db, `activeDrivers/${options.busId}`);
  const rootRef = runtime.ref(runtime.db, "/");
  const inactive = () => ({
    [`activeDrivers/${options.busId}`]: null,
    [`liveBuses/${options.busId}/active`]: false,
    [`liveBuses/${options.busId}/lastUpdated`]: runtime.serverTimestamp(),
    [`liveBuses/${options.busId}/endedAt`]: runtime.serverTimestamp(),
    [`publicBuses/${options.busId}/active`]: false,
    [`publicBuses/${options.busId}/lastUpdated`]: runtime.serverTimestamp(),
    [`publicBuses/${options.busId}/endedAt`]: runtime.serverTimestamp(),
  });
  let uploadsBlocked = false;
  let lockLost = false;
  let connectionEpoch = 0;

  const transaction = await runtime.runTransaction(lockRef, (current) => {
    if (current === null || current === user.uid) {
      return user.uid;
    }

    return undefined;
  });

  if (!transaction.committed) {
    throw new Error("That bus is already being tracked by another driver.");
  }

  let latestPosition: DriverLocation | null = firstLocation;
  let activePublish: Promise<void> | null = null;
  let stopped = false;
  let publishTimer: ReturnType<typeof setInterval> | undefined;
  let wakeLock: any = null;
  let watchId: number | undefined;
  let stopConnectionListener: (() => void) | undefined;
  let stopVisibilityListener: (() => void) | undefined;

  const releaseWakeLock = async () => {
    if (!wakeLock) return;

    try {
      await wakeLock.release();
    } catch {
      // Wake lock can be released automatically by the browser.
    }

    wakeLock = null;
  };

  const requestWakeLock = async () => {
    if (!("wakeLock" in navigator)) return;

    try {
      wakeLock = await (
        navigator as Navigator & {
          wakeLock: { request: (type: "screen") => Promise<any> };
        }
      ).wakeLock.request("screen");

      wakeLock?.addEventListener?.("release", () => {
        wakeLock = null;
      });
    } catch {
      // Optional enhancement only.
    }
  };

  const publishLatest = () => {
    if (stopped || uploadsBlocked || !latestPosition) return Promise.resolve();
    if (activePublish) return activePublish;

    activePublish = (async () => {
      try {
        await publishPosition(runtime, options, latestPosition!);
      } catch (error) {
        if (/permission[_ -]?denied/i.test(String(error))) {
          uploadsBlocked = true;
          if (publishTimer) clearInterval(publishTimer);
          if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
          void releaseWakeLock();
        }
        options.onError(
          "GPS update could not be saved. Check your connection.",
        );
      }
    })();

    return activePublish.finally(() => {
      activePublish = null;
    });
  };

  const handleVisibilityChange = () => {
    if (!stopped && document.visibilityState === "visible") {
      void requestWakeLock();
      void publishLatest();
    }
  };

  try {
    // Keep the driver lock alive only while the Firebase connection exists.
    await runtime.onDisconnect(lockRef).remove();

    // The first write is mandatory. We do not mark tracking live until
    // Firebase has actually accepted the GPS coordinates.
    await publishPosition(runtime, options, firstLocation);

    await runtime.onDisconnect(rootRef).update(inactive());

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (stopped || uploadsBlocked) return;
        const next = toLocation(position);
        if (latestPosition && next.capturedAt <= latestPosition.capturedAt) return;
        latestPosition = next;
        options.onPosition(latestPosition);

        // New GPS fixes are published immediately.
        void publishLatest();
      },
      (error) => {
        if (!stopped) {
          options.onError(readableGeolocationError(error));
        }
      },
      watchLocationOptions,
    );

    // Continue publishing the latest known GPS position every second even
    // when the browser has not delivered a new fix during that exact second.
    publishTimer = setInterval(() => {
      void publishLatest();
    }, 1_000);

    stopConnectionListener = runtime.onValue(
      runtime.ref(runtime.db, ".info/connected"),
      (snapshot) => {
        if (stopped || lockLost) return;
        const epoch = ++connectionEpoch;
        uploadsBlocked = true;
        if (snapshot.val() !== true) return;
        void runtime.get(lockRef).then(async (lock) => {
          if (stopped || epoch !== connectionEpoch) return;
          if (lock.val() !== user.uid) {
            lockLost = true;
            if (publishTimer) clearInterval(publishTimer);
            if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
            void releaseWakeLock();
            options.onError("The connection ended your tracking session. Stop tracking and start again when connected.");
            return;
          }
          await runtime.onDisconnect(rootRef).update(inactive());
          if (stopped || epoch !== connectionEpoch) return;
          uploadsBlocked = false;
          void publishLatest();
        }).catch(() => options.onError("Could not verify your tracking session. Stop tracking and reconnect before restarting."));
      },
    );

    document.addEventListener("visibilitychange", handleVisibilityChange);
    stopVisibilityListener = () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };

    await requestWakeLock();
    void publishLatest();

    const stop = async () => {
      if (stopped) return;

      stopped = true;

      if (watchId !== undefined) {
        navigator.geolocation.clearWatch(watchId);
      }

      if (publishTimer) {
        clearInterval(publishTimer);
      }

      stopConnectionListener?.();
      stopVisibilityListener?.();
      await releaseWakeLock();

      await activePublish;
      if (!lockLost) await runtime.update(rootRef, inactive());
      await runtime.onDisconnect(rootRef).cancel();
    };

    return {
      busId: options.busId,
      transport: "legacy_firebase",
      uploadIntervalMs: 1_000,
      stop,
    };
  } catch (error) {
    if (watchId !== undefined) {
      navigator.geolocation.clearWatch(watchId);
    }

    try {
      await runtime.onDisconnect(rootRef).cancel();
      await runtime.remove(lockRef);
    } catch {
      // Best-effort cleanup.
    }

    throw new Error(readableTrackingError(error, options.busNumber));
  }
}
