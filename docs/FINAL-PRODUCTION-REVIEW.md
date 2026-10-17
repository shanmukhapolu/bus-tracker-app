# Final production release review — October 16, 2026 (EDT)

**Decision: NO-GO for production deployment today; the code candidate passes automated verification.** Real-phone acceptance has not been confirmed, and a no-tracking maintenance window has not been agreed. Development-branch publication is authorized after secret scanning. Production deployment remains expressly unapproved.

This is a release review of the Spark GPS optimization and security compatibility changes, not certification for school-district use. No production writes, rules deployments, Hosting deployments, billing changes, routing changes, or signup changes were made during this review.

## Scope and exact live status

| Component | Live version / baseline | Proposed action |
| --- | --- | --- |
| Production public/driver Hosting | `dd3e951a56fd1a1c` | Publish optimized production bundle only after approval |
| Production admin Hosting | `52e075ccb3d2fb6e` | Leave unchanged |
| Production RTDB rules | normalized SHA-256 `07f5a0699c9d3d8593da099a5be1c33e2ee4d31306da4e663b265a1ac077411b` | Replace with verified strict GPS rules from the admin repository |
| Staging public/driver Hosting | `37748bd51713005b` | Already deployed; all nine hosted files match the newly rebuilt staging artifact |
| Staging admin Hosting | `685de4fb1b953958` | Unchanged and working |
| Intended/staging RTDB rules | normalized SHA-256 `d9ae28f65a1dd94cdc71f9c9643f9a3a2a34d3ca7e7c1e66700076fdfe0777a6` | Matches canonical admin rules and public emulator fixture |

Production was read at 23:58:27Z and 00:05:58Z (7:58 and 8:05 PM EDT). Database root ETag, rules and Hosting identifiers were unchanged. There were zero tracking locks and zero active private/public bus projections at both captures. This is a point-in-time observation, not permission to deploy later without rechecking.

Compared directly with the live production rules, only six expressions change: `.write`, `.validate`, and `$other/.validate` under each of `liveBuses/$busId` and `publicBuses/$busId`. Read permissions, administrators, driver assignments, bus lifecycle rules, geofences, history, incident evidence and audit permissions remain unchanged.

Production changes would be:

- Send each distinct valid GPS capture through a single-flight FIFO to an atomic private/public update. Retry pending work at one-second cadence; do not generate timer copies of already acknowledged fixes.
- Add `capturedAt` to live private and sanitized public GPS projections. Require it for active uploads, enforce freshness and monotonic ordering, reject altered duplicates, and allow exact unchanged retries.
- Preserve enabled-driver, bus-assignment, enabled-bus, identity and lock checks. Prevent drivers from deleting the replay watermark or replacing public GPS with a different private position.
- Close/release tracking atomically and fail closed when reconnecting without ownership. Drivers explicitly restart after a server disconnect has ended their session.
- Keep the staging banner staging-only. No public/admin design or onboarding changes; no history migration or backfill is required for this release.

The production source baseline is public `0618dfbfaa03aa0d618d7f3b52b55678d3fd8f40` and admin `230dbd5c715a53d332fe16386e942618aecfca70`. Isolated release worktrees exclude the unfinished Cloud Run changes in the original working directories. The pre-existing dormant telemetry adapter and trusted-client function are unchanged; these artifacts use direct Firebase telemetry and introduce no Cloud Run deployment.

## Verification results

**218 tests passed; zero failed in this review.**

| Suite | Passed |
| --- | ---: |
| Public unit tests | 60 |
| Credential-safe tooling tests | 8 |
| Admin unit/guard tests | 67 |
| GPS security and both-client transition emulator tests | 28 |
| Public rules emulator tests | 7 |
| Admin rules emulator tests | 24 |
| Phase 2 lifecycle, concurrency, backfill and audit regressions | 19 |
| Final strict-rules, 188-bus emulator load cases | 2 |
| Hosted staging optimized client, compatible client and admin lifecycle scenarios | 3 |

Both hosted client scenarios delivered 60/60 distinct one-second captures to anonymous public and authenticated admin listeners. Each checked 33 conditions, including wrong-bus/disabled/forged writes, stale/future/expired/malformed GPS, exact retry, altered duplicates, timestamp-free cached clients, watermark deletion, projection consistency, disconnect cleanup, reconnect denial without a lock, explicit restart, Stop and preservation. These are synthetic browser-geolocation callbacks using the actual client services and real staging Firebase, not physical phone tests.

Active-driver disable, safe lock release, replacement-driver use, race handling and lifecycle/history preservation passed the emulator suites. The hosted admin scenario deactivated/reactivated only unassigned synthetic `SYN-118`, verifying two atomic audit entries. Existing disabled-driver denial was also tested against staging. No production driver was disabled for testing.

Final strict-rules load benchmark (local emulator, 188 buses, 60 seconds, one offered fix/bus/second):

| History | Captures acknowledged | Duplicate writes | Write p95 | Capture-to-ack p95 | Client peak RSS |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0 MB | 11,280/11,280 | 0 | 319 ms | 331 ms | 171,184,128 bytes |
| ~100 MB | 11,280/11,280 | 0 | 317 ms | 329 ms | 168,296,448 bytes |

Both had zero errors, zero history-path accesses, and zero steady-state reads/transactions. Startup/stop operations are outside the measured window. These results do not establish Internet latency, phone behavior, five-year storage capacity, or hosted Spark fleet capacity. No full-fleet hosted stress test was run.

Production public, staging public, production-compatible fallback and admin production builds passed. The only build warnings were existing large map chunks. Public and admin `npm audit` each reported zero known vulnerabilities. Public/staging/fallback target guards passed; negative environment-mismatch tests passed. Lockfiles and onboarding files were unchanged.

Browser inspection confirmed the staging public map's live synthetic marker and the admin's changing online/speed values. Live Map, Safety Events, Trip History, Devices, Drivers, Buses and Geofences opened without permission errors. A transient overview map-load warning cleared; subsequent DOM inspection showed map markers and no captured console errors. This was not a comprehensive cross-browser accessibility audit or every-admin-action manual test. Staging geofence data is empty, so populated editing remains covered by existing code/rules tests rather than a new hosted edit test.

Before/after staging snapshot comparison preserved drivers, admins, trips, safety events, incident evidence, devices, geofence paths and session closures. Every existing audit entry remained identical, with only the two expected lifecycle entries added. Expected mutations were synthetic `SYN-101` current GPS and `SYN-118` lifecycle metadata. No locks remained. Staging rules and Hosting were not changed by this review.

## Credential incident and source safety

The exact previously exposed CLI OAuth credential was revalidated without printing it: refresh returned HTTP 400 `invalid_grant`; the original access token returned HTTP 401. The fresh interactive CLI login is a different credential. Do not rerun the containment/revocation helper against that fresh login.

Release-tree, generated-artifact, Git-history and index scans found no publishable credentials. The only expected local finding was the ignored synthetic-account journal, which is excluded from commits. Firebase browser app configuration is public configuration, not an administrative credential. Pattern scanning cannot prove that every possible secret format is absent.

The prior incident review found no affirmative evidence of unauthorized activity in available logs. It did not establish complete coverage: data-access logging and other projects accessible to the exposed account remain gaps. Revocation and clean code scans do not erase that uncertainty. Do not print raw CLI auth objects, tokens, debug logs, account journals or backup contents.

The repository owner confirmed no automatic deployment integrations. The fetched production branches contain no Actions workflows, and local repositories have no active push hooks. This review does not independently enumerate private webhooks beyond the owner's confirmation. Push only these explicit development refs, never production refs:

- Public: `dev/spark-gps-release`
- Canonical rules: `dev/spark-security-remediation`
- Compatible fallback: `dev/spark-legacy-compat`

## Backup and rollback readiness

Production database, exact rules and release identifiers were saved in encrypted Windows DPAPI CurrentUser bundles outside Git and OneDrive. Latest backup directory:

`%LOCALAPPDATA%\CCSBusTracker\security-backups\2026-10-17T00-05-58.293Z`

The encrypted file and decrypted bundle hashes were checked, and in-memory decryption reproduced the original bytes. The adjacent manifest contains hashes and release metadata, not the protected records. Recovery requires this Windows user/profile; this is not yet an independently recoverable off-device disaster-recovery backup. No production record was copied into staging or committed. No production restore was attempted.

Tested release/fallback artifacts are archived at:

`%LOCALAPPDATA%\CCSBusTracker\release-artifacts\2026-10-17T00-00-34.558Z`

- `optimized-production`: nine files; file-list hash `c6626d9c06d9e4f4cc567f55cf669c7f16fd26369ff3faf7910c16fde76065f0`.
- `fallback-production`: nine files; file-list hash `5d1db7a29cdd07a546aef47aa4a385737c82482db55feb88de5bdb690255d17a`.
- Both manifests explicitly target production; no staging project string appears in their JS. The fallback service exactly matches the fixture exercised by both emulator and hosted strict-rule tests.

**Do not restore old production Hosting `dd3e951a56fd1a1c` with strict rules.** Its timestamp-free client is incompatible. Staging fallback version `996c5371f0545dd4` is staging-configured and must never be copied to production. The safe application fallback is the archived production-configured compatibility build, with strict rules retained. It keeps the older delivery cadence/coalescing behavior and is an emergency fallback, not a replacement for the optimized fleet performance claim.

No automatic database restoration belongs in normal rollback. The release does not migrate history. If data repair becomes necessary: stop writers under an approved incident window, capture a new encrypted backup, decrypt privately, compare only affected paths, preserve newer GPS and all history/audit additions, and prepare a conditional ETag-checked repair for explicit approval. Never blindly import a full old snapshot over current production.

## Exact production sequence — commands NOT executed

1. Obtain phone acceptance and explicit deployment approval; agree a 20–30 minute no-tracking window with the operator. Hold new starts, ask drivers to Stop, close old tabs and plan a reload. Recheck zero `activeDrivers` and zero active private/public projections immediately before deployment. Abort if any are active; do not forcibly clear locks to make the check pass.
2. Capture a fresh encrypted production backup and rules/Hosting baseline. Recheck branch SHAs, artifact file hashes, rules hash, production project and deployment manifests. Stop if anything drifted. No backfill or history migration is needed.
3. In the canonical **admin release checkout**, deploy only the strict rules:

   ```powershell
   npx.cmd --yes firebase-tools@15.31.0 deploy --project chsbustracker2 --config firebase.json --only database
   ```

   Read rules back and verify normalized SHA-256 `d9ae28f65a1dd94cdc71f9c9643f9a3a2a34d3ca7e7c1e66700076fdfe0777a6`. Keep the maintenance hold. Old cached clients deliberately cannot send active timestamp-free updates during this gap.

4. In the **optimized public release checkout**, verify `dist` against the archived production artifact, then deploy only public/driver Hosting:

   ```powershell
   npx.cmd --yes firebase-tools@15.31.0 deploy --project chsbustracker2 --config firebase.json --only hosting
   ```

   Save the new Hosting identifier and fetch deployed assets/headers/manifest. Do not deploy admin Hosting, Functions, Cloud Run, or rules from the public repository.

5. Have the designated approved driver reload, sign in and Start. Verify advancing capture times/positions, public/admin consistency, no private fields publicly, Stop and lock release, then controlled disconnect/reconnect and explicit restart. Check unauthenticated protected reads fail. Do not run attack/write probes against real fleet records or disable real drivers as a smoke test. Confirm existing history/audits and admin access. Reopen tracking only after success.
6. On client failure, keep tracking paused and strict rules in place. In the **compatible fallback checkout**, restore/verify its archived `dist` and run the same explicit Hosting-only command from step 4. Record its new production Hosting version, reload clients and repeat smoke tests. Do not downgrade rules to bypass failures. If strict rules themselves fail critically, remain in the maintenance window and investigate a tested correction; old rules are evidence, not an approved weakened rollback.

Commands require the approved interactive Firebase login plus appropriate project visibility, RTDB rules administration and Firebase Hosting deployment permissions. No billing role or billing upgrade is needed. Avoid `--debug` and token arguments.

## Remaining gates and limitations

1. **Release blocker:** no confirmed physical-phone acceptance results. Record phone/OS/browser, Start/Stop, movement on both maps, network loss/reconnect, explicit restart, and screen-on duration. The user's intention to test is not a pass result.
2. **Release blocker:** maintenance window, operator responsibility and final explicit production approval remain pending. The rules/client rollout is coordinated, not atomic across Firebase services.
3. Screen-lock, background-tab suspension, app switching, phone shutdown, abrupt radio loss and long-duration mobile recovery remain unverified. Browser wake locks are best effort; this is not a guaranteed background GPS tracker. If unattended/background tracking is required, the release is not ready for that requirement.
4. Locks are currently keyed by driver UID, not a unique device/session generation. Two tabs/devices using one driver account can interfere; close all older sessions and use one active device. This is a known reliability limitation, not a claim of robust multi-device tracking.
5. Authorized clients still supply coordinates/timestamps. Rules prevent specified replay/order violations but do not prove physical location or detect malicious invented fresh telemetry. Trusted ingestion, validated safety detection and durable offline trip buffering are outside this release. The FIFO is bounded to 120 pending fixes and fails visibly on overflow.
6. Spark fleet capacity, long-term retention, independent disaster recovery, comprehensive mobile/accessibility acceptance and CCS IT/privacy/records approval remain separate requirements. No claim of full district compliance is made.
7. The isolated admin checkout has an older overbroad staging Hosting-name guard; it fails closed for the staging-name prefix. Admin Hosting is deliberately not part of this release. Reconcile and retest that guard before a future admin staging rebuild/deployment.

**Conclusion:** eligible for reviewed development-branch publication; not authorized or fully accepted for production deployment. After phone acceptance and a maintenance plan, obtain explicit approval for the exact rules/client sequence above.
