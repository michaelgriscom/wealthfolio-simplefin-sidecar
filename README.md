# Wealthfolio SimpleFIN Sidecar

## Requirements

- A self-hosted **Wealthfolio server** (3.5+) reachable over HTTP.
- A SimpleFIN Bridge **access URL** (see below).
- One Wealthfolio account per brokerage, set to **HOLDINGS** tracking mode.

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

```json
{
  "simplefinAccessUrl": "https://USER:PASS@bridge.simplefin.org/simplefin",
  "exchangeMic": "XNAS",
  "mapping": {
    "<wealthfolio-account-id>": ["<simplefin-account-id>", "..."]
  }
}
```

Each Wealthfolio account maps to one or more SimpleFIN accounts; multiple sources are
**aggregated** (duplicate tickers summed with quantity-weighted average cost, cash
summed per currency).

To find the IDs: SimpleFIN account IDs come from the bridge's `/accounts` response;
Wealthfolio account IDs come from its API or app.

### Environment variables

| Var | Default | Purpose |
| --- | --- | --- |
| `WF_BASE_URL` | `http://wealthfolio:8088` | Wealthfolio server API base |
| `WF_PASSWORD` | — (required) | Wealthfolio login password |
| `SYNC_AT` | `04:00` | Daily run time (24h local) |
| `RUN_ON_START` | `false` | Sync once on startup |
| `CASH_SYMBOLS` | built-in list | Comma-separated tickers to treat as cash |
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

## Development

```bash
npm install
npm run type-check       # tsc --noEmit
npm run sync:once        # run a single sync against your config
```

## License

MIT
