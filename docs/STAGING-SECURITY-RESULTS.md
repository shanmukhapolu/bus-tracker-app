# Staging security deployment and verification

October 16, 2026 · Staging only · Production approval still required.

## Outcome

The approved strict rules and compatible public/driver build are deployed to `chsbustracker2-staging`. Hosted GPS security, reconnect, preservation and administrative lifecycle checks passed. No critical acceptance test failed; Hosting rollback was not needed. No production endpoint was used for deployment or database access, no billing was enabled, and nothing was pushed to GitHub. Admin Hosting and unfinished Cloud Run work were not deployed.

This GPS/security release is ready for review for a controlled production rollout, with the cutover and manual-device limitations below. It is not certification of district compliance or full-fleet Spark capacity.

## Deployment evidence

| Item | Verified result |
|---|---|
| Predeployment snapshot | October 16, 7:22:49 PM EDT; 20 synthetic buses, zero active locks |
| Rollback Hosting version | `996c5371f0545dd4`; all 9 served assets matched the local compatible bundle before deployment; both GPS services passed strict emulator rules |
| Rules source | Canonical `bus-safety-admin/database.rules.json`; staging-only guard passed |
| Rules readback SHA-256, normalized JSON | `d9ae28f65a1dd94cdc71f9c9643f9a3a2a34d3ca7e7c1e66700076fdfe0777a6` |
| Candidate rules file SHA-256, raw bytes | `cb6e857178b6c879043b20a09978b9122d0b77cf0af42b7db386734bf793b344` |
| New public/driver Hosting version | `37748bd51713005b`, released 7:25:18 PM EDT |
| Unchanged admin Hosting version | `685de4fb1b953958` |
| Main public JavaScript SHA-256 | `7ad31895159368947ac1856a3deae575ff92ae195a6ccd0a02da1c8969fc9b9f`; all 9 deployed assets match local files |

Rules were deployed first, read back and compared, then public/driver Hosting was deployed. The rollback and new public bundles have identical content; this release installs the stricter server rules with the already compatible client. No visible redesign was expected.

The predeployment encrypted database/rules/releases backup is under `%LOCALAPPDATA%/CCSBusTracker/security-backups/2026-10-16T23-22-49.914Z/`. Encrypted SHA-256: `ff623d275b1b4b80c5e77130f55e375a10072c45c481bfdbe3646f068251d4da`. Windows DPAPI CurrentUser encryption was verified by decrypting in memory and comparing bytes. Recovery requires the same Windows profile; this is not an off-device disaster-recovery backup. No Authentication password export was made. A final encrypted snapshot was captured at 7:37:18 PM EDT.

## Tests

All final test runs passed:

| Suite | Passed | Failed |
|---|---:|---:|
| Public unit | 60 | 0 |
| Security diagnostic helpers | 8 | 0 |
| Admin unit and deployment guards | 67 | 0 |
| GPS security and both-client transition emulator tests | 28 | 0 |
| Public Firebase rules | 7 | 0 |
| Admin Firebase rules | 24 | 0 |
| Phase 2 security regressions | 19 | 0 |
| Hosted optimized GPS scenario | 1 | 0 |
| Hosted compatibility GPS scenario | 1 | 0 |
| Hosted admin lifecycle/audit scenario | 1 | 0 |
| Synthetic browser-test cleanup verification | 1 | 0 |
| **Total final runs** | **217** | **0** |

The 213 existing local tests were rerun after deployment. The two GPS hosted scenarios each include 33 checks, rather than representing only one assertion. Each offered 60 distinct fixes at approximately one-second intervals: **60/60 reached the public listener and 60/60 the admin listener for each client**. GPS was synthetic; no physical-device locations were collected. The prior four builds passed before deployment; only test/report files were added during this verification, not website runtime code.

An initial run of the additional admin test harness stopped before network access because it imported an older staging Hosting-prefix validator from the isolated admin checkout. The harness was corrected to assert the exact staging project, database endpoint, Auth domain and synthetic account identity directly. It then passed. Application code, deployment guards and security rules were not relaxed. This initial harness setup failure is not hidden by the final totals.

### Security and recovery verified on deployed staging rules

- Authorized drivers upload only to their assigned bus. Wrong-bus and disabled-driver locks are denied. Disabled GPS writes and forged driver identities are denied.
- Anonymous reads of drivers, private telemetry, trips, safety events and audit logs are denied.
- Stale captures, changed duplicates, expired/future captures and malformed coordinates/speed/accuracy are denied. Exact unchanged retries remain intentionally idempotent.
- Public/private coordinates, accuracy, capture time, bus identity and active state agree for accepted fixes; public records contain neither driver identity nor private speed.
- Timestamp-free cached-client request shapes, private/public deletion, removing the capture watermark and independent public-coordinate changes are denied. Emulator tests additionally cover a timestamp-free client before any upgraded capture exists and driver handover.
- Disconnect atomically marks projections inactive and releases the owning lock. Reconnect cannot resume a lost session. An explicit new start succeeds; final stop leaves zero locks.
- Both service implementations are exercised using synthetic browser-geolocation callbacks and real Firebase SDK connections. This is packet/service-level cached-client testing, not a claim that every old browser/device was manually exercised.

### Browser checks

- Public bus search, map, selected bus details, live indication and return to zero active buses worked.
- Admin bus details visibly received changing GPS/speed; Overview, Live Map and full-map controls worked.
- Safety Events and a simulated incident/evidence page loaded. Trip History loaded the October 14 synthetic trip and its playback controls. Device Monitoring, Drivers and Buses loaded without permission errors.
- Geofences displayed its valid empty state; no staging geofence fixtures exist, so populated geofence editing was not manually exercised in this run. Local geofence/security regression coverage passed.
- Synthetic driver sign-in showed only the assigned bus. Reload returned to sign-in; signing in again worked. Actual device permission prompts and phone background behavior were not exercised.
- Browser error logs sampled after deployment contained zero error-level, permission-denied or network errors. Both sites returned HTTP 200 with CSP, nosniff and frame-denial headers; public HTML is non-cacheable. Existing admin cache policy was not changed.
- Browser control stalled on the native SYN-119 reactivation confirmation. After the operator closed the dialog, the page showed successful reactivation. The existing audited admin service returned SYN-119 to its original inactive state; both actions remain in audit history. This was a browser automation limitation, not an authorization failure.

## Preservation and administrative actions

Compared the final database with the encrypted predeployment snapshot, in memory without logging protected contents:

- All 20 trip-history groups, 20 safety events, 20 incident-evidence records, 20 device records, 10 drivers, 2 administrators and the existing session-closure record are unchanged.
- All **14 pre-existing audit records** are unchanged. Four legitimate records were appended: SYN-118 deactivation/reactivation and SYN-119 reactivation/deactivation. Final audit count: 18.
- Bus registrations and lifecycle states are restored; only administrative `updatedAt` values differ for the two tested buses. No driver assignments changed.
- Intended live changes are limited to SYN-101 public/private simulated GPS and SYN-118's sanitized public projection following its lifecycle cycle. SYN-118 is active but not tracking, with private last-known telemetry preserved. SYN-119 is inactive and absent from the public projection. No history was deleted or restored over newer data.
- Final tracking-lock count is zero. No real driver or production records were used.

## Remaining limits and production approval conditions

1. Approve a separate production maintenance window, freshly verify production release/rules baseline through authorized read-only access, and make an encrypted production backup in the approved protected location. None of this staging approval authorizes production deployment.
2. Stop all driver sessions, close old tabs, deploy strict rules followed immediately by the compatible public build, then require reload/sign-in and an explicit tracking restart. Older timestamp-free clients intentionally fail closed.
3. Rollback uses a separately validated **production-configured compatible build**, never the staging bundle or timestamp-free production release. Keep strict rules; if a rules issue arises, pause and fix forward. Do not overwrite history from a snapshot.
4. Manually exercise representative driver phones, permission handling, cached-page reload, app/background suspension and poor-network recovery before expanding a production pilot. UID-based locks still cannot distinguish multiple tabs using the same account.
5. GPS coordinates/timestamps remain client assertions. This change does not provide trusted-server attestation, validated collision detection, five-year hosted history capacity or proof that Spark supports 188 concurrent buses.
6. The isolated admin checkout has an older staging Hosting-prefix validator that rejects `chsbustracker2-staging` because it starts with the production project name. Its staging rules deployment guard works and this release did not deploy admin Hosting. Reconcile that pre-existing build-configuration issue before a future admin staging rebuild/redeployment; do not include unrelated unfinished backend work.
7. Earlier credential-incident log-coverage gaps and district privacy/accessibility/records-policy decisions remain. Automated and staging results do not establish full school-district compliance.

No critical failure required restoring Hosting. The verified staging rollback version remains available. Development branches were not pushed, and production remains unchanged.
