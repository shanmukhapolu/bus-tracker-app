import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Marker, type Map as LibreMap } from "maplibre-gl";
import type { Bus, Coordinate } from "../types/bus";
import { interpolatePosition } from "../utils/buses";
import { BusIcon } from "./BusIcon";

interface Props {
  map: LibreMap;
  bus: Bus;
  selected: boolean;
  onSelect: (id: string) => void;
  intervalMs: number;
}

export function BusMarker({ map, bus, selected, onSelect, intervalMs }: Props) {
  const [element] = useState(() => document.createElement("div"));
  const marker = useRef<Marker | null>(null);
  const initial = useRef<Coordinate>([bus.longitude, bus.latitude]);

  useEffect(() => {
    const instance = new Marker({ element, anchor: "bottom" })
      .setLngLat([...initial.current])
      .addTo(map);
    // The inner React button owns keyboard interaction and the accessible name.
    element.removeAttribute("role");
    element.removeAttribute("tabindex");
    element.removeAttribute("aria-label");
    marker.current = instance;
    return () => {
      instance.remove();
      marker.current = null;
    };
  }, [map, element]);

  useEffect(() => {
    const instance = marker.current;
    if (!instance) return;
    const current = instance.getLngLat();
    const from: Coordinate = [current.lng, current.lat];
    const to: Coordinate = [bus.longitude, bus.latitude];
    if (from[0] === to[0] && from[1] === to[1]) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      instance.setLngLat([...to]);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const animate = (now: number) => {
      const progress = (now - start) / Math.max(1, intervalMs);
      instance.setLngLat([...interpolatePosition(from, to, progress)]);
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [bus.latitude, bus.longitude, intervalMs]);

  useEffect(() => {
    element.classList.toggle("selected-marker-container", selected);
  }, [element, selected]);

  return createPortal(
    <button
      className={`map-bus ${selected ? "is-selected" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(bus.id);
      }}
      aria-label={`Select Bus ${bus.busNumber}`}
      aria-pressed={selected}
    >
      <span className="marker-label">
        {selected && <i />}Bus {bus.busNumber}
      </span>
      <span className="marker-body">
        <BusIcon small />
      </span>
      <span className="marker-dot" />
    </button>,
    element,
  );
}
