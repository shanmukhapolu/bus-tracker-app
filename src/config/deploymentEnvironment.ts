export function resolveFirebaseEnvironment(
  env: Record<string, unknown>,
  mode: string,
  app: "public" | "admin",
) {
  const production = "chsbustracker2";
  const isProduction = mode === "production";
  if (mode === "test")
    return {
      environment: "test",
      hostingSite: "demo-ccs-tests",
      config: {
        apiKey: "synthetic-test-key",
        projectId: "demo-ccs-tests",
        authDomain: "demo-ccs-tests.firebaseapp.com",
        databaseURL: "http://127.0.0.1:9000?ns=demo-ccs-tests",
        appId: "1:1:web:synthetic",
      },
    };
  const value = (key: string, fallback = "") =>
    String(env[key] ?? fallback).trim();
  if (isProduction && value("VITE_ENVIRONMENT") === "staging")
    throw new Error("Staging settings cannot be bundled as production.");
  const projectId = value(
    "VITE_FIREBASE_PROJECT_ID",
    isProduction ? production : "",
  );
  if (
    isProduction
      ? projectId !== production
      : !projectId || projectId === production || projectId.startsWith("demo-")
  )
    throw new Error(
      "Firebase project does not match the build environment. Configure a separate staging project in .env.staging.local.",
    );
  if (!isProduction && value("VITE_ENVIRONMENT") !== "staging")
    throw new Error(
      "Development requires explicit VITE_ENVIRONMENT=staging. Production fallback is forbidden.",
    );
  const config = {
    projectId,
    apiKey: value(
      "VITE_FIREBASE_API_KEY",
      isProduction ? "AIzaSyCmAOZY6xyCtXDh8nu8qdG4YcAd4_hiz0k" : "",
    ),
    authDomain: value(
      "VITE_FIREBASE_AUTH_DOMAIN",
      isProduction ? production + ".firebaseapp.com" : "",
    ),
    databaseURL: value(
      "VITE_FIREBASE_DATABASE_URL",
      isProduction
        ? "https://" + production + "-default-rtdb.firebaseio.com"
        : "",
    ),
    appId: value(
      "VITE_FIREBASE_APP_ID",
      isProduction
        ? app === "admin"
          ? "1:343059758295:web:a0463669dccc13cba0c492"
          : "1:343059758295:web:0ac65d6cf2ddb389a0c492"
        : "",
    ),
  };
  if (Object.values(config).some((v) => !v))
    throw new Error(
      "Missing Firebase environment configuration. No fallback is allowed for staging.",
    );
  if (config.authDomain !== projectId + ".firebaseapp.com")
    throw new Error("Auth domain must belong to the selected project.");
  const url = new URL(config.databaseURL);
  const validHost =
    url.hostname === projectId + "-default-rtdb.firebaseio.com" ||
    new RegExp(
      "^" + projectId + "-default-rtdb\\.[a-z0-9-]+\\.firebasedatabase\\.app$",
    ).test(url.hostname);
  if (
    !/^[a-z][a-z0-9-]{4,29}$/.test(projectId) ||
    !validHost ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  )
    throw new Error(
      "Database URL must be the selected project’s HTTPS default database.",
    );
  if (
    !isProduction &&
    (config.apiKey === "AIzaSyCmAOZY6xyCtXDh8nu8qdG4YcAd4_hiz0k" ||
      config.appId.startsWith("1:343059758295:"))
  )
    throw new Error(
      "Production Firebase app credentials cannot be used in staging.",
    );
  if (!isProduction && value("VITE_TELEMETRY_MODE", "legacy") !== "legacy")
    throw new Error(
      "Staging currently requires legacy Firebase telemetry; production backend URLs are forbidden.",
    );
  const hostingSite = isProduction
    ? app === "admin"
      ? production + "-admin"
      : production
    : value("VITE_FIREBASE_HOSTING_SITE");
  if (
    !hostingSite ||
    (!isProduction &&
      (!hostingSite.startsWith(projectId) ||
        [production, production + "-admin"].includes(hostingSite)))
  )
    throw new Error(
      "Configure a staging Hosting site belonging to the staging project.",
    );
  return {
    environment: isProduction ? "production" : "staging",
    config,
    hostingSite,
  };
}
