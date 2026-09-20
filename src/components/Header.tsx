import { Menu } from "lucide-react";

interface Props {
  onMenu: () => void;
  menuOpen: boolean;
  demo: boolean;
  connected: boolean;
  connectionError?: string;
  lastSyncAt?: Date;
}

export function Header({
  onMenu,
  menuOpen,
  demo,
  connected,
  connectionError,
  lastSyncAt,
}: Props) {
  return (
    <header className="header">
      <button
        className="icon-button menu-toggle"
        onClick={onMenu}
        aria-label="Open bus menu"
        aria-expanded={menuOpen}
        aria-controls="bus-menu"
      >
        <Menu />
      </button>
      <a
        className="brand"
        href="/"
        aria-label="Carmel Clay Schools Bus Tracker home"
      >
        <span className="brand-mark" aria-hidden="true">
          C
        </span>
        <span className="brand-copy">
          <strong>CARMEL CLAY SCHOOLS</strong>
          <span>BUS TRACKER</span>
        </span>
      </a>
      <div className="header-right">
        <span className="region">Carmel, Indiana</span>
        <span className={`live-indicator ${!connected ? "disconnected" : ""}`}>
          <i />
          {!connected
            ? "OFFLINE"
            : demo
              ? "LIVE DEMO"
              : "LIVE"}

        </span>
      </div>
    </header>
  );
}
