import * as http from "node:http";
import { loadConfig } from "./config";
import { runSync, type Logger, type SyncResult } from "./sync";

const cfg = loadConfig();

const log: Logger = {
  info: (m) => console.log(`[${new Date().toISOString()}] INFO  ${m}`),
  warn: (m) => console.warn(`[${new Date().toISOString()}] WARN  ${m}`),
  error: (m) => console.error(`[${new Date().toISOString()}] ERROR ${m}`),
};

let lastResult: SyncResult | null = null;
let lastError: string | null = null;
let running = false;

async function doSync(trigger: string): Promise<SyncResult> {
  if (running) throw new Error("a sync is already running");
  running = true;
  log.info(`sync started (${trigger})`);
  try {
    // Reload config each run so mapping/access-URL edits take effect without a restart.
    const result = await runSync(loadConfig(), log);
    lastResult = result;
    lastError = null;
    log.info(`sync finished: ${result.accountsSynced} synced, ${result.accountsFailed} failed`);
    return result;
  } catch (e) {
    lastError = (e as Error).message;
    log.error(`sync failed: ${lastError}`);
    throw e;
  } finally {
    running = false;
  }
}

function msUntilNext(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => Number.parseInt(n, 10));
  const now = new Date();
  const next = new Date(now);
  next.setHours(h, m, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

function scheduleDaily(): void {
  const delay = msUntilNext(cfg.syncAt);
  log.info(`next scheduled sync in ${Math.round(delay / 60000)} min (at ${cfg.syncAt})`);
  setTimeout(() => {
    void doSync("schedule").catch(() => {});
    scheduleDaily();
  }, delay);
}

if (process.argv.includes("--once")) {
  // one-shot mode (manual / CI): run once and exit non-zero on any failure
  doSync("cli")
    .then((r) => process.exit(r.accountsFailed > 0 ? 1 : 0))
    .catch(() => process.exit(1));
} else {
  http
    .createServer((req, res) => {
      const url = req.url ?? "/";
      if (url === "/") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, syncAt: cfg.syncAt }));
        return;
      }
      if (url === "/status") {
        const ok = lastError === null;
        res.writeHead(ok ? 200 : 500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok, lastResult, lastError }));
        return;
      }
      if (url === "/sync" && req.method === "POST") {
        doSync("http")
          .then((r) => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(r));
          })
          .catch((e) => {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: String(e) }));
          });
        return;
      }
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    })
    .listen(cfg.port, () => log.info(`listening on :${cfg.port}`));

  scheduleDaily();
  if (cfg.runOnStart) void doSync("startup").catch(() => {});
}
