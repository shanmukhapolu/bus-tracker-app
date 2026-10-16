# Option A — Firebase Spark optimization

Historical implementation report from the original worktree. The isolated release, current rerun results and staging status are documented in [SPARK-RELEASE.md](SPARK-RELEASE.md). Its baseline fixture retains the committed backend branch; unfinished Cloud Run changes are excluded.

Local-only review and implementation, 2026-10-16. No deployments, GitHub pushes, production database access, billing, routing, onboarding changes or new history/safety features.

## Which implementation was optimized

The hosted public bundle was read without authentication (public JavaScript only):
- `https://chsbustracker2.web.app/assets/index-CSwfRZfa.js`, SHA-256 `db916e6bd0103232669e30948c6a0716c95af4539000c25de5221c97af4aa0f0`.
- Admin bundle: `index-EVwGr_W3.js`, SHA-256 `0454142e232d0fd457b7aca90e06bd354360531e2726ce7db702ca3e3e28e07d`.

The current driver service defaults to direct Firebase writes. Trusted API mode remains restricted to the local emulator endpoint. Direct GPS publishing performs a multi-location update of `liveBuses/{busId}` and `publicBuses/{busId}`. Using a root reference for a PATCH/update is NOT a root transaction or a read/replacement of the entire database. Only lock acquisition transacts, at one `activeDrivers/{busId}` leaf. It does not download trip history.

The public site listens to sanitized `publicBuses`. The admin live service listens to `buses`, `liveBuses`, and existing route metadata, not accumulated history. Existing selected-day trip reads and the Phase 3A.1 exact-trip export remain unchanged. There is no history-dependent GPS transaction to replace in the deployed direct-write design. Listener rendering and public fan-out can still be expensive as viewer/fleet count increases.

Production rules were not downloaded in this phase. Tests use the current canonical rules in `bus-safety-admin/database.rules.json`; their SHA-256 is `43dd0001c8a8a329854a5e383b71e94d4ecb23a81e8a3b1bcd144465928e2bde`. Neither repository's rules file was changed. Live rule-version verification remains a staging/release gate, not an assumed result.

## Actual fixes

1. Added `SparkGpsQueue`: a single-flight FIFO of distinct captured fixes. Pending writes no longer cause intermediate fixes to be replaced with the newest one. Acknowledged fixes are not uploaded again by the timer, visibility events or connection callbacks. One-second retries remain for pending work; new device fixes are immediately offered without increasing the sampling interval.
2. Extracted `sparkGpsUpdate`, retaining exactly the existing live/private and sanitized/public payload fields and atomic paired writes. No history read, history write, timestamp fabrication, per-GPS transaction, or new schema is introduced.
3. The queue keeps the exact failed/uncertain payload until retry succeeds. Existing rules enforce monotonic captured timestamps, immutable equal-time location fields, authorization, assignment and lock ownership. Identical uncertain retries remain permitted; altered duplicates and older timestamps cannot replace current data.
4. Buffering is bounded to 120 pending fixes. Overflow is explicitly reported and location collection pauses; queued points are not silently evicted. It is not durable storage and cannot save unacknowledged points across a closed page. This limit is not used to improve the benchmarks.
5. Stop/disconnect now updates both inactive projections and releases the driver's lock in a single atomic operation. Stop keeps the disconnect safety net until its write is acknowledged. A reconnect checks the small lock record and rearms disconnect cleanup before resuming. A lost/replaced lock requires an explicit restart; it is never automatically reclaimed. Permission denial pauses publishing instead of generating an endless retry stream.
6. Replaced the GPS path's invalid empty-string root reference with `/`. The installed SDK rejected `ref(db, "")` during the full-service benchmark. The frozen baseline uses a documented benchmark-only normalization of that path so its prior publishing behavior can be measured. The optimized path needs no shim.
7. Updated one driver status sentence to describe device-provided GPS fixes accurately. Layout/design and signup flow are unchanged.

A stopped device must not appear to have a fresh GPS fix merely because a timer repeats its previous position. Staleness still follows the existing website rules; stationary devices that do not supply fresh fixes may show stale information. No artificial GPS heartbeat is introduced.

## Files

- `src/services/sparkGps.ts`: bounded queue and existing projection payload helper.
- `src/services/driverTrackingService.ts`: direct-Firebase delivery, root reference, stop/reconnect lifecycle. Trusted-backend behavior is preserved.
- `src/pages/DriversPage.tsx`: status sentence only.
- `src/services/sparkGps.test.ts`, `sparkTracking.test.ts`: regression tests.
- `scripts/spark/security.test.ts`, `load.test.ts`, `guard.ts`, `benchmark.mjs`, `driverTrackingService.before.txt`: local tests, load driver and frozen baseline.
- `spark.config.ts`, `vite.config.ts`, `package.json`: isolated test commands; load tests excluded from ordinary unit tests.
- This report and README cross-links. No admin application implementation or canonical rules changes were needed in this phase.

## Reproduce

Run from `bus-tracker-app` with dependencies installed and Java 21 available. Do not run benchmarks concurrently with other emulator suites or builds.

```powershell
npm.cmd test
npm.cmd run test:spark
# Point this to your installed Firebase CLI JavaScript entry point:
$env:FIREBASE_CLI_PATH = 'C:\path\to\firebase-tools\lib\bin\firebase.js'
npm.cmd run benchmark:spark
npm.cmd run build
npm.cmd run build:staging
```

The benchmark starts fresh loopback database emulators for each case, uses `demo-ccs-staging` only, rejects cloud credentials/Cloud Run, and limits Java to an 8 GiB heap on a host with sufficient memory. The tests load the canonical admin rules. They use 188 separate synthetic authenticated SDK contexts, not an Admin SDK GPS writer; owner access is used only to prepare synthetic fixtures and verify preserved records. Firebase Authentication UI/token-exchange latency is not part of this rules-enforced database benchmark.

Each case runs the actual driver tracking service (frozen pre-change source vs current source) with a synthetic Geolocation provider supplying one distinct fix per bus every second for 60 seconds. The old one-second repeat timer also runs, as it does in the website. Histories contain 0 or approximately 100 MiB of point-shaped synthetic records. Fixtures and cleanup are outside the measured GPS window. Results verify all distinct fix acknowledgements, final private/public locations, sanitized fields and old history/audit/safety sentinels. Database-operation counts are SDK calls, serialized bytes are application payload estimates, and RSS measures the combined 188-client Node process, not the emulator or a real phone.

## Compatibility and limitations

The Phase 3A.1 trusted backend, its constrained rules profile and optimized history storage are preserved. `DriverLocation`, the tracking-session interface, projection fields and backend transport switch remain compatible. Direct Spark mode still stores the latest position only; it does not create trusted historical records. Previously stored history/audits/safety data is preserved. Five-year recording/retention will require a separately approved storage/backend plan; this phase does not silently create or delete official history.

Firebase Spark allows only **100 simultaneous RTDB connections**, including drivers, admin browsers and public viewers. A local emulator handling 188 drivers does not change that hosted limit. Do not attempt full-fleet stress tests on hosted Spark, shard projects to evade quotas, or claim this is a 188-bus production deployment. Public listener bandwidth also grows with viewers. Current plan/storage/download quotas must be reviewed before rollout.

Direct client GPS remains less trusted than the future server API: authorized clients can submit fabricated but schema-valid data; there is no trusted server speed/trajectory check, durable server-side telemetry audit, distributed rate limit or verified crash detection. The legacy lock identifies a driver UID, not a unique device/session token, so multiple tabs/devices using one account remain a limitation. No security permission was broadened to address this.

Browser GPS timing, background suspension, extended disconnects, closed-page data loss and full-day operation are not certified by local one-minute load tests. Queue overflow and stale/rejected packets are visible errors, not successful recordings. The configured rules reject stale active GPS and protect ownership at commit time.

References: [RTDB limits](https://firebase.google.com/docs/database/usage/limits), [web offline/disconnect semantics](https://firebase.google.com/docs/database/web/offline-capabilities).

## Staging approval gate

No hosted staging deployment or full-fleet cloud test was performed. After approval:
1. Verify staging Hosting configuration and the staging canonical rules version; export a staging backup and record the current Hosting release for rollback. Do not deploy the strict trusted-backend rules profile with the direct-write client.
2. Build public/driver with `build:staging`; verify `dist-staging/deployment.json` names `chsbustracker2-staging` and inspect staging Firebase configuration. Leave telemetry mode `legacy`.
3. Deploy only the approved public/driver staging Hosting target. No schema migration or rules deployment is needed for this change. The admin app is unchanged.
4. Use two synthetic drivers/buses and one public/admin viewer. Check login/assignment, fresh fixes, stationary/no-fix staleness, private speed vs sanitized public location, disable/reassignment, duplicate/stale denial, stop and disconnect/restart behavior.
5. Verify histories/audits are unchanged and no production URLs are used. Check quota usage; do not run the 188-client benchmark on Spark.
6. Review results and request separate production approval. Roll back staging Hosting to its recorded release if needed; no data restoration/migration should be required because the schema is unchanged.

The working trees contain earlier Phase 3 changes as well as this phase. Review the complete release diff before any later staging build/deployment; this phase does not authorize publishing unrelated local changes.

## Regression results

Final local regression suites: **260 passed, 0 failed** (65 public/driver unit tests, 78 admin unit tests, 59 trusted-backend unit tests, 24 canonical admin rule tests, 19 Phase 2 security regressions, 7 public rule tests, 8 new Spark rule/disconnect tests). The backend-only emulator integration suites are unchanged and were not rerun in this phase; they are not included in these counts. The new load cases are reported separately below.

The new tests caught and fixed a reconnect/paused-flush race: a still-owned connection now waits for an outstanding paused flush before draining the queue. An epoch check prevents a late reconnect response from resuming writes after a newer disconnect. Additional tests prove an initial failed write never announces a live session, and a failed explicit stop retains its disconnect safety net.

Both public/driver and admin production-mode and staging-mode builds passed, and trusted-backend TypeScript compilation passed. Existing large-bundle warnings remain. Build manifests identify staging project `chsbustracker2-staging`, with sites `chsbustracker2-staging` and `chsbustracker2-staging-admin`. Production-mode builds are local artifacts only, not deployments.

The Phase 3A.1 verification manifest was checked: all recorded backend/rules source hashes still match. Canonical database rules remain unchanged. Full hosted authentication, mobile background GPS, browser rendering and WAN latency still require the small staging test after approval.

## Measurement interpretation

Final fixed-window counters (`offeredWindow*`) cover exactly the 60-second offered-load window. The harness then waits up to 15 seconds for missing acknowledgements. Total counters and all-request latency fields include that drain window, during which the frozen old client still repeats its last position. Use fixed-window counters for the before/after traffic comparison; do not compare the old 75-second total to the new 60-second total as if their durations were identical.

`uniqueFixCaptureToAckP95Ms` measures device timestamp to first acknowledgement of each distinct offered fix, including queueing. Missing baseline fixes have no acknowledgement latency and are reported explicitly; percentiles alone do not prove complete delivery. SDK write p95 excludes time spent waiting in the application queue. No history is newly persisted in this Spark phase; "acknowledged fixes" means live projections were successfully updated, not that a trip archive was created.

The frozen baseline intentionally fails the all-fixes-delivered assertion. Consequently the combined before/after benchmark command returns nonzero when the old bug is reproduced, even if both optimized cases pass. Inspect each saved result. Initial trial cases were retained as `exploratory-*.json`; the final cases use fixed-window and capture-to-ack instrumentation. Early setup attempts failed on the empty-root reference and were corrected before performance measurements; the baseline-only normalization is documented above.

The benchmark does not simulate large numbers of public/admin viewers or their map rendering. Listener fan-out/egress and handset battery/network behavior need separate staging validation. No hosted staging browser session was used to claim the new code is already live.


## Final controlled benchmark results

188 simultaneous synthetic drivers, one distinct device fix per second, 60-second offered window. Both optimized cases passed; both frozen-baseline cases failed the complete-delivery assertion (78 missed fixes each). No Firebase rejection/network errors occurred in these four measured cases. The previous implementation silently coalesced fixes while a timer write was pending.

| Version / history | Distinct fixes acknowledged / offered | Writes in 60 s | SDK-write p95 | Capture-to-ack p95 | Payload in 60 s | Peak 188-client Node RSS |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| before / 0 MiB | 11,202 / 11,280 | 19,956 | 295 ms | 350 ms | 9,559,829 bytes | 169.7 MiB |
| before / 100 MiB | 11,202 / 11,280 | 20,030 | 313 ms | 361 ms | 9,594,061 bytes | 168.0 MiB |
| after / 0 MiB | 11,280 / 11,280 | 11,280 | 317 ms | 333 ms | 5,404,440 bytes | 157.7 MiB |
| after / 100 MiB | 11,280 / 11,280 | 11,280 | 306 ms | 321 ms | 5,404,440 bytes | 165.7 MiB |

Both versions performed **zero GPS-loop database reads, zero GPS-loop transactions and zero history accesses**. Startup lock transactions, initial publication, connection verification, fixture preparation, final integrity reads and stop cleanup are outside the offered-window counts. New normal writes remain one atomic two-location update per captured fix, with no added database work proportional to history.

The optimized version used approximately **44% fewer write calls and serialized payload bytes** in matched 60-second windows, with **zero duplicate writes and zero omitted distinct fixes**. Database-write p95 remains roughly 0.3 seconds: this is a completeness/traffic/reliability improvement, not evidence of a dramatic database latency fix. History size had no material impact on either direct-write version in these tests, unlike the previous trusted-backend root-transaction bottleneck. Java holds the 100 MiB fixture outside reported client RSS; this is not a cloud capacity or billing measurement.

The unchanged old-history, audit and safety sentinels and final private/public positions passed integrity checks. The 100 MiB fixture contained 104,860,590 serialized bytes of synthetic historical trip records. No historical sampling frequency was changed; direct Spark mode still does not record new trip history.

**Readiness:** ready for an explicitly approved small synthetic staging Hosting rollout and manual phone/public/admin smoke test. Not yet verified on hosted staging; not approved for production. The Spark connection/storage/download limits, browser background/offline limitations, UID-only legacy locks, untrusted client-supplied telemetry, and five-year retention planning remain. No paid service, Cloud Run deployment, schema migration, automatic deletion, production change or GitHub push was performed.
