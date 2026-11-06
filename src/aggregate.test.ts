import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateSnapshots } from "./aggregate";

test("aggregation preserves crypto instrument fields", () => {
  const crypto = { symbol: "BTC", quantity: "1", currency: "USD", instrumentType: "CRYPTO", quoteCcy: "USD" };
  const merged = aggregateSnapshots([
    { positions: [crypto], cashBalances: {} },
    { positions: [{ ...crypto, quantity: "0.5" }], cashBalances: { USD: "10" } },
  ]);
  assert.deepEqual(merged.positions, [{ ...crypto, quantity: "1.5" }]);
  assert.deepEqual(merged.cashBalances, { USD: "10" });
});

test("a stock and a crypto coin sharing a ticker stay separate", () => {
  const stock = { symbol: "AMP", quantity: "10", currency: "USD" };
  const coin = { symbol: "AMP", quantity: "500", currency: "USD", instrumentType: "CRYPTO", quoteCcy: "USD" };
  const merged = aggregateSnapshots([
    { positions: [stock], cashBalances: {} },
    { positions: [coin], cashBalances: {} },
  ]);
  assert.deepEqual(merged.positions, [stock, coin]);
});
