/**
 * SimpleFIN account -> Wealthfolio snapshot mapping and multi-account
 * aggregation, for plain (non-crypto) brokerage accounts.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mapAccountToSnapshot, normalizeCurrency } from "./mapping";
import { aggregateSnapshots } from "./aggregate";
import type { SimpleFinAccount, SimpleFinHolding } from "./simplefin";

function account(overrides: Partial<SimpleFinAccount>): SimpleFinAccount {
  return { id: "acct", name: "Brokerage", balance: "0", ...overrides };
}

function holding(symbol: string, overrides: Partial<SimpleFinHolding> = {}): SimpleFinHolding {
  return { id: `h-${symbol}`, symbol, ...overrides };
}

describe("normalizeCurrency", () => {
  test("accepts ISO codes in any case and surrounding whitespace", () => {
    assert.equal(normalizeCurrency(" cad "), "CAD");
    assert.equal(normalizeCurrency("EUR"), "EUR");
  });

  test("falls back for empty values, crypto URLs and non-ISO strings", () => {
    assert.equal(normalizeCurrency(undefined), "USD");
    assert.equal(normalizeCurrency(""), "USD");
    assert.equal(normalizeCurrency("https://www.bitcoin.org"), "USD");
    assert.equal(normalizeCurrency("USDT"), "USD");
    assert.equal(normalizeCurrency("US$", "CAD"), "CAD");
  });
});

describe("mapAccountToSnapshot", () => {
  test("average cost is total cost basis divided by shares, rounded to cents", () => {
    const snap = mapAccountToSnapshot(
      account({
        balance: "1000",
        holdings: [holding("VTI", { shares: "3", cost_basis: "100", market_value: "1000" })],
      }),
    );
    assert.deepEqual(snap.positions, [
      { symbol: "VTI", quantity: "3", currency: "USD", averageCost: "33.33" },
    ]);
  });

  test("average cost is omitted when it can't be derived", () => {
    const snap = mapAccountToSnapshot(
      account({
        holdings: [
          holding("NOCOST", { shares: "5" }),
          holding("ZEROCOST", { shares: "5", cost_basis: "0" }),
          holding("NOSHARES", { shares: "0", cost_basis: "100" }),
          holding("JUNK", { shares: "abc", cost_basis: "100" }),
        ],
      }),
    );
    for (const p of snap.positions) assert.equal(p.averageCost, undefined, p.symbol);
  });

  test("quantity is passed through as a string", () => {
    const snap = mapAccountToSnapshot(
      account({ holdings: [holding("FXAIX", { shares: "12.345678901" })] }),
    );
    assert.equal(snap.positions[0].quantity, "12.345678901");
  });

  test("a holding without shares gets quantity 0", () => {
    const snap = mapAccountToSnapshot(account({ holdings: [holding("VTI")] }));
    assert.deepEqual(snap.positions, [{ symbol: "VTI", quantity: "0", currency: "USD" }]);
  });

  test("currency comes from the holding, falling back to the account, then USD", () => {
    const snap = mapAccountToSnapshot(
      account({
        currency: "cad",
        // XEQT has a market value so cash is derived on main, #5 and #6.
        // #5 emits no cash when no holding has a market value.
        balance: "110",
        holdings: [
          holding("XEQT", { currency: "cad", market_value: "10" }),
          holding("VTI", { currency: "USD" }),
          holding("ODD", { currency: "https://example.com/token" }),
          holding("NONE"),
        ],
      }),
    );
    assert.deepEqual(
      snap.positions.map((p) => [p.symbol, p.currency]),
      [
        ["XEQT", "CAD"],
        ["VTI", "USD"],
        ["ODD", "CAD"],
        ["NONE", "CAD"],
      ],
    );
    assert.deepEqual(snap.cashBalances, { CAD: "100" }, "cash is keyed by the account currency");
  });

  test("symbols are trimmed and holdings without a symbol are skipped", () => {
    const snap = mapAccountToSnapshot(
      account({
        balance: "500",
        holdings: [
          holding("  VTI ", { shares: "1", market_value: "200" }),
          holding("", { shares: "1", market_value: "100" }),
          holding("   ", { shares: "1", market_value: "100" }),
        ],
      }),
    );
    assert.deepEqual(
      snap.positions.map((p) => p.symbol),
      ["VTI"],
    );
    // Skipped holdings aren't subtracted, so their value counts as cash.
    assert.deepEqual(snap.cashBalances, { USD: "300" });
  });

  test("money-market funds fold into cash, case-insensitively", () => {
    const snap = mapAccountToSnapshot(
      account({
        balance: "10250.75",
        holdings: [
          holding("VTI", { shares: "10", market_value: "2500" }),
          holding("vmfxx", { shares: "7500", market_value: "7500" }),
          holding("Spaxx", { shares: "200", market_value: "200" }),
        ],
      }),
    );
    assert.deepEqual(
      snap.positions.map((p) => p.symbol),
      ["VTI"],
    );
    // 10250.75 - 2500 = 7500 MMF + 200 MMF + 50.75 uninvested
    assert.deepEqual(snap.cashBalances, { USD: "7750.75" });
  });

  test("cash is rounded to cents", () => {
    const snap = mapAccountToSnapshot(
      account({
        balance: "1000.10",
        holdings: [
          holding("A", { market_value: "333.33" }),
          holding("B", { market_value: "333.33" }),
        ],
      }),
    );
    assert.deepEqual(snap.cashBalances, { USD: "333.44" });
  });

  test("no cash entry when holdings are at or above the balance", () => {
    for (const balance of ["1000", "999.99", "-250"]) {
      const snap = mapAccountToSnapshot(
        account({ balance, holdings: [holding("VTI", { market_value: "1000" })] }),
      );
      assert.deepEqual(snap.cashBalances, {}, `balance ${balance}`);
    }
  });

  test("an account with no holdings syncs its whole balance as cash", () => {
    assert.deepEqual(mapAccountToSnapshot(account({ balance: "42.5" })), {
      positions: [],
      cashBalances: { USD: "42.5" },
    });
  });

  test("keeps sub-cent average costs", () => {
    const snap = mapAccountToSnapshot(
      account({
        holdings: [
          holding("SHIB", { shares: "1000000", cost_basis: "8.5", market_value: "10" }),
          holding("PENNY", { shares: "3", cost_basis: "1", market_value: "1" }),
          holding("DUST", { shares: "1000000000", cost_basis: "0.5", market_value: "1" }),
        ],
      }),
    );
    assert.deepEqual(
      snap.positions.map((p) => p.averageCost),
      ["0.0000085", "0.333333", "0.0000000005"],
    );
  });
});

describe("aggregateSnapshots", () => {
  test("keeps sub-cent average costs when merging", () => {
    const merged = aggregateSnapshots(
      ["0.000008", "0.000009"].map((averageCost) => ({
        positions: [{ symbol: "SHIB", quantity: "1000000", currency: "USD", averageCost }],
        cashBalances: {},
      })),
    );
    assert.equal(merged.positions[0].averageCost, "0.0000085");
  });

  test("the same ticker across accounts sums quantity and quantity-weights cost", () => {
    const merged = aggregateSnapshots([
      {
        positions: [{ symbol: "VTSAX", quantity: "10", currency: "USD", averageCost: "100" }],
        cashBalances: {},
      },
      {
        positions: [{ symbol: "vtsax", quantity: "30", currency: "USD", averageCost: "120" }],
        cashBalances: {},
      },
    ]);
    // (10*100 + 30*120) / 40 = 115; the first-seen spelling of the ticker is kept.
    assert.deepEqual(merged.positions, [
      { symbol: "VTSAX", quantity: "40", currency: "USD", averageCost: "115" },
    ]);
  });

  test("if any lot lacks a cost, the merged position has no average cost", () => {
    for (const order of [
      ["100", undefined],
      [undefined, "100"],
    ]) {
      const merged = aggregateSnapshots(
        order.map((averageCost) => ({
          positions: [{ symbol: "VTI", quantity: "1", currency: "USD", averageCost }],
          cashBalances: {},
        })),
      );
      assert.equal(merged.positions[0].averageCost, undefined, `order ${order}`);
      assert.equal(merged.positions[0].quantity, "2");
    }
  });

  test("distinct tickers keep first-seen order", () => {
    const merged = aggregateSnapshots([
      {
        positions: [
          { symbol: "B", quantity: "1", currency: "USD" },
          { symbol: "A", quantity: "1", currency: "USD" },
        ],
        cashBalances: {},
      },
      {
        positions: [
          { symbol: "C", quantity: "1", currency: "USD" },
          { symbol: "A", quantity: "1", currency: "USD" },
        ],
        cashBalances: {},
      },
    ]);
    assert.deepEqual(
      merged.positions.map((p) => [p.symbol, p.quantity]),
      [
        ["B", "1"],
        ["A", "2"],
        ["C", "1"],
      ],
    );
  });

  test("summed quantities are rounded to 6dp", () => {
    const merged = aggregateSnapshots([
      { positions: [{ symbol: "X", quantity: "0.1", currency: "USD" }], cashBalances: {} },
      { positions: [{ symbol: "X", quantity: "0.2", currency: "USD" }], cashBalances: {} },
    ]);
    assert.equal(merged.positions[0].quantity, "0.3");
  });

  test("a zero total quantity has no average cost", () => {
    const merged = aggregateSnapshots([
      {
        positions: [{ symbol: "X", quantity: "0", currency: "USD", averageCost: "10" }],
        cashBalances: {},
      },
    ]);
    assert.deepEqual(merged.positions, [{ symbol: "X", quantity: "0", currency: "USD" }]);
  });

  test("cash is summed per currency, rounded to cents, and zero totals are dropped", () => {
    const merged = aggregateSnapshots([
      { positions: [], cashBalances: { USD: "0.1", CAD: "50" } },
      { positions: [], cashBalances: { USD: "0.2", EUR: "0" } },
      { positions: [], cashBalances: {} },
    ]);
    assert.deepEqual(merged.cashBalances, { USD: "0.3", CAD: "50" });
  });

  test("no snapshots aggregate to an empty snapshot", () => {
    assert.deepEqual(aggregateSnapshots([]), { positions: [], cashBalances: {} });
  });
});
