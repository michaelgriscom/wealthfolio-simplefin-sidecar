import type { SnapshotHoldingInput } from "./types";

/** Minimal client for Wealthfolio's server REST API (cookie session auth). */
export class WealthfolioClient {
  private cookie: string | null = null;

  constructor(private readonly baseUrl: string) {}

  async login(password: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      throw new Error(`Wealthfolio login failed (HTTP ${res.status})`);
    }
    const setCookie = res.headers.get("set-cookie");
    if (!setCookie) {
      throw new Error("Wealthfolio login returned no session cookie");
    }
    // keep only the "name=value" portion of the first cookie
    this.cookie = setCookie.split(";")[0];
  }

  /** Save a dated holdings snapshot for a HOLDINGS-mode account. */
  async saveSnapshot(
    accountId: string,
    holdings: SnapshotHoldingInput[],
    cashBalances: Record<string, string>,
    snapshotDate: string,
  ): Promise<void> {
    if (!this.cookie) throw new Error("WealthfolioClient.login() must be called first");
    const res = await fetch(`${this.baseUrl}/api/v1/snapshots`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: this.cookie },
      body: JSON.stringify({ accountId, holdings, cashBalances, snapshotDate }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`saveSnapshot failed for ${accountId} (HTTP ${res.status}). ${body}`.trim());
    }
  }
}
