import { Menu } from "lucide-react";
import { SchoolLogo } from "./SchoolLogo";

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
        <SchoolLogo
          className="brand-logo"
          alt=""
        />
        <span className="brand-copy">
          <strong>CARMEL CLAY SCHOOLS</strong>
          <span>BUS TRACKER</span>
        </span>
      </a>
      <div className="header-right">
        <span className="region">Carmel, Indiana</span>
        <span
          className={`live-indicator ${!connected ? "disconnected" : ""}`}
          title={
            connectionError
              ? `Firebase sync error: ${connectionError}`
              : lastSyncAt
                ? `Firebase synced at ${lastSyncAt.toLocaleTimeString()}`
                : "Connecting to Firebase Realtime Database"
          }
        >
          <i />
          {!connected ? "OFFLINE" : demo ? "LIVE DEMO" : "LIVE"}
        </span>
      </div>
    </header>
  );
}
