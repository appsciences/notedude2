/**
 * Due-date handling for the Google Tasks sync (#138).
 *
 * Google Tasks stores `due` as a **calendar date** encoded as midnight UTC — the time part
 * carries no meaning. So a due date's day must be read from its **UTC** parts, while "today"
 * comes from the user's **local** parts, and the two are compared as `YYYY-MM-DD` strings.
 *
 * Comparing instants instead would be off by one day for every user west of UTC: the value
 * "2026-08-04T00:00:00Z" is 2026-08-03 17:00 local in UTC-7, so a task due today would read
 * as due yesterday. Lexicographic order on `YYYY-MM-DD` is chronological order, which is what
 * makes the string comparison sound.
 */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** The local calendar date of an instant, as `YYYY-MM-DD`. */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The calendar date a Google `due` value denotes, as `YYYY-MM-DD`, or null if unset. */
export function dueDateKey(due: string | null | undefined): string | null {
  if (!due) return null;
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** A Google `due` value denoting the local calendar date of `d`. */
export function dueValueForLocalDate(d: Date): string {
  return `${localDateKey(d)}T00:00:00.000Z`;
}

/** Whether a task is due today or overdue. An unset due date is never "today". */
export function isDueOnOrBeforeToday(due: string | null | undefined, now: Date): boolean {
  const key = dueDateKey(due);
  return key !== null && key <= localDateKey(now);
}
