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
  /** Non-fatal problems the caller should log (e.g. cash that could not be derived). */
  warnings?: string[];
}

export interface MapOptions {
  cashSymbols?: string[];
  /**
   * Treat every non-cash holding as a CRYPTO instrument. Set for SimpleFIN
   * accounts listed in `cryptoAccounts` (e.g. Coinbase wallets).
   */
  crypto?: boolean;
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
 * Crypto accounts (`options.crypto`) differ in two ways:
 *  - holdings become CRYPTO instruments (`instrumentType: "CRYPTO"` +
 *    `quoteCcy`), which Wealthfolio keys as CRYPTO:{BASE}/{QUOTE} and prices
 *    natively (e.g. BTC-USD) instead of matching an equity with that ticker;
 *  - some aggregators (notably SimpleFIN's Coinbase feed) report the account's
 *    USD value as `balance` but leave `market_value` empty or 0 on holdings.
 *    If any holding lacks a market value, the balance cannot be split into
 *    holdings vs. cash, so no cash is emitted (Wealthfolio values the
 *    positions from quotes) and a warning is returned.
 */
export function mapAccountToSnapshot(
  account: SimpleFinAccount,
  options: MapOptions = {},
): MappedSnapshot {
  const { cashSymbols = DEFAULT_CASH_SYMBOLS, crypto = false } = options;
  const accountCurrency = normalizeCurrency(account.currency);
  const cashSet = new Set(cashSymbols.map((s) => s.toUpperCase()));
  const holdings = account.holdings ?? [];

  const positions: SnapshotHoldingInput[] = [];
  let nonCashMarketValue = 0;
  let missingMarketValue = 0;

  for (const holding of holdings) {
    const symbol = (holding.symbol ?? "").trim();
    if (!symbol) continue;
    if (cashSet.has(symbol.toUpperCase())) {
      // economically cash — accounted for via the balance-derived cash below
      continue;
    }
    const marketValue = toNumber(holding.market_value);
    if (marketValue <= 0) missingMarketValue += 1;
    nonCashMarketValue += marketValue;
    const currency = normalizeCurrency(holding.currency, accountCurrency);
    const avg = averageCost(holding);
    positions.push({
      symbol,
      quantity: holding.shares ?? "0",
      currency,
      ...(crypto ? { instrumentType: "CRYPTO", quoteCcy: currency } : {}),
      ...(avg !== undefined ? { averageCost: avg } : {}),
    });
  }

  const cashBalances: Record<string, string> = {};
  if (crypto && missingMarketValue > 0) {
    const warning =
      `SimpleFIN account ${account.id} (${account.name}): ${missingMarketValue} of ` +
      `${positions.length} holdings have no market value, so cash cannot be derived ` +
      `from the balance (${account.balance}); syncing positions with no cash. ` +
      `Any fiat cash in this account is not synced.`;
    return { positions, cashBalances, warnings: [warning] };
  }

  const cash = round2(toNumber(account.balance) - nonCashMarketValue);
  if (cash > 0) cashBalances[accountCurrency] = String(cash);

  return { positions, cashBalances };
}
