import { useMemo, useState } from "react";
import { Trash2, UserCheck, UserX, ShieldCheck } from "lucide-react";
import type { FleetBus, FleetDriver } from "../services/fleetService";
import { Empty, ErrorState, Metric, PageHeading, Badge } from "./UI";
import {
  deleteDriverAccount,
  updateAdminDriverAccess,
} from "./adminData";

type DriverView = "active" | "pending" | "disabled";

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
  const [view, setView] = useState<DriverView>("active");

  const pending = useMemo(
    () =>
      drivers
        .filter((driver) => driver.approvalStatus === "pending")
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [drivers],
  );

  const active = useMemo(
    () =>
      drivers
        .filter(
          (driver) =>
            driver.approvalStatus === "approved" && driver.enabled,
        )
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [drivers],
  );

  const disabled = useMemo(
    () =>
      drivers
        .filter(
          (driver) =>
            driver.approvalStatus === "approved" && !driver.enabled,
        )
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [drivers],
  );

  const save = async (
    driver: FleetDriver,
    enabledNext: boolean,
    action: "approve" | "enable" | "save" | "disable",
  ) => {
    const selected = assignments[driver.uid] ?? driver.assignedBus;
    setSaving(driver.uid);
    setMessage("");

    try {
      await updateAdminDriverAccess(driver.uid, selected, enabledNext);
      setMessage(
        action === "approve"
          ? "Driver approved and moved to Active."
          : action === "enable"
            ? "Driver enabled and moved to Active."
            : action === "disable"
              ? "Driver disabled and moved to Disabled."
              : "Driver access and bus assignment saved.",
      );

      if (action === "approve" || action === "enable") {
        setView("active");
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
      "Remove " +
        driver.displayName +
        "'s driver profile from this application? This removes the Firebase database record. The Firebase Authentication account must be removed separately because browser Firebase credentials cannot delete another user's Auth account.",
    );

    if (!confirmed) return;

    setSaving(driver.uid);
    setMessage("");

    try {
      await deleteDriverAccount(driver.uid);
      setMessage(driver.displayName + "'s driver profile was removed.");
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "Could not remove the driver profile.",
      );
    } finally {
      setSaving("");
    }
  };

  const displayed =
    view === "pending" ? pending : view === "disabled" ? disabled : active;

  const tabCounts = {
    active: active.length,
    pending: pending.length,
    disabled: disabled.length,
  };

  return (
    <>
      <PageHeading
        title="Driver access"
        description="Manage active drivers, review new account requests, and restore disabled driver accounts."
      />
      <div className="metrics driver-metrics">
        <Metric label="Active drivers" value={active.length} tone="green" />
        <Metric label="Pending requests" value={pending.length} tone="amber" />
        <Metric label="Disabled drivers" value={disabled.length} />
      </div>
      <div className="notice driver-security-notice">
        <ShieldCheck size={18} />
        Approved drivers can publish live GPS only for their assigned bus.
        Pending accounts cannot sign in until approved.
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              {view === "pending"
                ? "Driver requests"
                : view === "disabled"
                  ? "Disabled drivers"
                  : "Active drivers"}
            </h2>
            <span>
              {displayed.length}{" "}
              {view === "pending"
                ? "pending request" + (displayed.length === 1 ? "" : "s")
                : view === "disabled"
                  ? "disabled driver" + (displayed.length === 1 ? "" : "s")
                  : "active driver" + (displayed.length === 1 ? "" : "s")}
            </span>
          </div>
        </div>

        <div
          className="fleet-tabs driver-view-tabs"
          role="tablist"
          aria-label="Driver access views"
        >
          {(["active", "pending", "disabled"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={view === tab}
              aria-pressed={view === tab}
              onClick={() => setView(tab)}
            >
              {tab === "active"
                ? "Active"
                : tab === "pending"
                  ? "Pending"
                  : "Disabled"}{" "}
              <span className="tab-count">{tabCounts[tab]}</span>
            </button>
          ))}
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
                  <th className="driver-actions-header">
                    <span className="sr-only">Actions</span>
                  </th>
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
                            driver.approvalStatus === "pending"
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
                      <td className="driver-actions-cell">
                        <div className="driver-actions">
                          {view === "pending" ? (
                            <button
                              className="primary"
                              disabled={busy || !selected}
                              onClick={() =>
                                void save(driver, true, "approve")
                              }
                            >
                              <UserCheck size={16} />
                              {busy ? "Approving…" : "Approve"}
                            </button>
                          ) : view === "disabled" ? (
                            <button
                              className="primary"
                              disabled={busy || !selected}
                              onClick={() =>
                                void save(driver, true, "enable")
                              }
                            >
                              <UserCheck size={16} />
                              {busy ? "Enabling…" : "Enable"}
                            </button>
                          ) : (
                            <>
                              <button
                                className="primary"
                                disabled={busy || !selected}
                                onClick={() =>
                                  void save(driver, true, "save")
                                }
                              >
                                <UserCheck size={16} />
                                Save assignment
                              </button>
                              <button
                                className="secondary"
                                disabled={busy}
                                onClick={() =>
                                  void save(driver, false, "disable")
                                }
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
                            Remove
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
            {view === "pending"
              ? "No new driver requests are waiting for approval."
              : view === "disabled"
                ? "No drivers are currently disabled."
                : "No active driver accounts are available yet."}
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
