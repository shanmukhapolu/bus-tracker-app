// Generates LOCAL configuration only; does not call a cloud API or create resources.
import fs from "node:fs";
import { loadEnv } from "vite";
const env = loadEnv("staging", process.cwd(), "VITE_");
const project = env.VITE_FIREBASE_PROJECT_ID,
  site = env.VITE_FIREBASE_HOSTING_SITE;
if (
  env.VITE_ENVIRONMENT !== "staging" ||
  !project ||
  project === "chsbustracker2" ||
  !site?.startsWith(project) ||
  ["chsbustracker2", "chsbustracker2-admin"].includes(site)
)
  throw Error(
    "Configure a separate project and site in .env.staging.local first.",
  );
const config = JSON.parse(fs.readFileSync("firebase.json", "utf8"));
config.hosting.site = site;
config.hosting.public = "dist-staging";
// Old admin bookmarks must stay within the selected environment.
for (const redirect of config.hosting.redirects ?? []) {
  const destination = new URL(redirect.destination);
  if (destination.origin !== "https://chsbustracker2-admin.web.app")
    throw Error("Unexpected legacy admin redirect destination.");
  destination.hostname = project + "-admin.web.app";
  redirect.destination = destination.toString();
}
for (const entry of config.hosting.headers ?? [])
  for (const header of entry.headers ?? []) {
    header.value = header.value.replaceAll(
      "chsbustracker2.firebaseapp.com",
      project + ".firebaseapp.com",
    );
  }
config.hosting.predeploy = [
  "node scripts/deployment-guard.mjs staging hosting",
];
if (config.database)
  config.database.predeploy = [
    "node scripts/deployment-guard.mjs staging database",
  ];
fs.writeFileSync(
  "firebase.staging.json",
  JSON.stringify(config, null, 2) + "\n",
);
console.log(
  "Local staging configuration written. No cloud resources were created.",
);
