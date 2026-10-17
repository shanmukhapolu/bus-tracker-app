# Controlled GPS release plan — approval required

Do not execute deployment or push commands until the user approves the specific release. No billing upgrade is needed for these changes. Do not deploy the unfinished trusted backend. Canonical rules come only from `bus-safety-admin`.

## Exact observed deployment baseline

Read-only inventory captured October 16, 2026 at 22:05 UTC (not a claim about subsequent external changes):

| Target | Observed Hosting version |
|---|---|
| Production public/driver | `dd3e951a56fd1a1c` |
| Production admin | `52e075ccb3d2fb6e` |
| Staging public/driver | `996c5371f0545dd4` |
| Staging admin | `685de4fb1b953958` |

Normalized production rules SHA-256 was `07f5a0699c9d3d8593da099a5be1c33e2ee4d31306da4e663b265a1ac077411b`; staging rules SHA-256 was `d112469de4b7aba2a2846d830fdea2cf4969f1a6b8339e67bfd08cbefe91b2b9`. Production rejects `capturedAt`; staging already accepts it but lacks the extra deletion/partial-write hardening in this candidate. Recheck all releases/rules read-only using freshly authorized credentials before acting. Abort on unexplained drift.

## Before any cloud write

1. Review the incident report and credential revocation results. Account owner reviews Google security activity and other accessible projects. Authorize a fresh interactive CLI login; never print its credential configuration. Restrict future operator IAM to approved duties where practical.
2. Review both isolated branches and the compatibility patch; scan source, index, history and build output. Confirm no unfinished backend files or protected data. Get repository-owner confirmation of external deployment triggers before a push.
3. Run `npm test`, `npm run test:security-tools`, `npm run test:rules`, `npm run test:transition`, `npm run build`, `npm run build:staging` in the public release. Run admin unit tests and both rules suites against the canonical candidate. Use only `demo-*` projects on loopback for emulator tests.
4. Record hashes of the candidate rules and both client bundles. The rule test fixture must match the canonical candidate. Review stage `deployment.json` and generated `firebase.staging.json`: project must be `chsbustracker2-staging`, public site `chsbustracker2-staging`, never production. Confirm the staging banner and auth audience. Do not use an ambiguous default project or deploy every target.

## Backup and restore plan

- No production backup was taken during remediation; protected production data was not copied anywhere.
- Before an approved production cutover, an authorized CCS operator exports the production RTDB snapshot and deployed rules to a restricted, encrypted, off-repository backup location. Use the Firebase Console export and locally reviewed download destination, or an approved API tool that never prints data/credentials. Verify file size, JSON structure and SHA-256 locally without logging contents. Record time, project, operator, access controls and retention; never put this backup in staging or Git.
- Record exact Hosting release/version identifiers and preserve both the reviewed compatibility bundle and optimized bundle. Database export does not back up Firebase Authentication accounts: no Auth changes are planned, and any Auth backup decision belongs to CCS IT.
- Rehearse restore with **synthetic emulator data only**. Never blindly import the full old snapshot over a live database: it could erase intervening trips, telemetry, safety evidence or audit entries. In an approved outage, preserve a fresh incident snapshot and use a reviewed, scoped merge of only damaged keys with timestamp/ownership preconditions. Preserve newer records and audit evidence. Full restore is a separate CCS-authorized disaster-recovery procedure, not routine rollback.

## Staged deployment order

1. Obtain staging-only approval. Use a fresh CLI login with access to the staging project. Install the reviewed canonical rules first in staging; existing optimized stage GPS must be paused during the controlled test window.
2. From the isolated admin checkout, the reviewed command is `npx.cmd --yes firebase-tools@15.31.0 deploy --config firebase.security-staging.json --only database --project chsbustracker2-staging`. Only after approval, set `$env:CONFIRM_STAGING_SECURITY_RELEASE="chsbustracker2-staging"` in that shell. The dedicated manifest uses the canonical rules and a guard that rejects production, missing confirmation and unspecified projects. Do not bypass this guard.
3. From the isolated public checkout, build staging and deploy only its explicit staging Hosting manifest: `npx.cmd --yes firebase-tools@15.31.0 deploy --config firebase.staging.json --only hosting --project chsbustracker2-staging`. Do not deploy admin Hosting or databases from the public checkout.
4. Verify synthetic old-compatible and optimized service clients against the installed rules. Test real hosted driver browser behavior, refresh from a cached old page, loss/recovery of network, timestamps, bus assignment, disabled drivers, driver handover, public/admin listeners, bus lifecycle and audits. No full-fleet stress test on hosted Spark. Record exact deployed hashes and results.
5. Obtain separate production approval. Coordinate a quiet maintenance window: stop all driver sessions, confirm inactive projections and cleared locks through authorized management actions, close old tabs, and export backups. Do not delete tracking/history data to clear a lock. Resolve orphaned locks with a separately reviewed administrator operation, not an unguarded database write.
6. Deploy strict production rules from the canonical admin checkout, immediately followed by the approved public Hosting build. There is a deliberate short fail-closed window: old clients are denied. Load the compatible client as fallback if the optimized release fails. Do not add an optional timestamp bypass for uninterrupted old-client access.
7. Drivers reload/close cached pages, confirm assignment, and explicitly start fresh sessions. Start with a small authorized pilot, then expand only after smoke tests pass. Production smoke activity and any synthetic production fixtures require explicit operator approval; do not create fake buses there silently.

## Rollback

- On a failure, stop the rollout and affected sessions. Keep the strict rules. Roll Hosting forward/back to the **reviewed compatible bundle**, not the pre-fix timestamp-free bundle. Reverting Hosting alone to `dd3e951a56fd1a1c` will not work under strict rules.
- Do not restore vulnerable rules merely to make a stale cached client work. If the compatibility bundle is not available or validated, keep tracking paused, investigate and fix forward. Data backups remain for scoped recovery, not wholesale rollback of history.
- Preserve new audit/trip/safety records and the existing private GPS watermarks. Record the rollback, hashes, operator and times in the release incident record.

## Post-deployment checks

- Exact bundle and rule hashes match review; no unintended admin/backend Hosting release.
- Anonymous users can read only sanitized public bus fields and cannot access private telemetry, drivers, incidents, trips or audit records.
- Assigned driver uploads succeed; wrong bus, disabled identity, missing/replaced lock, missing/future/stale timestamps, altered duplicates, deletions and mismatched public GPS are denied.
- One-second synthetic fixes reach both public/admin listeners in staging; public projection contains no driver identity or private speed/evidence.
- Disconnect cleanup, reload and explicit restart work; a stopped old session cannot upload without the valid lock. All old tabs are closed because locks remain UID-based.
- Bus deactivate/retire/reactivate and driver disable/handover preserve history; required audits are present. Geofences remain functional.
- Existing record hashes/counts for untouched history, incidents and audits remain intact. Do not log protected contents.
- Review errors and operator logs, then retain the release evidence under CCS-approved controls.

Required permissions: an authorized staging/production operator with Firebase Hosting deployment permissions, RTDB rules/instance administration and necessary project-read permissions. Audit investigation additionally needs relevant Logs Viewer/Private Logs Viewer permissions; data export needs approved protected-database read access. GitHub repository administration is needed to confirm webhooks/integrations. Do not grant broad Owner access just to resolve a deployment error.
