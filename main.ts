// BTC race bot: trend-following long-only bot for CBBTC/USDC, 1-minute bars.
//
// Design (deliberately simple and robust -- see the dev-window analysis):
//   * The dev window is a smooth uptrend (+3.6% over 24h, max drawdown ~2%,
//     1-minute noise ~8 bps). Fast EMA crossovers whipsaw on that noise:
//     offline replay showed 70-100 trades and about -$150 net. Any rule
//     that trades often pays ~26-45 bps per round trip and dies on fees.
//   * So this bot trades RARELY: it scales into a long early, then only
//     exits on a wide trailing stop. In a rising window it behaves almost
//     like buy-and-hold (the near-optimal play there); in a falling window
//     the trailing stop + slow-trend re-entry filter keep it in cash while
//     buy-and-hold bleeds. That asymmetry is the whole edge.
//   * Rules, decided on each batch's bar, filled at the next bar's open:
//       1. First tradeable batch: buy 50% of cash.
//       2. Second leg: when the close is >= 0.5% above the entry close,
//          buy the remaining cash (pyramiding on confirmation).
//       3. Trailing stop: while long, sell everything if the close falls
//          2.5% below the highest close since entry.
//       4. Per-trade stop-loss: sell everything if the close falls 3%
//          below the entry close (belt-and-braces under the trailing stop).
//       5. Equity drawdown flatten: sell everything if equity falls 10%
//          below its peak (catastrophe guard).
//       6. Re-entry after a stop-out: buy in full only when the close
//          recovers 0.5% above the exit close, or when the close is above
//          its 240-bar SMA while sitting >= 1% below the 240-bar high
//          (a dip inside an intact uptrend).
//   * At most one order per reply. Deterministic: no clock, no randomness,
//     no network, no files; state is only the closes seen so far.

import { runBars, type BarsState, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const MAX_SLIPPAGE_BPS = 100; // 1%: fills move ~0.1-0.2%, so this rarely binds
const PYRAMID_BPS = 50n; // second leg once +0.5% above entry
const TRAIL_BPS = 250n; // trailing stop: 2.5% below peak since entry
const STOP_BPS = 300n; // per-trade stop-loss: 3% below entry
const EQUITY_DD_BPS = 1000n; // flatten if equity -10% from its peak
const REENTRY_BPS = 50n; // re-enter 0.5% above the exit close
const SMA_N = 240; // 4-hour slow trend filter for dip re-entry
const DIP_BPS = 100n; // dip re-entry: >= 1% below the 240-bar high
const BPS = 10000n;

const closes: bigint[] = []; // closes seen so far, at price_scale
let entryPx: bigint | null = null; // close of the bar the first buy was decided on
let peakPx: bigint | null = null; // highest close since entry
let exitPx: bigint | null = null; // close of the bar the stop-out sell was decided on
let legs = 0; // 0 = never bought, 1 = half in, 2 = fully in / re-entered
let peakEquity: bigint | null = null;

function sma(n: number): bigint {
  const window = closes.slice(-n);
  let sum = 0n;
  for (const c of window) sum += c;
  return sum / BigInt(window.length);
}

function sellAll(state: BarsState, close: bigint): OrderInput[] {
  const holding = state.positions.get(SYMBOL);
  if (!holding) return [];
  exitPx = close;
  return [{ side: 'sell', symbol: SYMBOL, qty: holding.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
}

await runBars({
  onBatch(state): OrderInput[] {
    if (state.warmingUp) return [];
    const close = state.close(SYMBOL);
    if (close === null) return [];
    closes.push(close);

    const holding = state.positions.get(SYMBOL);
    const qty = holding ? holding.qty : 0n;

    if (peakEquity === null || state.equity > peakEquity) peakEquity = state.equity;
    if (qty > 0n && (peakPx === null || close > peakPx)) peakPx = close;

    // 5. Catastrophe guard: flatten on a 10% equity drawdown from peak.
    if (qty > 0n && peakEquity !== null && state.equity * BPS < peakEquity * (BPS - EQUITY_DD_BPS)) {
      return sellAll(state, close);
    }

    if (qty > 0n) {
      // 3. Trailing stop, then 4. per-trade stop-loss.
      if (peakPx !== null && close * BPS < peakPx * (BPS - TRAIL_BPS)) return sellAll(state, close);
      if (entryPx !== null && close * BPS < entryPx * (BPS - STOP_BPS)) return sellAll(state, close);
      // 2. Second leg: pyramid the remaining cash on +0.5% confirmation.
      if (legs === 1 && entryPx !== null && close * BPS >= entryPx * (BPS + PYRAMID_BPS)) {
        if (state.cash >= 1000000n) {
          legs = 2;
          return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
        }
      }
      return [];
    }

    // Flat: 1. first entry (half size), or 6. re-entry after a stop-out.
    if (legs === 0 || (legs === 1 && exitPx === null)) {
      // legs == 1 with no position means the first half-buy was rejected
      // (e.g. slippage): retry the entry instead of staying flat forever.
      if (state.cash >= 2000000n) {
        entryPx = close;
        peakPx = close;
        legs = 1;
        return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash / 2n, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }
    if (exitPx !== null) {
      const recovered = close * BPS >= exitPx * (BPS + REENTRY_BPS);
      const high240 = closes.slice(-SMA_N).reduce((a, b) => (a > b ? a : b));
      const dipInUptrend =
        closes.length >= SMA_N && close > sma(SMA_N) && close * BPS < high240 * (BPS - DIP_BPS);
      if (recovered || dipInUptrend) {
        if (state.cash >= 1000000n) {
          entryPx = close;
          peakPx = close;
          exitPx = null;
          legs = 2;
          return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
        }
      }
    }
    return [];
  },
});
