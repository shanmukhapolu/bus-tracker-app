const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2/options");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getDatabase, ref, get, update } = require("firebase-admin/database");

initializeApp();
setGlobalOptions({ region: "us-central1" });

async function requireAdmin(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Administrator sign-in is required.");
  }

  const adminSnapshot = await get(
    ref(getDatabase(), `admins/${request.auth.uid}`),
  );
  const profile = adminSnapshot.val();

  if (
    !profile ||
    profile.role !== "admin" ||
    profile.enabled !== true
  ) {
    throw new HttpsError("permission-denied", "Administrator access is required.");
  }
}

exports.deleteDriver = onCall(async (request) => {
  await requireAdmin(request);

  const uid = typeof request.data?.uid === "string" ? request.data.uid.trim() : "";

  if (!uid || !/^[A-Za-z0-9_-]{10,128}$/.test(uid)) {
    throw new HttpsError("invalid-argument", "A valid driver account is required.");
  }

  if (uid === request.auth.uid) {
    throw new HttpsError("failed-precondition", "An administrator cannot delete their own account from the driver portal.");
  }

  const database = getDatabase();
  const driverRef = ref(database, `drivers/${uid}`);
  const driverSnapshot = await get(driverRef);

  if (!driverSnapshot.exists()) {
    throw new HttpsError("not-found", "Driver account record was not found.");
  }

  const driver = driverSnapshot.val() || {};
  const assignedBus =
    driver.assignedBus === null || driver.assignedBus === undefined
      ? ""
      : String(driver.assignedBus).trim();

  if (assignedBus) {
    const activeDriverSnapshot = await get(
      ref(database, `activeDrivers/${assignedBus}`),
    );
    const liveSnapshot = await get(
      ref(database, `liveBuses/${assignedBus}`),
    );
    const activeDriverUid = activeDriverSnapshot.val();
    const live = liveSnapshot.val();

    if (
      activeDriverUid === uid ||
      (live && live.active === true && live.driverUid === uid)
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Stop tracking for this driver before deleting the account.",
      );
    }
  }

  // Remove the database record and any stale lock owned by this driver.
  const updates = {
    [`drivers/${uid}`]: null,
  };

  if (assignedBus) {
    const activeDriverSnapshot = await get(
      ref(database, `activeDrivers/${assignedBus}`),
    );

    if (activeDriverSnapshot.val() === uid) {
      updates[`activeDrivers/${assignedBus}`] = null;
    }
  }

  await update(ref(database), updates);

  try {
    await getAuth().deleteUser(uid);
  } catch (error) {
    // Best-effort restoration if authentication deletion fails.
    try {
      await update(ref(database), {
        [`drivers/${uid}`]: driver,
      });
    } catch {
      // The original database record is already unavailable; surface the
      // authentication failure to the administrator.
    }

    if (error && error.code === "auth/user-not-found") {
      return { success: true, authAccountAlreadyMissing: true };
    }

    throw new HttpsError(
      "internal",
      "The driver record was removed, but the authentication account could not be deleted.",
    );
  }

  return { success: true };
});
