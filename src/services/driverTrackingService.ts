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
  timeout: 20_000,
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
function requestInitialLocation(): Promise<DriverLocation> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(toLocation(position)),
      (error) => reject(new Error(readableGeolocationError(error))),
      initialLocationOptions,
    );
  });
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
  const snapshot = await runtime.get(
    runtime.ref(runtime.db, `drivers/${uid}`),
  );

  return snapshot.exists()
    ? (snapshot.val() as DriverProfile)
    : null;
}

async function publishPosition(
  runtime: FirebaseRuntime,
  liveRef: any,
  options: DriverTrackingOptions,
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

  const publishLatest = async () => {
    if (stopped || publishing || !latestPosition) return;

    publishing = true;

    try {
      await publishPosition(runtime, liveRef, options, latestPosition);
    } catch (error) {
      options.onError(
        error instanceof Error
          ? `Firebase write failed: ${error.message}`
          : "Firebase could not save the latest GPS position.",
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
    // If the connection disappears, the driver lock is removed immediately.
    // The live bus record is registered for an inactive update only after
    // the first successful live GPS write below.
    await runtime.onDisconnect(lockRef).remove();

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (stopped) return;

        latestPosition = toLocation(position);
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

    await runtime.onDisconnect(liveRef).update({
      active: false,
      endedAt: runtime.serverTimestamp(),
      lastUpdated: runtime.serverTimestamp(),
    });

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
        // The server-side disconnect handler may already have run.
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
    if (watchId !== undefined) {
      navigator.geolocation.clearWatch(watchId);
    }

    try {
      await runtime.onDisconnect(lockRef).cancel();
      await runtime.onDisconnect(liveRef).cancel();
      await runtime.remove(liveRef);
      await runtime.remove(lockRef);
    } catch {
      // Best-effort cleanup.
    }

    throw new Error(
      error instanceof Error ? error.message : "Could not start tracking.",
    );
  }
}
