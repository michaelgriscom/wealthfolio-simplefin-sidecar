import type { SnapshotHoldingInput } from "./types";
import type { MappedSnapshot } from "./mapping";

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/**
 * Merge several per-account snapshots into one. Duplicate tickers (e.g. VTSAX
 * held in multiple accounts) have their quantities summed and average cost
 * recomputed as a quantity-weighted mean; cash is summed per currency.
 */
export function aggregateSnapshots(snapshots: MappedSnapshot[]): MappedSnapshot {
  interface Agg {
    symbol: string;
    quantity: number;
    weightedCost: number;
    hasCost: boolean;
    currency: string;
  }
  const bySymbol = new Map<string, Agg>();
  const cash: Record<string, number> = {};

  for (const snap of snapshots) {
    for (const pos of snap.positions) {
      const key = pos.symbol.toUpperCase();
      const qty = Number.parseFloat(pos.quantity) || 0;
      const avg = pos.averageCost !== undefined ? Number.parseFloat(pos.averageCost) : NaN;
      const prev = bySymbol.get(key);
      if (prev) {
        prev.quantity += qty;
        if (Number.isFinite(avg)) prev.weightedCost += qty * avg;
        else prev.hasCost = false;
      } else {
        bySymbol.set(key, {
          symbol: pos.symbol,
          quantity: qty,
          weightedCost: Number.isFinite(avg) ? qty * avg : 0,
          hasCost: Number.isFinite(avg),
          currency: pos.currency,
        });
      }
    }
    for (const [ccy, amount] of Object.entries(snap.cashBalances)) {
      cash[ccy] = (cash[ccy] ?? 0) + (Number.parseFloat(amount) || 0);
    }
  }

  const positions: SnapshotHoldingInput[] = [];
  for (const agg of bySymbol.values()) {
    const pos: SnapshotHoldingInput = {
      symbol: agg.symbol,
      quantity: String(round(agg.quantity, 6)),
      currency: agg.currency,
    };
    if (agg.hasCost && agg.quantity > 0) {
      pos.averageCost = String(round(agg.weightedCost / agg.quantity, 2));
    }
    positions.push(pos);
  }

  const cashBalances: Record<string, string> = {};
  for (const [ccy, amount] of Object.entries(cash)) {
    const rounded = round(amount, 2);
    if (rounded !== 0) cashBalances[ccy] = String(rounded);
  }

  return { positions, cashBalances };
}
