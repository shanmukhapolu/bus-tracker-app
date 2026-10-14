# CCS Bus Tracker

Public bus-location website and driver phone tracker for the shared CCS bus-tracking prototype. The protected operations dashboard is maintained separately in the private `bus-safety-admin` repository.

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
| `liveBuses`                              | No          | Assigned driver for own bus; enabled admin | Assigned driver holding that bus lock                          |
| `activeDrivers`                          | No          | Enabled drivers/admins                     | Assigned driver                                                |
| `drivers`                                | No          | Own profile; enabled admin                 | Pending self-registration or enabled admin                     |
| `safetyEvents`, `tripHistory`, `devices` | No          | Enabled admin                              | Restricted by collection rules                                 |
| `auditLogs`                              | No          | Enabled admin                              | Append-only enabled admin records                              |

### Firebase security-rules ownership

`bus-safety-admin` is the canonical owner of Realtime Database security rules for the shared `chsbustracker2` project. Database rules must be reviewed, tested, and deployed from that repository only.

This public repository keeps `database.rules.json` as a synchronized test fixture so its public and driver clients can be tested against the real security boundary. `firebase.json` intentionally has no database deployment target, and `npm run firebase:deploy` deploys hosting only. Do not re-enable database-rule deployment here.

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

Copy `.env.example` to `.env.local`. Firebase web identifiers may be present in client configuration. Never add server credentials or secrets.

```powershell
npm install
npm run dev
```

Browser GPS requires HTTPS outside localhost and explicit location permission. Mobile browsers can suspend background tabs; a managed native application remains the recommended production tracker.

## Known production decisions

CCS Transportation, IT, and legal still need to decide route/VersaTrans integration, route and stop visibility, public GPS delay/generalization, retention periods, MFA and Workspace enforcement, final staff roles, managed-phone requirements, and approved vendors. This phase does not decide or implement those items.
