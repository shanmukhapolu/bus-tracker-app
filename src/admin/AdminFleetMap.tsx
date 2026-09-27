import { useEffect, useRef, useState } from "react";
import {
  Map as LibreMap,
  Marker,
  NavigationControl,
  LngLatBounds,
  type GeoJSONSource,
} from "maplibre-gl";
import { Crosshair } from "lucide-react";
import busIconUrl from "../assets/bus-front.svg";
export interface MapPosition {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  alert?: boolean;
  offline?: boolean;
}
interface Props {
  positions: MapPosition[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  line?: [number, number][];
  progress?: [number, number][];
  events?: MapPosition[];
  onEventSelect?: (eventId: string) => void;
  dataLabel?: string;
}
export function FleetMap({
  positions,
  selectedId,
  onSelect,
  line,
  progress,
  events = [],
  onEventSelect,
  dataLabel = "LIVE GPS",
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<LibreMap | null>(null),
    markers = useRef(new Map<string, Marker>());
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const current = useRef({ positions, onSelect, line });
  current.current = { positions, onSelect, line };
  useEffect(() => {
    if (!host.current) return;
    setError("");
    setReady(false);
    let instance: LibreMap;
    try {
      instance = new LibreMap({
        container: host.current,
        style: "https://tiles.openfreemap.org/styles/positron",
        center: [-86.155, 39.976],
        zoom: 11.8,
        attributionControl: { compact: true },
      });
    } catch {
      setError(
        "Map requires WebGL. Fleet information remains available in the tables.",
      );
      return;
    }
    map.current = instance;
    instance.addControl(
      new NavigationControl({ showCompass: false }),
      "top-right",
    );
    const timer = setTimeout(() => {
      if (!instance.loaded())
        setError(
          "Map is taking too long to load. Check your connection and retry.",
        );
    }, 20000);
    instance.on("load", () => {
      clearTimeout(timer);
      setReady(true);
      setError("");
    });
    instance.on("error", () =>
      setError(
        "Some map resources could not load. Check your connection or retry the map.",
      ),
    );
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(host.current);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      markers.current.forEach((marker) => marker.remove());
      markers.current.clear();
      instance.remove();
      map.current = null;
    };
  }, [attempt]);
  useEffect(() => {
    if (!ready || !map.current) return;
    const instance = map.current;
    const ids = new Set(positions.map((point) => point.id));
    markers.current.forEach((marker, id) => {
      if (!ids.has(id)) {
        marker.remove();
        markers.current.delete(id);
      }
    });
    positions.forEach((point) => {
      let marker = markers.current.get(point.id);
      if (!marker) {
        const element = document.createElement("button");
        element.type = "button";
        const icon = document.createElement("img");
        icon.src = busIconUrl;
        icon.alt = "";
        icon.className = "fleet-marker-icon";
        const number = document.createElement("span");
        number.className = "fleet-marker-number";
        element.append(icon, number);
        element.addEventListener("click", () =>
          current.current.onSelect?.(point.id),
        );
        marker = new Marker({ element })
          .setLngLat([point.longitude, point.latitude])
          .addTo(instance);
        markers.current.set(point.id, marker);
      }
      const element = marker.getElement();
      element.querySelector(".fleet-marker-number")!.textContent =
        point.label.replace(/^Bus\s+/i, "");
      element.setAttribute("aria-label", "Select " + point.label);
      element.setAttribute("aria-pressed", String(selectedId === point.id));
      element.className =
        "maplibregl-marker fleet-marker" +
        (point.alert ? " alert" : "") +
        (point.offline ? " offline" : "") +
        (selectedId === point.id ? " selected" : "");
      marker.setLngLat([point.longitude, point.latitude]);
t { useEffect, useRef, useState } from "react";
import {
  Map as LibreMap,
  Marker,
  NavigationControl,
  LngLatBounds,
  type GeoJSONSource,
} from "maplibre-gl";
import { Crosshair } from "lucide-react";
import busIconUrl from "../assets/bus-front.svg";
export interface MapPosition {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  alert?: boolean;
  offline?: boolean;
}
interface Props {
  positions: MapPosition[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  line?: [number, number][];
  progress?: [number, number][];
  events?: MapPosition[];
  onEventSelect?: (eventId: string) => void;
  dataLabel?: string;
}
export function FleetMap({
  positions,
  selectedId,
  onSelect,
  line,
  progress,
  events = [],
  onEventSelect,
  dataLabel = "LIVE GPS",
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<LibreMap | null>(null),
    markers = useRef(new Map<string, Marker>());
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const current = useRef({ positions, onSelect, line });
  current.current = { positions, onSelect, line };
  useEffect(() => {
    if (!host.current) return;
    setError("");
    setReady(false);
    let instance: LibreMap;
    try {
      instance = new LibreMap({
        container: host.current,
        style: "https://tiles.openfreemap.org/styles/positron",
        center: [-86.155, 39.976],
        zoom: 11.8,
        attributionControl: { compact: true },
      });
    } catch {
      setError(
        "Map requires WebGL. Fleet information remains available in the tables.",
      );
      return;
    }
    map.current = instance;
    instance.addControl(
      new NavigationControl({ showCompass: false }),
      "top-right",
    );
    const timer = setTimeout(() => {
      if (!instance.loaded())
        setError(
          "Map is taking too long to load. Check your connection and retry.",
        );
    }, 20000);
    instance.on("load", () => {
      clearTimeout(timer);
      setReady(true);
      setError("");
    });
    instance.on("error", () =>
      setError(
        "Some map resources could not load. Check your connection or retry the map.",
      ),
    );
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(host.current);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      markers.current.forEach((marker) => marker.remove());
      markers.current.clear();
      instance.remove();
      map.current = null;
    };
  }, [attempt]);
  useEffect(() => {
    if (!ready || !map.current) return;
    const instance = map.current;
    const ids = new Set(positions.map((point) => point.id));
    markers.current.forEach((marker, id) => {
      if (!ids.has(id)) {
        marker.remove();
        markers.current.delete(id);
      }
    });
    positions.forEach((point) => {
      let marker = markers.current.get(point.id);
      if (!marker) {
        const element = document.createElement("button");
        element.type = "button";
        const icon = document.createElement("img");
        icon.src = busIconUrl;
        icon.alt = "";
        icon.className = "fleet-marker-icon";
        const number = document.createElement("span");
        number.className = "fleet-marker-number";
        element.append(icon, number);
        element.addEventListener("click", () =>
          current.current.onSelect?.(point.id),
        );
        marker = new Marker({ element })
          .setLngLat([point.longitude, point.latitude])
          .addTo(instance);
        markers.current.set(point.id, marker);
      }
      const element = marker.getElement();
      element.querySelector(".fleet-marker-number")!.textContent =
        point.label.replace(/^Bus\s+/i, "");
      element.setAttribute("aria-label", "Select " + point.label);
      element.setAttribute("aria-pressed", String(selectedId === point.id));
      element.className =
        "maplibregl-marker fleet-marker" +
        (point.alert ? " alert" : "") +
        (point.offline ? " offline" : "") +
        (selectedId === point.id ? " selected" : "");
      const from = marker.getLngLat();
      animations.push({
        marker,
        from: [from.lng, from.lat],
        to: [point.longitude, point.latitude],
      });
    });
  useEffect(() => {
    if (!map.current || !ready) return;
    for (const [id, coordinates, color, width] of [
      ["route", line, "#a1b5c9", 5],
      ["progress", progress, "#23679d", 5],
    ] as const) {
      const data = {
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "LineString" as const,
          coordinates: coordinates ?? [],
        },
      };
      const source = map.current.getSource(id) as GeoJSONSource | undefined;
      if (source) source.setData(data);
      else {
        map.current.addSource(id, { type: "geojson", data });
        map.current.addLayer({
          id,
          type: "line",
          source: id,
          paint: { "line-color": color, "line-width": width },
        });
      }
    }
  }, [line, progress, ready]);
  useEffect(() => {
    if (!ready || !map.current) return;
    const list = events.map((point) => {
      const el = document.createElement(onEventSelect ? "button" : "div");
      if (el instanceof HTMLButtonElement) {
        el.type = "button";
        el.addEventListener("click", (event) => {
          event.stopPropagation();
          onEventSelect?.(point.id);
        });
      }
      el.className = "event-map-marker";
      el.textContent = "!";
      el.title = onEventSelect
        ? "Open safety event: " + point.label
        : point.label;
      el.setAttribute("aria-label", el.title);
      return new Marker({ element: el })
        .setLngLat([point.longitude, point.latitude])
        .addTo(map.current!);
    });
    return () => list.forEach((marker) => marker.remove());
  }, [events, ready, onEventSelect]);
  const center = () => {
    const instance = map.current;
    if (!instance) return;
    const points = current.current.line?.length
      ? current.current.line
      : current.current.positions.map(
          (point) => [point.longitude, point.latitude] as [number, number],
        );
    if (!points.length) return;
    const bounds = new LngLatBounds();
    points.forEach((point) => bounds.extend(point));
    instance.fitBounds(bounds, {
      padding: 60,
      maxZoom: 15,
      duration: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 600,
    });
  };
  useEffect(() => {
    if (ready) center();
  }, [ready, line]);
  return (
    <div className="fleet-map">
      <div className="map-host" ref={host} aria-label="Fleet map" />
      <button className="map-center" onClick={center} aria-label="Center map">
        <Crosshair size={18} />
      </button>
      <span className="map-tag">{dataLabel}</span>
      {!ready && !error && (
        <div className="map-feedback" role="status">
          Loading map…
        </div>
      )}
      {error && (
        <div className="map-feedback" role="alert">
          {error}
          <button onClick={() => setAttempt((value) => value + 1)}>
            Retry map
          </button>
        </div>
      )}
    </div>
  );
}

export { FleetMap as AdminFleetMap };
