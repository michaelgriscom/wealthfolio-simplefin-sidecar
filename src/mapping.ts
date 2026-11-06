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

/**
 * Which holdings of an account are crypto: `"all"` (e.g. a Coinbase account)
 * or a list of tickers (an account holding both stocks and coins).
 */
export type CryptoScope = "all" | string[];

export interface MapOptions {
  cashSymbols?: string[];
  /** Holdings to emit as CRYPTO instruments. Omit for an ordinary account. */
  crypto?: CryptoScope;
}

export interface InferredCryptoAccount {
  id: string;
  scope: CryptoScope;
  /** For `scope: "all"`: non-cash symbols that aren't in `cryptoSymbols`. */
  unlisted: string[];
}

/**
 * Legacy `cryptoSymbols` support: infer each account's crypto scope.
 *  - An account that holds at least one listed symbol and reports no market
 *    values (the shape of SimpleFIN's Coinbase feed) is `"all"` crypto, so an
 *    unlisted coin doesn't stop it from qualifying.
 *  - Any other account holding listed symbols gets just those symbols as
 *    crypto — PR #5's original per-ticker behaviour, kept so mixed accounts
 *    still work. The caller warns, since a stock sharing a crypto ticker
 *    (AMP, ZETA, ...) is misclassified this way.
 */
export function inferCryptoAccounts(
  accounts: SimpleFinAccount[],
  cryptoSymbols: string[],
  cashSymbols: string[] = DEFAULT_CASH_SYMBOLS,
): InferredCryptoAccount[] {
  const crypto = new Set(cryptoSymbols.map((s) => s.toUpperCase()));
  const cash = new Set(cashSymbols.map((s) => s.toUpperCase()));
  const result: InferredCryptoAccount[] = [];
  for (const account of accounts) {
    const holdings = (account.holdings ?? []).filter((h) => {
      const s = (h.symbol ?? "").trim().toUpperCase();
      return s && !cash.has(s);
    });
    const symbols = holdings.map((h) => h.symbol.trim().toUpperCase());
    const anyListed = symbols.some((s) => crypto.has(s));
    const anyPriced = holdings.some((h) => toNumber(h.market_value) > 0);
    if (!anyListed) continue;
    if (!anyPriced) {
      result.push({ id: account.id, scope: "all", unlisted: symbols.filter((s) => !crypto.has(s)) });
    } else {
      const listed = [...new Set(symbols.filter((s) => crypto.has(s)))];
      result.push({ id: account.id, scope: listed, unlisted: [] });
    }
  }
  return result;
}

/**
 * Fiat currencies accepted as a crypto quote/cash currency. A crypto feed's
 * `currency` can itself be a 3-letter coin code (e.g. "BTC"), which would
 * otherwise produce pairs like CRYPTO:BTC/BTC.
 */
const FIAT_CURRENCIES = new Set([
  "USD", "EUR", "GBP", "CAD", "AUD", "NZD", "JPY", "CHF", "SEK", "NOK", "DKK",
  "SGD", "HKD", "CNY", "INR", "KRW", "MXN", "BRL", "ZAR", "PLN", "CZK", "ILS",
]);

function fiatOr(currency: string, fallback: string): string {
  return FIAT_CURRENCIES.has(currency) ? currency : fallback;
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
 * Crypto holdings (`options.crypto`: every holding, or listed tickers):
 *  - become CRYPTO instruments (`instrumentType: "CRYPTO"` +
 *    `quoteCcy`), which Wealthfolio keys as CRYPTO:{BASE}/{QUOTE} and prices
 *    natively (e.g. BTC-USD) instead of matching an equity with that ticker;
 *  - some aggregators (notably SimpleFIN's Coinbase feed) report the account's
 *    USD value as `balance` but leave `market_value` empty or 0 on holdings.
 *    If any held crypto holding lacks a market value, the balance cannot be
 *    split into holdings vs. cash, so no cash is emitted (Wealthfolio values the
 *    positions from quotes) and a warning is returned.
 */
export function mapAccountToSnapshot(
  account: SimpleFinAccount,
  options: MapOptions = {},
): MappedSnapshot {
  const { cashSymbols = DEFAULT_CASH_SYMBOLS, crypto } = options;
  const cryptoSet = Array.isArray(crypto) ? new Set(crypto.map((s) => s.toUpperCase())) : null;
  const isCrypto = (symbol: string) => crypto === "all" || (cryptoSet?.has(symbol.toUpperCase()) ?? false);
  const rawAccountCurrency = normalizeCurrency(account.currency);
  const accountCurrency = crypto ? fiatOr(rawAccountCurrency, "USD") : rawAccountCurrency;
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
    const holdingIsCrypto = isCrypto(symbol);
    const marketValue = toNumber(holding.market_value);
    // A held coin (shares > 0) with no positive market value means the feed
    // didn't price it. Zero-share dust/closed positions don't count.
    if (holdingIsCrypto && marketValue <= 0 && toNumber(holding.shares) > 0) missingMarketValue += 1;
    nonCashMarketValue += marketValue;
    const holdingCurrency = normalizeCurrency(holding.currency, accountCurrency);
    const currency = holdingIsCrypto ? fiatOr(holdingCurrency, accountCurrency) : holdingCurrency;
    const avg = averageCost(holding);
    positions.push({
      symbol,
      quantity: holding.shares ?? "0",
      currency,
      ...(holdingIsCrypto ? { instrumentType: "CRYPTO", quoteCcy: currency } : {}),
      ...(avg !== undefined ? { averageCost: avg } : {}),
    });
  }

  const cashBalances: Record<string, string> = {};
  if (missingMarketValue > 0) {
    const warning =
      `SimpleFIN account ${account.id} (${account.name}): ${missingMarketValue} ` +
      `crypto holding(s) have no market value, so cash cannot be derived ` +
      `from the balance (${account.balance}); syncing positions with no cash. ` +
      `Any fiat cash in this account is not synced.`;
    return { positions, cashBalances, warnings: [warning] };
  }

  const cash = round2(toNumber(account.balance) - nonCashMarketValue);
  if (cash > 0) cashBalances[accountCurrency] = String(cash);

  return { positions, cashBalances };
}
