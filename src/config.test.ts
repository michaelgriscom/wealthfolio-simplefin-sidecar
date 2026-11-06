import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "./config";

function load(extra: Record<string, unknown>) {
  const dir = mkdtempSync(join(tmpdir(), "sidecar-cfg-"));
  const path = join(dir, "config.json");
  writeFileSync(path, JSON.stringify({ simplefinAccessUrl: "https://u:p@x/y", mapping: { wf: ["sf"] }, ...extra }));
  return loadConfig({ CONFIG_FILE: path });
}

test("cryptoAccounts list form means all", () => {
  assert.deepEqual(load({ cryptoAccounts: ["a", "b"] }).cryptoAccounts, { a: "all", b: "all" });
});

test("cryptoAccounts object form accepts all or ticker lists", () => {
  const cfg = load({ cryptoAccounts: { a: "all", b: ["BTC", "ETH"] } });
  assert.deepEqual(cfg.cryptoAccounts, { a: "all", b: ["BTC", "ETH"] });
});

test("cryptoAccounts rejects bad shapes", () => {
  assert.throws(() => load({ cryptoAccounts: { a: "some" } }), /cryptoAccounts/);
  assert.throws(() => load({ cryptoAccounts: "a" }), /cryptoAccounts/);
  assert.throws(() => load({ cryptoAccounts: [1] }), /cryptoAccounts/);
});
