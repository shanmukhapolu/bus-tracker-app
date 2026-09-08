import { Search, X } from "lucide-react";

export function BusSearch({
  query,
  onChange,
}: {
  query: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="search-field">
      <Search size={19} aria-hidden="true" />
      <input
        aria-label="Search bus number or route"
        placeholder="Search bus number or route…"
        value={query}
        onChange={(event) => onChange(event.target.value)}
        type="search"
      />
      {query && (
        <button aria-label="Clear search" onClick={() => onChange("")}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}
