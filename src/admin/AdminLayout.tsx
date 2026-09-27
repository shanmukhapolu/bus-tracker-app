import { useEffect, useRef } from "react";
import {
  BusFront,
  LayoutDashboard,
  LogOut,
  Map,
  Smartphone,
  UserCheck,
  ChevronRight,
  Database,
} from "lucide-react";
import { SchoolLogo } from "../components/SchoolLogo";
import { relativeTime } from "../utils";
import type { Bus } from "../types/bus";

const links = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "map", label: "Live Map", icon: Map },
  { key: "devices", label: "Devices", icon: Smartphone },
  { key: "drivers", label: "Drivers", icon: UserCheck },
] as const;

export type AdminPageKey = (typeof links)[number]["key"];

export function AdminLayout({
  page,
  onNavigate,
  onSignOut,
  displayName,
  buses,
  lastSyncAt,
  connected,
  children,
}: {
  page: AdminPageKey;
  onNavigate: (page: AdminPageKey) => void;
  onSignOut: () => void;
  displayName: string;
  buses: Bus[];
  lastSyncAt?: Date;
  connected: boolean;
  children: React.ReactNode;
}) {
  const main = useRef<HTMLElement>(null);

  useEffect(() => {
    main.current?.focus();
  }, [page]);

  const pageName = links.find((link) => link.key === page)?.label ?? "Dashboard";
  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "AD";

  return (
    <div className="admin-shell operations-shell">
      <a className="skip-link" href="#admin-main">
        Skip to content
      </a>

      <aside className="sidebar">
        <div className="admin-brand-logo" style={{ margin: "0 24px 30px" }}>
          <SchoolLogo className="admin-school-logo" alt="" />
          <div>
            <strong>BUS SAFETY</strong>
            <span>ADMIN</span>
          </div>
        </div>

        <div className="sidebar-label">OPERATIONS</div>
        <nav aria-label="Admin navigation">
          {links.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={page === key ? "admin-nav-button active" : "admin-nav-button"}
              onClick={() => onNavigate(key)}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
              {key === "dashboard" && <span className="nav-count">{buses.length}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="workspace-label">
            <Database size={18} />
            <span>Firebase workspace</span>
          </div>
          <div className="user">
            <span className="avatar">{initials}</span>
            <div>
              <strong>Admin</strong>
              <small>{displayName}</small>
            </div>
          </div>
          <button className="signout" type="button" onClick={onSignOut}>
            <LogOut size={18} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div>
            <div className="breadcrumb">
              <span>Transportation</span>
              <ChevronRight size={14} />
              <strong>{pageName}</strong>
            </div>
          </div>
          <div className="topbar-right">
            <span className="demo-label">LIVE FIREBASE DATA</span>
            <span className="feed-updated">
              {connected && lastSyncAt
                ? "Updated " + relativeTime(lastSyncAt.toISOString())
                : connected
                  ? "Connected"
                  : "Waiting for Firebase"}
            </span>
          </div>
        </header>

        <main id="admin-main" className="page" ref={main} tabIndex={-1}>
          {children}
        </main>

        <footer className="app-footer">
          <span>{buses.length} registered buses · Shared bus tracking project</span>
          <span className={"feed-status " + (connected ? "online" : "offline")}>
            <i />
            {connected ? "Firebase feed active" : "Waiting for Firebase"}
          </span>
        </footer>
      </div>
    </div>
  );
}
