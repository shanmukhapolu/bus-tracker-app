import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import mapLibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "./styles.css";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

// Keep MapLibre's worker as an explicit Vite asset in production builds.
setWorkerUrl(mapLibreWorkerUrl);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
