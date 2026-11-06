import { inferCryptoAccounts, mapAccountToSnapshot } from "./mapping";
import { fetchAccounts, type SimpleFinAccount } from "./simplefin";
import { aggregateSnapshots } from "./aggregate";
import type { SyncConfig } from "./config";
import { WealthfolioClient } from "./wealthfolio-client";

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export interface SyncResult {
  date: string;
  finishedAt: string;
  accountsSynced: number;
  accountsFailed: number;
  skipped: string[];
  errors: string[];
}

/** Run a full sync: pull SimpleFIN holdings and write a snapshot per mapped Wealthfolio account. */
export async function runSync(cfg: SyncConfig, log: Logger): Promise<SyncResult> {
  const date = new Date().toISOString().slice(0, 10);
  const result: SyncResult = {
    date,
    finishedAt: "",
    accountsSynced: 0,
    accountsFailed: 0,
    skipped: [],
    errors: [],
  };

  const sf = await fetchAccounts(cfg.simplefinAccessUrl);
  for (const e of sf.errors ?? []) log.warn(`SimpleFIN connection warning: ${e}`);
  const byId = new Map<string, SimpleFinAccount>(sf.accounts.map((a) => [a.id, a]));

  const cryptoAccounts = new Set(cfg.cryptoAccounts ?? []);
  for (const id of cryptoAccounts) {
    if (!byId.has(id)) {
      log.warn(`cryptoAccounts lists ${id}, which SimpleFIN did not return; check the id`);
    }
  }
  if (cfg.cryptoSymbols?.length) {
    const mappedIds = new Set(Object.values(cfg.mapping).flat());
    const mapped = sf.accounts.filter((a) => mappedIds.has(a.id) && !cryptoAccounts.has(a.id));
    for (const { id, unlisted } of inferCryptoAccounts(mapped, cfg.cryptoSymbols, cfg.cashSymbols)) {
      cryptoAccounts.add(id);
      if (unlisted.length) {
        log.warn(
          `SimpleFIN account ${id} treated as crypto via cryptoSymbols, including ` +
            `unlisted symbols [${unlisted.join(", ")}]`,
        );
      }
    }
    log.warn(
      cryptoAccounts.size
        ? `config.cryptoSymbols is deprecated. Replace it with: ` +
            `"cryptoAccounts": ${JSON.stringify([...cryptoAccounts])}`
        : `config.cryptoSymbols is deprecated and matched no account this run; ` +
            `list your crypto SimpleFIN account ids under "cryptoAccounts" instead`,
    );
  }

  const wf = new WealthfolioClient(cfg.wfBaseUrl);
  if (!cfg.wfPassword) {
    log.info("WF_PASSWORD not set — connecting without authentication");
  }
  await wf.login(cfg.wfPassword);

  for (const [wfAccountId, simplefinIds] of Object.entries(cfg.mapping)) {
    const missing = simplefinIds.filter((id) => !byId.has(id));
    if (missing.length) {
      result.skipped.push(`${wfAccountId}: missing SimpleFIN accounts [${missing.join(", ")}]`);
    }
    const sources = simplefinIds
      .map((id) => byId.get(id))
      .filter((a): a is SimpleFinAccount => a !== undefined);
    if (sources.length === 0) continue;

    const snapshots = sources.map((a) =>
      mapAccountToSnapshot(a, { cashSymbols: cfg.cashSymbols, crypto: cryptoAccounts.has(a.id) }),
    );
    for (const w of snapshots.flatMap((s) => s.warnings ?? [])) log.warn(w);
    const merged = aggregateSnapshots(snapshots);
    // Crypto instruments must not carry an exchange MIC.
    const positions = merged.positions.map((p) =>
      p.instrumentType === "CRYPTO" ? p : { ...p, exchangeMic: cfg.exchangeMic },
    );
    try {
      await wf.saveSnapshot(wfAccountId, positions, merged.cashBalances, date);
      result.accountsSynced += 1;
      log.info(
        `Snapshot saved for ${wfAccountId}: ${merged.positions.length} positions, ` +
          `cash [${Object.entries(merged.cashBalances).map(([c, v]) => `${c} ${v}`).join(", ") || "none"}]`,
      );
    } catch (e) {
      result.accountsFailed += 1;
      result.errors.push((e as Error).message);
      log.error((e as Error).message);
    }
  }

  result.finishedAt = new Date().toISOString();
  return result;
}
