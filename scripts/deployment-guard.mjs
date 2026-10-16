import fs from "node:fs";
const [environment, target = "hosting"] = process.argv.slice(2);
const project = process.env.GCLOUD_PROJECT;
if (!project || !["production", "staging"].includes(environment))
  throw Error(
    "Run through Firebase CLI with an explicit project and environment.",
  );
if ((environment === "production") !== (project === "chsbustracker2"))
  throw Error("Deployment project/environment mismatch.");
if (environment === "staging") {
  const envFile = fs.readFileSync(".env.staging.local", "utf8");
  const match = envFile.match(/^VITE_FIREBASE_PROJECT_ID=(.+)$/m);
  if (!match || match[1].trim() !== project)
    throw Error(
      "Staging deployment must match the explicitly configured staging project.",
    );
}
if (target === "hosting") {
  const directory = environment === "production" ? "dist" : "dist-staging";
  const manifest = JSON.parse(
    fs.readFileSync(directory + "/deployment.json", "utf8"),
  );
  const config = JSON.parse(
    fs.readFileSync(
      environment === "production" ? "firebase.json" : "firebase.staging.json",
      "utf8",
    ),
  );
  if (
    manifest.projectId !== project ||
    manifest.environment !== environment ||
    manifest.site !== (config.hosting.site || project) ||
    config.hosting.public !== directory
  )
    throw Error(
      "Build manifest, Hosting site and target project must match. Build the intended environment first.",
    );
}
console.log("Deployment target guard passed: " + environment + " / " + target);
