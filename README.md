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
