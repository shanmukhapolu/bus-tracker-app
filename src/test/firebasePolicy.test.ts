import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const firebase = JSON.parse(readFileSync("firebase.json", "utf8"));

function policyHeader() {
  const entries = firebase.hosting.headers as Array<{
    source: string;
    headers: Array<{ key: string; value: string }>;
  }>;
  return entries
    .flatMap((entry) => entry.headers)
    .find((header) => header.key === "Content-Security-Policy")?.value ?? "";
}

describe("Firebase deployment and browser security policy", () => {
  it("keeps the signup script policy narrow and allows Firebase Auth reCAPTCHA", () => {
    const csp = policyHeader();
    expect(csp).toContain(
      "script-src 'self' https://www.gstatic.com https://apis.google.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/;",
    );
    expect(csp).toContain(
      "script-src-elem 'self' https://www.gstatic.com https://apis.google.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/",
    );
    expect(csp).toContain("https://www.google.com/recaptcha/");
    expect(csp).toContain("https://recaptcha.google.com/recaptcha/");
    expect(csp).not.toContain("googletagmanager.com");
    expect(csp).not.toContain("google-analytics.com");
    expect(csp).not.toContain("script-src *");
    expect(csp).not.toContain("script-src https:");
  });

  it("bundles Firebase SDK modules instead of relying on runtime CDN script requests", () => {
    const runtime = readFileSync("src/config/firebase.ts", "utf8");
    expect(runtime).toContain('from "firebase/app"');
    expect(runtime).toContain('from "firebase/auth"');
    expect(runtime).toContain('from "firebase/database"');
    expect(runtime).not.toContain('from "firebase/analytics"');
    expect(runtime).not.toContain("https://www.gstatic.com/firebasejs/");
  });

  it("declares Realtime Database rules and guards deployment to chsbusapp", () => {
    expect(firebase.database.rules).toBe("database.rules.json");
    expect(firebase.database.predeploy).toContain(
      "node scripts/deployment-guard.mjs production database",
    );
  });

  it("keeps Hosting deployment guarded and rewrites app routes to the SPA entry point", () => {
    expect(firebase.hosting.predeploy).toContain(
      "node scripts/deployment-guard.mjs production hosting",
    );
    expect(firebase.hosting.rewrites).toContainEqual({
      source: "**",
      destination: "/index.html",
    });
  });
});
