# Staging security verification — approval packet

Date: October 16, 2026. Scope: `chsbustracker2-staging` only. **No deployment is authorized by this document.** Production branches, production Firebase and billing remain unchanged.

## Preparation completed

- Reviewed the canonical rules and both client implementations. Rules SHA-256: `cb6e857178b6c879043b20a09978b9122d0b77cf0af42b7db386734bf793b344`. The public emulator fixture is byte-identical. Only six live/public telemetry rule expressions differ from the admin baseline; read permissions, geofences, bus lifecycle, incident/history and audit rules are unchanged.
- Reran all local release suites: **213 passed, 0 failed** (60 public unit, 8 diagnostic, 67 admin unit/guard, 28 GPS/transition, 7 public rules, 24 admin rules, 19 Phase 2 regressions).
- Rebuilt optimized public staging/production bundles, the legacy compatibility client, and admin. All passed; existing bundle-size warnings remain.
- Optimized staging build identifies project/site `chsbustracker2-staging`. Main JavaScript SHA-256: `7ad31895159368947ac1856a3deae575ff92ae195a6ccd0a02da1c8969fc9b9f`.
- Preserved the validated staging-only client bundle locally in ignored `.security.local/staging-compatible-rollback-20261016.zip`; archive SHA-256 `0ed102eaa40c2b2fe2993f21773d75281f5cf8f10f5b277d939d9df880b7b457`.
- The repository owner has confirmed no automatic deployment integrations, as reported by the user. This resolves the earlier integration uncertainty. Development-only commits/push preparation may proceed; this preparation does not alter a production branch or deploy Firebase.

## Live baseline and backup gate

Fresh authorized login succeeded. Read-only staging capture completed at **2026-10-16 22:59:06 UTC (6:59 PM EDT)**. The complete database/rules/release bundle was encrypted and verified by an in-memory decryption round-trip; no cloud data or rules were changed.

- 20 synthetic buses; zero active tracking locks.
- Current public/driver Hosting version: `996c5371f0545dd4` (released 22:02:34 UTC).
- Current admin Hosting version: `685de4fb1b953958` (released October 14, 20:04:00 UTC).
- Deployed rules normalized SHA-256: `d112469de4b7aba2a2846d830fdea2cf4969f1a6b8339e67bfd08cbefe91b2b9`. These are the current staging rules, not the stricter candidate awaiting approval.
- Encrypted backup: `%LOCALAPPDATA%/CCSBusTracker/security-backups/2026-10-16T22-59-06.456Z/chsbustracker2-staging.dpapi` (152,182 bytes), with a metadata-only `manifest.json` alongside it.
- Encrypted SHA-256: `647259a1dd4c94a82fc5982a20250536fe02e0c13b7b5d1a2ac68a4a8b81ff63`.

Recheck for new sessions, data changes and release/rules drift immediately before deployment; refresh the backup if needed. Production was not accessed by this backup helper.

The prepared read-only backup helper is pinned to `chsbustracker2-staging`, validates the project and database endpoint, rejects non-synthetic bus identifiers, and does not issue any cloud write. It reads a coherent RTDB snapshot with ETag, rules before/after to detect drift, and both staging Hosting release lists. The full bundle is encrypted with Windows DPAPI CurrentUser, decrypted in memory to verify equality, and saved outside Git and OneDrive under `%LOCALAPPDATA%/CCSBusTracker/security-backups/`. Metadata records hashes and sizes only. The encryption round-trip was tested locally with synthetic input.

This backup requires the same Windows account/profile for recovery and is not an off-device disaster-recovery copy. No Firebase Authentication account export or auth changes are planned. Never print or commit the database export, CLI tokens or test passwords.

Before deployment, require: verified encrypted backup, recorded fresh Hosting version IDs/rules hash, zero active staging locks, no unexpected data or rules drift, and explicit user approval of the sequence below. If any gate fails, stop.

## Exact proposed deployment order

1. **Quiesce staging.** Stop synthetic simulators and driver tracking normally. Close old driver tabs. Confirm tracking locks are empty; preserve records. Capture/verify the fresh backup and release inventory. Record the two stage Hosting releases as rollback references. No production requests or writes.
2. **Confirm the rollback client.** Verify the saved bundle manifest and hash and the current staged client version. The saved optimized client has passed the strict emulator rules. Do not use a timestamp-free old bundle as fallback.
3. **Install canonical rules first.** In the isolated admin checkout, only after approval:

   ```powershell
   $env:CONFIRM_STAGING_SECURITY_RELEASE="chsbustracker2-staging"
   npx.cmd --yes firebase-tools@15.31.0 deploy --config firebase.security-staging.json --only database --project chsbustracker2-staging
   ```

   This manifest contains no Hosting target; its guard rejects production and missing confirmation. Read back the rules and compare the reviewed semantic hash. If readback differs, stop before starting drivers.
4. **Release the pinned public/driver staging build.** In the isolated public checkout, revalidate `dist-staging/deployment.json` and its asset hashes, then:

   ```powershell
   npx.cmd --yes firebase-tools@15.31.0 deploy --config firebase.staging.json --only hosting --project chsbustracker2-staging
   ```

   Only site `chsbustracker2-staging` is targeted; the driver portal is `/drivers` on the same site. The admin Hosting site is not redeployed. Record the new release ID and retrieve the public manifest/asset hashes. Any predeploy-guard rejection stops the release; do not bypass it.
5. **Transition and verify.** Open the hosted public, driver and admin staging sites. Reload drivers and explicitly restart assigned synthetic sessions. Execute the full checklist below against the freshly installed rules. Run the local security suites again after any corrective code/rule change. Retain the backup and results.
6. **Stop for review.** Report results and remaining issues. No production deployment follows automatically, even if staging passes. Obtain separate production approval.

## Verification checklist and acceptance criteria

- Run both client services with synthetic staging accounts: each must deliver 60 distinct one-second captures to public/admin listeners. No real driver credentials or full-fleet hosted load test.
- Authorized assigned driver succeeds. Anonymous, wrong-bus, disabled-driver, forged identity, missing/replaced-lock and malformed uploads fail.
- Older timestamps and altered duplicates fail. **An exact unchanged retry is intentionally idempotent and may succeed**; it must not create a different position or duplicate a history record. Do not report every duplicate as rejected.
- Missing/future/expired capture times fail. Deleting a live record or driver public projection, dropping `capturedAt`, and replacing public coordinates independently must fail.
- Compare public/private bus identity, position, capture time and accuracy after each accepted fix; public data must not gain driver identity, private speed or protected evidence.
- Disconnect closes both projections and releases only the owning lock. Reconnect requires explicit restart when the lock was lost; another authorized driver can use the bus. No stale upload may resume under a replacement lock.
- A cached timestamp-free client must fail before and after the first upgraded upload. It cannot erase the watermark or resume after reconnect. Demonstrate stop/close/reload/start from the older UI, without weakening rules. UID-only locks still require closing all old tabs using the same account.
- Browser checks: public bus list/search/map and offline state; driver login/start/stop/error display; admin overview/live map/bus details, drivers, lifecycle actions, geofences, safety/trip/device pages. Read populated and empty states; distinguish permission errors from empty data. All writes use synthetic fixtures only.
- Verify audits for the intentional administrative test actions. Hash untouched history/safety/incident/geofence/device records before/after; only expected test records may change. Do not copy protected records to public paths.
- If a hosted security denial unexpectedly succeeds, or client/UI functionality breaks, stop the test and keep the release blocked. Record the specific failure rather than marking the checklist complete.

## Rollback and failure handling

1. Stop synthetic tracking and the rollout; preserve errors, current records and audit evidence. Admin Hosting remains at its recorded version because it is not part of this deployment.
2. Keep the strict rules. Restore/redeploy the saved, hash-verified `capturedAt`-compatible staging client bundle, or roll Hosting back to verified compatible staging version `996c5371f0545dd4`. The unchanged admin baseline is `685de4fb1b953958`. Do not restore the old timestamp-free client or known-vulnerable rules.
3. If rules themselves prevent authorized use, pause tracking and fix forward locally, rerun security tests and request approval for the correction. No broad allow rule, optional timestamp bypass or production fallback.
4. Database data should not need rollback: the release changes rules/assets, not schema/history. The encrypted backup is for investigation and scoped repair. Never overwrite the entire database with an old snapshot, because it would erase later telemetry/audit records. Any necessary repair requires a separate reviewed plan using current timestamps and synthetic staging data only.
5. Read back asset/rule hashes and rerun the smoke checks after recovery. Report the release as failed/blocked until the acceptance criteria pass.

## Remaining limitations

The new rule rollout has not yet been tested on hosted staging. Device GPS/timestamps remain client assertions; UID-only locks do not distinguish two tabs sharing one account. Browser background tracking and physical-device recovery require manual testing. Log coverage remains incomplete for the earlier incident. Staging success supports a controlled production approval request; it does not establish school-district legal/privacy/accessibility compliance.
