export function resolveFirebaseEnvironment(
  env: Record<string, unknown>,
  mode: string,
  app: "public" | "admin",
) {
  const production = "chsbusapp";
  const previousProduction = "chsbustracker2";
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
      : !projectId || projectId === production || projectId === previousProduction || projectId.startsWith("demo-")
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
      isProduction ? "AIzaSyBhAuYpVr2CT4t-Qmt8uAwf7tmIon2H0KY" : "",
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
      isProduction ? "1:1047681628698:web:6c9c9d51517617f24cafa3" : "",
    ),
    storageBucket: value(
      "VITE_FIREBASE_STORAGE_BUCKET",
      isProduction ? "chsbusapp.firebasestorage.app" : "",
    ),
    messagingSenderId: value(
      "VITE_FIREBASE_MESSAGING_SENDER_ID",
      isProduction ? "1047681628698" : "",
    ),
    measurementId: value(
      "VITE_FIREBASE_MEASUREMENT_ID",
      isProduction ? "G-BNL3ZXYPNV" : "",
    ),
  };
  if ([config.projectId, config.apiKey, config.authDomain, config.databaseURL, config.appId].some((v) => !v))
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
    (config.apiKey === "AIzaSyBhAuYpVr2CT4t-Qmt8uAwf7tmIon2H0KY" ||
      config.apiKey === "AIzaSyCmAOZY6xyCtXDh8nu8qdG4YcAd4_hiz0k" ||
      config.appId.startsWith("1:1047681628698:") ||
      config.appId.startsWith("1:343059758295:") ||
      config.storageBucket === "chsbusapp.firebasestorage.app" ||
      config.storageBucket === "chsbustracker2.firebasestorage.app" ||
      config.messagingSenderId === "1047681628698" ||
      config.messagingSenderId === "343059758295" ||
      config.measurementId === "G-BNL3ZXYPNV" ||
      config.measurementId === "G-R4GTR1CDC3" ||
      config.authDomain === "chsbusapp.firebaseapp.com" ||
      config.authDomain === "chsbustracker2.firebaseapp.com" ||
      config.databaseURL.includes("chsbusapp-default-rtdb") ||
      config.databaseURL.includes("chsbustracker2-default-rtdb")
    )
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
        hostingSite.startsWith(production) ||
        hostingSite.startsWith(previousProduction)))
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
