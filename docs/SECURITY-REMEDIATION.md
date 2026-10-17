# Credential incident and GPS release remediation — 2026-10-16

**Release status: HOLD. No push, Hosting deployment, rules deployment, production-data change, billing change, or history deletion was performed for this remediation.** Cloud Run work is excluded. School-district compliance is not established by these tests.

## Credential incident

Severity: **Critical**. Firebase CLI 15.31.0 `login:list --json` returned a Google OAuth refresh token, access token, and OpenID ID token into the task's diagnostic tool transcript at approximately 17:52 EDT on October 16. This was CLI account authentication, not a public Firebase web API key or a driver password.

The affected Google account (identified in the private incident journal, masked here as `j***@gmail.com`) had direct Editor access to production `chsbustracker2`, Owner access to `chsbustracker2-staging`, and Owner access to three other projects, one already pending deletion. The project inventory had no further page. Tested permissions included Firebase Authentication user administration, RTDB instance access/update, Hosting updates, service enablement and audit-log listing. Production did not grant private Data Access log viewing or IAM policy writes in the tested set. OAuth scopes included Firebase, cloud-platform and account email; effective access also depends on IAM. Group/inherited/conditional access was not exhaustively audited.

Containment completed at 22:21 UTC:

- Revoke via **HTTPS POST** to Google's OAuth revocation endpoint, placing the credential in the form body only. No credential was placed in command arguments, a URL, output, or a new file.
- Google returned HTTP 200. Refreshing the revoked grant returned HTTP 400 `invalid_grant`; the cached access token returned HTTP 401.
- Removed the revoked Firebase CLI login and associated local CLI credentials. The safe status command now reports signed out and no local credential.
- Independently read the **exact originally exposed token** from the existing transcript in memory, without copying it into a report or another file: its refresh attempt also returned `400 invalid_grant`, and its original access token returned `401`.
- The exposed material remains in the original transcript and any retained copies. Revocation prevents reuse of the tested OAuth credentials; it does not erase retained logs or establish that no earlier access occurred. It does not prove every separately established session has terminated.

Operator follow-up: review Google Account → Security → Your connections to third-party apps and services → Firebase CLI; remove that connection if still present, and review recent account security activity. The grant has already been revoked; do not paste tokens into this interface or a shell. A future CLI login must be interactive, without JSON/debug output. Do not use `logout --token <value>`: this CLI version includes the token in its success output, and its revoke implementation puts the token in a request URL. The native POST containment used here avoids both.

### Log evidence and limits

Read-only Cloud Audit Logs queries covered October 9 through containment, using available Activity, Data Access and Policy log categories. They returned 48 staging entries and 2 production entries, without pagination. Returned records were setup/configuration operations; production entries were failed service-enable operations. No returned entry fell after the exposure time. **No positive evidence of unauthorized activity was found in this limited evidence, but absence of misuse cannot be established.**

Project-level `auditConfigs` were empty; inherited logging configuration was not checked. RTDB record reads/writes, Hosting activity, log ingestion delays, unavailable private production logs, other projects, identity-provider activity and GitHub access are coverage gaps. Logs in the other three accessible projects were not investigated before revocation. CCS IT/account owners should review those independently. No production records were exported or copied into staging.

### Secret review and safeguards

Scanned current source/configuration and generated artifacts, locally reachable Git history/refs, Git index blobs, Git configuration, and the isolated release checkouts. Scanner output contains only rule identifiers and locations/blob IDs, never matched values. OAuth tokens, JWT credentials, GitHub tokens, private keys, embedded URL credentials, literal password assignments and known local synthetic-account passwords are checked. Firebase web API configuration is not classified as a password.

Known synthetic-account passwords remain only in ignored local staging journals; they are deliberately excluded from commits. Fixed emulator-only test credentials in the unfinished backend work are excluded from this release. No exposed CLI credential was found in the reviewed repository history or release artifacts. This is pattern-based scanning, not a proof that every possible secret format or remote/unreachable object has been inspected; dependency directories and binary artifacts are outside the textual scan.

Use `npm run security:scan` before staging a commit and immediately before push. Use `npm run firebase:status:safe` with `FIREBASE_CLI_PATH` pointing to the installed `firebase-tools/lib/bin/firebase.js` for account diagnostics. It emits only signed-in state, account email and whether a local credential exists. Do not dump authentication objects, environment variables, CLI config, raw HTTP request/response bodies, `login:list --json` or debug logs. Ignore rules cover local credential journals and diagnostic logs; these are safeguards, not a global prohibition on someone bypassing the documented tools.

## GPS compatibility and rule changes

Severity: **High**. The inspected production rules omit `capturedAt` from both live/public field allowlists. The optimized client sends that field, so Firebase rejects its entire atomic update. Making the field optional would allow cached timestamp-free clients to bypass capture ordering; this was not done.

The candidate rules require real capture timestamps for active GPS, numeric/range validation, a five-minute maximum capture age and a one-minute future tolerance; receipt timestamps must not regress. Capture timestamps must increase, or an identical capture may be retried only with unchanged GPS evidence. An identical retry does not create another history record. Drivers must be enabled, assigned to the enabled bus, and own its active lock. Existing deny-by-default, administrator authorization and public/private separation remain.

Additional gaps closed during review:

- Drivers cannot delete `liveBuses` or `publicBuses` to erase ordering state. Firebase skips `.validate` on deletion, so this protection belongs in `.write`.
- A timestamp-free inactive update may only stop an existing unchanged legacy position; it cannot replace coordinates.
- Driver public GPS coordinates/accuracy/capture timestamp must match the resulting private projection. The private watermark survives an administrator removing the public projection during lifecycle management. Administrator public removal remains supported.

`bus-safety-admin/database.rules.json` in `dev/spark-security-remediation` is the canonical rules candidate. The public repository copy under `scripts/spark/fixtures/` is emulator-only and must not be deployed. There are no new collection paths or migrations, and no history/audit deletion.

### Legacy compatibility client

`scripts/security/legacy-compatibility.patch` applies to public client base `0618dfbfaa03aa0d618d7f3b52b55678d3fd8f40`. A separate local `dev/spark-legacy-compat` checkout contains the applied patch and builds successfully. Its frozen service fixture is tested alongside the optimized service.

Only GPS transport/session behavior changes: serialize the original `GeolocationPosition.timestamp` as `capturedAt` into both projections, correct the root reference, reject locally reversed fixes, atomically stop projections/release the lock, verify ownership on reconnect, and stop publishing after a session/authorization failure. Layout and onboarding remain unchanged. This compatibility client retains the legacy delivery cadence/coalescing behavior; the optimized FIFO sender remains the intended performance release.

Unpatched cached clients are **rejected**, including on their first upload, after a newer fix, through partial writes, and after reconnect. They must stop tracking, close old tabs, reload, verify their assignment and start a fresh session. No automatic claim is made that every open browser can be force-updated. Locks remain UID-based: multiple tabs using the same account are not independently session-identified, so all old tabs must be closed during cutover. Device timestamps/coordinates remain client assertions; a malicious authorized client can fabricate a new timestamp. Trusted-server attestation/validation remains future work, not included here.

## Verification

Final local suite results: **213 passed, 0 failed**:

| Suite | Passed |
|---|---:|
| Public release unit tests | 60 |
| Isolated admin unit tests, including staging deployment guard | 67 |
| Public Firebase rules | 7 |
| Admin rules, bus lifecycle and ordering | 24 |
| Phase 2 race, revocation, audit and backfill regressions | 19 |
| Spark rules plus both-client transition/security tests | 28 |
| Credential detection and safe diagnostics | 8 |

Initial test failures were resolved: disconnect registration needed a comparison that did not require both projected `active` flags to change during registration; old fixtures needed a single capture timestamp per GPS fix; normal unit discovery was restricted to `src` to avoid discovering ignored hosted-staging scripts or Node's separate test runner. The protection was retained and the final suites rerun.

Local production builds succeeded for the optimized public client, patched legacy client and unchanged admin website. The optimized public staging build also succeeded. Existing large-bundle warnings remain. Backend tests/builds are not represented in these counts; unfinished Cloud Run work is intentionally excluded.

Both clients also passed separate hosted staging smoke scenarios: each delivered 60 distinct one-second fixes to public/admin listeners, denied unauthorized/stale uploads, disconnected and restarted safely, and left history, drivers, geofences, devices and audits unchanged. These were service-level tests with synthetic staging accounts, not a new browser UI deployment. The canonical candidate rules SHA-256 is `cb6e857178b6c879043b20a09978b9122d0b77cf0af42b7db386734bf793b344`.

The new rules have not been installed in hosted staging or production. The staged release must pass the deployment checklist in `CONTROLLED-GPS-RELEASE.md` before production approval is requested. Hosted compatibility smoke results, if run, exercise the **existing** staging rules and do not prove that the new rules have been deployed.

## Remaining release blockers

1. Explicit approval for a staging rules/client release, followed by fresh synthetic hosted verification of the exact reviewed hashes.
2. Explicit production approval after staging acceptance, a controlled driver cutover and backup/restore rehearsal.
3. Repository-owner confirmation that the development-branch push cannot trigger an external production deployment. The previous user-requested push hold remains in effect.
4. Credential incident follow-up: account-owner review of the other accessible projects and available security logs; document residual logging uncertainty.
5. Known architecture limitations: browser background GPS, UID-only multi-tab locks, client-asserted GPS, incomplete trusted audit coverage and Spark connection/capacity limits. Automated tests do not establish legal, privacy, accessibility or school-district compliance.

The code is ready for security review and an approved staging verification cycle, **not an unattended production release**.

## October 16 staging preparation update

The user reports repository-owner confirmation that no automatic deployment integrations exist. The earlier integration uncertainty is resolved; explicit release approval is still required. A new interactive CLI login was authorized after revocation and used for a read-only encrypted staging backup at 22:59 UTC. The original compromised grant remains revoked; do not rerun revocation against the new login. All 213 local tests and four builds passed again. See [the staging approval packet](STAGING-SECURITY-APPROVAL.md) for the fresh baseline, exact deployment order and rollback plan. No deployment or push occurred during preparation.
