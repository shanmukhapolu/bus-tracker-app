# Spark GPS release verification — 2026-10-16

## Scope

Prepared in isolated branch `dev/spark-gps-release` from public/driver commit `0618dfb`. The original working folder, including unfinished Phase 3/3A Cloud Run work, remains intact. The existing committed backend transport function and telemetry client are unchanged. This release includes direct Firebase GPS queue/lifecycle fixes, tests, the previously prepared staging banner, and necessary staging target guards. No administrator application, routing, onboarding, database-rule deployment, history migration, or billing change is included.

`database.rules.json` at the repository root remains a deprecated compatibility copy; bus-safety-admin is the canonical rules owner. `scripts/spark/fixtures/database.rules.json` is a test-only snapshot, never a deployment source. Its contents match the live staging rules on 2026-10-16. The emulator-only Firebase configuration points to this fixture and uses a demo project.

## Release checks

- Public/driver unit tests: 60 passed.
- Spark rules/lifecycle tests: 8 passed.
- Public/driver rule regressions: 7 passed.
- Unchanged admin unit regressions: 78 passed.
- Canonical admin rules: 24 passed.
- Phase 2 security rules: 19 passed.
- Total functional regressions: 196 passed, 0 failed.
- Public/driver and admin builds: production and staging modes passed. Existing large JavaScript chunk warnings remain.
- Load results: see `scripts/spark/results/`; the old baseline is expected to fail its completeness assertion. Results here are from the isolated release, not copied from the unfinished worktree.
- Credential scan: no private keys, OAuth tokens, GitHub tokens, or synthetic account passwords found in the release changes. Ignored environment/account files are not included. Firebase web app configuration is public configuration, not an authorization secret.
- GitHub Actions API returned zero workflows. Repository webhook settings were inaccessible (404); the owner must confirm external deployment triggers before this branch is pushed. No production branch is modified.

Staging deployment and smoke results will be recorded after execution. No production deployment is authorized.

## Recorded rollback targets before this release

- Staging public/driver: `sites/chsbustracker2-staging/versions/d855df33b9107326` (2026-10-14T19:25:49.686Z).
- Staging admin (must remain unchanged): `sites/chsbustracker2-staging-admin/versions/685de4fb1b953958`.
- Production public/driver (read-only observation): `sites/chsbustracker2/versions/dd3e951a56fd1a1c`.
- Production admin (must remain unchanged): `sites/chsbustracker2-admin/versions/52e075ccb3d2fb6e`.

## Production compatibility blocker and approval-gated rollout plan

Production rules are NOT the staging rules. A read-only comparison found five changed rule expressions under liveBuses/publicBuses: production disallows capturedAt and lacks the staging monotonic capture-time/immutable duplicate protections. Optimized GPS writes would be denied under current production rules. Conversely, the old client omits capturedAt, which staging requires for active writes. Therefore neither a Hosting-only production release nor an untested old-Hosting rollback under new rules is safe.

Canonical rules owner remains bus-safety-admin. The public repository's fixture must never be deployed. No rules were changed in this release. Normalized rule hashes at inspection:
- Production: 07f5a0699c9d3d8593da099a5be1c33e2ee4d31306da4e663b265a1ac077411b
- Staging: d112469de4b7aba2a2846d830fdea2cf4969f1a6b8339e67bfd08cbefe91b2b9

Before production approval:
1. Have the repository owner verify external deploy triggers before pushing the development branch. User has explicitly asked to keep the push blocked until verified.
2. Review staging evidence and complete a physical-phone/background smoke test. Plan an operator-coordinated cutover with active drivers stopped and client pages reloaded; do not assume old and new clients can overlap under the new rules.
3. Prepare and test a rollback frontend that writes capturedAt and is compatible with the intended canonical rules. The recorded old production Hosting version is for reference, NOT an approved rollback under new rules. Do not weaken or automatically revert security rules to accommodate an old client. A compatible rollback artifact is still a release blocker.
4. Record current Hosting versions/rules immediately before cutover. Have an authorized CCS operator export and secure a production database backup under district access/retention policy. Do not copy it to staging. Test restoration locally with synthetic data; do not restore the entire live database over newer telemetry/history.
5. Build the approved clean client commit with npm ci, npm test, npm run test:spark, npm run test:rules and npm run build. Verify dist/deployment.json explicitly names production chsbustracker2 and the approved artifact hash; keep staging output separate.
6. ONLY after explicit approval of BOTH canonical rules and Hosting deployment: deploy the reviewed direct-Firebase rules from bus-safety-admin, then the compatible public/driver Hosting build from this branch. Do not deploy the strict Cloud Run rules profile, admin Hosting, Cloud Run services, or emulator configurations. Drivers must refresh/start only after both steps pass. Exact rules command depends on the reviewed admin release commit, which has not been isolated/approved in this task. The client command would be firebase deploy --config firebase.json --project chsbustracker2 --only hosting; it is not authorized now.
7. Smoke test assigned-bus login, fresh fixes, public sanitization/admin speed, stale/duplicate denial, stop, disconnect/explicit restart, history preservation and admin actions. Monitor errors/usage within Spark limits. Stop the rollout if either rules or client checks fail.
8. Roll back ONLY to the pretested compatible Hosting artifact, keeping timestamp protections and existing data. If none is available, pause tracking and fix forward rather than silently weakening rules. Hosting rollback does not replace JavaScript in open tabs: coordinate refresh/restart. Any data restoration or rules rollback requires a separately reviewed, explicit decision.

For this staging-only release, the prior staging version already uses capturedAt and the current staging rules. If needed, Firebase Console → Hosting → chsbustracker2-staging → Release history → Roll back to the recorded staging version. Verify assets and perform the small synthetic test; no database restore or schema migration is needed.

Required permissions: GitHub branch push with automation settings verified by a repository administrator; Firebase Hosting deploy/rollback permissions plus project read access. Future production rule deployment requires separately approved Realtime Database rules permissions in the canonical admin repository. No billing upgrade is required or authorized.

## Known limits

Spark's hosted connection quota does not support 188 simultaneous drivers plus viewers; the 188-client benchmark is emulator-only. Browser sampling/background suspension, 120-point memory-only buffering, UID-only locks across multiple devices, and client-supplied GPS trust remain limitations. Direct Spark mode updates latest locations; it does not add trusted historical recording. Cloud Run and five-year retention work remain separate and undeployed. Disconnection that releases a lock intentionally requires explicit stop/start rather than silently reclaiming a session.

## Isolated release load rerun

Both optimized 188-bus/60-second cases passed: 11,280 distinct fixes offered and acknowledged, 11,280 writes, no duplicates/errors/history access or integrity errors. SDK write p95: 334 ms with empty history and 282 ms with 100 MiB; capture-to-ack p95: 349/296 ms. Both frozen old cases intentionally failed completeness. See the four result JSON files for full counters. These are emulator results, not hosted capacity guarantees.
