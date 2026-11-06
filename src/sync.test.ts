import { afterEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { runSync, type Logger } from "./sync";
import type { SyncConfig } from "./config";
import type { SimpleFinAccount, SimpleFinResponse } from "./simplefin";

const SF_ACCESS_URL = "https://user:pass@bridge.simplefin.test/simplefin";
const WF = "http://wf.test";

interface Snapshot {
  accountId: string;
  holdings: Record<string, string>[];
  cashBalances: Record<string, string>;
  snapshotDate: string;
}

interface FakeServers {
  simplefin?: SimpleFinResponse | Response;
  /** Status for POST /snapshots per Wealthfolio account id (default 200). */
  snapshotStatus?: Record<string, number>;
  loginStatus?: number;
}

/** Route fetch to fake SimpleFIN and Wealthfolio servers; returns what Wealthfolio received. */
function fakeServers(opts: FakeServers) {
  const snapshots: Snapshot[] = [];
  const snapshotCookies: (string | undefined)[] = [];
  let logins = 0;

  mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://bridge.simplefin.test/simplefin/accounts?")) {
      const sf = opts.simplefin ?? { errors: [], accounts: [] };
      return sf instanceof Response ? sf : Response.json(sf);
    }
    if (url === `${WF}/api/v1/auth/login`) {
      logins += 1;
      const status = opts.loginStatus ?? 200;
      return new Response(null, {
        status,
        headers: status === 200 ? { "set-cookie": "wf=session; Path=/" } : {},
      });
    }
    if (url === `${WF}/api/v1/snapshots`) {
      const body = JSON.parse(String(init?.body)) as Snapshot;
      snapshotCookies.push((init?.headers as Record<string, string>).Cookie);
      const status = opts.snapshotStatus?.[body.accountId] ?? 200;
      if (status !== 200) return new Response(`rejected ${body.accountId}`, { status });
      snapshots.push(body);
      return new Response(null, { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  });

  return {
    snapshots,
    snapshotCookies,
    get logins() {
      return logins;
    },
  };
}

function recordingLogger() {
  const lines: { level: keyof Logger; msg: string }[] = [];
  const log: Logger = {
    info: (msg) => lines.push({ level: "info", msg }),
    warn: (msg) => lines.push({ level: "warn", msg }),
    error: (msg) => lines.push({ level: "error", msg }),
  };
  return { log, lines, at: (level: keyof Logger) => lines.filter((l) => l.level === level).map((l) => l.msg) };
}

function config(overrides: Partial<SyncConfig> = {}): SyncConfig {
  return {
    wfBaseUrl: WF,
    simplefinAccessUrl: SF_ACCESS_URL,
    mapping: {},
    syncAt: "04:00",
    port: 8080,
    runOnStart: false,
    exchangeMic: "XNAS",
    ...overrides,
  };
}

const brokerageA: SimpleFinAccount = {
  id: "sf-a",
  name: "Brokerage A",
  balance: "1600",
  holdings: [
    { id: "1", symbol: "VTI", shares: "4", market_value: "1000", cost_basis: "800" },
    { id: "2", symbol: "SPAXX", shares: "500", market_value: "500" },
  ],
};
const brokerageB: SimpleFinAccount = {
  id: "sf-b",
  name: "Brokerage B",
  balance: "750",
  holdings: [{ id: "3", symbol: "VTI", shares: "2", market_value: "500", cost_basis: "500" }],
};
const ira: SimpleFinAccount = {
  id: "sf-ira",
  name: "IRA",
  balance: "300",
  holdings: [{ id: "4", symbol: "BND", shares: "3", market_value: "300" }],
};

afterEach(() => mock.restoreAll());

test("maps, aggregates and saves one dated snapshot per Wealthfolio account", async () => {
  const wf = fakeServers({ simplefin: { errors: [], accounts: [brokerageA, brokerageB, ira] } });
  const { log } = recordingLogger();

  const result = await runSync(
    config({ mapping: { "wf-taxable": ["sf-a", "sf-b"], "wf-ira": ["sf-ira"] } }),
    log,
  );

  // One date for the whole run, shared by every snapshot and the result.
  const date = result.date;
  assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(wf.snapshots, [
    {
      accountId: "wf-taxable",
      // VTI: 4 @ 200 + 2 @ 250 -> 6 @ 216.67; SPAXX + uninvested fold into cash.
      holdings: [
        { symbol: "VTI", quantity: "6", currency: "USD", averageCost: "216.67", exchangeMic: "XNAS" },
      ],
      cashBalances: { USD: "850" },
      snapshotDate: date,
    },
    {
      accountId: "wf-ira",
      holdings: [{ symbol: "BND", quantity: "3", currency: "USD", exchangeMic: "XNAS" }],
      cashBalances: {},
      snapshotDate: date,
    },
  ]);
  assert.equal(result.accountsSynced, 2);
  assert.equal(result.accountsFailed, 0);
  assert.deepEqual(result.skipped, []);
  assert.deepEqual(result.errors, []);
  assert.ok(!Number.isNaN(Date.parse(result.finishedAt)));
});

test("the configured exchange MIC is applied to every position", async () => {
  const wf = fakeServers({ simplefin: { errors: [], accounts: [brokerageA, ira] } });
  await runSync(
    config({ exchangeMic: "XTSE", mapping: { "wf-1": ["sf-a", "sf-ira"] } }),
    recordingLogger().log,
  );
  assert.deepEqual(
    wf.snapshots[0].holdings.map((h) => h.exchangeMic),
    ["XTSE", "XTSE"],
  );
});

test("configured cash symbols replace the default money-market list", async () => {
  const account: SimpleFinAccount = {
    id: "sf-1",
    name: "Brokerage",
    balance: "1000",
    holdings: [
      { id: "1", symbol: "MYMMF", shares: "600", market_value: "600" },
      { id: "2", symbol: "SPAXX", shares: "400", market_value: "400" },
    ],
  };
  const wf = fakeServers({ simplefin: { errors: [], accounts: [account] } });
  await runSync(config({ cashSymbols: ["mymmf"], mapping: { "wf-1": ["sf-1"] } }), recordingLogger().log);

  assert.deepEqual(
    wf.snapshots[0].holdings.map((h) => h.symbol),
    ["SPAXX"],
  );
  assert.deepEqual(wf.snapshots[0].cashBalances, { USD: "600" });
});

test("missing SimpleFIN accounts are reported; a Wealthfolio account with none left is not written", async () => {
  const wf = fakeServers({ simplefin: { errors: [], accounts: [brokerageA] } });
  const result = await runSync(
    config({ mapping: { "wf-partial": ["sf-a", "sf-gone"], "wf-empty": ["sf-gone-1", "sf-gone-2"] } }),
    recordingLogger().log,
  );

  assert.deepEqual(
    wf.snapshots.map((s) => s.accountId),
    ["wf-partial"],
  );
  assert.deepEqual(result.skipped, [
    "wf-partial: missing SimpleFIN accounts [sf-gone]",
    "wf-empty: missing SimpleFIN accounts [sf-gone-1, sf-gone-2]",
  ]);
  assert.equal(result.accountsSynced, 1);
  assert.equal(result.accountsFailed, 0);
});

test("SimpleFIN connection errors are logged as warnings without failing the sync", async () => {
  fakeServers({
    simplefin: { errors: ["Connection to Vanguard may need attention"], accounts: [ira] },
  });
  const logger = recordingLogger();
  const result = await runSync(config({ mapping: { "wf-ira": ["sf-ira"] } }), logger.log);

  assert.deepEqual(logger.at("warn"), [
    "SimpleFIN connection warning: Connection to Vanguard may need attention",
  ]);
  assert.equal(result.accountsSynced, 1);
});

test("with a password, it logs in once and sends the session cookie with each snapshot", async () => {
  const wf = fakeServers({ simplefin: { errors: [], accounts: [brokerageA, ira] } });
  await runSync(
    config({ wfPassword: "pw", mapping: { "wf-1": ["sf-a"], "wf-2": ["sf-ira"] } }),
    recordingLogger().log,
  );
  assert.equal(wf.logins, 1);
  assert.deepEqual(wf.snapshotCookies, ["wf=session", "wf=session"]);
});

test("without a password, it skips login and says so", async () => {
  const wf = fakeServers({ simplefin: { errors: [], accounts: [ira] } });
  const logger = recordingLogger();
  await runSync(config({ mapping: { "wf-ira": ["sf-ira"] } }), logger.log);

  assert.equal(wf.logins, 0);
  assert.deepEqual(wf.snapshotCookies, [undefined]);
  assert.ok(logger.at("info").some((m) => m.includes("WF_PASSWORD not set")));
});

test("one account failing to save doesn't stop the others", async () => {
  const wf = fakeServers({
    simplefin: { errors: [], accounts: [brokerageA, ira] },
    snapshotStatus: { "wf-1": 500 },
  });
  const logger = recordingLogger();
  const result = await runSync(config({ mapping: { "wf-1": ["sf-a"], "wf-2": ["sf-ira"] } }), logger.log);

  assert.deepEqual(
    wf.snapshots.map((s) => s.accountId),
    ["wf-2"],
  );
  assert.equal(result.accountsSynced, 1);
  assert.equal(result.accountsFailed, 1);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /saveSnapshot failed for wf-1 \(HTTP 500\).*rejected wf-1/);
  assert.deepEqual(logger.at("error"), result.errors);
});

test("a SimpleFIN failure rejects before anything is written to Wealthfolio", async () => {
  const wf = fakeServers({ simplefin: new Response("Forbidden", { status: 403 }) });
  await assert.rejects(
    runSync(config({ wfPassword: "pw", mapping: { "wf-1": ["sf-a"] } }), recordingLogger().log),
    /SimpleFIN request failed \(HTTP 403\)/,
  );
  assert.equal(wf.logins, 0);
  assert.deepEqual(wf.snapshots, []);
});

test("a Wealthfolio login failure rejects before any snapshot is written", async () => {
  const wf = fakeServers({ simplefin: { errors: [], accounts: [ira] }, loginStatus: 401 });
  await assert.rejects(
    runSync(config({ wfPassword: "wrong", mapping: { "wf-ira": ["sf-ira"] } }), recordingLogger().log),
    /Wealthfolio login failed \(HTTP 401\)/,
  );
  assert.deepEqual(wf.snapshots, []);
});
