# Tracker heartbeat and stable admin metadata — October 16, 2026

Implemented and verified locally and on chsbustracker2-staging only. Production was not changed. Publication targets are the existing development branches only; no production deployment is authorized for this work.

## Reproduced causes

1. SparkGpsQueue intentionally sends only distinct captured fixes. Browsers can stop providing fixes while stationary; there was no independent tracker presence signal. Admin normalization also treated the GPS receipt/Stop timestamp as capture time.
2. BusDetails requested all drivers whenever data.timestamp changed. useResource cleared its result before each request, temporarily presenting “Not assigned.” Layout also reloaded safety events on every GPS update. Map props depended on the entire live object; even unrelated metadata restarted marker effects, and the default empty events array was recreated on every render.

Both new reproductions failed against the unchanged implementation, then passed with the fixes.

## Behavior and schema

- New protected trackerHeartbeats/{busId}: driverUid, lastSeenAt (server timestamp), gpsAvailable, intervalMs. One bounded record per bus; no historical data is replaced. No heartbeat fields are exposed in publicBuses.
- Default heartbeat is 15 seconds. Set VITE_TRACKER_HEARTBEAT_MS before building the public/driver app to configure 5,000–60,000 milliseconds. Invalid values use 15,000. There is at most one in-flight heartbeat and no rapid retry loop. Fresh GPS still uploads independently as fixes arrive.
- Existing GPS rules are unchanged. The additive heartbeat rules require an enabled assigned/allowed driver, enabled bus, current owning lock, active private telemetry belonging to the driver, exact server time, bounded interval and an explicit field allowlist. Anonymous reads and writes are denied.
- GPS capture time, GPS receipt time and heartbeat time remain separate. Heartbeats never touch GPS projections, capturedAt, coordinates or history. Stop pauses queued uploads, clears GPS/heartbeat timers and the location watch, awaits already-issued writes, then atomically ends both projections and releases the owned lock. No new queued fixes are sent after Stop. Disconnect recovery still verifies ownership and requires explicit restart after lock loss.
- Admin considers a tracker unavailable after max(45 seconds, three heartbeat intervals) without a received GPS/heartbeat update. The local clock expires online status without database reads. “Online · stationary at last GPS fix” explicitly describes the last observation when a stationary fix becomes old; it does not claim a new measurement. Missing GPS, unknown speed, moving, stationary, stopped and unresponsive states are differentiated.
- Driver accounts and safety-event summaries use independent realtime subscriptions, not GPS-dependent requests. A confirmed removal/reassignment replaces the displayed assignment immediately; permission cancellation clears protected metadata. Known data stays visible during normal subscription reconnection. useResource remains appropriate for identity-dependent one-shot resources; it is no longer used for driver metadata here.
- Memoized maps, coordinate/status-only position dependencies, stable empty event lists and 800 ms marker interpolation avoid restarting map work for elapsed-time or driver metadata changes. Fleet snapshots preserve unchanged object references and ignore obsolete asynchronous responses.
- Existing staging banner retained. A stale admin staging guard incorrectly rejected the separate project because its name starts with the production name; it now rejects exact production site IDs, with regression coverage, matching the public app's guard.

## Verification

Local: **224 tests passed**, zero remaining failures: public 64, admin 72, GPS/transition emulator 30, admin rules 24, administrative-security rules 19, public rules 7, security tools 8. Production and staging builds passed for both apps. Existing MapLibre bundle-size warnings remain.

Hosted synthetic test: **PASS**, about 265 seconds. Used the existing synthetic SYN-101 driver only; no production accounts, bus records or assignments touched.

- 60/60 offered one-second fixes observed by both public and private/admin listeners (61 GPS writes including initial fix).
- Three real stationary minutes: 12 heartbeats; GPS capturedAt and lastUpdated stayed exactly unchanged.
- Heartbeat requests measured 1,560 serialized JSON bytes total: 130 bytes/request, about 520 bytes/minute or 31.2 KB/hour per bus at default cadence, excluding WebSocket/TLS/framing, acknowledgements and listener fan-out. This is payload measurement, not a cloud billing or full-fleet bandwidth measurement.
- Stop: zero additional GPS/heartbeat writes during a 17-second observation, both projections inactive and lock released. Reconnect failed closed, then explicit restart succeeded.
- Wrong-bus and disabled-driver uploads, stale/altered-duplicate GPS and anonymous protected reads were rejected. Disable/reassignment/removal/lock-handover heartbeat denials tested in the emulator; assignment/disable/removal display changes tested through subscription callbacks without modifying hosted account assignments.
- Buses, drivers, geofences, trip history, safety events, incident evidence, audits and devices were hashed before/after and unchanged.
- Service-operation regression: 60 GPS emissions plus four heartbeat emissions caused zero driver/safety GETs or writes after subscriptions initialized. Map and driver fields observed in hosted admin while moving, stationary at 175 seconds, and stopped. Screen-reader status excludes second-by-second elapsed text; existing keyboard/protected-page tests passed. Physical screen-reader and iPhone background testing remain manual.
- All 9 public and 6 admin hosted files matched the tested staging builds. Both deployment manifests point only to chsbustracker2-staging.
- Secret scans: no release/source/artifact findings. The known ignored local synthetic-account journal remains private and must never be committed.

The first hosted harness attempt read retired geofenceEvents instead of current geofenceAlerts/geofenceBusOrder and stopped before tracking. Correcting that harness path produced the complete passing run; no rules were relaxed.

## Files

Public/driver: src/services/trackingHeartbeat.ts, driverTrackingService.ts, trackingHeartbeat.test.ts, sparkTracking.test.ts; scripts/spark/security.test.ts and its canonical-rules fixture. Admin: BusDetails, Layout, FleetMap, TrackingStatus, useFleet, useDriverAccounts, useSafetyEvents, FleetService/FirebaseFleetService/MockFleetService, models, utils/trackingStatus, regression tests, canonical database.rules.json. Staging-only configuration fixes and the pre-existing EnvironmentBanner are included. No routing, onboarding, geofence behavior or history schema changed.

## Deployment and rollback requirements

Production remains on the previously approved release. Before any production rollout, get explicit approval and check active sessions. Back up database/rules/Hosting IDs. Deploy additive canonical rules from bus-safety-admin first, then the compatible driver website and admin dashboard. Old clients remain valid under these rules but cannot emit heartbeats; their freshness is inferred from GPS only. Never deploy the new client before its heartbeat rule is present: a rejected initial heartbeat fails closed rather than pretending to track.

Rollback the affected Hosting bundle to its captured compatible version if needed; retain the additive strict heartbeat path while new clients may remain open. Do not restore database snapshots over live GPS or remove replay protection. Staging preflight backup (DPAPI, round-trip verified) is at %LOCALAPPDATA%/CCSBusTracker/security-backups/2026-10-17T00-58-14.839Z, with zero active locks before this rollout. Previous staging Hosting versions: public 37748bd51713005b; admin 685de4fb1b953958.

Manual acceptance: use the existing staging driver account on iPhone Chrome; keep the page visible, hold stationary several minutes, test movement, Stop and reconnect, and observe the admin Bus Details page. Browser sleep/background execution can suspend both timers and GPS; heartbeat makes that visible but does not guarantee background tracking. Public maps intentionally continue showing GPS staleness, rather than treating private tracker presence as fresh public GPS. Existing UID-based multi-device lock limitations and client-asserted location trust remain unchanged.

## Foreground iPhone follow-up — October 16, 2026

The operator reported a 92-second-old GPS capture with a 17-second-old heartbeat while the iPhone Chrome driver page remained visible/unlocked. The earlier heartbeat test proved connectivity/pipeline behavior, not native device GPS delivery. Inspection found the one-second upload retry never requested a new fix after watchPosition became quiet. A new regression failed on that implementation (one initial native request, no recovery) before the change.

FreshLocationRecovery now requests a high-accuracy, maximumAge:0 reading after three seconds without an accepted watch fix. It permits only one native request in flight, with a ten-second browser timeout. Fresh request results permit another request at the next one-second tick; errors or duplicate captures back off five seconds. Normal one-second watch callbacks suppress these extra requests. Hidden pages and disconnected uploads pause recovery; Stop and authorization failure cancel further requests and ignore late callbacks. A late failed request cannot override a freshly recovered watch. Coordinates and capture timestamps are never fabricated or advanced by a timer. The existing queue still validates, deduplicates and orders every capture. Heartbeat cadence stays 15 seconds; there are no new heartbeat/history writes or rule changes in this follow-up.

Admin tables now say GPS captured and update their elapsed seconds in an isolated component, without rereading Firebase or rerendering the map each second. Bus Details and Live Map use the same explicit label. Overview safety events now use their independent subscription rather than GPS-triggered GETs. The driver wording is Saves each fresh GPS fix, replacing a misleading unconditional Saving every second claim.

Verification: **233 local tests passed** (public 72, admin 73, transition/security emulator 30, canonical admin rules 24, admin Phase 2 rules 19, public rules 7, security-tool tests 8). Both apps passed production and staging builds. Pattern/known-secret scans found no publishable credentials; the ignored local synthetic-account journal remains excluded.

A separate hosted staging recovery test used SYN-102 without modifying SYN-101, the operator's active phone test. The synthetic provider supplied no watch callbacks; 58 distinct capture timestamps were delivered to both public and admin listeners during 60.5 seconds, including the initial fix and the three-second recovery delay. Stop released its own lock and produced no further requests/GPS/heartbeat writes over 17 seconds. Bus/driver definitions, geofences, history, safety, incident, audit and device records matched their pre-test hashes. This validates the fallback request/upload path against hosted rules, not the frequency or accuracy of native iPhone measurements.

Only the two staging Hosting sites were updated. Every hosted asset matched its tested build (9 public, 6 admin). No rules changed during this follow-up. Encrypted staging preflight snapshot: %LOCALAPPDATA%/CCSBusTracker/security-backups/2026-10-17T01-51-13.980Z, verified by DPAPI round trip. Previous compatible staging Hosting versions: public 9194b591e3d8e975; admin 1ac69388d5421785. Retain existing strict/additive rules if reverting these Hosting bundles. No full-database restore is needed or permitted for a UI rollback.

Phone acceptance remains required: Stop Tracking, refresh driver and admin, Start again with the driver page visible. Observe capture timestamps during stationary and moving tests. Browser/native location services can still return no fix or take longer than one second, even in the foreground. Do not interpret a heartbeat as fresh GPS or promise guaranteed one-second/background location. Production remains unchanged.
