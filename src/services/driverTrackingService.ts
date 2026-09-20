import type { FirebaseRuntime } from "../config/firebase";
import { getFirebaseRuntime } from "../config/firebase";

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
  stop: () => Promise<void>;
}

export type LocationPermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "unknown";

export async function getLocationPermissionState(): Promise<LocationPermissionState> {
  if (!("permissions" in navigator) || !navigator.permissions?.query) {
    return "unknown";
  }

  try {
    const permission = await navigator.permissions.query({
      name: "geolocation" as PermissionName,
    });

    return permission.state as LocationPermissionState;
  } catch {
    return "unknown";
  }
}

export function getLocationSupportMessage() {
  if (!window.isSecureContext) {
    return "Driver tracking requires HTTPS. Open the Firebase Hosting URL directly.";
  }

  if (!("geolocation" in navigator)) {
    return "This browser does not provide location services.";
  }

  return "";
}

interface StartOptions {
  busId: string;
  busNumber: string;
  route: string;
  onPosition: (position: DriverLocation) => void;
  onError: (message: string) => void;
}

const initialLocationOptions: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 20_000,
};

const watchLocationOptions: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 2_000,
  timeout: 20_000,
};

function readableGeolocationError(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return "Location permission was denied. Use the browser's site settings to allow location, then press Start tracking again.";
  }

  if (error.code === error.POSITION_UNAVAILABLE) {
    return "Your device could not determine a location. Make sure device location services are on and try again outside or near a window.";
  }

  if (error.code === error.TIMEOUT) {
    return "The GPS fix took too long. Keep location services on and try Start tracking again.";
  }

  return error.message || "The device could not provide a location.";
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
 * Request one real GPS fix immediately.
 *
 * This intentionally runs before Firebase initialization/transactions so the
 * browser's native "Allow location?" permission prompt is triggered directly
 * from the driver's button interaction.
 */
function requestInitialLocation(): Promise<DriverLocation> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(toLocation(position)),
      (error) => reject(new Error(readableGeolocationError(error))),
      initialLocationOptions,
    );
  });
}

async function publishPosition(
  runtime: FirebaseRuntime,
  liveRef: any,
  options: StartOptions,
  position: DriverLocation,
) {
  const user = runtime.auth.currentUser;

  if (!user) {
    throw new Error("Driver authentication is no longer active.");
  }

  await runtime.update(liveRef, {
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
  });
}

export async function signInDriver(email: string, password: string) {
  const runtime = await getFirebaseRuntime();
  return runtime.signInWithEmailAndPassword(runtime.auth, email, password);
}

export async function listenForDriverAuth(
  callback: (user: any | null) => void,
) {
  const runtime = await getFirebaseRuntime();
  return runtime.onAuthStateChanged(runtime.auth, callback);
}

export async function signOutDriver() {
  const runtime = await getFirebaseRuntime();
  await runtime.signOut(runtime.auth);
}

export async function loadDriverProfile(
  uid: string,
): Promise<DriverProfile | null> {
  const runtime = await getFirebaseRuntime();
  const profileSnapshot = await runtime.get(
    runtime.ref(runtime.db, `drivers/${uid}`),
  );

  return profileSnapshot.exists()
    ? (profileSnapshot.val() as DriverProfile)
    : null;
}

export async function startDriverTracking(
  options: StartOptions,
): Promise<DriverTrackingSession> {
  const supportMessage = getLocationSupportMessage();

  if (supportMessage) {
    throw new Error(supportMessage);
  }

  // 1. Ask the browser for a real GPS fix FIRST. Do not initialize Firebase,
  // acquire the bus lock, or await anything before this call.
  const firstLocation = await requestInitialLocation();
  options.onPosition(firstLocation);

  // 2. Once the browser has granted location, connect to Firebase and claim
  // the selected bus.
  const runtime = await getFirebaseRuntime();
  const user = runtime.auth.currentUser;

  if (!user) {
    throw new Error("Sign in as a driver before starting tracking.");
  }

  const lockRef = runtime.ref(runtime.db, `activeDrivers/${options.busId}`);
  const liveRef = runtime.ref(runtime.db, `liveBuses/${options.busId}`);

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
  let publishing = false;
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
      // Some browsers release wake locks automatically.
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
      // Wake lock is optional; location tracking can continue without it.
    }
  };

  const publishLatest = async () => {
    if (stopped || publishing || !latestPosition) return;

    publishing = true;

    try {
      await publishPosition(runtime, liveRef, options, latestPosition);
    } catch (error) {
      options.onError(
        error instanceof Error
          ? `GPS is active, but Firebase could not receive the latest position: ${error.message}`
          : "GPS is active, but Firebase could not receive the latest position.",
      );
    } finally {
      publishing = false;
    }
  };

  const handleVisibilityChange = () => {
    if (!stopped && document.visibilityState === "visible") {
      void requestWakeLock();
      void publishLatest();
    }
  };

  try {
    // Make disconnect cleanup part of the session before its first live write.
    await runtime.onDisconnect(lockRef).remove();
    await runtime.onDisconnect(liveRef).update({
      active: false,
      endedAt: runtime.serverTimestamp(),
      lastUpdated: runtime.serverTimestamp(),
    });

    // 3. The initial fix succeeded, so now subscribe to continuous GPS updates.
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (stopped) return;

        latestPosition = toLocation(position);
        options.onPosition(latestPosition);
        void publishLatest();
      },
      (error) => {
        if (!stopped) {
          options.onError(readableGeolocationError(error));
        }
      },
      watchLocationOptions,
    );

    publishTimer = setInterval(() => {
      void publishLatest();
    }, 1_000);

    stopConnectionListener = runtime.onValue(
      runtime.ref(runtime.db, ".info/connected"),
      (snapshot) => {
        if (snapshot.val() === true) {
          void publishLatest();
        }
      },
    );

    document.addEventListener("visibilitychange", handleVisibilityChange);
    stopVisibilityListener = () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };

    await requestWakeLock();
    await publishLatest();

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

      try {
        await runtime.onDisconnect(lockRef).cancel();
        await runtime.onDisconnect(liveRef).cancel();
      } catch {
        // The server-side disconnect handlers may already have fired.
      }

      try {
        await runtime.update(liveRef, {
          active: false,
          endedAt: runtime.serverTimestamp(),
          lastUpdated: runtime.serverTimestamp(),
        });
      } finally {
        await runtime.remove(lockRef);
      }
    };

    return {
      busId: options.busId,
      stop,
    };
  } catch (error) {
    try {
      await runtime.onDisconnect(lockRef).cancel();
      await runtime.onDisconnect(liveRef).cancel();
      await runtime.remove(lockRef);
    } catch {
      // Best-effort cleanup.
    }

    const message =
      error instanceof Error ? error.message : "Could not start tracking.";

    throw new Error(message);
  }
}
