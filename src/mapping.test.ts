import { test } from "node:test";
import assert from "node:assert/strict";
import { mapAccountToSnapshot } from "./mapping";
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
    { crypto: "all" },
  );
  assert.deepEqual(snap.positions, [
    { symbol: "BTC", quantity: "0.001", currency: "USD", instrumentType: "CRYPTO", quoteCcy: "USD" },
  ]);
  assert.deepEqual(snap.cashBalances, {});
});

test("all-crypto account with zero market values emits no cash", () => {
  const snap = mapAccountToSnapshot(
    account({
      balance: "232676.61",
      holdings: [
        { id: "h1", symbol: "BTC", shares: "2.93", market_value: "0" },
        { id: "h2", symbol: "ETH", shares: "1" },
      ],
    }),
    { crypto: "all" },
  );
  assert.equal(snap.positions.length, 2);
  assert.deepEqual(snap.cashBalances, {});
  assert.equal(snap.warnings, undefined);
});

test("all-crypto account with partial market values emits no phantom cash", () => {
  const snap = mapAccountToSnapshot(
    account({
      balance: "1000",
      holdings: [
        { id: "h1", symbol: "BTC", shares: "0.01", market_value: "600" },
        { id: "h2", symbol: "ETH", shares: "0.1", market_value: "0" },
      ],
    }),
    { crypto: "all" },
  );
  assert.deepEqual(snap.cashBalances, {});
});

test("all-crypto account with a wrong market value emits no phantom cash", () => {
  // Seen on Coinbase: market_value about a sixth of the wallet's balance.
  const snap = mapAccountToSnapshot(
    account({
      balance: "6000",
      holdings: [{ id: "h1", symbol: "BTC", shares: "0.06", market_value: "1000" }],
    }),
    { crypto: "all" },
  );
  assert.deepEqual(snap.cashBalances, {});
});

test("crypto holdings are quoted in the account currency, not the holding's", () => {
  const snap = mapAccountToSnapshot(
    account({
      balance: "100",
      holdings: [
        { id: "h1", symbol: "ETH", shares: "0.03", currency: "ETH" },
        { id: "h2", symbol: "CLV", shares: "10", currency: "CAD" },
      ],
    }),
    { crypto: "all" },
  );
  assert.deepEqual(
    snap.positions.map((p) => [p.symbol, p.currency, p.quoteCcy]),
    [["ETH", "USD", "USD"], ["CLV", "USD", "USD"]],
  );
});

test("crypto account with no holdings syncs balance as cash", () => {
  const snap = mapAccountToSnapshot(account({ balance: "50" }), { crypto: "all" });
  assert.deepEqual(snap.cashBalances, { USD: "50" });
  assert.equal(snap.warnings, undefined);
});

test("mixed account: a zero-share coin doesn't block cash", () => {
  const snap = mapAccountToSnapshot(
    account({
      balance: "1200",
      holdings: [
        { id: "h1", symbol: "BTC", shares: "0.01", market_value: "1000" },
        { id: "h2", symbol: "SHIB", shares: "0", market_value: "0" },
      ],
    }),
    { crypto: ["BTC", "SHIB"] },
  );
  assert.deepEqual(snap.cashBalances, { USD: "200" });
  assert.equal(snap.warnings, undefined);
});

test("mixed account: only listed tickers become crypto", () => {
  const snap = mapAccountToSnapshot(
    account({
      balance: "1300",
      holdings: [
        { id: "h1", symbol: "VTI", shares: "4", market_value: "1000" },
        { id: "h2", symbol: "BTC", shares: "0.002", market_value: "200" },
      ],
    }),
    { crypto: ["btc"] },
  );
  assert.deepEqual(snap.positions, [
    { symbol: "VTI", quantity: "4", currency: "USD" },
    { symbol: "BTC", quantity: "0.002", currency: "USD", instrumentType: "CRYPTO", quoteCcy: "USD" },
  ]);
  assert.deepEqual(snap.cashBalances, { USD: "100" });
});

test("mixed account: an unpriced coin blocks cash, an unpriced stock doesn't", () => {
  const coinUnpriced = mapAccountToSnapshot(
    account({
      balance: "1300",
      holdings: [
        { id: "h1", symbol: "VTI", shares: "4", market_value: "1000" },
        { id: "h2", symbol: "BTC", shares: "0.002" },
      ],
    }),
    { crypto: ["BTC"] },
  );
  assert.deepEqual(coinUnpriced.cashBalances, {});
  assert.equal(coinUnpriced.warnings?.length, 1);

  const stockUnpriced = mapAccountToSnapshot(
    account({
      balance: "1300",
      holdings: [
        { id: "h1", symbol: "VTI", shares: "4" },
        { id: "h2", symbol: "BTC", shares: "0.002", market_value: "200" },
      ],
    }),
    { crypto: ["BTC"] },
  );
  assert.deepEqual(stockUnpriced.cashBalances, { USD: "1100" });
  assert.equal(stockUnpriced.warnings, undefined);
});
