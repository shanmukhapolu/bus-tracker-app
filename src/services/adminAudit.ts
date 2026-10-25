import type { FirebaseRuntime } from "../config/firebase";

// Realtime Database rules authorize individual records, not writes made against
// the database root. Write each explicitly authorized path, then append audit.
// These writes are necessarily sequential; errors identify possible partial saves.
export async function auditedAdminUpdate(
  runtime: FirebaseRuntime,
  action: string,
  resource: string,
  updates: Record<string, unknown>,
) {
  const user = runtime.auth.currentUser;
  if (!user) throw new Error("Administrator sign-in is required.");

  const entries = Object.entries(updates);
  if (!entries.length) {
    throw new Error("No database records were provided for this admin change.");
  }

  for (const [path] of entries) {
    const segments = path.split("/");
    if (
      !path ||
      path.startsWith("/") ||
      segments.some(
        (segment) =>
          !segment || /[.#$\[\]\u0000-\u001f\u007f]/.test(segment),
      )
    ) {
      throw new Error("Admin writes must target a valid, specific database path.");
    }
  }

  // When replacing a bus driver, clear the previous assignment before assigning
  // the new driver so a failed second write does not leave two assigned drivers.
  entries.sort(([pathA, valueA], [pathB, valueB]) => {
    const aClearsAssignment = pathA.endsWith("/assignedBus") && valueA === "";
    const bClearsAssignment = pathB.endsWith("/assignedBus") && valueB === "";
    return Number(bClearsAssignment) - Number(aClearsAssignment);
  });

  const completedPaths: string[] = [];
  for (const [path, value] of entries) {
    try {
      await runtime.set(runtime.ref(runtime.db, path), value);
      completedPaths.push(path);
    } catch (error) {
      if (!completedPaths.length) throw error;
      const original =
        error instanceof Error ? error.message : "Unknown database error";
      throw new Error(
        `Admin update stopped at "${path}" after saving ${completedPaths.length} record(s). Refresh the page and verify the records before retrying. Firebase reported: ${original}`,
      );
    }
  }

  const auditPath = "auditLogs/" + crypto.randomUUID();
  try {
    await runtime.set(runtime.ref(runtime.db, auditPath), {
      actorUid: user.uid,
      ...(user.email ? { actorEmail: user.email } : {}),
      action,
      resource,
      timestamp: runtime.serverTimestamp(),
      result: "success",
    });
  } catch (error) {
    const original =
      error instanceof Error ? error.message : "Unknown database error";
    throw new Error(
      `The admin change was saved, but its audit record could not be saved. Refresh the page and verify the change. Firebase reported: ${original}`,
    );
  }
}
