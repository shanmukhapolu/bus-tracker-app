import { useMemo, useState } from "react";
import { Trash2, UserCheck, UserX, ShieldCheck } from "lucide-react";
import type { FleetBus, FleetDriver } from "../services/fleetService";
import { Empty, ErrorState, Metric, PageHeading, Badge } from "./UI";
import {
  deleteDriverAccount,
  updateAdminDriverAccess,
} from "./adminData";

export function AdminDrivers({
  drivers,
  buses,
  error,
}: {
  drivers: FleetDriver[];
  buses: FleetBus[];
  error?: string;
}) {
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const [view, setView] = useState<"drivers" | "requests">("drivers");

  const requests = useMemo(
    () =>
      drivers
        .filter((driver) => driver.approvalStatus !== "approved")
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [drivers],
  );

  const currentDrivers = useMemo(
    () =>
      drivers
        .filter((driver) => driver.approvalStatus === "approved")
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [drivers],
  );

  const pending = requests.length;
  const enabled = currentDrivers.filter((driver) => driver.enabled).length;

  const save = async (driver: FleetDriver, enabledNext: boolean) => {
    const selected = assignments[driver.uid] ?? driver.assignedBus;
    setSaving(driver.uid);
    setMessage("");

    try {
      await updateAdminDriverAccess(driver.uid, selected, enabledNext);
      setMessage(
        enabledNext
          ? driver.approvalStatus === "approved"
            ? "Driver access and bus assignment saved."
            : "Driver approved and added to the drivers list."
          : "Driver disabled.",
      );

      if (driver.approvalStatus !== "approved" && enabledNext) {
        setView("drivers");
      }
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "Could not update driver access.",
      );
    } finally {
      setSaving("");
    }
  };

  const remove = async (driver: FleetDriver) => {
    const confirmed = window.confirm(
      driver.approvalStatus === "approved"
        ? "Remove " +
            driver.displayName +
            "'s driver profile? This removes the driver record and access from this application. The Firebase Authentication account cannot be deleted from the browser."
        : "Remove " +
            driver.displayName +
            "'s pending request? This removes the driver record and access from this application. The Firebase Authentication account cannot be deleted from the browser.",
    );

    if (!confirmed) return;

    setSaving(driver.uid);
    setMessage("");

    try {
      await deleteDriverAccount(driver.uid);
      setMessage(
        driver.approvalStatus === "approved"
          ? driver.displayName + "'s driver profile was removed."
          : driver.displayName + "'s request was removed.",
      );
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "Could not delete the driver account.",
      );
    } finally {
      setSaving("");
    }
  };

  const displayed = view === "requests" ? requests : currentDrivers;

  return (
    <>
      <PageHeading
        title="Driver access"
        description="Review driver requests, manage approved drivers, and control which bus each driver may track."
      />
      <div className="metrics driver-metrics">
        <Metric label="Driver accounts" value={currentDrivers.length} />
        <Metric label="Pending requests" value={pending} tone="amber" />
        <Metric label="Enabled drivers" value={enabled} tone="green" />
      </div>
      <div className="notice driver-security-notice">
        <ShieldCheck size={18} />
        Approval grants permission to publish live GPS only for the assigned bus.
        Confirm the person and assignment before enabling access.
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{view === "requests" ? "Driver requests" : "Current drivers"}</h2>
            <span>
              {view === "requests"
                ? requests.length +
                  " pending request" +
                  (requests.length === 1 ? "" : "s")
                : currentDrivers.length +
                  " approved driver" +
                  (currentDrivers.length === 1 ? "" : "s")}
            </span>
          </div>
        </div>

        <div
          className="fleet-tabs driver-view-tabs"
          role="tablist"
          aria-label="Driver access views"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === "drivers"}
            aria-pressed={view === "drivers"}
            onClick={() => setView("drivers")}
          >
            Drivers <span className="tab-count">{currentDrivers.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "requests"}
            aria-pressed={view === "requests"}
            onClick={() => setView("requests")}
          >
            Requests <span className="tab-count">{requests.length}</span>
          </button>
        </div>

        {error ? (
          <ErrorState message={error} />
        ) : displayed.length ? (
          <div className="table-wrap">
            <table className="fleet-table driver-table">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Status</th>
                  <th>Assigned bus</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((driver) => {
                  const selected =
                    assignments[driver.uid] ?? driver.assignedBus;
                  const busy = saving === driver.uid;

                  return (
                    <tr key={driver.uid}>
                      <td>
                        <div className="driver-identity">
                          <span className="driver-avatar" aria-hidden="true">
                            {driver.displayName.slice(0, 2).toUpperCase()}
                          </span>
                          <span>
                            <strong>{driver.displayName}</strong>
                            <small>
                              {driver.email ??
                                "Account " +
                                  driver.uid.slice(0, 8).toUpperCase()}
                            </small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <Badge
                          value={
                            driver.approvalStatus !== "approved"
                              ? "pending"
                              : driver.enabled
                                ? "enabled"
                                : "disabled"
                          }
                        />
                      </td>
                      <td>
                        <label
                          className="sr-only"
                          htmlFor={"bus-" + driver.uid}
                        >
                          Bus assigned to {driver.displayName}
                        </label>
                        <select
                          id={"bus-" + driver.uid}
                          value={selected}
                          disabled={busy}
                          onChange={(event) =>
                            setAssignments((current) => ({
                              ...current,
                              [driver.uid]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Choose a bus</option>
                          {buses.map((bus) => (
                            <option key={bus.id} value={bus.id}>
                              Bus {bus.busNumber} · Route {bus.route}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div className="driver-actions">
                          {driver.approvalStatus !== "approved" ? (
                            <button
                              className="primary"
                              disabled={busy || !selected}
                              onClick={() => void save(driver, true)}
                            >
                              <UserCheck size={16} />
                              {busy ? "Approving…" : "Approve"}
                            </button>
                          ) : (
                            <>
                              <button
                                className="primary"
                                disabled={busy || !selected}
                                onClick={() => void save(driver, true)}
                              >
                                <UserCheck size={16} />
                                Save assignment
                              </button>
                              <button
                                className="secondary"
                                disabled={busy}
                                onClick={() => void save(driver, false)}
                              >
                                <UserX size={16} />
                                Disable
                              </button>
                            </>
                          )}
                          <button
                            className="secondary admin-delete driver-delete"
                            disabled={busy}
                            onClick={() => void remove(driver)}
                            title="Remove driver from this application"
                          >
                            <Trash2 size={15} />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>
            {view === "requests"
              ? "No driver requests are waiting for approval."
              : "No approved driver accounts are available yet."}
          </Empty>
        )}

        {message && (
          <p className="driver-message" role="status">
            {message}
          </p>
        )}
      </section>
    </>
  );
}
