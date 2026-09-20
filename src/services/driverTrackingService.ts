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

interface StartOptions {
  busId: string;
  busNumber: string;
  route: string;
  onPosition: (position: DriverLocation) => void;
  onError: (message: string) => void;
}

function readableGeolocationError(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return "Location permission was denied. Allow location access for this site and try again.";
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return "The phone could not get a usable GPS position.";
  }
  if (error.code === error.TIMEOUT) {
    return "The GPS fix timed out. Keep the phone somewhere with a clear view of the sky.";
  }
  return "The phone could not provide a location.";
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

async function publishPosition(
  runtime: FirebaseRuntime,
  liveRef: any,
  options: StartOptions,
  position: DriverLocation,
) {
  const user = runtime.auth.currentUser;
  if (!user) throw new Error("Driver authentication is no longer active.");

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
  if (!window.isSecureContext) {
    throw new Error(
      "Driver tracking requires HTTPS. Localhost is also treated as a secure context during development.",
    );
  }

  if (!("geolocation" in navigator)) {
    throw new Error("This phone/browser does not provide geolocation.");
  }

  const runtime = await getFirebaseRuntime();
  const user = runtime.auth.currentUser;
  if (!user) {
    throw new Error("Sign in as a driver before starting tracking.");
  }

  const lockRef = runtime.ref(runtime.db, `activeDrivers/${options.busId}`);
  const liveRef = runtime.ref(runtime.db, `liveBuses/${options.busId}`);
  const transaction = await runtime.runTransaction(lockRef, (current) => {
    if (current === null || current === user.uid) return user.uid;
    return undefined;
  });

  if (!transaction.committed) {
    throw new Error("That bus is already being tracked by another driver.");
  }

  let latestPosition: DriverLocation | null = null;
  let publishing = false;
  let stopped = false;
  let publishTimer: ReturnType<typeof setInterval> | undefined;
  let wakeLock: any = null;
  let watchId: number | undefined;
  let stopConnectionListener: (() => void) | undefined;

  const releaseWakeLock = async () => {
    if (wakeLock) {
      try {
        await wakeLock.release();
      } catch {
        // Some browsers release wake locks automatically.
      }
      wakeLock = null;
    }
  };

  const requestWakeLock = async () => {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLock = await (navigator as Navigator & {
        wakeLock: { request: (type: "screen") => Promise<any> };
      }).wakeLock.request("screen");
      wakeLock?.addEventListener?.("release", () => {
        wakeLock = null;
      });
    } catch {
      // Wake lock is an enhancement; GPS can continue without it.
    }
  };

  const publishLatest = async () => {
    if (stopped || publishing || !latestPosition) return;
    publishing = true;
    try {
      await publishPosition(runtime, liveRef, options, latestPosition);
    } catch {
      options.onError(
        "GPS is active, but Firebase could not receive the latest position.",
      );
    } finally {
      publishing = false;
    }
  };

  try {
    // Register disconnect behavior before the first live write.
    await runtime.onDisconnect(lockRef).remove();
    await runtime.onDisconnect(liveRef).update({
      active: false,
      endedAt: runtime.serverTimestamp(),
      lastUpdated: runtime.serverTimestamp(),
    });

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        latestPosition = toLocation(position);
        options.onPosition(latestPosition);
      },
      (error) => {
        options.onError(readableGeolocationError(error));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000,
      },
    );

    publishTimer = setInterval(() => {
      void publishLatest();
    }, 1000);

    stopConnectionListener = runtime.onValue(
      runtime.ref(runtime.db, ".info/connected"),
      (snapshot) => {
        if (snapshot.val() === true) {
          void publishLatest();
        }
      },
    );

    document.addEventListener("visibilitychange", () => {
      if (!stopped && document.visibilityState === "visible") {
        void requestWakeLock();
      }
    });

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

    return { busId: options.busId, stop };
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
