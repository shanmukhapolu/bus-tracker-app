# GPS capture and heartbeat release — October 18, 2026

The user explicitly approved publication to GitHub, staging and production. Production rules and both Hosting sites were released on October 18 at approximately 9:04 PM EDT. No billing or Cloud Run activation, routing, signup, driver assignment, or database-record changes were made.

## Sources and deployed versions

- Public/driver source: `4e23f370c0d8b4de78d7f45f6dab3338cc5f226d`, development branch `dev/spark-gps-release`.
- Admin/rules source: `f12faceac8a5fb1f064addf46ead958bcb8464a5`, development branch `dev/spark-security-remediation`.
- Production public/driver Hosting: `de3120668a21ef3f`.
- Production admin Hosting: `a9d23b7c382f6072`.
- Staging public/driver Hosting: `a4d5d772942d8559`; staging admin Hosting: `7af43356dadf1987`. Both were already current; exact file hashes matched the rebuilt staging artifacts, so no redundant release was necessary.
- Both environments' normalized rules SHA-256: `d244391b35875db5afed56863ccbf8505acb9bb32a8b3426c8edc62a044e72b8`.
- GitHub production branches remain unchanged. The development commits above identify the released sources.

## Changes promoted

The release includes the previously staging-tested separate tracker heartbeat/reports, corrected report timer cadence, recoverable GPS timeout handling, stable admin driver-account subscriptions and elapsed-time status, and the fresh-fix queue completion-race fix. Raw callback, timestamp and upload diagnostics and the watch-only comparison mode remain staging-only. Capture timestamps always remain those supplied by Geolocation; heartbeat/report timestamps never relabel an old capture as fresh.

Production's previous rules matched the canonical rules after removing only the new `trackerHeartbeats` subtree. That subtree permits only authorized assigned drivers owning the active tracking lock to report, requires server-time and schema validation, ties last-known location to acknowledged private telemetry, and permits reads only to authorized administrators. Existing GPS replay protections and other permissions are unchanged.

## Verification

All 247 local tests passed in this release run: 93 public application, 73 admin application, 31 GPS security/transition, 7 public rules, 24 admin rules, and 19 lifecycle/backfill/audit regressions. All four builds passed with existing large-map-bundle warnings. Secret scans found no publishable credentials; synthetic passwords remain only in the ignored local journal. Production and staging artifacts were checked by exact file hashes (9 public files and 6 admin files per environment).

Immediately before cutover there were zero production tracking locks and zero active private/public buses. Deployment order was canonical rules, admin Hosting, then public/driver Hosting. After deployment the complete database content hash still matched the encrypted backup. Nine protected paths rejected anonymous reads in each environment; public records contained only the established public-field allowlist. Driver and admin login URLs returned HTTP 200 with CSP, frame and MIME protections. No real account was used to generate synthetic production GPS.

The checker initially omitted the existing public `endedAt` field and failed its allowlist check. Inspection confirmed this lifecycle field was already permitted by unchanged public rules; correcting the checker resolved the failure without changing application code, rules or data.

## Backup and rollback

A fresh encrypted database/rules/release backup is stored outside Git at `%LOCALAPPDATA%/CCSBusTracker/security-backups/2026-10-19T01-02-27.905Z`. Windows DPAPI CurrentUser encryption/decryption round-trip passed. This is same-user/profile recovery protection, not independent off-device disaster recovery.

Previous production Hosting versions are public `aa2769eec38bb833` and admin `52e075ccb3d2fb6e`. The prior public version already used strict capturedAt-compatible GPS. The newly added heartbeat rules leave all prior rule subtrees unchanged, so those Hosting versions remain compatible if rollback is required. Keep the strict current rules; restore the recorded Hosting versions only after coordinating stopped sessions. A prior admin rollback loses heartbeat visibility but retains its previous functionality. Do not restore insecure timestamp-free rules or blindly import a database snapshot over newer records. No rollback was required.

## Acceptance limits

The physical phone A/B results are documented in GPS-CAPTURE-COMPARISON.md: all seven unique captures were uploaded in each test, but raw native watch callbacks had gaps up to approximately 14.6 seconds. This release does not guarantee one-Hz fresh physical capture, screen-lock/background tracking, or complete school-district compliance. Physical production Start/Stop, movement and reconnect acceptance after this release remains for the operator; staging and emulator tests are not substitutes for that phone check.
