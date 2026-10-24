import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { spawnSync } from "node:child_process";
const guard = resolve(process.cwd(), "scripts/deployment-guard.mjs");
function check(
  project: string | undefined,
  environment: string,
  manifestEnvironment: string,
  manifestProject: string,
) {
  const directory = mkdtempSync(join(tmpdir(), "ccs-deploy-guard-"));
  try {
    const dist = environment === "production" ? "dist" : "dist-staging";
    mkdirSync(join(directory, dist));
    writeFileSync(
      join(directory, dist, "deployment.json"),
      JSON.stringify({
        environment: manifestEnvironment,
        projectId: manifestProject,
        site: manifestProject,
      }),
    );
    writeFileSync(
      join(
        directory,
        environment === "production"
          ? "firebase.json"
          : "firebase.staging.json",
      ),
      JSON.stringify({ hosting: { site: manifestProject, public: dist } }),
    );
    const env = { ...process.env };
    delete env.GCLOUD_PROJECT;
    if (project) env.GCLOUD_PROJECT = project;
    return spawnSync(process.execPath, [guard, environment, "hosting"], {
      cwd: directory,
      env,
      encoding: "utf8",
    }).status;
  } finally {
    if (
      resolve(directory).startsWith(
        resolve(tmpdir()) + "\\ccs-deploy-guard-",
      ) ||
      resolve(directory).startsWith(resolve(tmpdir()) + "/ccs-deploy-guard-")
    )
      rmSync(directory, { recursive: true });
  }
}
describe("deployment target guard (no Firebase/network calls)", () => {
  it("allows matching production artifacts", () =>
    expect(
      check("chsbusapp", "production", "production", "chsbusapp"),
    ).toBe(0));
  it("allows matching staging artifacts", () =>
    expect(
      check("ccs-synthetic-stage", "staging", "staging", "ccs-synthetic-stage"),
    ).toBe(0));
  it("rejects staging code destined for production", () =>
    expect(
      check("chsbusapp", "production", "staging", "ccs-synthetic-stage"),
    ).not.toBe(0));
  it("rejects production code destined for staging", () =>
    expect(
      check("ccs-synthetic-stage", "staging", "production", "chsbusapp"),
    ).not.toBe(0));
  it("rejects staging command targeting production", () =>
    expect(
      check("chsbustracker2", "staging", "staging", "chsbustracker2"),
    ).not.toBe(0));
  it("requires an explicit Firebase project", () =>
    expect(
      check(undefined, "production", "production", "chsbusapp"),
    ).not.toBe(0));
});
