/**
 * Timestamp formatting for the note list's metadata line (#133).
 *
 * `now` is injectable purely so the three branches can be tested. They are unreachable
 * from the E2E suite: every fixture note is created with `createdAt: 1–7` (epoch 1970),
 * so only the "older" branch ever ran, and the other two shipped unverified.
 */
export function formatTimestamp(ts: number, now: Date = new Date()): string {
  const d = new Date(ts);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());

  if (d >= startOfToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (d >= startOfWeek) {
    return d.toLocaleDateString([], { weekday: "short" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
