# Staging phone timing check

The iPhone screenshot shows a recent tracker report and an older GPS capture. This change does not claim to solve the phone's capture cadence. It adds local timing evidence to distinguish native location-response delays from Firebase delays.

## What changed

Staging driver sessions expose a GPS timing check beneath the tracking controls. It counts periodic fresh-location requests, their completions and latency, accepted/repeated fixes from either GPS source, GPS acknowledgements and report acknowledgements. It shows pending request/upload age, current capture age, connection status, and numeric native error codes.

No coordinates, identity, error strings, credentials or absolute timestamps appear in the report. Counters live only in memory, cause no Firebase reads/writes, and freeze at Stop or a terminal tracking failure. The panel unmounts when the session ends. Production builds neither create the collector nor display the panel. No rules or schema changes are needed.

## Phone procedure

1. Stop tracking, then refresh https://chsbustracker2-staging.web.app/drivers on the iPhone.
2. Start tracking and expand STAGING: GPS timing check.
3. Keep the page visible and unlocked for 60 seconds. Copy the timing report before Stop Tracking (the panel closes on Stop).
4. Share only the timing report for diagnosis. Do not share credentials or coordinates.

A growing requestPendingMs with recent report acknowledgements indicates the native request is still waiting, not an upload backlog. Repeated fixes increase repeatedOrOlderFixes but never advance gpsCaptureAgeMs. A growing uploadPendingMs indicates an acknowledgement delay. Millisecond measurements are local wall-clock estimates; screen suspension and clock changes can affect them. These diagnostics are not proof of physical GPS accuracy or a guarantee of one-Hz sensor sampling.

## Verification

79 application tests, 31 emulator compatibility/security tests, and 7 emulator rules tests passed. Both production and staging builds passed (existing large-map-chunk warning). Tests cover a six-second native delay, independent upload timing, duplicate capture preservation, no additional diagnostic database traffic, Stop freezing, late callbacks and the production diagnostic guard.

Physical iPhone validation remains pending. No production deployment, admin Hosting deployment, security-rule change, account mutation or history mutation is part of this diagnostic release.
