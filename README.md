# Wealthfolio SimpleFIN Sidecar

## Requirements

- A self-hosted **Wealthfolio server** (3.5+) reachable over HTTP.
- A SimpleFIN Bridge **access URL** (see below).
- **⚠️ One Wealthfolio account per brokerage, set to *HOLDINGS* tracking mode.** Currently, SimpleFIN does not supply sufficient information (e.g. ticker, share quantity) to support tracking mode.

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
allowed.

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
| `WF_PASSWORD` | — (optional) | Wealthfolio login password. Omit if the server runs with `WF_AUTH_REQUIRED=false` |
| `SYNC_AT` | `04:00` | Daily run time (24h local) |
| `RUN_ON_START` | `false` | Sync once on startup |
| `CASH_SYMBOLS` | `VMFXX,VMRXX,SPAXX,SPRXX,FDRXX,FZFXX,SWVXX` | Comma-separated tickers to treat as cash. Prepopulated with money-market and sweep funds (VMFXX, SPAXX, FDRXX, etc). |
| `EXCHANGE_MIC` | `XNAS` | Exchange for synced positions (also `exchangeMic` in the config file) |
| `CONFIG_FILE` | `/config/config.json` | Path to the config file |
| `PORT` | `8080` | Health/status/trigger HTTP port |

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

Ensure that the mapped Wealthfolio account is set to **HOLDINGS** mode (Account settings → tracking mode).

### `HTTP 401`/`HTTP 403` errors

Check that `WF_PASSWORD` is correct. If the Wealthfolio server runs with `WF_AUTH_REQUIRED=false`, unset
the variable.

## Development

```bash
npm install
npm run type-check       # tsc --noEmit
npm run sync:once        # run a single sync against your config
```

## License

MIT
