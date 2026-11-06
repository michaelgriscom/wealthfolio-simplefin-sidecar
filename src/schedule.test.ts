import { test } from "node:test";
import assert from "node:assert/strict";
import { msUntilNext } from "./schedule";

// msUntilNext works in local time; pin a zone with DST so the results are
// deterministic. Node re-reads TZ when it is assigned at runtime, and the test
// runner gives each file its own process.
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

test("exactly the scheduled time schedules the next day, not an immediate re-run", () => {
  const now = new Date(2026, 0, 15, 4, 0, 0, 0);
  assert.equal(msUntilNext("04:00", now), 24 * HOUR);
});

test("seconds past the minute are accounted for", () => {
  const now = new Date(2026, 0, 15, 3, 59, 30);
  assert.equal(msUntilNext("04:00", now), 30 * 1000);
});

test("schedules follow the local wall clock across a DST change", () => {
  // US spring-forward is 2026-03-08 02:00 -> 03:00, so 04:00 -> 04:00 is 23h.
  const now = new Date(2026, 2, 7, 4, 0);
  assert.equal(msUntilNext("04:00", now), 23 * HOUR);
});

