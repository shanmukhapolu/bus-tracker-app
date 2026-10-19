import { useEffect, useState } from "react";
import type { DriverTrackingSession } from "../services/driverTrackingService";

/** Separate local timer: no database reads, writes, storage or automatic logging. */
export function GpsTimingPanel({
  session,
}: {
  session: DriverTrackingSession;
}) {
  const [includeFixTimings, setIncludeFixTimings] = useState(false);
  const [, refresh] = useState(0);
  useEffect(() => {
    if (!session.diagnostics) return;
    const timer = setInterval(() => refresh((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [session]);
  if (import.meta.env.MODE !== "staging" || !session.diagnostics) return null;
  const data = session.diagnostics();
  const summary = data.stopped
    ? "Timing collection stopped."
    : data.firebaseConnected === false
      ? "Firebase is disconnected."
      : data.requestPendingMs !== null && data.requestPendingMs >= 2000
        ? "Waiting for the phone to answer a fresh location request."
        : data.uploadPendingMs !== null && data.uploadPendingMs >= 2000
          ? "Waiting for Firebase to acknowledge a GPS upload."
          : "Measuring phone responses and Firebase acknowledgements.";
  const report = JSON.stringify(
    {
      ...data,
      delivery: {
        ...data.delivery,
        fixTimings: includeFixTimings ? data.delivery.fixTimings : undefined,
      },
      pageVisible: document.visibilityState === "visible",
    },
    null,
    2,
  );
  return (
    <details className="simple-driver-empty">
      <summary>STAGING: GPS timing check</summary>
      <p>{summary}</p>
      <p>
        {data.recoveryEnabled
          ? "Comparison mode: watch plus recovery requests"
          : "Comparison mode: watch only"}
      </p>
      <label>
        <input
          type="checkbox"
          checked={includeFixTimings}
          onChange={(event) => setIncludeFixTimings(event.target.checked)}
        />{" "}
        Include per-fix timings (last 256 callbacks)
      </label>
      <p>
        Keep this page visible for 60 seconds. Copy these timing counters before
        stopping. They contain no coordinates, account details or passwords.
        Nothing is saved or sent automatically.
      </p>
      <label htmlFor="gps-timing-report">
        GPS timing report (milliseconds)
      </label>
      <textarea
        id="gps-timing-report"
        readOnly
        rows={16}
        value={report}
        style={{ width: "100%", boxSizing: "border-box" }}
      />
      <p>
        Error codes: 1 = permission denied; 2 = location unavailable; 3 =
        request timed out.
      </p>
    </details>
  );
}
