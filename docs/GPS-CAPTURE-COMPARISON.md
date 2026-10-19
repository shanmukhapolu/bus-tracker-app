# GPS capture comparison — October 18, 2026

## Findings

**The old one-second display was not proof of one-second capture.** The exact pre-optimization implementation at commit 0618dfbfaa03aa0d618d7f3b52b55678d3fd8f40 kept latestPosition and re-uploaded it on every 1,000 ms timer tick, including when watchPosition had supplied nothing new. publishPosition wrote a new server lastUpdated timestamp but omitted capturedAt from both liveBuses and publicBuses. The current admin prefers capturedAt over lastUpdated. Replaying the exact old Git blob in a synthetic VM produced 64 additional uploads over 64 seconds with no additional Geolocation callbacks. The legacy source is used only by a local test and is not bundled into the websites or connected to Firebase.

**An application queue delay was reproduced and fixed.** A valid callback arriving after the queue drain emptied but before the enclosing upload promise finished could remain queued until the next one-second retry tick. The service now starts another drain immediately after a successful completion if work remains. It does not spin on errors, resume while disconnected, bypass authorization, overlap writes or generate catch-up reports. The regression test failed before the fix and passes afterward. This bounds a specific unnecessary application delay; it does not explain the whole sparse-phone-reading result.

**The earlier phone diagnostic did not isolate Safari.** Its freshFixes counter counted accepted queue entries after validation; it did not count raw watch callbacks separately from getCurrentPosition responses. Seven accepted and acknowledged fixes in 64 seconds, zero upload errors, and a pending native request suggested capture-side waiting, but were insufficient to rule out filtering or recovery interference. Attribution specifically to Safari remains pending paired physical-phone measurements.

## Measurements now available on staging

- Successful raw callbacks by source: initial, watch, and request. Each source records callback gaps and newer, repeated, older or invalid timestamps before queue validation.
- rawNewerTimestamps: strictly increasing browser-supplied timestamps across all sources, before validation. This measures API timestamps, not independent proof of satellite/GPS accuracy.
- Queue decisions: queued, duplicate, older, invalid, overflow. New timestamps with unchanged coordinates are accepted.
- For each of the most recent 256 callbacks: relative callback time, capture age when received, queue decision, upload attempts, callback-to-send wait, Firebase acknowledgement latency, callback-to-acknowledgement latency. Last-window p95/max summaries are also available.
- Counters continue for the session; detailed timings are bounded to 256 callbacks. Capture age uses the phone wall clock and can be distorted by clock skew. Queue/network durations use a monotonic clock. Pending accepted samples are bounded by the existing 120-fix queue.
- Tracker report counters remain separate. Neither diagnostics nor heartbeats refresh a GPS capture timestamp. Diagnostics are local memory only: no coordinates, account identity, credentials, absolute capture timestamps, storage or extra database reads/writes.

## Security and intentional rejection

The queue rejects duplicate/out-of-order timestamps, invalid numeric fields, coordinates outside geographic bounds, accuracy outside 0–10,000 m, speed outside 0–90 m/s, and heading outside [0,360). Overflow fails visibly without evicting earlier accepted fixes. Firebase rules still enforce timestamp freshness/monotonicity, driver identity, account authorization, assigned bus and session ownership. This change does not loosen those rules or replay an old client against strict staging rules.

## Local results

93 application tests and 38 Firebase emulator security/compatibility tests passed. Both builds passed with the existing map chunk-size warning. The test set covers the exact historical implementation, completion-race re-drain, 60 one-Hz watch callbacks with unchanged coordinates, simulated 95 ms acknowledgements, repeated/older/invalid callbacks, failed upload retry, disconnects, permissions, Stop, bounded diagnostic memory and the production comparison-mode guard.

A synthetic 64-second run with 64 watch callbacks but only seven distinct increasing timestamps produced exactly seven GPS acknowledgements and 65 separate tracker reports. No accepted fix remained pending. A 60-callback one-Hz run acknowledged all 60 fresh watch fixes plus its initial fix; the simulated Firebase p95 was 95 ms. These are controlled tests, not measured Safari/device performance.

## Required physical Safari comparison

Stop before changing pages. Use the same phone, Safari, location, foreground/unlocked state and approximately the same movement conditions.

A. https://chsbustracker2-staging.web.app/drivers?gpsTest=watch-only disables extra recovery requests for this staging session and keeps the normal watch options used by the old capture flow.

B. https://chsbustracker2-staging.web.app/drivers uses the current watch plus recovery requests.

Run each for at least 60 seconds. Before stopping, copy the STAGING: GPS timing check report; enable Include per-fix timings when individual delays need investigation. Confirm diagnosticVersion=2 and recoveryEnabled=false for A / true for B. Repeat in reverse order if the rates differ, because GPS conditions vary over time.

Interpretation: sparse watch callbacks in both modes points toward native/browser delivery. A repeatable callback drop only with recovery enabled suggests interference from our recovery strategy. Many raw newer timestamps but rejected entries or a growing accepted queue points to application validation/queue behavior. Short queue waits plus slow Firebase acknowledgement points toward network/backend latency. Do not identify Safari as the sole cause without these measurements.

Only the staging public/driver Hosting site is updated. Production, admin Hosting, database rules, assignments, history, signup and routing remain unchanged. The watch-only option is ignored in production. No billing changes.

## Hosted staging verification

The synthetic hosted test passed against chsbustracker2-staging: 61 separate stationary tracker reports during approximately 60 seconds, followed by 60 fresh simulated watch fixes at approximately one per second. All 60 fresh fixes were observed through both public and administrative data listeners. The initial fix plus the 60 watch fixes produced 61 acknowledgements; 120 repeated recovery responses were classified as duplicates, with zero invalid or overflow decisions and zero accepted fixes remaining pending.

Measured across those 61 acknowledgements: queue-wait p95 0.09 ms (maximum 46.51 ms), Firebase-acknowledgement p95 104.66 ms, and callback-to-acknowledgement p95 104.72 ms (maximum 288.20 ms). These are hosted staging network measurements from a synthetic Geolocation provider on the development computer, not iPhone/Safari measurements. Stop ended requests and writes and released the test session. Protected history, audit and metadata checks passed. The hosted test brings this run to 132 passing tests, zero failures.

Physical Safari A/B results are still required before deciding whether recovery requests affect native callback delivery. No production release is approved by these synthetic results.

## Physical phone A/B results supplied by the operator

Watch-only A ran for 75.191 seconds; watch-plus-recovery B ran for 63.357 seconds. Each received seven successful watch callbacks and seven unique increasing capture timestamps across all sources, acknowledged all seven fixes, rejected no invalid/older fixes, and had no accepted fix pending. Maximum watch gaps were 14.076 seconds (A) and 14.563 seconds (B). Maximum callback-to-acknowledgement latency was 127.7 ms (A) and 230 ms (B). Tracker report acknowledgements were 75 and 63, respectively.

A classified one initial/watch overlap as duplicate. B classified six duplicates; the five successful recovery callbacks added no globally new capture timestamps. Recovery did not establish one-Hz fresh capture in this pair. Different durations and varying GPS conditions prevent attributing a small difference in cadence to recovery interference.

The long gaps occurred before application callbacks, not in the upload queue. These device reports support sparse phone/browser location delivery under the tested conditions, but cannot distinguish browser scheduling from the operating system location provider. All delivered fresh fixes were preserved. Genuine one-Hz physical capture remains unmet; movement and background operation are not guaranteed. The earlier statement that physical A/B evidence was pending is superseded by this section.
