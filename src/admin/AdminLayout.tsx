import { useEffect, useRef, type ReactNode } from "react";
import {
  LayoutDashboard,
  LogOut,
  Map,
  Smartphone,
  UserCheck,
} from "lucide-react";
import { SchoolLogo } from "../components/SchoolLogo";
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
  children,
}: {
  page: AdminPageKey;
  onNavigate: (page: AdminPageKey) => void;
  onSignOut: () => void;
  displayName: string;
  buses: Bus[];
  children: ReactNode;
}) {
  const main = useRef<HTMLElement>(null);

  useEffect(() => {
    main.current?.focus();
  }, [page]);

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
        <div className="admin-brand-logo">
          <SchoolLogo className="admin-school-logo" alt="" />
          <div>
            <strong>Admin Panel</strong>
          </div>
        </div>

        <nav aria-label="Admin navigation">
          {links.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={
                page === key
                  ? "admin-nav-button active"
                  : "admin-nav-button"
              }
              onClick={() => onNavigate(key)}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
              {key === "dashboard" && (
                <span className="nav-count">{buses.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="user">
            <span className="avatar">{initials}</span>
            <div>
              <strong>{displayName}</strong>
            </div>
          </div>
          <button className="signout" type="button" onClick={onSignOut}>
            <LogOut size={18} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <div className="main-shell">
        <main id="admin-main" className="page" ref={main} tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
