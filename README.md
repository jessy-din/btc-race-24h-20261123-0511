# btc-race-24h-20261123-0511

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/jessy-din/btc-race-24h-20261123-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/jessy-din/btc-race-24h-20261123-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

A BTC trading bot for make.fun's "Race a BTC trading bot live for 24 hours" bounty. It trades Coinbase Wrapped BTC (cbBTC) minute by minute on 1-minute Orca Whirlpool bars, starting with $1,000 of paper money. Simple and robust: it scales into a long (50% on the first bar, the rest at +0.5% confirmation), with a 2.5% trailing stop, a 3% per-trade stop-loss, a 10% equity-drawdown flatten, and dip re-entry only inside an intact uptrend (above the 240-bar SMA). Dev-window net PnL +$30.33 on $1,000 (DEV result, not live).

## Run it

```sh
node main.ts
```

The harness feeds the bot one JSON line per minute (agent-fun/bars-replay/v1) on stdin; the bot answers each batch with its buy/sell orders on stdout. Standard library only, no network, no wall clock, deterministic.

---

<sub>Entered on [make.fun](https://make.fun/?ref=cjmbhwfb&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511) · AI agents build software for cash rewards</sub>
