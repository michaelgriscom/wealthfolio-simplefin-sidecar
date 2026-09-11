import type { SnapshotHoldingInput } from "./types";
import type { SimpleFinAccount, SimpleFinHolding } from "./simplefin";

/**
 * Money-market / sweep funds that are economically cash. By default they are
 * folded into the snapshot's cash balance instead of being tracked as a
 * security position, so asset allocation treats them as cash.
 */
export const DEFAULT_CASH_SYMBOLS = [
  "VMFXX",
  "VMRXX",
  "SPAXX",
  "SPRXX",
  "FDRXX",
  "FZFXX",
  "SWVXX",
];

export interface MappedSnapshot {
  positions: SnapshotHoldingInput[];
  cashBalances: Record<string, string>;
}

/** Normalize a SimpleFIN currency value to a 3-letter ISO code, with a fallback. */
export function normalizeCurrency(currency: string | undefined, fallback = "USD"): string {
  if (!currency) return fallback;
  const c = currency.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : fallback;
}

function toNumber(value: string | undefined): number {
  const n = Number.parseFloat(value ?? "");
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Per-share average cost from SimpleFIN's total cost_basis, if derivable. */
function averageCost(holding: SimpleFinHolding): string | undefined {
  const shares = toNumber(holding.shares);
  const costBasis = toNumber(holding.cost_basis);
  if (shares > 0 && costBasis > 0) return String(round2(costBasis / shares));
  return undefined;
}

/**
 * Convert a SimpleFIN account into a Wealthfolio holdings snapshot:
 *  - securities become positions (symbol + quantity [+ averageCost])
 *  - money-market funds and any leftover sweep cash become a cash balance
 *
 * Cash is computed as `accountBalance - marketValue(non-cash holdings)`, which
 * captures both money-market funds and any uninvested sweep balance not
 * reported as its own holding.
 *
 * Exception: if the account has non-cash holdings but every one of them lacks
 * `market_value` (SimpleFIN's Coinbase aggregator reports crypto this way),
 * the balance is treated as embedded in the holdings and no cash is emitted —
 * Wealthfolio prices the assets itself.
 *
 * Symbols listed in `cryptoSymbols` become CRYPTO instruments
 * (`instrumentType: "CRYPTO"` + `quoteCcy`) so Wealthfolio resolves them as
 * crypto pairs (e.g. BTC -> CRYPTO:BTC/USD, priced as BTC-USD) instead of
 * searching for an equity with the same ticker.
 */
export function mapAccountToSnapshot(
  account: SimpleFinAccount,
  cashSymbols: string[] = DEFAULT_CASH_SYMBOLS,
  cryptoSymbols: string[] = [],
): MappedSnapshot {
  const accountCurrency = normalizeCurrency(account.currency);
  const cashSet = new Set(cashSymbols.map((s) => s.toUpperCase()));
  const cryptoSet = new Set(cryptoSymbols.map((s) => s.toUpperCase()));
  const holdings = account.holdings ?? [];

  const positions: SnapshotHoldingInput[] = [];
  let nonCashMarketValue = 0;

  for (const holding of holdings) {
    const symbol = (holding.symbol ?? "").trim();
    if (!symbol) continue;
    if (cashSet.has(symbol.toUpperCase())) {
      // economically cash — accounted for via the balance-derived cash below
      continue;
    }
    nonCashMarketValue += toNumber(holding.market_value);
    const avg = averageCost(holding);
    const isCrypto = cryptoSet.has(symbol.toUpperCase());
    positions.push({
      symbol,
      quantity: holding.shares ?? "0",
      currency: normalizeCurrency(holding.currency, accountCurrency),
      // Crypto instruments are keyed as CRYPTO:{BASE}/{QUOTE} in Wealthfolio
      // and priced natively by Yahoo as {BASE}-{QUOTE}. They must NOT carry an
      // exchange MIC (the aggregator JSONC sets exchangeMic for securities).
      ...(isCrypto ? { instrumentType: "CRYPTO", quoteCcy: normalizeCurrency(holding.currency, accountCurrency) } : {}),
      ...(avg !== undefined ? { averageCost: avg } : {}),
    });
  }

  const cashBalances: Record<string, string> = {};
  if (positions.length > 0 && nonCashMarketValue === 0 && toNumber(account.balance) > 0) {
    // SimpleFIN reports balance but every holding's market_value is 0 (several
    // aggregators, notably Coinbase, do this). The value of the account lives
    // in its holdings, not in sweep cash — emit the positions and let
    // Wealthfolio price them from market data.
    return { positions, cashBalances };
  }

  const cash = round2(toNumber(account.balance) - nonCashMarketValue);
  if (cash > 0) cashBalances[accountCurrency] = String(cash);

  return { positions, cashBalances };
}
