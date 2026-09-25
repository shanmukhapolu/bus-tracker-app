import { useEffect, useState } from "react";
import type { Ref } from "react";
import { ChevronDown, Clock3, Crosshair, MapPin, Route } from "lucide-react";
import type { Bus } from "../types/bus";
import { statusLabel, updatedLabel } from "../utils/buses";
import { BusIcon } from "./BusIcon";

export function BusInfoCard({
  bus,
  onCenter,
  demo,
  onHide,
  hideButtonRef,
}: {
  bus: Bus;
  onCenter: () => void;
  demo: boolean;
  onHide: () => void;
  hideButtonRef?: Ref<HTMLButtonElement>;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const stale = now - bus.lastUpdated.getTime() > 30_000;
  const unavailable =
    stale ||
    bus.status === "offline" ||
    (!demo && bus.trackingActive !== true);

  return (
    <section className={`info-card ${demo ? "is-demo" : "is-live"}`} aria-label={`Bus ${bus.busNumber} details`}>
      <div className="details-toolbar">
        <button
          ref={hideButtonRef}
          className="hide-details-button"
          onClick={onHide}
          aria-label="Hide bus details"
          aria-expanded={true}
        >
          Hide <ChevronDown size={17} aria-hidden="true" />
        </button>
      </div>

      <div className="card-heading">
        <BusIcon />
        <div>
          <h2>Bus {bus.busNumber}</h2>
          <span>Route {bus.route}</span>
        </div>
        <span className={`status-pill ${unavailable ? "offline" : bus.status}`}>
          <i />
          {stale && !demo ? "Update delayed" : statusLabel(bus)}
        </span>
      </div>

      <div className="arrival-section">
        <div>
          <span className="eyebrow">
            {demo ? "SIMULATED ARRIVAL" : "LIVE ETA"}
          </span>
          <div className="eta">
            {unavailable || bus.etaMinutes === undefined ? "—" : bus.etaMinutes}
            <span>
              {!unavailable && bus.etaMinutes !== undefined
                ? "min"
                : demo
                  ? "Unavailable"
                  : "Route data needed"}
            </span>
          </div>
        </div>
        <div className="destination">
          <span>
            <Route size={16} />
            Next stop
          </span>
          <strong>
            {demo ? bus.nextStop ?? "Not available" : "No live route feed"}
          </strong>
        </div>
      </div>

      <div className="location-line">
        <span className="location-icon">
          <MapPin size={20} />
        </span>
        <div>
          <span>Current location</span>
          <strong>
            {!demo && bus.trackingActive
              ? `Live GPS${bus.locationAccuracyMeters !== undefined ? ` · ±${Math.round(bus.locationAccuracyMeters)} m` : ""}`
              : bus.currentLocation ?? "Location not available"}
          </strong>
        </div>
      </div>

      <div className="card-footer">
        <span title={bus.lastUpdated.toLocaleString()}>
          <Clock3 size={14} />
          <span>
            Updated {updatedLabel(bus.lastUpdated, now).toLowerCase()}
          </span>
        </span>
        <button className="center-button" onClick={onCenter}>
          <Crosshair size={17} />
          Center on Bus
        </button>
      </div>
    </section>
  );
}
