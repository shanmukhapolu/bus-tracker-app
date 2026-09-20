# Carmel Clay Schools Bus Tracker

A mobile-first public bus-tracking prototype for Carmel, Indiana. Select a bus on the interactive map or in the searchable menu to see its sample arrival time, location, status, and next stop. Bus 218 is selected initially and moves automatically using simulated GPS updates.

**All positions, route assignments, statuses, and ETAs are fictional demonstration data. This is an independent prototype, not an official district service.** There are no accounts, student records, real GPS connections, or backend services.

## Run locally

Use Node.js 22.12+ (or a newer supported Node release) and npm.

```bash
npm install
npm run dev
```

Open the URL Vite prints, usually `http://localhost:5173`. The dev server also listens on your local network for phone testing using the printed network address, subject to your firewall settings.

```bash
npm run build    # TypeScript checks and production bundle in dist/
npm run preview  # Preview the production build locally
npm test         # Service lifecycle, movement, search, and formatting tests
```

Deploy `dist/` to a static web host when ready. No server process is needed in production. This change does not publish a website or push to GitHub.

## Technology and map configuration

- React 19, TypeScript, Vite, plain CSS, and Lucide icons.
- MapLibre GL JS provides pan, zoom, touch gestures, keyboard map controls, and markers.
- OpenFreeMap's Positron style supplies OpenStreetMap-derived vector maps. **No API key, paid API, account, or environment variable is required.** See the [OpenFreeMap quick start](https://openfreemap.org/quick_start/).
- Change `src/config/map.ts` to use a different compatible style. Attribution remains available in the map's lower-left corner.
- An internet connection is required for map tiles and the optional Google Fonts. System fonts provide a fallback. If the map cannot load, a retry message appears and the bus list and details remain usable. A browser with WebGL is required for the map.

## Project structure

```text
src/
  components/
    Header.tsx        Compact school branding and live-demo indicator
    SideMenu.tsx      Responsive list / accessible mobile drawer
    BusSearch.tsx     Bus number and route search
    BusMap.tsx        Map lifecycle, camera, controls, loading recovery
    BusMarker.tsx     Selectable markers with position interpolation
    BusIcon.tsx       Shared bus symbol
    BusInfoCard.tsx   ETA, next stop, location, freshness, recenter action
  config/map.ts      Map style and initial Carmel center
  data/mockBuses.ts  Fictional fleet and simulation coordinates
  hooks/useBuses.ts  React subscription to the bus service
  hooks/useBusTools.ts  Optional browser agent tool using the same selection action
  services/
    busService.ts    Provider-neutral contract and provider selection
    mockBusService.ts  Shared, subscriber-managed simulation
  types/bus.ts       Bus and snapshot types
  utils/buses.ts     Search, time/status formatting, interpolation
  App.tsx            Selection and responsive application layout
  styles.css         Responsive styles and shared color tokens
```

## How tracking works

`BusService` exposes `getSnapshot()` and `subscribe(listener)`, compatible with React's `useSyncExternalStore`. Snapshots are immutable and stable between updates. The first subscription starts one simulation timer; the last unsubscribe stops it, including React Strict Mode remounts.

The mock provider publishes a new Bus 218 coordinate approximately every ten seconds. It traverses an illustrative segment of College Avenue, then reverses at the endpoint. Other buses publish stationary simulated heartbeats. Each marker interpolates from its current displayed position to the newest sample using `requestAnimationFrame`. This deliberately displays movement up to one update interval behind the simulated server. Reduced-motion preferences disable interpolation and camera animation.

ETAs, stop names, and location descriptions are static sample metadata, not routing calculations. Update age reflects the last received snapshot. Positions older than 30 seconds display an update warning and suppress ETA. Selecting or recentering moves the camera; background updates do not override a user's pan.

On phones and tablets, the hamburger opens a left drawer with search, Escape-to-close, focus trapping, and focus restoration. Desktop keeps the bus list visible. Safe-area padding and dynamic viewport height accommodate phones.

## Future Firebase integration

```text
Android bus phone → Google Cloud Run → Firebase Realtime Database
                                      ↓
                               firebaseBusService
                                      ↓
                              useBuses → React UI
```

1. Define the public bus record schema, server timestamps, permitted fields, and authorized tracker writes. Keep student information out of public records.
2. Add `firebaseBusService.ts` implementing `BusService`. Normalize Firebase coordinates and timestamps into validated `Bus` objects, preserve stable snapshots, and clean up database listeners when unsubscribing.
3. Handle connection state, stale/offline vehicles, removed buses, and errors in the adapter; set `mode: 'live'` only when real tracking is connected. Set the update cadence through `updateIntervalMs`.
4. Switch the exported provider in `src/services/busService.ts`. The map and bus UI do not need Firebase imports.
5. Configure Firebase public read rules and authenticated tracker writes, then test with the Firebase Emulator Suite before connecting real vehicles. Public website access does not mean public write access.

Firebase, Cloud Run, authentication, and a backend are intentionally not installed in version 1.


## Firebase live tracking setup

The prototype can switch from the built-in simulation to a Firebase Realtime Database-backed live provider when all `VITE_FIREBASE_*` variables are present. The public map subscribes to `liveBuses`; the hidden `/drivers` page signs drivers in and publishes phone GPS while tracking is active.

Firebase's web SDK is loaded from the official modular CDN at runtime, so this prototype does not add a large Firebase dependency to the npm lockfile. The public Firebase web configuration is not a secret; database rules and Firebase Authentication are what protect writes.

### 1. Create/register the Firebase web app

Create or select a Firebase project, create a Web app, and enable Realtime Database. Copy the web-app configuration values into a local `.env` based on `.env.example`. Set `VITE_FIREBASE_DATABASE_URL` to the Realtime Database URL from the Firebase console.

### 2. Enable driver authentication

Enable Firebase Authentication with Email/Password. Create one account per driver. The driver page does not create accounts itself.

### 3. Add the database rules

Publish `firebase.database.rules.json` as the Realtime Database rules. Public users can read live bus locations, but only enabled driver accounts can claim an assigned bus and write its live record.

### 4. Add a driver profile

After creating a driver account, copy its Firebase Auth UID into the Realtime Database under:

```text
drivers/
  DRIVER_UID/
    enabled: true
    displayName: "Driver Name"
    allowedBuses:
      "218": true
```

Add more bus IDs to `allowedBuses` when that driver is permitted to operate them. The client can display the list, but the same assignment is enforced again by the database rules.

### 5. Run the app

```bash
npm install
npm run dev
```

Open `/drivers` on the driver's phone. Sign in, select an assigned bus, and press **Start tracking**. The browser requests high-accuracy location permission and publishes the newest GPS fix approximately once per second while the page is active.

The public map listens to Firebase and only renders buses whose `liveBuses/<busId>.active` value is true. When tracking stops, the record becomes inactive. Firebase's `onDisconnect` mechanism also marks the bus inactive and releases the bus lock when the tracking connection drops.

### Driver-phone limitations

Browser geolocation requires a secure context such as HTTPS, and the user must grant permission. `watchPosition()` is preferable to repeatedly calling `getCurrentPosition()` because the browser can deliver updated position fixes as they become available. The implementation requests high accuracy, allows at most about one second of cached position age, and publishes at most once per second.

Mobile browsers can throttle or suspend background tabs. The page therefore asks for a Screen Wake Lock when supported, but a web page cannot guarantee continuous background GPS tracking across all phones. For reliable all-day fleet tracking, the eventual production version should use a dedicated native Android/iOS driver app or a managed device mode rather than depending on a foreground browser tab.

### Cost/scaling note

A one-second write cadence is intentionally aggressive for the prototype. It is suitable for a small number of active buses, but it is not the most efficient fleet design. A production implementation should usually combine movement thresholds, adaptive intervals, and heartbeat writes—for example, publish immediately when the bus moves several meters, otherwise send a periodic heartbeat. Firebase Realtime Database is designed for realtime listeners, but usage is billed primarily on stored data and outbound traffic, so scaling should be measured rather than assuming a free large-scale fleet.

### Security note

`/drivers` is hidden from the public navigation, but hiding a URL is not an access-control mechanism. Firebase Authentication and Realtime Database Rules are the real controls. Do not replace the rules with a shared secret embedded in frontend code.

### Suggested production evolution

For a real district deployment, keep the current `BusService` abstraction but replace browser-driver publishing with:

```text
Driver phone app
   ↓
Authenticated tracking session
   ↓
Cloud Run / trusted ingestion API
   ↓
Firebase Realtime Database
   ↓
Public bus listener
   ↓
Map UI
```

That trusted ingestion layer can validate driver assignments server-side, enforce rate limits, reject impossible GPS jumps, keep driver identity private from public clients, and maintain route/ETA computation separately from raw GPS.


## Firebase Hosting deployment

The repository is now wired for Firebase Hosting and Realtime Database deployment. The Firebase project ID in the supplied web configuration is **chsbustracker2** (the Firebase project display name can be different).

### One-time Firebase console setup

In Firebase Console for `chsbustracker2`:

1. Create **Realtime Database** and choose its region. Start in locked mode. Firebase provides the database URL after the database is created; this URL must be added locally as `VITE_FIREBASE_DATABASE_URL`. Firebase documents that the URL format depends on the database region.
2. Enable **Authentication → Sign-in method → Email/Password**. Create one Firebase Authentication account per driver.
3. After creating a driver account, copy its Auth UID and add a driver profile in Realtime Database:

```json
{
  "drivers": {
    "DRIVER_UID": {
      "enabled": true,
      "displayName": "Driver Name",
      "allowedBuses": {
        "218": true
      }
    }
  }
}
```

The database rules in `database.rules.json` enforce the same bus assignment server-side.

### Local setup on Windows PowerShell

Clone the exact prototype branch:

```powershell
git clone --branch prototype --single-branch https://github.com/shanmukhapolu/bus-tracker-app.git
cd bus-tracker-app
npm ci
```

Create the local environment file:

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

Set:

```text
VITE_FIREBASE_DATABASE_URL=https://YOUR_DATABASE_URL
```

You normally only need to add the database URL because the supplied `chsbustracker2` web configuration is already included in `src/config/firebase.ts`. `.env.local` is ignored by Git.

Install/login to the Firebase CLI. The current Firebase CLI requires Node.js 18+ and Firebase recommends the npm installation path for Node users. citeturn482753search0

```powershell
npm install -g firebase-tools
firebase login
firebase projects:list
```

The repository already contains `.firebaserc`, so it points at `chsbustracker2`. The deployment files are `firebase.json` and `database.rules.json`.

Build and deploy:

```powershell
npm run build
firebase deploy --only hosting,database
```

Or use the repository script, which also runs the Hosting predeploy build:

```powershell
npm run firebase:deploy
```

Firebase Hosting serves static assets over HTTPS and provides project-hosted `web.app` and `firebaseapp.com` domains.

After deployment, open the Hosting URL printed by the CLI. The public tracker is `/`; the internal driver page is `/drivers`.

### Local testing

For normal development:

```powershell
npm run dev
```

For Firebase Hosting-style local serving:

```powershell
npm run firebase:serve
```

For a phone GPS test, use the deployed HTTPS site or another HTTPS development environment. Browser geolocation requires a secure context and user permission.

### Important production limitation

A browser tab is not a fleet-management-grade tracking client. Mobile operating systems can throttle or suspend background tabs, so the driver should keep the tracking page active. The implementation requests Wake Lock where supported, but it cannot guarantee background GPS.

For a real district deployment, the next production layer should add a trusted ingestion service that validates driver/bus assignments, rejects impossible GPS jumps, rate-limits writes, and keeps internal driver identity out of public live-bus records.
