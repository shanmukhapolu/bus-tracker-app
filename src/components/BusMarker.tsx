import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Marker, type Map as LibreMap } from "maplibre-gl";
import type { Bus } from "../types/bus";
import { BusIcon } from "./BusIcon";

interface Props {
  map: LibreMap;
  bus: Bus;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function BusMarker({ map, bus, selected, onSelect }: Props) {
  const [element] = useState(() => document.createElement("div"));
  const marker = useRef<Marker | null>(null);
  const initial = useRef<[number, number]>([bus.longitude, bus.latitude]);

  useEffect(() => {
    const instance = new Marker({ element, anchor: "bottom" })
      .setLngLat([...initial.current])
      .addTo(map);

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
    marker.current?.setLngLat([bus.longitude, bus.latitude]);
  }, [bus.latitude, bus.longitude]);

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
