import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.K_SERVICE || process.argv.length !== 2)
  throw Error("Local synthetic emulator benchmark only; no credentials or target overrides allowed.");
const cli = process.env.FIREBASE_CLI_PATH;
if (!cli || !existsSync(cli)) throw Error("Set FIREBASE_CLI_PATH to your installed firebase-tools/lib/bin/firebase.js.");
let failed = false;
for (const variant of ["before", "after"]) for (const history of [0, 100]) {
  const code = await new Promise(resolve => {
    const child = spawn(process.execPath, [cli, "emulators:exec", "--config", "firebase.spark-emulators.json", "--project", "demo-ccs-staging", "--only", "database", "node node_modules/vitest/vitest.mjs run --config spark.config.ts scripts/spark/load.test.ts"], {
      stdio: "inherit", windowsHide: true,
      env: { ...process.env, JAVA_TOOL_OPTIONS: "-Xms256m -Xmx8g -XX:+UseG1GC", RUN_SPARK_LOAD: "1", SPARK_VARIANT: variant, SPARK_HISTORY_MB: String(history) },
    });
    child.on("error", () => resolve(1)); child.on("exit", resolve);
  });
  if (code !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
