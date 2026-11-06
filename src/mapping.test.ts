import { test } from "node:test";
import assert from "node:assert/strict";
import { inferCryptoAccounts, mapAccountToSnapshot } from "./mapping";
import type { SimpleFinAccount } from "./simplefin";

function account(overrides: Partial<SimpleFinAccount>): SimpleFinAccount {
  return { id: "acct", name: "Test", balance: "0", ...overrides };
}

test("brokerage: cash is balance minus holdings market value", () => {
  const snap = mapAccountToSnapshot(
    account({
      balance: "1500",
      holdings: [{ id: "h1", symbol: "VTI", shares: "4", market_value: "1000" }],
    }),
  );
  assert.deepEqual(snap.positions, [{ symbol: "VTI", quantity: "4", currency: "USD" }]);
  assert.deepEqual(snap.cashBalances, { USD: "500" });
  assert.equal(snap.warnings, undefined);
});

test("brokerage without market values keeps balance as cash (unchanged behaviour)", () => {
  const snap = mapAccountToSnapshot(
    account({ balance: "1500", holdings: [{ id: "h1", symbol: "VTI", shares: "4" }] }),
  );
  assert.deepEqual(snap.cashBalances, { USD: "1500" });
  assert.equal(snap.positions[0].instrumentType, undefined);
});

test("money-market symbols fold into cash", () => {
  const snap = mapAccountToSnapshot(
    account({
      balance: "300",
      holdings: [{ id: "h1", symbol: "SPAXX", shares: "300", market_value: "300" }],
    }),
  );
  assert.deepEqual(snap.positions, []);
  assert.deepEqual(snap.cashBalances, { USD: "300" });
});

test("crypto account: holdings become CRYPTO instruments", () => {
  const snap = mapAccountToSnapshot(
    account({
      balance: "100",
      holdings: [{ id: "h1", symbol: "BTC", shares: "0.001", market_value: "100" }],
    }),
    { crypto: true },
  );
  assert.deepEqual(snap.positions, [
    { symbol: "BTC", quantity: "0.001", currency: "USD", instrumentType: "CRYPTO", quoteCcy: "USD" },
  ]);
  assert.deepEqual(snap.cashBalances, {});
});

test("crypto account with all market values zero emits no cash and warns", () => {
  const snap = mapAccountToSnapshot(
    account({
      balance: "232676.61",
      holdings: [
        { id: "h1", symbol: "BTC", shares: "2.93", market_value: "0" },
        { id: "h2", symbol: "ETH", shares: "1" },
      ],
    }),
    { crypto: true },
  );
  assert.equal(snap.positions.length, 2);
  assert.deepEqual(snap.cashBalances, {});
  assert.equal(snap.warnings?.length, 1);
});

test("crypto account with partial market values emits no phantom cash", () => {
  const snap = mapAccountToSnapshot(
    account({
      balance: "1000",
      holdings: [
        { id: "h1", symbol: "BTC", shares: "0.01", market_value: "600" },
        { id: "h2", symbol: "ETH", shares: "0.1", market_value: "0" },
      ],
    }),
    { crypto: true },
  );
  assert.deepEqual(snap.cashBalances, {});
  assert.equal(snap.warnings?.length, 1);
});

test("crypto account with no holdings syncs balance as cash", () => {
  const snap = mapAccountToSnapshot(account({ balance: "50" }), { crypto: true });
  assert.deepEqual(snap.cashBalances, { USD: "50" });
  assert.equal(snap.warnings, undefined);
});

test("inferCryptoAccounts only picks accounts that are entirely crypto", () => {
  const accounts = [
    account({ id: "coinbase", holdings: [{ id: "1", symbol: "BTC" }, { id: "2", symbol: "AMP" }] }),
    account({ id: "brokerage", holdings: [{ id: "3", symbol: "AMP" }, { id: "4", symbol: "VTI" }] }),
    account({ id: "mmf-only", holdings: [{ id: "5", symbol: "SPAXX" }] }),
    account({ id: "empty" }),
  ];
  assert.deepEqual(inferCryptoAccounts(accounts, ["BTC", "AMP"]), ["coinbase"]);
});
