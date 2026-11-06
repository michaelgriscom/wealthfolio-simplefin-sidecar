# Wealthfolio SimpleFIN Sidecar

## Requirements

- A self-hosted **Wealthfolio server** (3.5+) reachable over HTTP.
- A SimpleFIN Bridge **access URL** (see below).
- **⚠️ One Wealthfolio account per brokerage, set to *HOLDINGS* tracking mode.** Currently, SimpleFIN does not supply sufficient information in its transactions (e.g. ticker, share quantity) to support tracking mode.

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
it at `/config/config.json`.

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
| `CASH_SYMBOLS` | `VMFXX,VMRXX,SPAXX,SPRXX,FDRXX,FZFXX,SWVXX` | Comma-separated tickers to treat as cash. Prepopulated with money-market and sweep funds. |
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

### Crypto accounts (`cryptoAccounts`)

Some SimpleFIN feeds report crypto in a way the default mapping gets wrong.
SimpleFIN's Coinbase feed reports an account whose `balance` is the total USD
value of its coins while every holding has an empty or zero `market_value`,
and its tickers are crypto tickers. Without help, Wealthfolio shows the whole
account as **cash**, and each holding matches a wrong security (BTC -> the
Grayscale Bitcoin ETF, BCH -> Banco de Chile, COMP -> Compass, Inc. ...).

List those SimpleFIN accounts under `cryptoAccounts` in the config file:

```jsonc
"cryptoAccounts": {
  "<coinbase-id>": "all",              // every holding is crypto
  "<mixed-broker-id>": ["BTC", "ETH"], // only these; other holdings stay stocks
}
```

A plain list of ids (`["<coinbase-id>"]`) also works and means `"all"`. For
crypto holdings in those accounts:

- They are synced as **CRYPTO** instruments (`instrumentType: "CRYPTO"` +
  `quoteCcy`, no `exchangeMic`). Wealthfolio keys these as
  `CRYPTO:{BASE}/{QUOTE}` and prices them from market data (Yahoo symbol
  `BTC-USD`). The setting is scoped per account because many crypto tickers
  are also stock tickers (AMP, ZETA, NEAR, ...).
- If any held coin (shares > 0) has no `market_value`, the balance can't be
  split into holdings vs. cash, so **no cash is synced** for that account and
  a warning is logged. This means fiat cash held in the same account is not
  synced. Accounts with no holdings still sync their balance as cash.

Tickers Wealthfolio's market data doesn't know (renamed or delisted coins,
such as Coinbase's `CGLD` for Celo) will sync without a price.

Accounts not listed in `cryptoAccounts` are mapped exactly as before.

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
