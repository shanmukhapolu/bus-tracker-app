import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronRight, Info, MapPin, X } from "lucide-react";
import type { Bus } from "../types/bus";
import { filterBuses, statusLabel } from "../utils/buses";
import { BusIcon } from "./BusIcon";
import { BusSearch } from "./BusSearch";

interface Props {
  buses: Bus[];
  selectedId: string;
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  demo: boolean;
}

export function SideMenu({
  buses,
  selectedId,
  open,
  onClose,
  onSelect,
  demo,
}: Props) {
  const [query, setQuery] = useState("");
  const panel = useRef<HTMLElement>(null);
  const results = filterBuses(buses, query);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLInputElement>("input")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          "button, input, a[href]",
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [open, onClose]);

  return (
    <>
      {open && (
        <button
          className="menu-backdrop"
          aria-label="Close bus menu"
          onClick={onClose}
        />
      )}
      <aside
        ref={panel}
        id="bus-menu"
        className={`side-menu ${open ? "is-open" : ""}`}
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        aria-labelledby="menu-title"
      >
        <div className="menu-heading">
          <div>
            <span className="eyebrow">YOUR RIDE, IN VIEW</span>
            <h1 id="menu-title">Find a Bus</h1>
          </div>
          <button
            className="icon-button close-menu"
            aria-label="Close bus menu"
            onClick={onClose}
          >
            <X />
          </button>
          <span className="fleet-icon">
            <BusIcon small />
          </span>
        </div>
        <BusSearch query={query} onChange={setQuery} />
        <div className="list-heading">
          <span>{query ? "SEARCH RESULTS" : "ALL BUSES"}</span>
          <span>
            {results.length} {results.length === 1 ? "bus" : "buses"}
          </span>
        </div>
        <div className="bus-list" aria-label="Buses">
          {results.map((bus) => (
            <button
              className={`bus-row ${selectedId === bus.id ? "selected" : ""}`}
              key={bus.id}
              onClick={() => onSelect(bus.id)}
              aria-pressed={selectedId === bus.id}
              aria-label={`Bus ${bus.busNumber}, Route ${bus.route}, ${statusLabel(bus)}`}
            >
              <BusIcon small />
              <span className="bus-row-copy">
                <strong>Bus {bus.busNumber}</strong>
                <span>
                  Route {bus.route}
                  <span className="separator">·</span>
                  <span className={`row-status ${bus.status}`}>
                    {statusLabel(bus)}
                  </span>
                </span>
              </span>
              <ChevronRight size={18} />
            </button>
          ))}
          {results.length === 0 && (
            <div className="empty-state">
              <MapPin />
              <strong>No buses found</strong>
              <p>Try a bus number like 218 or a route like C.</p>
              <button className="text-button" onClick={() => setQuery("")}>
                Show all buses
              </button>
            </div>
          )}
        </div>
        <div className="menu-footer">
          {demo && (
            <div className="demo-note">
              <Info size={17} />
              <div>
                <strong>You’re exploring a demo</strong>
                <p>Bus locations and arrival times are simulated.</p>
              </div>
            </div>
          )}
          <a href="https://www.ccs.k12.in.us/" target="_blank" rel="noreferrer">
            Carmel Clay Schools
            <ArrowUpRight size={16} />
          </a>
          <span className="prototype-note">
            Independent prototype · Not an official district service
          </span>
        </div>
      </aside>
    </>
  );
}
