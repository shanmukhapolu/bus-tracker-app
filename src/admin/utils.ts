export function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function relativeTime(value: string) {
  const elapsed = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(elapsed)) return "unknown";
  const seconds = Math.max(0, Math.round(elapsed / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return seconds + "s ago";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes + "m ago";
  const hours = Math.round(minutes / 60);
  return hours + "h ago";
}
