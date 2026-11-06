/** Milliseconds from `now` until the next local occurrence of a 24h "HH:MM" time. */
export function msUntilNext(hhmm: string, now: Date = new Date()): number {
  const [h, m] = hhmm.split(":").map((n) => Number.parseInt(n, 10));
  const next = new Date(now);
  next.setHours(h, m, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

/** The local calendar date of `now` as "YYYY-MM-DD", matching SYNC_AT's local time. */
export function localDate(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
