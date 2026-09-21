import { useEffect, useMemo, useState } from "react";
import type { PublicNotification } from "../services/adminService";
import { subscribePublicNotifications } from "../services/publicNotificationService";
import { Bell, X } from "lucide-react";

export function PublicNotifications() {
  const [notifications, setNotifications] = useState<PublicNotification[]>([]);
  const [now, setNow] = useState(Date.now());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const stop = subscribePublicNotifications(setNotifications);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, []);

  const active = useMemo(
    () =>
      notifications
        .filter((notification) => notification.expiresAt > now)
        .slice(0, 5),
    [notifications, now],
  );

  if (active.length === 0) return null;

  return (
    <div className="public-notifications">
      <button
        className="public-notifications-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Open bus notifications"
      >
        <Bell size={16} />
        <span>{active.length}</span>
      </button>

      <div className={`public-notification-panel ${open ? "is-open" : ""}`}>
        {active.map((notification) => (
          <article key={notification.id} className="public-notification">
            <button
              className="public-notification-close"
              onClick={() =>
                setNotifications((items) =>
                  items.filter((item) => item.id !== notification.id),
                )
              }
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
            <p>{notification.geofenceName}</p>
            <strong>{notification.message}</strong>
            <span>
              {new Date(notification.timestamp).toLocaleTimeString()}
            </span>
          </article>
        ))}
      </div>
    </div>
  );
}
