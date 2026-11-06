# Changelog

## [1.2.0](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/compare/v1.1.0...v1.2.0) (2026-11-06)


### Features

* crypto holdings from aggregators without market data, e.g. Coinbase: configure with `cryptoAccounts` ([#5](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/pull/5)) ([4f1bf8f](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/commit/4f1bf8fa536e8985d47f6391a9f2c5812fdc9d4c))


### Bug Fixes

* **deps:** pin the base image digest ([f66a3a4](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/commit/f66a3a4106bfb52a4b2ff3ef9265a52e42e27149))
* date snapshots with the local date, and let Wealthfolio date the snapshot ([c1225c2](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/commit/c1225c2a5e8fda16ab949573e7abb462eb08cbf5), [4f93ae3](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/commit/4f93ae3a8036aa38b451144aef3b9bc3aeea5614))
* keep sub-cent precision in average costs ([8b77cb2](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/commit/8b77cb22333b3f74144bbdc5ce0fac00114ce9fe))
* reject mapping values that are not lists of account ids ([7a3a3d0](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/commit/7a3a3d0cb5bbb0a090eb3d41a738fc12adc78000))
* validate SYNC_AT and PORT at config load, and treat empty values as unset ([bc78318](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/commit/bc783189338ca470b75341cc2b1759860e0a3c02), [74e755c](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/commit/74e755cf31fbaa6b1cf0ef8a82042b7f0195a0ad))

## [1.1.0](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/compare/v1.0.0...v1.1.0) (2026-07-24)


### Features

* support passwordless wealthfolio deployments, change config to JSONC ([#3](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/issues/3)) ([c9fc9eb](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/commit/c9fc9eb953c60f65c36ff5ecae45ba1182a71b6c))

## 1.0.0 (2026-06-27)


### Features

* standalone Wealthfolio SimpleFIN sync sidecar ([2e36ac6](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/commit/2e36ac62994da59bae3aab014877431155bd259a))
