import { test } from "node:test";
import assert from "node:assert/strict";
import { localDate, msUntilNext } from "./schedule";

// msUntilNext uses local time, so pin a zone with DST. Node applies TZ set at
// runtime, and each test file runs in its own process.
process.env.TZ = "America/New_York";

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

test("a time later today is scheduled today", () => {
  const now = new Date(2026, 0, 15, 1, 30); // 01:30 local
  assert.equal(msUntilNext("04:00", now), 2 * HOUR + 30 * MIN);
});

test("a time already passed today rolls over to tomorrow", () => {
  const now = new Date(2026, 0, 15, 4, 1);
  assert.equal(msUntilNext("04:00", now), 24 * HOUR - MIN);
});

test("exactly the scheduled time rolls over to tomorrow", () => {
  const now = new Date(2026, 0, 15, 4, 0, 0, 0);
  assert.equal(msUntilNext("04:00", now), 24 * HOUR);
});

test("seconds past the minute are accounted for", () => {
  const now = new Date(2026, 0, 15, 3, 59, 30);
  assert.equal(msUntilNext("04:00", now), 30 * 1000);
});

test("follows local time across a DST change", () => {
  // Spring-forward on 2026-03-08 makes 04:00 to 04:00 23h.
  const now = new Date(2026, 2, 7, 4, 0);
  assert.equal(msUntilNext("04:00", now), 23 * HOUR);
});


test("the snapshot date is the local date, not the UTC date", () => {
  // 22:30 on Jan 14 in New York is already Jan 15 in UTC.
  const now = new Date("2026-01-15T03:30:00Z");
  assert.equal(now.toISOString().slice(0, 10), "2026-01-15");
  assert.equal(localDate(now), "2026-01-14");
  assert.equal(localDate(new Date(2026, 8, 5, 0, 0)), "2026-09-05");
});
