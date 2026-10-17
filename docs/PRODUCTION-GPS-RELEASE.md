# Approved production GPS release — October 16, 2026

Status: **deployed and automated checks passed; physical-phone operational acceptance is pending**. The user explicitly approved production rules followed by public/driver Hosting, and will test GPS using iPhone Chrome. Do not change driver assignments or bus registration records for this test.

## Released

- Project: `chsbustracker2`.
- Public/driver Hosting version: `aa2769eec38bb833`, released 2026-10-17 00:23:03Z (October 16, 8:23 PM EDT).
- Public source: `34689ddf1b5dba64499cdabdec87f92445d976aa`, branch `dev/spark-gps-release`.
- Canonical rules source: `3e1326f12bfa2acaefc3a73442449a371a3a82c1`, admin branch `dev/spark-security-remediation`.
- Deployed normalized rules SHA-256: `d9ae28f65a1dd94cdc71f9c9643f9a3a2a34d3ca7e7c1e66700076fdfe0777a6`.
- Admin Hosting remains `52e075ccb3d2fb6e`; it was not deployed.
- No Cloud Run, Functions, routing, onboarding, design, billing, authentication-provider or driver-assignment changes.
- GitHub production branches were not merged/updated. Use the exact reviewed development commits above when maintaining this deployed release.

## Preflight and backup

There were zero active locks and zero active private/public bus records before deployment. Fresh encrypted production database/rules/release backup: `%LOCALAPPDATA%\CCSBusTracker\security-backups\2026-10-17T00-21-16.182Z`. The Windows DPAPI CurrentUser encryption/decryption round trip and hashes passed. This remains a same-user/profile recovery backup, not an independent off-device disaster-recovery solution.

The former public Hosting version was `dd3e951a56fd1a1c`. The approved fallback is the production-configured compatibility bundle from `da8423f9a2e0fe604d519e5c553151d1db28fcfb` on `dev/spark-legacy-compat`; its source matched the strict-rule test fixture and its nine artifact hashes were verified. Do not use the old timestamp-free production version or a staging-configured bundle as fallback. Keep strict rules during rollback; no rollback was needed.

## Verified after deployment

- Live rules match the tested canonical rules exactly after JSON normalization.
- All nine live public Hosting files match the tested production build.
- Driver page returned HTTP 200; CSP, frame protection, MIME protection, referrer policy, permissions policy and no-cache HTML headers are present.
- Anonymous reads of drivers, admins, live private telemetry, trips, safety events, incident evidence, audits and tracking locks returned HTTP 401.
- Public buses are readable and contain only allowlisted sanitized fields.
- An anonymous conditional no-op GPS-field write returned HTTP 401. The probe wrote no simulated location and did not change any record.
- The database root ETag still matched the pre-deployment backup after checks. Buses, driver/admin records, assignments, devices, geofences, history, safety/incident evidence and existing audits were preserved. No audit entry was removed or added by these read-only checks.
- Public map loaded and displayed the three registered buses, all stopped; driver and admin sign-in pages loaded. No authenticated production browser session was available in the review browser, so these page checks do not count as successful driver/admin login tests.
- The 28 GPS security/transition emulator tests passed again after readback verified that their rules are the deployed rules. Full pre-release verification had 218 passing tests and zero failures, including two hosted client scenarios and 188-bus local benchmarks.

## Explicit remaining acceptance checks

The user will test the existing Bus 12 assignment using their authorized production driver account on iPhone Chrome. No accounts, passwords or assignments were changed or copied from staging.

1. Reload https://chsbustracker2.web.app/drivers, sign in, verify Bus 12 is offered, and Start Tracking.
2. Keep the page visible and walk a short safe distance. Check advancing position and capture times on https://chsbustracker2.web.app and https://chsbustracker2-admin.web.app/map. One-second uploads depend on fresh device location callbacks; they are not fabricated when the phone has no new fix.
3. Stop Tracking and verify both live projections become inactive and the lock clears.
4. Test network loss/reconnection. A session ended by disconnect must not silently reclaim a bus; Stop/restart explicitly if prompted.
5. Report any error without sending passwords. Screen lock, app switching and sustained background tracking remain unverified; browser background execution is not guaranteed.

Authenticated stale/altered-duplicate rejection, disabled-driver handling and lock handover passed the staging/emulator tests. They were not re-probed using a real production driver's credentials or fabricated production GPS. Exact unchanged duplicate retries are deliberately idempotent and may succeed; altered duplicates and older captures must be rejected. Do not describe all duplicates as rejected.

No critical post-deployment failure was found. Deployment integrity and anonymous security boundaries passed, but end-to-end phone tracking and authenticated admin/driver operation must not be reported as confirmed until the user completes those checks. The known UID-based multi-device lock limitation and client-asserted GPS trust limits remain as documented in FINAL-PRODUCTION-REVIEW.md. This is not a claim of full school-district compliance.
