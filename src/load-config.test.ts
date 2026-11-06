import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "./config";

const ACCESS_URL = "https://user:pass@bridge.simplefin.org/simplefin";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function writeConfig(text: string): string {
  const dir = mkdtempSync(join(tmpdir(), "sidecar-load-config-"));
  tempDirs.push(dir);
  const path = join(dir, "config.json");
  writeFileSync(path, text);
  return path;
}

function load(file: unknown, env: Record<string, string> = {}) {
  return loadConfig({ CONFIG_FILE: writeConfig(JSON.stringify(file)), ...env });
}

const minimal = { simplefinAccessUrl: ACCESS_URL, mapping: { "wf-1": ["sf-1"] } };

describe("loadConfig", () => {
  test("reads an annotated JSONC file", () => {
    const path = writeConfig(`{
      // from: npm run claim -- <token>
      "simplefinAccessUrl": "${ACCESS_URL}",
      "mapping": {
        "wf-1": ["sf-1", "sf-2"], /* two brokerages */
        // "wf-2": ["sf-3"],
      },
    }`);
    const cfg = loadConfig({ CONFIG_FILE: path });
    assert.equal(cfg.simplefinAccessUrl, ACCESS_URL);
    assert.deepEqual(cfg.mapping, { "wf-1": ["sf-1", "sf-2"] });
  });

  test("defaults when no env vars are set", () => {
    const cfg = load(minimal);
    assert.equal(cfg.wfBaseUrl, "http://wealthfolio:8088");
    assert.equal(cfg.wfPassword, undefined);
    assert.equal(cfg.cashSymbols, undefined, "undefined lets mapping use DEFAULT_CASH_SYMBOLS");
    assert.equal(cfg.syncAt, "04:00");
    assert.equal(cfg.port, 8080);
    assert.equal(cfg.runOnStart, false);
    assert.equal(cfg.exchangeMic, "XNAS");
  });

  test("env vars override the defaults", () => {
    const cfg = load(minimal, {
      WF_BASE_URL: "https://wf.example.com//",
      WF_PASSWORD: "hunter2",
      CASH_SYMBOLS: " VMFXX, ,SPAXX ,",
      SYNC_AT: "23:15",
      PORT: "9000",
      RUN_ON_START: "TRUE",
      EXCHANGE_MIC: "XNYS",
    });
    assert.equal(cfg.wfBaseUrl, "https://wf.example.com", "trailing slashes are stripped");
    assert.equal(cfg.wfPassword, "hunter2");
    assert.deepEqual(cfg.cashSymbols, ["VMFXX", "SPAXX"]);
    assert.equal(cfg.syncAt, "23:15");
    assert.equal(cfg.port, 9000);
    assert.equal(cfg.runOnStart, true);
    assert.equal(cfg.exchangeMic, "XNYS");
  });

  test("an empty WF_PASSWORD means no authentication", () => {
    assert.equal(load(minimal, { WF_PASSWORD: "" }).wfPassword, undefined);
  });

  test("RUN_ON_START only enables on 'true'", () => {
    for (const v of ["1", "yes", "false", ""]) {
      assert.equal(load(minimal, { RUN_ON_START: v }).runOnStart, false, v);
    }
  });

  test("exchangeMic in the file wins over EXCHANGE_MIC", () => {
    assert.equal(load({ ...minimal, exchangeMic: "XTSE" }, { EXCHANGE_MIC: "XNYS" }).exchangeMic, "XTSE");
  });

  test("a missing config file names the path", () => {
    const path = join(tmpdir(), "definitely-missing-sidecar-config.json");
    assert.throws(() => loadConfig({ CONFIG_FILE: path }), (e: Error) => {
      assert.ok(e.message.includes(`Failed to read config file at ${path}`), e.message);
      return true;
    });
  });

  test("an unparseable config file names the path", () => {
    const path = writeConfig('{"mapping": ');
    assert.throws(() => loadConfig({ CONFIG_FILE: path }), /Failed to read config file at .*config\.json/);
  });

  test("an empty or missing mapping is rejected", () => {
    assert.throws(() => load({ simplefinAccessUrl: ACCESS_URL }), /mapping is empty/);
    assert.throws(() => load({ simplefinAccessUrl: ACCESS_URL, mapping: {} }), /mapping is empty/);
  });

  test("a missing or empty simplefinAccessUrl is rejected", () => {
    assert.throws(() => load({ mapping: minimal.mapping }), /Missing required config: simplefinAccessUrl/);
    assert.throws(
      () => load({ ...minimal, simplefinAccessUrl: "" }),
      /Missing required config: simplefinAccessUrl/,
    );
  });

  // BUG: this loads today, then runSync throws a TypeError.
  test.todo("rejects a non-array mapping value", () => {
    assert.throws(() => load({ ...minimal, mapping: { "wf-1": "sf-1" } }), /mapping/);
  });

  // BUG: both load today. A bad SYNC_AT makes msUntilNext return NaN, and the
  // scheduler then re-fires every ~1ms.
  test.todo("rejects an invalid SYNC_AT or PORT", () => {
    assert.throws(() => load(minimal, { SYNC_AT: "4am" }));
    assert.throws(() => load(minimal, { PORT: "http" }));
  });
});
