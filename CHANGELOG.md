# Changelog

## [1.2.0](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/compare/v1.1.0...v1.2.0) (2026-11-06)


### Features

* crypto holdings from aggregators without market data (Coinbase) ([4f1bf8f](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/commit/4f1bf8fa536e8985d47f6391a9f2c5812fdc9d4c))
* keep cryptoSymbols as a deprecated fallback for cryptoAccounts ([b586281](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/commit/b586281ea4c6eca6ebb903fcf8fc09c4f30e1b36))
* scope crypto handling per account and harden the cash fallback (on top of [#5](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/issues/5)) ([bd297c7](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/commit/bd297c71b55929cf8f3b7fdf2d3e32ae09fae47b))
* scope crypto handling to cryptoAccounts and harden cash fallback ([6ef46c8](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/commit/6ef46c8e1d5256834c0211e7f3084ce26f9ab41e))
* support accounts holding both stocks and crypto ([694c05a](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/commit/694c05a43ac86a75a298548378aa59c876a311a6))


### Bug Fixes

* address review findings on crypto account handling ([a1b3ba5](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/commit/a1b3ba57b953e602fe2f24b753b691d3231fe79c))
* crypto holdings from aggregators without market data (Coinbase) ([849d812](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/commit/849d81261e6b19c8e760280199b2e327d13a3e4f))
* date snapshots with the local date ([c1225c2](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/commit/c1225c2a5e8fda16ab949573e7abb462eb08cbf5))
* **deps:** pin the base image digest and drop the no-op release age ([f66a3a4](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/commit/f66a3a4106bfb52a4b2ff3ef9265a52e42e27149))
* infer legacy crypto accounts from listed coin + no market values ([7ba606b](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/commit/7ba606b3983d855fae4c4d24c7cd9053e99e83e7))
* keep sub-cent precision in average costs ([8b77cb2](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/commit/8b77cb22333b3f74144bbdc5ce0fac00114ce9fe))
* let Wealthfolio date the snapshot ([4f93ae3](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/commit/4f93ae3a8036aa38b451144aef3b9bc3aeea5614))
* quote crypto in the account currency and never derive cash for all-crypto accounts ([af40f63](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/commit/af40f63a4f8c956a7d519bb9ac16fe444ef54060))
* reject mapping values that are not lists of account ids ([7a3a3d0](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/commit/7a3a3d0cb5bbb0a090eb3d41a738fc12adc78000))
* treat an empty SYNC_AT or PORT as unset ([74e755c](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/commit/74e755cf31fbaa6b1cf0ef8a82042b7f0195a0ad))
* validate SYNC_AT and PORT at config load ([bc78318](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/commit/bc783189338ca470b75341cc2b1759860e0a3c02))

## [1.1.0](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/compare/v1.0.0...v1.1.0) (2026-07-24)


### Features

* support passwordless wealthfolio deployments, change config to JSONC ([#3](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/issues/3)) ([c9fc9eb](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/commit/c9fc9eb953c60f65c36ff5ecae45ba1182a71b6c))

## 1.0.0 (2026-06-27)


### Features

* standalone Wealthfolio SimpleFIN sync sidecar ([2e36ac6](https://github.com/michaelgriscom/wealthfolio-simplefin-sidecar/commit/2e36ac62994da59bae3aab014877431155bd259a))
