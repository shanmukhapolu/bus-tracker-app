export function emulatorOnly() {
  if (
    process.env.GCLOUD_PROJECT !== "demo-ccs-staging" ||
    process.env.FIREBASE_DATABASE_EMULATOR_HOST !== "127.0.0.1:9000" ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.K_SERVICE
  )
    throw Error(
      "Spark tests require demo-ccs-staging on loopback; cloud targets forbidden.",
    );
}
