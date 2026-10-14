import type { FirebaseRuntime } from "../config/firebase";

// Legacy admin mutations use the same private append-only audit contract.
// A required audit failure rolls back the mutation, rather than failing later.
export async function auditedAdminUpdate(
  runtime: FirebaseRuntime,
  action: string,
  resource: string,
  updates: Record<string, unknown>,
) {
  const user = runtime.auth.currentUser;
  if (!user) throw new Error("Administrator sign-in is required.");
  await runtime.update(runtime.ref(runtime.db, ""), {
    ...updates,
    ["auditLogs/" + crypto.randomUUID()]: {
      actorUid: user.uid,
      ...(user.email ? { actorEmail: user.email } : {}),
      action,
      resource,
      timestamp: runtime.serverTimestamp(),
      result: "success",
    },
  });
}
