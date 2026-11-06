import { readFileSync } from "node:fs";
import { parseJsonc } from "./jsonc";

export interface SyncConfig {
  wfBaseUrl: string;
  wfPassword?: string;
  simplefinAccessUrl: string;
  /** Wealthfolio account id -> list of SimpleFIN account ids to aggregate into it. */
  mapping: Record<string, string[]>;
  cashSymbols?: string[];
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
}

function required(key: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required config: ${key}`);
  return value;
}

function syncAt(value: string): string {
  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error(`SYNC_AT must be a 24h "HH:MM" time, got "${value}"`);
  }
  return value;
}

function port(value: string): number {
  const n = Number(value);
  if (!/^\d+$/.test(value) || n < 1 || n > 65535) {
    throw new Error(`PORT must be an integer from 1 to 65535, got "${value}"`);
  }
  return n;
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
  for (const [wfId, sfIds] of Object.entries(mapping)) {
    if (!Array.isArray(sfIds) || !sfIds.every((id) => typeof id === "string")) {
      throw new Error(`config.mapping["${wfId}"] must be a list of SimpleFIN account ids`);
    }
  }

  return {
    wfBaseUrl: (env.WF_BASE_URL ?? "http://wealthfolio:8088").replace(/\/+$/, ""),
    wfPassword: env.WF_PASSWORD || undefined,
    simplefinAccessUrl: required("simplefinAccessUrl", file.simplefinAccessUrl),
    mapping,
    cashSymbols: env.CASH_SYMBOLS
      ? env.CASH_SYMBOLS.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined,
    syncAt: syncAt(env.SYNC_AT?.trim() || "04:00"),
    port: port(env.PORT?.trim() || "8080"),
    runOnStart: (env.RUN_ON_START ?? "false").toLowerCase() === "true",
    exchangeMic: file.exchangeMic ?? env.EXCHANGE_MIC ?? "XNAS",
  };
}
