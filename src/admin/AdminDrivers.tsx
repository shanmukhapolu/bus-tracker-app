import { useMemo, useState } from "react";
import { UserCheck, UserX, ShieldCheck } from "lucide-react";
import type { FleetBus, FleetDriver } from "../services/fleetService";
import { Empty, ErrorState, Metric, PageHeading, Loading, Badge } from "./UI";
import { updateAdminDriverAccess } from "./adminData";

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

  const pending = drivers.filter((driver) => !driver.enabled).length;
  const enabled = drivers.filter((driver) => driver.enabled).length;

  const save = async (driver: FleetDriver, enabledNext: boolean) => {
    const selected = assignments[driver.uid] ?? driver.assignedBus;
    setSaving(driver.uid);
    setMessage("");

    try {
      await updateAdminDriverAccess(driver.uid, selected, enabledNext);
      setMessage("Driver access and bus assignment saved.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not update driver access.");
    } finally {
      setSaving("");
    }
  };

  const sorted = useMemo(
    () =>
      [...drivers].sort((a, b) => {
        if (a.enabled !== b.enabled) return a.enabled ? 1 : -1;
        return a.displayName.localeCompare(b.displayName);
      }),
    [drivers],
  );

  return (
    <>
      <PageHeading
        title="Driver access"
        description="Review driver accounts and control which bus each approved driver may track."
      />
      <div className="metrics driver-metrics">
        <Metric label="Driver accounts" value={drivers.length} />
        <Metric label="Pending approval" value={pending} tone="amber" />
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
            <h2>Driver accounts</h2>
            <span>{drivers.length} registered accounts</span>
          </div>
        </div>

        {error ? (
          <ErrorState message={error} />
        ) : sorted.length ? (
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
                {sorted.map((driver) => {
                  const selected = assignments[driver.uid] ?? driver.assignedBus;
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
                            <small>Account {driver.uid.slice(0, 8).toUpperCase()}</small>
                          </span>
                        </div>
                      </td>
                      <td><Badge value={driver.enabled ? "enabled" : "pending"} /></td>
                      <td>
                        <label className="sr-only" htmlFor={"bus-" + driver.uid}>
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
                          <button
                            className="primary"
                            disabled={busy || !selected}
                            onClick={() => void save(driver, true)}
                          >
                            <UserCheck size={16} />
                            {driver.enabled ? "Save assignment" : "Approve"}
                          </button>
                          {driver.enabled && (
                            <button
                              className="secondary"
                              disabled={busy}
                              onClick={() => void save(driver, false)}
                            >
                              <UserX size={16} />
                              Disable
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No driver accounts are waiting for review.</Empty>
        )}

        {message && <p className="driver-message" role="status">{message}</p>}
      </section>
    </>
  );
}
