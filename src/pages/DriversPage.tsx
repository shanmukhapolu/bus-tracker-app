import { useEffect, useRef, useState } from "react";

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
}

function readPosition(position: GeolocationPosition): LocationData {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    altitude: position.coords.altitude,
    speed: position.coords.speed,
    heading: position.coords.heading,
    timestamp: position.timestamp,
  };
}

function getErrorMessage(error: GeolocationPositionError) {
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

function formatNumber(value: number | null, digits = 5) {
  return value === null || !Number.isFinite(value)
    ? "Unavailable"
    : value.toFixed(digits);
}

export function DriversPage() {
  const [status, setStatus] = useState<"idle" | "requesting" | "tracking" | "error">(
    "idle",
  );
  const [position, setPosition] = useState<LocationData | null>(null);
  const [error, setError] = useState("");
  const watchId = useRef<number | null>(null);

  const stopTracking = () => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }

    setStatus("idle");
  };

  useEffect(() => {
    return () => {
      if (watchId.current !== null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, []);

  const handleLocation = (nextPosition: GeolocationPosition) => {
    setPosition(readPosition(nextPosition));
    setError("");
    setStatus("tracking");
  };

  const handleError = (locationError: GeolocationPositionError) => {
    setError(getErrorMessage(locationError));
    setStatus("error");
  };

  const startTracking = () => {
    if (!window.isSecureContext) {
      setError("This page must be opened over HTTPS.");
      setStatus("error");
      return;
    }

    if (!("geolocation" in navigator)) {
      setError("This browser does not support geolocation.");
      setStatus("error");
      return;
    }

    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }

    setError("");
    setPosition(null);
    setStatus("requesting");

    // IMPORTANT: this is intentionally called directly from the button click.
    // The browser controls the real native location permission prompt.
    navigator.geolocation.getCurrentPosition(
      (nextPosition) => {
        handleLocation(nextPosition);

        watchId.current = navigator.geolocation.watchPosition(
          handleLocation,
          handleError,
          {
            enableHighAccuracy: true,
            maximumAge: 1000,
            timeout: 20000,
          },
        );
      },
      handleError,
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000,
      },
    );
  };

  const isTracking = status === "tracking" || status === "requesting";

  return (
    <main className="simple-driver-page">
      <section className="simple-driver-card">
        <p className="simple-driver-eyebrow">DRIVER LOCATION TEST</p>
        <h1>Live location</h1>
        <p className="simple-driver-description">
          Press Start Tracking and this page will ask your browser for your
          location. No Firebase, login, bus assignment, or backend is involved.
        </p>

        <button
          className="simple-driver-button"
          type="button"
          onClick={isTracking ? stopTracking : startTracking}
        >
          {isTracking ? "Stop Tracking" : "Start Tracking"}
        </button>

        <div className={status === "error" ? "simple-driver-status error" : "simple-driver-status"}>
          <span
            className={
              status === "tracking"
                ? "status-dot live"
                : status === "error"
                  ? "status-dot error"
                  : "status-dot"
            }
          />
          {status === "idle" && "Ready to request location"}
          {status === "requesting" && "Requesting your location…"}
          {status === "tracking" && "Location tracking is active"}
          {status === "error" && error}
        </div>

        {position && (
          <div className="simple-driver-coordinates">
            <div>
              <span>Latitude</span>
              <strong>{formatNumber(position.latitude)}</strong>
            </div>
            <div>
              <span>Longitude</span>
              <strong>{formatNumber(position.longitude)}</strong>
            </div>
            <div>
              <span>Accuracy</span>
              <strong>±{Math.round(position.accuracy)} m</strong>
            </div>
            <div>
              <span>Speed</span>
              <strong>
                {position.speed === null
                  ? "Unavailable"
                  : `${(position.speed * 3.6).toFixed(1)} km/h`}
              </strong>
            </div>
            <div>
              <span>Heading</span>
              <strong>
                {position.heading === null
                  ? "Unavailable"
                  : `${Math.round(position.heading)}°`}
              </strong>
            </div>
            <div>
              <span>Altitude</span>
              <strong>
                {position.altitude === null
                  ? "Unavailable"
                  : `${position.altitude.toFixed(1)} m`}
              </strong>
            </div>
          </div>
        )}

        {!position && !error && (
          <div className="simple-driver-empty">
            Coordinates will appear here after the browser grants location access.
          </div>
        )}

        {position && (
          <p className="simple-driver-updated">
            Last update: {new Date(position.timestamp).toLocaleTimeString()}
          </p>
        )}
      </section>
    </main>
  );
}
