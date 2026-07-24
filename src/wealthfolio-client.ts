import type { SnapshotHoldingInput } from "./types";

/**
 * Minimal client for Wealthfolio's server REST API.
 *
 * Authentication is optional. A server started with `WF_AUTH_REQUIRED=false`
 * (the usual shape behind a forward-auth reverse proxy) issues no session
 * cookie and expects none, so `login()` is a no-op when no password is given
 * and requests simply go out unauthenticated.
 */
export class WealthfolioClient {
  private cookie: string | null = null;

  constructor(private readonly baseUrl: string) {}

  /** Establish a session. Without a password, assumes the server needs none. */
  async login(password?: string): Promise<void> {
    if (!password) {
      this.cookie = null;
      return;
    }
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
    const res = await fetch(`${this.baseUrl}/api/v1/snapshots`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: JSON.stringify({ accountId, holdings, cashBalances, snapshotDate }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const hint =
        (res.status === 401 || res.status === 403) && !this.cookie
          ? " Set WF_PASSWORD if this Wealthfolio server requires authentication."
          : "";
      throw new Error(
        `saveSnapshot failed for ${accountId} (HTTP ${res.status}).${hint} ${body}`.trim(),
      );
    }
  }
}
