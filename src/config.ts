import { readFileSync } from "node:fs";
import { parseJsonc } from "./jsonc";

export interface SyncConfig {
  wfBaseUrl: string;
  wfPassword?: string;
  simplefinAccessUrl: string;
  /** Wealthfolio account id -> list of SimpleFIN account ids to aggregate into it. */
  mapping: Record<string, string[]>;
  cashSymbols?: string[];
  /**
   * SimpleFIN account ids whose holdings are all cryptocurrencies (e.g.
   * Coinbase wallets). Their holdings are emitted as CRYPTO instruments
   * (priced natively by Wealthfolio, e.g. BTC-USD) instead of equities on
   * `exchangeMic`. Scoped per account so crypto tickers that collide with
   * stock tickers (AMP, ZETA, COMP, ...) don't affect brokerage accounts.
   */
  cryptoAccounts?: string[];
  /**
   * Deprecated: use `cryptoAccounts`. Accounts whose non-cash holdings are all
   * in this list are treated as crypto accounts.
   */
  cryptoSymbols?: string[];
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
  cryptoSymbols?: unknown;
}

function stringArray(key: string, value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
    throw new Error(`config.${key} must be an array of strings`);
  }
  return value;
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
    cryptoAccounts: stringArray("cryptoAccounts", file.cryptoAccounts),
    cryptoSymbols: stringArray("cryptoSymbols", file.cryptoSymbols),
    exchangeMic: file.exchangeMic ?? env.EXCHANGE_MIC ?? "XNAS",
  };
}
