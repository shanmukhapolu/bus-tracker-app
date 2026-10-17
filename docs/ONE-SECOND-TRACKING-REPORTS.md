# One-second tracking reports — October 16, 2026

This supersedes the 15-second heartbeat default and three-second quiet-watch recovery described in TRACKER-HEARTBEAT-VERIFICATION.md. Released to staging only; production remains unchanged.

## Behavior

- While tracking, the default report timer runs every 1,000 ms whether moving or stationary. Each protected trackerHeartbeats/{busId} report now contains lastKnownLocation (latitude, longitude, accuracyMeters, speedMps, headingDeg and the original capturedAt), plus server receipt time, GPS availability and configured interval.
- This is the last successfully acknowledged GPS measurement, not a timer-generated observation. Fresh GPS still updates liveBuses/publicBuses through the unchanged strictly ordered, validated GPS queue. Repeated reports never alter capture timestamps or create duplicate historical GPS points.
- The foreground client requests fresh maximumAge:0 GPS at a one-second cadence with one native request in flight. Request scheduling is anchored to request start, not callback completion, so a 100 ms callback does not halve the cadence. Native timeouts remain bounded at ten seconds. Browser suspension, lack of a GPS fix, denied location permission, network delays and loss of authorization can still prevent delivery; this is not a guarantee of one fresh physical measurement per second.
- GPS writes and reports are serialized. Reports cannot race a same-client GPS upload and accidentally reference an unacknowledged fix. Stop cancels future timers/requests, ignores late native callbacks, waits for already-issued writes and ends the owned session. Slow writes do not accumulate unbounded repeated reports.
- Admin shows Tracker report separately from GPS captured. Existing public/private separation and driver metadata subscriptions are preserved. No routing, onboarding, history or production changes.
- VITE_TRACKER_HEARTBEAT_MS remains configurable from 1,000 to 60,000 ms; unspecified/invalid values use 1,000. The tested staging build uses the default 1,000 ms.

## Rules

Canonical rules remain in bus-safety-admin. One-second reporting is allowed, but authentication, enabled-driver/bus, assignment and active-lock ownership checks remain unchanged. Optional lastKnownLocation is field-allowlisted and must exactly match the currently acknowledged protected GPS fields, including capturedAt. Older heartbeat clients remain compatible. Stale/altered/duplicate GPS protection is unchanged. Reports remain admin-readable only. The public repository contains an emulator fixture, never deployable authoritative rules.

## Verification

236 local tests passed: public 74, admin 73, transition/security emulator 31, admin rules 24, admin Phase 2 rules 19, public rules 7, security tools 8. Both repositories passed production/staging builds. Existing bundle-size warnings remain. Added cases cover five stationary minutes (301 reports including initial), repeated capture preservation, delayed writes/report ordering, 100 ms device callbacks, rejected forged report data, Stop, disabled accounts and reconnect.

Hosted synthetic SYN-102 test passed: 61 reports over 60.5 stationary seconds with the original GPS capture unchanged, then 59 fresh captures observed by both public and admin listeners. Stop prevented further requests/writes during 17 seconds and released the owned lock. Bus/driver definitions, histories, audits, geofences, incident/safety/device records matched their pre-test hashes. No production account/data was used. Hosted admin showed stationary status with a current report timestamp.

Stationary report payloads totaled 16,165 serialized JSON bytes: 265 bytes/report, roughly 15.9 KB/minute or 954 KB/hour at 1 Hz per bus. This excludes WebSocket/TLS/framing, acknowledgements, GPS writes and subscriber fan-out; it is not a billing measurement or a full-fleet Spark capacity claim. No billing was enabled.

All deployed assets match the tested staging files (9 public/driver, 6 admin). Secret scans exclude the intentionally private ignored synthetic-account journal; no publishable credentials were found. Actual iPhone device cadence remains a manual acceptance check.

## Rollout and rollback

Staging database/rules/releases were backed up with verified Windows DPAPI round trip at %LOCALAPPDATA%/CCSBusTracker/security-backups/2026-10-17T02-02-09.644Z. Zero active tracking locks were present. Previous compatible Hosting versions: public 7a6d92107297e931; admin e137953e3721e5c5.

Order: canonical staging rules, staging public/driver Hosting, staging admin Hosting, synthetic tests and asset verification. No production changes are authorized. If reverting Hosting, retain the backward-compatible strict report rules while a new client may remain open; never roll back replay protections or restore a full database over live records. For phone acceptance: Stop, refresh both staging sites, then Start. Observe Tracker report near 0–1 seconds while connected; GPS captured remains truthful even when the phone returns no new measurement.
