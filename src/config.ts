import { readFileSync } from "node:fs";
import { parseJsonc } from "./jsonc";
import type { CryptoScope } from "./mapping";

export interface SyncConfig {
  wfBaseUrl: string;
  wfPassword?: string;
  simplefinAccessUrl: string;
  /** Wealthfolio account id -> list of SimpleFIN account ids to aggregate into it. */
  mapping: Record<string, string[]>;
  cashSymbols?: string[];
  /**
   * SimpleFIN account id -> which of its holdings are crypto: "all" (e.g. a
   * Coinbase account) or a list of tickers (an account holding stocks and
   * coins). Crypto holdings are emitted as CRYPTO instruments (priced natively
   * by Wealthfolio, e.g. BTC-USD) instead of equities on `exchangeMic`. Scoped
   * per account so crypto tickers that collide with stock tickers (AMP, ZETA,
   * COMP, ...) don't affect other accounts.
   */
  cryptoAccounts?: Record<string, CryptoScope>;
  /** Daily run time, 24h "HH:MM" local. */
  syncAt: string;
  port: number;
  runOnStart: boolean;
  exchangeMic: string;
}

interface FileConfig {
  simplefinAccessUrl?: string;
  mapping?: Record<string, string[]>;
  exchangeMic?: string;
  cryptoAccounts?: unknown;
}

function stringArray(key: string, value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
    throw new Error(`config.${key} must be an array of strings`);
  }
  return value;
}

/**
 * `cryptoAccounts` accepts a list of account ids (each meaning "all") or an
 * object of account id -> "all" | ticker list.
 */
function cryptoAccounts(value: unknown): Record<string, CryptoScope> | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    const ids = stringArray("cryptoAccounts", value) ?? [];
    return Object.fromEntries(ids.map((id) => [id, "all" as const]));
  }
  const err = new Error(
    'config.cryptoAccounts must be a list of account ids, or an object of account id -> "all" or a list of tickers',
  );
  if (typeof value !== "object" || value === null) throw err;
  const out: Record<string, CryptoScope> = {};
  for (const [id, scope] of Object.entries(value)) {
    if (scope === "all") out[id] = "all";
    else if (Array.isArray(scope) && scope.every((s) => typeof s === "string")) out[id] = scope;
    else throw err;
  }
  return out;
}

function required(key: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required config: ${key}`);
  return value;
}

/**
 * Config comes from a mounted JSON file (access URL + mapping — avoids putting
 * credentials and JSON through .env interpolation) plus a few simple env vars.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): SyncConfig {
  const file: FileConfig = (() => {
    const path = env.CONFIG_FILE ?? "/config/config.json";
    try {
      return parseJsonc<FileConfig>(readFileSync(path, "utf8"));
    } catch (e) {
      throw new Error(`Failed to read config file at ${path}: ${(e as Error).message}`);
    }
  })();

  const mapping = file.mapping ?? {};
  if (Object.keys(mapping).length === 0) {
    throw new Error("config.mapping is empty — nothing to sync");
  }

  return {
    wfBaseUrl: (env.WF_BASE_URL ?? "http://wealthfolio:8088").replace(/\/+$/, ""),
    wfPassword: env.WF_PASSWORD || undefined,
    simplefinAccessUrl: required("simplefinAccessUrl", file.simplefinAccessUrl),
    mapping,
    cashSymbols: env.CASH_SYMBOLS
      ? env.CASH_SYMBOLS.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined,
    syncAt: env.SYNC_AT ?? "04:00",
    port: Number(env.PORT ?? "8080"),
    runOnStart: (env.RUN_ON_START ?? "false").toLowerCase() === "true",
    cryptoAccounts: cryptoAccounts(file.cryptoAccounts),
    exchangeMic: file.exchangeMic ?? env.EXCHANGE_MIC ?? "XNAS",
  };
}
