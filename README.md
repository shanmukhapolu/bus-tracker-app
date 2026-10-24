# CCS Bus Tracker

Public bus-location website and driver phone tracker for the shared CCS bus-tracking prototype. The protected operations dashboard is maintained separately in the private `bus-safety-admin` repository.


## Firebase project setup for `working-gps-version`

This branch's production web-app configuration and Hosting alias now target `chsbusapp`. The app's driver authentication, driver profiles, bus assignments, and live GPS code use Firebase Authentication plus **Realtime Database**. The runtime loads the Realtime Database SDK and does not initialize or use Cloud Firestore. Changing the web configuration does not migrate records, authentication users, or security rules.

The supplied web config did not include a Realtime Database URL. `.env.example` therefore uses the conventional `https://chsbusapp-default-rtdb.firebaseio.com` URL as a placeholder assumption. Confirm the actual URL shown in Firebase Console after creating the Realtime Database, and update `src/config/deploymentEnvironment.ts` and `.env.example` if the instance uses a regional `firebasedatabase.app` URL.

Before using this branch with real drivers, enable the required Authentication providers (Email/Password and Google if used by your sign-in flow), and provision Realtime Database with security rules reviewed specifically for `chsbusapp`. Cloud Firestore is not required by this application. The documented `bus-safety-admin` rules ownership and the existing rules fixture refer to the prior `chsbustracker2` project; do not assume the old project's rules, users, or records have been migrated. GitHub changes do not create or enable Firebase Console resources.

The public admin signup route is `/admin/signup`. It creates a Firebase Authentication email/password account and a Realtime Database record at `admins/{uid}` with `role: "admin"` and `enabled: false`. The database rules permit each authenticated account to create only its own pending profile, validate the email against the Firebase Auth token, restrict allowed fields, and deny the account permission to edit the profile after creation. An authorized project owner must manually set `admins/{uid}/enabled` to `true` in the Firebase Console before the account can enter the admin panel. This client-side signup is a request workflow, not proof of a person's district affiliation.

After reviewing the rules and confirming that the `chsbusapp` Realtime Database instance exists, publish its rules with `npx firebase-tools deploy --project chsbusapp --only database`. Publish the website and its CSP separately with `npx firebase-tools deploy --project chsbusapp --only hosting`. Never deploy these rules to `chsbustracker2`.

## Current system

- `/` is the public bus map.
- `/drivers` supports the existing Firebase driver signup, approval, sign-in, bus assignment, and phone GPS workflow.
- `/admin` is a legacy protected interface retained temporarily during consolidation into `bus-safety-admin`. New administrative development belongs in the standalone admin repository.
- Firebase Authentication protects driver and administrator sessions.
- Realtime Database Rules are the security boundary. UI checks are not authorization.

The public map reads only `publicBuses`, a public-safe projection containing bus number, route label, active state, approved coordinates, accuracy, and timestamps. It cannot read driver identities, internal telemetry, accounts, safety events, trips, incidents, devices, notes, geofence administration, or audit records.

Internal phone telemetry is stored under `liveBuses`. In the current no-cost prototype, an approved assigned driver writes both the internal record and the sanitized public projection atomically. A production district deployment should replace direct browser telemetry with a trusted ingestion service.

## Authentication and sessions

Driver onboarding remains self-registration followed by administrator approval. New profiles are disabled and pending until an enabled administrator assigns a bus and approves them. Browser authentication uses session-only persistence. A live driver profile listener stops tracking and signs the user out when the profile is removed or disabled.

Do not put passwords, service-account credentials, tracker secrets, database secrets, or private API credentials in frontend code. Firebase web configuration identifies the project and is not a server secret.

## Firebase data boundaries

| Path                                     | Public read | Authorized reader                          | Writer                                                         |
| ---------------------------------------- | ----------- | ------------------------------------------ | -------------------------------------------------------------- |
| `publicBuses`                            | Yes         | Everyone                                   | Assigned active driver; enabled admin for fleet initialization |
| `buses`                                  | No          | Enabled drivers and admins                 | Enabled admin                                                  |
| `liveBuses`                              | No          | Assigned driver for own bus; enabled admin | Assigned driver holding that bus lock; narrowly validated admin session closure |
| `activeDrivers`                          | No          | Enabled drivers/admins                     | Assigned driver; admin cleanup of the revoked driver's own lock |
| `drivers`                                | No          | Own profile; enabled admin                 | Pending self-registration or enabled admin                     |
| `safetyEvents`, `tripHistory`, `devices` | No          | Enabled admin                              | Restricted by collection rules                                 |
| `auditLogs`                              | No          | Enabled admin                              | Append-only enabled admin records                              |

### Firebase security-rules ownership

`bus-safety-admin` remains the canonical owner of Realtime Database security rules for the original shared `chsbustracker2` project. This `working-gps-version` branch now targets the separate `chsbusapp` Firebase project and configures `database.rules.json` as the rules source for that project only. The rules allow anonymous reads of the public-safe `publicBuses` projection, keep telemetry and administrator data restricted, and allow a user to create only their own pending administrator profile with `enabled: false`. A pending administrator cannot change their own role or enable themselves.

Before deploying rules to `chsbusapp`, review and test them against the current application schema. Deploy only with an explicit `--project chsbusapp` target; the deployment guard rejects the original `chsbustracker2` project. Never deploy this branch's rules to `chsbustracker2`. The standalone `bus-safety-admin` repository remains the rules owner for that original project.

`npm run test:rules` uses the sibling `../bus-safety-admin/firebase.json` emulator configuration. Keep that repository beside this checkout, keep the rules fixture synchronized, and use Java 21 or newer for Firebase emulator tests. This command runs only against a `demo-` test project; it does not deploy or modify production data.

## Security and validation

Rules enforce assignment and active-lock ownership, latitude/longitude limits, speed from 0–90 m/s, heading from 0–359.999 degrees, GPS accuracy from 0–10,000 m, recent timestamps, required fields, and an allowlist of telemetry fields. Public projection records reject driver IDs, safety fields, and unexpected children.

Hosting configuration adds CSP, clickjacking protection, referrer policy, MIME-sniffing protection, and a permissions policy that allows geolocation only from this origin. HTTPS and HSTS are provided by Firebase Hosting.

## Accessibility

The target is WCAG 2.1 Level AA. The interface includes keyboard focus styles, named controls, live status announcements, reduced-motion handling, and non-map bus information. Map tiles are visual context; bus state is also available through the bus list and detail card.

## Development and tests

Use Node.js 22 LTS.

```powershell
npm ci
npm test
npm run build
npm audit --omit=dev
```

Firebase rule regression tests require Java 21 or another Firebase-supported JDK on `PATH`:

```powershell
npm run test:rules
```

The suite covers anonymous users, enabled and disabled drivers, wrong-bus writes, admins, protected reads, public writes, malformed telemetry, unexpected fields, and private append-only audit records.

## Local configuration

Use the separate staging setup below: copy `.env.staging.example` to `.env.staging.local`, supply an approved staging project's own configuration, and run `npm.cmd run dev:staging`. Development deliberately rejects production configuration. `.env.example` documents production build settings; do not use it as a local-development shortcut. Never add server credentials or secrets.

Browser GPS requires HTTPS outside localhost and explicit location permission. Mobile browsers can suspend background tabs; a managed native application remains the recommended production tracker.

## Known production decisions

CCS Transportation, IT, and legal still need to decide route/VersaTrans integration, route and stop visibility, public GPS delay/generalization, retention periods, MFA and Workspace enforcement, final staff roles, managed-phone requirements, and approved vendors. This phase does not decide or implement those items.

## Phase 2A — isolated development and release safeguards

Phase 2A publication to GitHub and Firebase was explicitly approved on October 14, 2026. Release verification is recorded below. Separate cloud-staging and real-phone acceptance are still pending; publication does not establish district production readiness. The admin repository remains the sole rules owner; the public copy is a test fixture. The old /admin remains available, but bus registration must use the standalone admin's Buses page. Driver signup/onboarding is unchanged.

### Configure a separate staging project

Cloud project creation, enabling Authentication/Realtime Database/Hosting, seeding records and deployments each require approval. No staging cloud project has been provisioned by this work. Use a separate CCS-approved Firebase project, never a second Hosting site on the production database. No production Auth users, passwords, tokens, database exports or protected records may be copied.

After approval, configure that project's own web apps (public/driver and admin), default Realtime Database, Authentication providers and authorized staging domains. Register a staging public Hosting site and a separate admin site; use site IDs prefixed by the staging project ID. Configure Google sign-in/email-password as needed to match the current onboarding flow. Use synthetic accounts, not district/production credentials.

In EACH repository, copy `.env.staging.example` to ignored `.env.staging.local`. Replace every placeholder with the STAGING project's web configuration. Required keys: VITE_ENVIRONMENT=staging, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_DATABASE_URL, VITE_FIREBASE_API_KEY, VITE_FIREBASE_APP_ID, and VITE_FIREBASE_HOSTING_SITE. The project/database/auth/app must all belong to staging. Public Firebase web configuration is not a private credential. Never add private credentials to VITE variables.

Auth domain must be `<stage-project>.firebaseapp.com`; the default RTDB URL must be `https://<stage-project>-default-rtdb.firebaseio.com` or its regional `firebasedatabase.app` equivalent. The current staging setup deliberately rejects trusted-backend telemetry mode until a separate staging telemetry backend is reviewed. Leave VITE_TELEMETRY_MODE=legacy and VITE_TELEMETRY_API_BASE_URL empty.

Local-only commands:

```powershell
npm.cmd run configure:staging
npm.cmd run build:staging
npm.cmd run dev:staging
```

`configure:staging` writes ignored `firebase.staging.json`; it creates NO cloud resources. Staging builds go to `dist-staging`, have a [STAGING] page title and a deployment manifest. Production builds remain in `dist`. Plain development without explicit staging configuration fails closed; localhost is no longer a shortcut to production. Unit tests use mocked/loopback Firebase and rule tests require a loopback emulator, with demo-only project IDs.

The generated staging config replaces the public portal's Google-auth CSP frame domain with the staging auth domain. Both configs run a predeploy guard: the CLI project, build environment, Hosting site and artifact directory must match. These prevent accidental cross-environment deployment through the repository workflow; they are not a defense against a privileged operator deliberately bypassing scripts. Production Hosting no longer implicitly rebuilds during deploy: explicitly run `npm.cmd run build` and tests first. Production defaults are accepted only by production-mode builds.

Manual cloud commands below are examples for AFTER staging approval, never run automatically:

```powershell
# bus-safety-admin only: deploy canonical rules to the approved staging project.
npx.cmd --yes firebase-tools@15.31.0 deploy --config firebase.staging.json --project <STAGING_PROJECT_ID> --only database
# Each repo: publish only its independently configured staging Hosting site.
npx.cmd --yes firebase-tools@15.31.0 deploy --config firebase.staging.json --project <STAGING_PROJECT_ID> --only hosting
```

The checked generated configs/builds currently use fictional `ccs-synthetic-stage` identifiers to verify build isolation. They do not represent an existing cloud project and must be regenerated with the approved configuration before browser staging. Neither the generated config nor build output is tracked in Git.

### Synthetic test data and checks

The admin repository contains `scripts/staging-seed.example.json`, exclusively synthetic metadata. After cloud-staging approval, create fresh synthetic Auth accounts in staging, put their staging UIDs into a LOCAL copy of that fixture, then seed only the approved staging project through its console. Never paste production UIDs/passwords or use a production database export. The test driver starts pending/disabled, preserving the ordinary approval workflow. Use synthetic buses and no student records. Do not seed or run phone tests in production during staging.

From admin, run `npm.cmd test`, `npm.cmd run test:rules`, `npm.cmd run test:phase2`, and `npm.cmd run build`. From public, run `npm.cmd test`, `npm.cmd run test:rules`, and `npm.cmd run build`. Java 21+ must be on PATH for Firebase emulator tests. The public rule suite reads the admin's canonical Firebase configuration; keep the repositories as siblings.

Staging browser acceptance: Google/email signup produces one pending driver; approve/assign a synthetic bus; start stationary test tracking; disable while GPS is arriving; confirm GPS denial, inactive public state, matching-lock cleanup and audit; assign another approved synthetic driver and restart. Verify backfill under a simultaneous start never removes GPS. Create/deactivate/retire/reactivate synthetic buses and verify history retention. Test geofence edit/assignment, incident note/status audits, sign-out/session expiry, keyboard navigation and map fallback. No routing or VersaTrans changes are part of this work.

### Conditional writes, session closure and audits

- Backfill commits the sanitized missing projection, a private `publicBackfillClaims/{busId}` receipt containing auditId, and its append-only audit in ONE root update. Rules check the public record is absent at COMMIT. A concurrent publisher wins; an existing record is never replaced. Repeated/concurrent initialization is idempotent. No protected telemetry is copied into backfill.
- Driver disable normally commits enabled=false, the owned lock removal, active=false/endedAt on the owned last telemetry/public record, a private `sessionClosures/{busId}` receipt (driverUid + auditId), and the audit together. GPS coordinates and their sample timestamp are preserved. Rules constrain closure to the revoked driver's session and a fresh successful audit; admins do not gain general telemetry-write permission.
- A pre-commit lock acquired on an additional legacy allowed bus can miss the first snapshot. After revocation (when further driver writes are denied), bounded reconciliation closes such sessions with an additional atomic audited commit. Another driver's lock is never removed. Failures are reported as incomplete, not successful. The disabled-driver tab's **Finish disabling** retries cleanup; re-enabling also requires cleanup to finish first. If a different driver has already won the lock, its session is left untouched.
- Active assignment changes are rejected until tracking stops. Driver profile removal requires disablement first; records for buses/trips/incidents/audits are not removed. Legacy administrative mutations use the same atomic audit contract. Legacy geofence removal retains recorded entries and order.
- Driver management, incident status/notes, geofence edits/assignments, bus lifecycle and backfill commit their required audit with the mutation. Trip export awaits its audit before returning data to the UI. Audit rejection rolls back mutations and propagates an error. New receipt paths are private; existing geofence/bus/history schemas remain intact. Receipt records are operational metadata, not a substitute for retained audit records.

### Remaining trust boundaries

Browser clients cannot provide authoritative auditing of every read, login failure, offline access, malicious direct SDK call or completed file download. RTDB admin write permission is not proof that an operator used these audited helpers. A future trusted API must enforce mutation+audit centrally and record request identity/results, sensitive reads, authentication events and exports; a download's audit records release of data, not proof the user's filesystem saved it. Service-account/IAM access also requires provider audit controls and district policy. This limitation is explicit; no blanket write grants were added.

Geofence entry detection remains browser-dependent; always-on deduplication/monitoring requires the future trusted service. No new backend or billing resources were provisioned. These changes apply to the current Firebase GPS transport; any future trusted telemetry backend must enforce the same revocation/session-close contract. Real-phone background GPS, OAuth provider setup and manual WCAG checks remain staging acceptance items, not claims proven by unit tests.

For each future release, complete staging acceptance and obtain explicit deployment approval. Deploy the reviewed canonical rules from bus-safety-admin before relying on new admin closure/backfill operations. Older admin clients cannot safely close an active driver under the tightened rules and must use the updated official admin. Do not weaken rules to accommodate an old UI. Follow the backup, compatibility and rollback runbook in the admin VALIDATION.md. Publishing Hosting and rules does not run a bulk data migration; authorized fleet loads can conditionally initialize missing public projections as documented above.

## Verified Phase 2A release — October 14, 2026

Published with explicit owner approval. The deployment included canonical RTDB rules from bus-safety-admin, then public/driver Hosting, then admin Hosting.

| Component | Source commit | Live Hosting version | Released (UTC) |
| --- | --- | --- | --- |
| Public website and driver portal (working-gps-version) | f03864b62a8ae04759740127635a212deccfd691 | dd3e951a56fd1a1c | 2026-10-14 17:07:15 |
| Standalone admin (main) | 258fd69ed9e8d805514111bedcdd8b3c7080a3c9 | 52e075ccb3d2fb6e | 2026-10-14 17:07:29 |

Live sites: [public map](https://chsbustracker2.web.app/), [driver portal](https://chsbustracker2.web.app/drivers), [official admin](https://chsbustracker2-admin.web.app/). Subsequent documentation-only commits do not change these build artifacts.

All 146 tests were rerun successfully, including synthetic Firebase Emulator concurrency and authorization tests. Both production builds passed. Read-only post-release verification at 2026-10-14T17:07:45.827Z confirmed all 15 hosted files match the local build hashes, both production deployment manifests name chsbustracker2, security headers are present, and deployed rules match the canonical admin rules and synchronized public test fixture. Canonical rules SHA-256: 51e563de92af2d8b4b6c69162bc9e1dfca94a09723f91d5f27002b16d111eaf2. Anonymous publicBuses reads returned HTTP 200; all 11 checked protected collection reads returned HTTP 401.

No bulk database migration, data import/export, production test records, Auth changes or staging cloud resources were created by this release. The normal admin fleet-load initializer remains conditional and audited. Previous Hosting versions and exact pre-release rules were captured for recovery reference; a protected full-database backup/restore rehearsal was not performed.

Separate cloud-staging acceptance, real-device tracking, OAuth/session smoke tests and manual WCAG verification remain outstanding. This is a published prototype release, not a claim of district production certification. Follow the remaining trust boundaries and the admin VALIDATION.md recovery runbook.
