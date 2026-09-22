import { useEffect, useRef, useState } from "react";
import { MapPin, RefreshCw, ShieldCheck } from "lucide-react";

interface DeviceLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: number;
}

function geolocationError(error: GeolocationPositionError) {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Location permission was denied by the browser. Use the browser's site settings to allow location, then try again.";
    case error.POSITION_UNAVAILABLE:
      return "Your device cannot determine a location right now. Check that Location Services are enabled.";
    case error.TIMEOUT:
      return "The location request timed out. Try again where the device has a clearer view of the sky.";
    default:
      return error.message || "The browser could not get a location.";
  }
}

/**
 * Standalone device-location check. This page intentionally has no Firebase,
 * authentication, assignment, or tracking write work: the click directly asks
 * the browser for one current GPS position.
 */
export function DriversPage() {
  const [location, setLocation] = useState<DeviceLocation | null>(null);
  const [status, setStatus] = useState<"ready" | "requesting" | "error">("ready");
  const [message, setMessage] = useState("Press the button to request this device's current location.");
  const requestId = useRef(0);

  useEffect(() => () => { requestId.current += 1; }, []);

  const requestLocation = () => {
    if (!window.isSecureContext) {
      setStatus("error");
      setMessage("Location requires HTTPS (or localhost). Open this page on its HTTPS Hosting URL.");
      return;
    }
    if (!("geolocation" in navigator)) {
      setStatus("error");
      setMessage("This browser does not support device geolocation.");
      return;
    }

    const id = ++requestId.current;
    setStatus("requesting");
    setMessage("Waiting for the browser's location prompt…");

    // This is deliberately called synchronously from the button click.
    // Do not add Firebase, auth, network, or permission-wrapper work here.
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (id !== requestId.current) return;
        const { latitude, longitude, accuracy } = position.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          setStatus("error");
          setMessage("The browser returned invalid coordinates.");
          return;
        }
        setLocation({ latitude, longitude, accuracy: Number.isFinite(accuracy) ? Math.max(0, accuracy) : 0, capturedAt: position.timestamp });
        setStatus("ready");
        setMessage("Current device coordinates received. Nothing was sent to a backend.");
      },
      (error) => {
        if (id !== requestId.current) return;
        setStatus("error");
        setMessage(geolocationError(error));
      },
      { enableHighAccuracy: true, maximumAge: 1_000, timeout: 20_000 },
    );
  };

  return <main className="simple-driver-page"><section className="simple-driver-card">
    <p className="simple-driver-eyebrow">DEVICE LOCATION CHECK</p>
    <h1>Current location</h1>
    <p className="simple-driver-description">This page only asks your browser for the device&apos;s current coordinates. It does not sign in, contact Firebase, select a bus, or publish GPS.</p>
    <button className="simple-driver-button" type="button" disabled={status === "requesting"} onClick={requestLocation}>
      {status === "requesting" ? <><RefreshCw size={18}/>Requesting location…</> : <><MapPin size={18}/>{location ? "Get current location again" : "Get current location"}</>}
    </button>
    <div className={status === "error" ? "simple-driver-status error" : "simple-driver-status"} role={status === "error" ? "alert" : "status"}>{message}</div>
    {location && <div className="simple-driver-coordinates">
      <div><span>Latitude</span><strong>{location.latitude.toFixed(6)}</strong></div>
      <div><span>Longitude</span><strong>{location.longitude.toFixed(6)}</strong></div>
      <div><span>Accuracy</span><strong>±{Math.round(location.accuracy)} m</strong></div>
      <div><span>Captured</span><strong>{new Date(location.capturedAt).toLocaleTimeString()}</strong></div>
    </div>}
    <div className="simple-driver-note"><ShieldCheck size={15}/>Coordinates remain on this device and disappear when the page is closed.</div>
  </section></main>;
}
