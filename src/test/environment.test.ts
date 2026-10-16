import { describe, it, expect } from "vitest";
import { resolveFirebaseEnvironment } from "../config/deploymentEnvironment";
const stage = {
  VITE_ENVIRONMENT: "staging",
  VITE_FIREBASE_PROJECT_ID: "ccs-synthetic-stage",
  VITE_FIREBASE_AUTH_DOMAIN: "ccs-synthetic-stage.firebaseapp.com",
  VITE_FIREBASE_DATABASE_URL:
    "https://ccs-synthetic-stage-default-rtdb.firebaseio.com",
  VITE_FIREBASE_API_KEY: "synthetic-stage-key",
  VITE_FIREBASE_APP_ID: "1:111:web:synthetic",
  VITE_FIREBASE_HOSTING_SITE: "ccs-synthetic-stage-admin",
};
describe("environment isolation", () => {
  it("rejects development without explicit staging config", () =>
    expect(() =>
      resolveFirebaseEnvironment({}, "development", "admin"),
    ).toThrow());
  it("accepts a fully separate project", () =>
    expect(
      resolveFirebaseEnvironment(stage, "staging", "admin").config.projectId,
    ).toBe("ccs-synthetic-stage"));
  it.each([
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_DATABASE_URL",
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_APP_ID",
    "VITE_FIREBASE_HOSTING_SITE",
  ])("rejects missing %s", (key) =>
    expect(() =>
      resolveFirebaseEnvironment({ ...stage, [key]: "" }, "staging", "admin"),
    ).toThrow(),
  );
  it.each([
    { VITE_FIREBASE_PROJECT_ID: "chsbustracker2" },
    { VITE_FIREBASE_AUTH_DOMAIN: "chsbustracker2.firebaseapp.com" },
    {
      VITE_FIREBASE_DATABASE_URL:
        "https://chsbustracker2-default-rtdb.firebaseio.com",
    },
    { VITE_FIREBASE_APP_ID: "1:343059758295:web:example" },
    { VITE_FIREBASE_API_KEY: "AIzaSyCmAOZY6xyCtXDh8nu8qdG4YcAd4_hiz0k" },
    { VITE_TELEMETRY_MODE: "backend" },
  ])("rejects mixed production settings %j", (changes) =>
    expect(() =>
      resolveFirebaseEnvironment({ ...stage, ...changes }, "staging", "admin"),
    ).toThrow(),
  );
  it("refuses a staging project in a production build", () =>
    expect(() =>
      resolveFirebaseEnvironment(stage, "production", "admin"),
    ).toThrow());
  it("uses loopback/demo identifiers for tests regardless of supplied credentials", () =>
    expect(
      resolveFirebaseEnvironment(
        { VITE_FIREBASE_PROJECT_ID: "chsbustracker2" },
        "test",
        "admin",
      ).config.databaseURL,
    ).toContain("127.0.0.1"));
});

it("allows the proposed staging project without accepting production", () => {
  const project = "chsbustracker2-staging";
  expect(
    resolveFirebaseEnvironment(
      {
        ...stage,
        VITE_FIREBASE_PROJECT_ID: project,
        VITE_FIREBASE_AUTH_DOMAIN: project + ".firebaseapp.com",
        VITE_FIREBASE_DATABASE_URL:
          "https://" + project + "-default-rtdb.firebaseio.com",
        VITE_FIREBASE_HOSTING_SITE: project + "-admin",
      },
      "staging",
      "admin",
    ).config.projectId,
  ).toBe(project);

});
