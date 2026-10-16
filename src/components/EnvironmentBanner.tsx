export function EnvironmentBanner() {
  if (!["staging", "emulator", "development"].includes(import.meta.env.MODE))
    return null;
  return (
    <aside className="environment-banner" aria-label="Testing environment">
      <strong>STAGING / TEST DATA</strong>
      <span>Simulated records · Not for transportation operations</span>
    </aside>
  );
}
