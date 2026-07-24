# Wealthfolio SimpleFIN Sidecar

## ⚠️ Accounts must use HOLDINGS tracking mode

**Set every account this sidecar writes to — Account settings → tracking mode —
to `HOLDINGS`.** A snapshot written to a `TRANSACTIONS`-mode account is accepted
with `200` and then surfaces nowhere, so the sync logs look clean while the UI
stays empty. That is almost always why an account never fills in.

<details>
<summary>Why not TRANSACTIONS mode?</summary>

SimpleFIN returns the same flat schema for a brokerage as for a checking account:

```
amount, description, id, mcc, memo, payee, posted, transacted_at
```

No symbol, share quantity, unit price, or activity type. A fund purchase arrives
as two cash legs with a free-text label:

```
   855.66  VANGUARD TOTAL STOCK MARKET INDEX ADMIRAL CL
  -855.66  CASH
```

Rebuilding activities from that would mean fuzzy-matching fund names to tickers,
inferring buy/sell from the sign, and dividing by a date-specific price lookup to
recover share counts — and some feeds use the same description in both
directions, leaving the sign as the only signal. The Bridge's `holdings` array
carries `symbol`, `shares`, `market_value`, and `cost_basis` directly, so
HOLDINGS mode needs no inference. This is a protocol limitation rather than a gap
in the sidecar.

</details>

Money-market and sweep funds (VMFXX, SPAXX, FDRXX, …) are folded into the
account's cash balance rather than tracked as securities, so allocation treats
them as cash — override the list with `CASH_SYMBOLS`.

## Requirements

- A self-hosted **Wealthfolio server** (3.5+) reachable over HTTP.
- A SimpleFIN Bridge **access URL** (see below).
- One Wealthfolio account per brokerage, set to **HOLDINGS** tracking mode
  (see above — this is the most common setup mistake).

## Getting a SimpleFIN access URL

SimpleFIN gives you a one-time **setup token** after you connect your accounts at
`bridge.simplefin.org`. Exchange it once for a long-lived access URL:

```bash
npm install
npm run claim -- <your-setup-token>
# prints: https://USER:PASS@bridge.simplefin.org/simplefin
```

Put that access URL into `config.json` as `simplefinAccessUrl`. (The setup token is
single-use and is consumed by this call.)

## Configuration

Create a `config.json` (see [`config.example.json`](config.example.json)) and mount
it at `/config/config.json`. Keep it out of version control — it holds credentials.

The file is parsed as **JSONC**: `//` and `/* */` comments and trailing commas are
allowed. Account ids are opaque on both sides, so label them — an uncommented
mapping is unreadable six months later.

```jsonc
{
  "simplefinAccessUrl": "https://USER:PASS@bridge.simplefin.org/simplefin",
  "exchangeMic": "XNAS",

  // Wealthfolio account id -> the SimpleFIN account ids feeding it
  "mapping": {
    // Vanguard — Roth IRA
    "0f2b…": ["ACT-1a2b…"],

    // Fidelity — HSA + 529, aggregated into one Wealthfolio account
    "7c41…": [
      "ACT-9f8e…", // HSA
      "ACT-3d4c…", // 529
    ],
  },
}
```

Each Wealthfolio account maps to one or more SimpleFIN accounts; multiple sources are
**aggregated** (duplicate tickers summed with quantity-weighted average cost, cash
summed per currency).

To find the IDs: SimpleFIN account IDs come from the bridge's `/accounts` response;
Wealthfolio account IDs come from its API or app. To list SimpleFIN accounts with
their ids:

```bash
curl -s -u 'USER:PASS' 'https://bridge.simplefin.org/simplefin/accounts?balances-only=1' \
  | python3 -m json.tool
```

### Environment variables

| Var | Default | Purpose |
| --- | --- | --- |
| `WF_BASE_URL` | `http://wealthfolio:8088` | Wealthfolio server API base |
| `WF_PASSWORD` | — (optional) | Wealthfolio login password. Omit if the server runs with `WF_AUTH_REQUIRED=false` — see below |
| `SYNC_AT` | `04:00` | Daily run time (24h local) |
| `RUN_ON_START` | `false` | Sync once on startup |
| `CASH_SYMBOLS` | built-in list | Comma-separated tickers to treat as cash |
| `EXCHANGE_MIC` | `XNAS` | Exchange for synced positions (also `exchangeMic` in the config file) |
| `CONFIG_FILE` | `/config/config.json` | Path to the config file |
| `PORT` | `8080` | Health/status/trigger HTTP port |

### Servers without a password

If your Wealthfolio server runs with `WF_AUTH_REQUIRED=false` — the usual shape
when a reverse proxy handles forward authentication — leave `WF_PASSWORD` unset.
The sidecar then skips the login call and issues requests unauthenticated, which
is what such a server expects. It logs `WF_PASSWORD not set — connecting without
authentication` so the mode is visible in the logs.

If you leave it unset against a server that *does* want a password, snapshot
writes fail with 401/403 and the error says to set `WF_PASSWORD`.

## Running

### Docker

```bash
docker run -d \
  -v ./config.json:/config/config.json:ro \
  -e WF_BASE_URL=http://wealthfolio:8088 \
  -e WF_PASSWORD=your-password \
  ghcr.io/michaelgriscom/wealthfolio-simplefin-sidecar:latest
```

### docker compose

```yaml
services:
  wealthfolio-simplefin-sidecar:
    image: ghcr.io/michaelgriscom/wealthfolio-simplefin-sidecar:latest
    restart: unless-stopped
    environment:
      - WF_BASE_URL=http://wealthfolio:8088
      - WF_PASSWORD=${WEALTHFOLIO_LOGIN_PASSWORD}
      - SYNC_AT=05:00
    volumes:
      - ./config.json:/config/config.json:ro
```

### One-shot (run once and exit; non-zero on any failure)

```bash
docker run --rm … ghcr.io/michaelgriscom/wealthfolio-simplefin-sidecar:latest tsx src/main.ts --once
```

## HTTP endpoints

The container serves a tiny status/trigger API on `PORT` (default `8080`):

- `GET /` — health (`{ ok, syncAt }`)
- `GET /status` — last run result (`200` ok / `500` on last error)
- `POST /sync` — trigger a sync now

## Troubleshooting

### Sync logs success but nothing shows up in Wealthfolio

The target account is almost certainly on **TRANSACTIONS** tracking mode. A
snapshot write to a TRANSACTIONS-mode account is accepted with `200` and then has
nowhere to surface, so the logs look perfect and the UI stays empty. Switch the
account to **HOLDINGS** (Account settings → tracking mode) and re-run
`POST /sync`. See [the section above](#%EF%B8%8F-accounts-must-use-holdings-tracking-mode)
for why this sidecar only supports HOLDINGS.

### `Wealthfolio login failed (HTTP 401)`

`WF_PASSWORD` is wrong. If the server runs with `WF_AUTH_REQUIRED=false`, unset
the variable entirely rather than guessing a value.

### `saveSnapshot failed … (HTTP 401/403)`

The server wants authentication and `WF_PASSWORD` is unset. Set it.

### `config.mapping is empty — nothing to sync`

The config file parsed but contained no mapping entries — check you haven't
commented out the whole block.

## Development

```bash
npm install
npm run type-check       # tsc --noEmit
npm run sync:once        # run a single sync against your config
```

## License

MIT
