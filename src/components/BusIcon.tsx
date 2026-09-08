import { BusFront } from "lucide-react";

export function BusIcon({ small = false }: { small?: boolean }) {
  return (
    <span className={`bus-icon${small ? " small" : ""}`} aria-hidden="true">
      <BusFront strokeWidth={1.8} />
    </span>
  );
}
