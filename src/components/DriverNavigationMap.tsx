import { useEffect, useMemo, useRef, useState } from "react";
import {
  LngLatBounds,
  Map as LibreMap,
  Marker,
  NavigationControl,
  type GeoJSONSource,
} from "maplibre-gl";
import { Crosshair } from "lucide-react";
import busIconUrl from "../assets/bus-front.svg";
import type { DriverLocation } from "../services/driverTrackingService";
import type { DriverRoute, RouteStop } from "../types/route";

interface Props {
  busNumber: string;
  position: DriverLocation | null;
  route: DriverRoute;
  nextStop: RouteStop | null;
}

export function DriverNavigationMap({
  busNumber,
  position,
  route,
  nextStop,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<LibreMap | null>(null);
  const busMarker = useRef<Marker | null>(null);
  const stopMarkers = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [following, setFollowing] = useState(true);
  const coordinates = useMemo(
    () => route.stops.map((stop) => [stop.longitude, stop.latitude]),
    [route.stops],
  );

  useEffect(() => {
    if (!host.current) return;
    let instance: LibreMap;
    try {
      instance = new LibreMap({
        container: host.current,
        style: "https://tiles.openfreemap.org/styles/positron",
        center: position
          ? [position.longitude, position.latitude]
          : [-86.118, 39.9784],
        zoom: position ? 15 : 12,
        attributionControl: { compact: true },
      });
    } catch {
      setError("This device could not open the live map.");
      return;
    }
    map.current = instance;
    instance.addControl(
      new NavigationControl({ showCompass: false }),
      "top-right",
    );
    instance.on("load", () => {
      setReady(true);
      setError("");
    });
    instance.on("error", () =>
      setError("Some map tiles could not load. GPS tracking is still active."),
    );
    instance.on("dragstart", () => setFollowing(false));
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(host.current);
    return () => {
      observer.disconnect();
      stopMarkers.current.forEach((marker) => marker.remove());
      stopMarkers.current = [];
      busMarker.current?.remove();
      busMarker.current = null;
      instance.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !map.current) return;
    const data = {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates,
      },
    };
    const source = map.current.getSource("driver-route") as
      GeoJSONSource | undefined;
    if (source) source.setData(data);
    else {
      map.current.addSource("driver-route", { type: "geojson", data });
      map.current.addLayer({
        id: "driver-route-outline",
        type: "line",
        source: "driver-route",
        paint: {
          "line-color": "#ffffff",
          "line-width": 9,
          "line-opacity": 0.94,
        },
      });
      map.current.addLayer({
        id: "driver-route",
        type: "line",
        source: "driver-route",
        paint: {
          "line-color": "#1d68b2",
          "line-width": 5,
          "line-opacity": 0.92,
        },
      });
    }

    stopMarkers.current.forEach((marker) => marker.remove());
    stopMarkers.current = route.stops.map((stop, index) => {
      const element = document.createElement("div");
      element.className =
        "driver-stop-marker" + (stop.id === nextStop?.id ? " next" : "");
      element.textContent = String(index + 1);
      element.title = `${index + 1}. ${stop.name}`;
      element.setAttribute("aria-label", element.title);
      return new Marker({ element })
        .setLngLat([stop.longitude, stop.latitude])
        .addTo(map.current!);
    });

    if (coordinates.length) {
      const bounds = new LngLatBounds();
      coordinates.forEach((point) => bounds.extend(point as [number, number]));
      map.current.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 0 });
    }
  }, [coordinates, nextStop?.id, ready, route.stops]);

  useEffect(() => {
    if (!ready || !map.current || !position) return;
    if (!busMarker.current) {
      const element = document.createElement("div");
      element.className = "driver-bus-marker";
      const icon = document.createElement("img");
      icon.src = busIconUrl;
      icon.alt = "";
      const number = document.createElement("span");
      number.textContent = busNumber;
      element.append(icon, number);
      busMarker.current = new Marker({ element })
        .setLngLat([position.longitude, position.latitude])
        .addTo(map.current);
    } else {
      busMarker.current.setLngLat([position.longitude, position.latitude]);
    }
    if (following) {
      map.current.easeTo({
        center: [position.longitude, position.latitude],
        zoom: Math.max(map.current.getZoom(), 15),
        duration: 700,
      });
    }
  }, [busNumber, following, position, ready]);

  const recenter = () => {
    if (!map.current || !position) return;
    setFollowing(true);
    map.current.easeTo({
      center: [position.longitude, position.latitude],
      zoom: 16,
      duration: 500,
    });
  };

  return (
    <div className="driver-navigation-map">
      <div ref={host} className="driver-navigation-map-host" />
      <div className="driver-map-live-pill">
        <span /> Live GPS
      </div>
      <button
        className="driver-map-center"
        type="button"
        onClick={recenter}
        disabled={!position}
        aria-label="Center map on bus"
      >
        <Crosshair size={20} />
      </button>
      {!ready && !error && (
        <div className="driver-map-feedback">Loading route map…</div>
      )}
      {error && <div className="driver-map-feedback error">{error}</div>}
    </div>
  );
}
