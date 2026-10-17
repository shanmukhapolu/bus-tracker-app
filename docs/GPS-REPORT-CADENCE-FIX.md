# GPS report cadence correction

## Phone evidence

A foreground staging phone run reported 64,185 ms elapsed, 40 acknowledged tracker reports, 7 accepted GPS fixes and 7 GPS uploads, with no GPS upload errors. The latest upload took 95 ms. One native location request had been pending for 7,992 ms, and the last capture was 8,951 ms old. Those observations distinguish report cadence from fresh sensor availability; they do not prove the cause of every missed report.

## Reproduced application defect

The previous heartbeat combined setInterval(1000) with a strict elapsed-time guard based on the previous actual callback. If one callback ran at 1,005 ms and the next at 2,000 ms, the latter was rejected because only 995 ms had elapsed. It then waited an entire additional interval. A regression with alternating five-millisecond callback delay produced only 33 sends in 64 seconds (including the initial send), rather than 65.

The heartbeat now schedules the remaining time to its next deadline with a monotonic clock. A slow acknowledgement still permits only one outstanding report. Resume does not replay a burst of missed intervals. Stop and disconnect cancel scheduled attempts. The periodic fresh-location requester had a similar guard; it now schedules a short remainder retry instead of silently losing a whole second.

The same regression now produces 65 sends, all spaced at least 1,000 ms apart. No GPS coordinates or capture times are fabricated, no historical records are written, and the Firebase schema/rules are unchanged. No paid services are involved.

## Verification and limits

83 app tests and 38 Firebase emulator security/compatibility tests passed. Both builds passed with the existing large map-chunk warning. Tests include late callbacks, no catch-up burst, wall-clock changes, disconnect, pending native requests, Stop, duplicate/stale captures, and authorization.

This fixes an observed application scheduling defect. It does not guarantee the iPhone supplies fresh GPS measurements once a second. The phone must be retested after loading the new staging bundle. Approximately one report per second remains dependent on foreground scheduling and network availability. A repeated last-known location retains its original capturedAt; the report timestamp is separate.

Production, admin Hosting, rules, assignments and onboarding are outside this release. Development branch: dev/spark-gps-release. Only the public/driver staging Hosting bundle is to be updated.

## Hosted staging verification

The synthetic SYN-102 Firebase smoke test passed: 60 reports in 60.5 stationary seconds with one unchanged GPS capture; 60 fresh synthetic captures during the subsequent 60.5 seconds, all observed by both public and admin listeners. Stop released the lock, marked the bus inactive and produced no further traffic during 17 seconds. Hashes of bus/driver metadata, history, audit, geofence and device records remained unchanged. This used a simulated location provider, not the physical iPhone. Total: 122 tests passed including this hosted check.
