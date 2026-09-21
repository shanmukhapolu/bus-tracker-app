import { useEffect, useRef, useState } from "react";
import {
  Map as LibreMap,
  NavigationControl,
  AttributionControl,
} from "maplibre-gl";
import { Crosshair, Layers, Radio, RotateCw } from "lucide-react";
import type { Bus } from "../types/bus";
import { CARMEL_CENTER, MAP_STYLE_URL } from "../config/map";
import { BusMarker } from "./BusMarker";
import { validCoordinate } from "../services/fleet";

interface Props {
  buses: Bus[];
  selectedId: string;
  onSelect: (id: string) => void;
  centerRequest: number;
  onCenter: () => void;
  intervalMs: number;
  demo: boolean;
  obscured: boolean;
  connectionError?: string;
  lastSyncAt?: Date;
}

export function BusMap({
  buses,
  selectedId,
  onSelect,
  centerRequest,
  onCenter,
  intervalMs,
  demo,
  obscured,
  connectionError,
  lastSyncAt,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<LibreMap | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const busesRef = useRef(buses);
  const previouslyLiveRef = useRef(false);
  busesRef.current = buses;

  const visibleBuses = demo ? buses : buses.filter((bus) => bus.trackingActive);
  const visibleCount = visibleBuses.length;

  useEffect(() => {
    if (!container.current) return;
    setState("loading");
    let instance: LibreMap;
    try {
      instance = new LibreMap({
        container: container.current,
        style: MAP_STYLE_URL,
        center: CARMEL_CENTER,
        zoom: 12.6,
        minZoom: 3,
        maxZoom: 18,
        attributionControl: false,
        pitchWithRotate: false,
        dragRotate: false,
        touchPitch: false,
      });
    } catch {
      setState("error");
      return;
    }
    instance.touchZoomRotate.disableRotation();
    instance.addControl(
      new NavigationControl({ showCompass: false }),
      "top-right",
    );
    instance.addControl(new AttributionControl({ compact: true }), "top-left");
    let ready = false;
    const timeout = setTimeout(() => {
      if (!ready) setState("error");
    }, 20_000);
    instance.on("load", () => {
      ready = true;
      clearTimeout(timeout);
      setState("ready");
    });
    instance.on("error", () => {
      if (!ready) setState("error");
    });
    const resize = new ResizeObserver(() => instance.resize());
    resize.observe(container.current);
    setMap(instance);
    return () => {
      clearTimeout(timeout);
      resize.disconnect();
      instance.remove();
    };
  }, [retry]);

  useEffect(() => {
    if (!map) return;
    const bus = busesRef.current.find((item) => item.id === selectedId);
    if (!bus || !validCoordinate(bus.latitude, bus.longitude)) return;
    const compact = window.matchMedia("(max-width: 899px)").matches;
    const shortLandscape =
      compact && window.matchMedia("(max-height: 500px)").matches;
    map.easeTo({
      center: [bus.longitude, bus.latitude],
      zoom: 13,
      offset: shortLandscape
        ? [-Math.min(170, map.getContainer().clientWidth * 0.2), 35]
        : compact
          ? [0, -80]
          : [100, -30],
      duration: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 800,
    });
  }, [map, selectedId, centerRequest]);

  useEffect(() => {
    if (!map || demo) {
      previouslyLiveRef.current = false;
      return;
    }

    const selected = busesRef.current.find((item) => item.id === selectedId);
    const isLive = selected?.trackingActive === true;

    if (isLive && !previouslyLiveRef.current && selected && validCoordinate(selected.latitude, selected.longitude)) {
      const compact = window.matchMedia("(max-width: 899px)").matches;
      map.easeTo({
        center: [selected.longitude, selected.latitude],
        zoom: 14,
        offset: compact ? [0, -80] : [80, -20],
        duration: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 700,
      });
    }

    previouslyLiveRef.current = isLive;
  }, [map, demo, selectedId, buses]);

  return (
    <div
      className="map-region"
      aria-label="Interactive map of buses around Carmel, Indiana"
      inert={obscured}
    >
      <div className="map-canvas" ref={container} />
      {map &&
        visibleBuses.map((bus) => (
          <BusMarker
            key={`${retry}-${bus.id}`}
            map={map}
            bus={bus}
            selected={bus.id === selectedId}
            onSelect={onSelect}
            intervalMs={intervalMs}
          />
        ))}
      <div className="map-top-label">
        <MapPinLabel />
        <span>Carmel, Indiana</span>
        <span className="map-label-divider" />
        <span>
          {demo
            ? `${visibleCount} buses`
            : `${visibleCount} active bus${visibleCount === 1 ? "" : "es"}`}
        </span>
      </div>
      <div className="map-demo-pill">
        <Radio size={15} />
        <span>
          {demo
            ? "Simulated GPS"
            : lastSyncAt
              ? `Live GPS · synced ${lastSyncAt.toLocaleTimeString()}`
              : "Live GPS · connecting"}
        </span>
      </div>
      <button
        className="map-recenter icon-button"
        onClick={onCenter}
        aria-label="Recenter map on selected bus"
        title="Center on selected bus"
      >
        <Crosshair size={21} />
      </button>
      <div className="map-key">
        <span className="key-dot" />
        {demo ? "Selected bus" : "Active bus"}
        <span className="key-dot other" />
        Other buses
      </div>
      {!demo && connectionError && state === "ready" && (
        <div className="map-message error" role="alert">
          <strong>Live bus data is offline</strong>
          <span>{connectionError}</span>
        </div>
      )}
      {!demo &&
        !connectionError &&
        visibleCount === 0 &&
        state === "ready" && (
          <div className="map-message">
            <Radio size={16} />
            <span>No buses are actively tracking right now.</span>
          </div>
        )}
      {state === "loading" && (
        <div className="map-message" role="status">
          <span className="loading-dot" />
          Loading Carmel map…
        </div>
      )}
      {state === "error" && (
        <div className="map-message error" role="alert">
          <strong>Map couldn’t load</strong>
          <span>Check your connection. You can still browse buses.</span>
          <button
            onClick={() => {
              setMap(null);
              setRetry((value) => value + 1);
            }}
          >
            <RotateCw size={15} />
            Retry map
          </button>
        </div>
      )}
    </div>
  );
}

function MapPinLabel() {
  return <Layers size={16} aria-hidden="true" />;
}
