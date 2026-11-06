/** Milliseconds from `now` until the next local occurrence of a 24h "HH:MM" time. */
export function msUntilNext(hhmm: string, now: Date = new Date()): number {
  const [h, m] = hhmm.split(":").map((n) => Number.parseInt(n, 10));
  const next = new Date(now);
  next.setHours(h, m, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}
