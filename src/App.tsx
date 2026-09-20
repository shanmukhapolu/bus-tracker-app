import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronUp } from "lucide-react";
import { Header } from "./components/Header";
import { SideMenu } from "./components/SideMenu";
import { BusMap } from "./components/BusMap";
import { BusInfoCard } from "./components/BusInfoCard";
import { useBuses } from "./hooks/useBuses";
import { useBusTools } from "./hooks/useBusTools";
import { DriversPage } from "./pages/DriversPage";

export default function App() {
  const isDriversPage =
    window.location.pathname.replace(/\/+$/, "") === "/drivers";

  return isDriversPage ? <DriversPage /> : <PublicTracker />;
}

function PublicTracker() {
  const { buses, mode, connected, updateIntervalMs } = useBuses();
  const [selectedId, setSelectedId] = useState("218");
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsVisible, setDetailsVisible] = useState(true);
  const detailsToggle = useRef<HTMLButtonElement>(null);
  const restoreDetailsFocus = useRef(false);
  const [centerRequest, setCenterRequest] = useState(0);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const centerBus = useCallback(
    () => setCenterRequest((value) => value + 1),
    [],
  );
  const selected = buses.find((bus) => bus.id === selectedId) ?? buses[0];
  const selectBus = useCallback((id: string) => {
    setSelectedId(id);
    setMenuOpen(false);
    setDetailsVisible(true);
    setCenterRequest((value) => value + 1);
  }, []);
  useBusTools(buses, selectBus);

  const toggleDetails = () => {
    restoreDetailsFocus.current = true;
    setDetailsVisible((visible) => !visible);
  };

  useEffect(() => {
    if (restoreDetailsFocus.current) {
      detailsToggle.current?.focus();
      restoreDetailsFocus.current = false;
    }
  }, [detailsVisible]);

  useEffect(() => {
    const media = matchMedia("(min-width: 900px)");
    const changed = () => {
      if (media.matches) setMenuOpen(false);
    };
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);

  return (
    <div className="app-shell">
      <Header
        onMenu={() => setMenuOpen(true)}
        menuOpen={menuOpen}
        demo={mode === "demo"}
        connected={connected}
      />
      <main className="workspace">
        <SideMenu
          buses={buses}
          selectedId={selected?.id ?? ""}
          open={menuOpen}
          onClose={closeMenu}
          onSelect={selectBus}
          demo={mode === "demo"}
        />
        <div className="tracking-surface">
          <BusMap
            buses={buses}
            selectedId={selected?.id ?? ""}
            onSelect={selectBus}
            centerRequest={centerRequest}
            onCenter={centerBus}
            intervalMs={updateIntervalMs}
            demo={mode === "demo"}
            obscured={menuOpen}
          />
          <div className="info-position" inert={menuOpen}>
            {selected && !detailsVisible ? (
              <button
                ref={detailsToggle}
                className="show-details-button"
                onClick={toggleDetails}
                aria-expanded={false}
              >
                <ChevronUp size={18} aria-hidden="true" />
                Show bus details
                <span>Bus {selected.busNumber}</span>
              </button>
            ) : selected ? (
              <BusInfoCard
                bus={selected}
                onCenter={centerBus}
                demo={mode === "demo"}
                onHide={toggleDetails}
                hideButtonRef={detailsToggle}
              />
            ) : (
              <div className="info-card no-buses" role="status">
                No buses are available right now.
              </div>
            )}
          </div>
          <div className="map-caption">
            {mode === "demo" ? "DEMO MODE" : "LIVE TRACKING"}
            <span />
            Carmel Clay Schools
          </div>
        </div>
      </main>
    </div>
  );
}
