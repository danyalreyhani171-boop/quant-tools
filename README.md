# DRQuantMTF

**Direction & Resistance Quantitative Medium Frequency Trading**

A signal service built on two complementary indicators. SMT divergence sets direction; multi-timeframe
supply and demand marks the level. Neither is a trade on its own — where they overlap is the setup.

Subscription: £47.99/month.

---

## Layout

```
indicators/
  smt-divergence.pine      SMT divergence across a correlated pair, 1H/4H
  mtf-supply-demand.pine   W/D/4H/1H supply & demand zones
web/
  index.html               Product site
docs/
  smt-research.md          Research notes behind the SMT engine
```

## Signals

### 1. SMT divergence — direction

Non-confirmation between two positively correlated instruments at the same swing.

| Setup | Primary | Reference | Reading |
|---|---|---|---|
| Bullish | Lower Low | Higher Low | Low swept on one side only |
| Bearish | Higher High | Lower High | High swept on one side only |

Gated on **rolling 60-bar log-return correlation**. Below 0.70 the signal is suppressed entirely;
0.85 and above earns the full pairing-quality score. Correlation breakdown is the technique's
dominant failure mode, so the gate runs before the divergence is believed.

Requires a **liquidity sweep** by default: the prior swing taken out intrabar and given back by the
close. A divergence without one is two charts drifting apart, not a signal.

Scored out of 10 — see `docs/smt-research.md` §6.

### 2. Multi-timeframe supply & demand — resistance

Zones built by identical rules on weekly, daily, 4H and 1H, scored out of 10, with ★ marking a zone
nested inside a higher-timeframe zone of the same direction. Four invalidation paths: no
follow-through within two bars, age limit, close beyond the far edge, or test count reaching its cap.
Weekly zones also break on a daily close, daily on a 4H close.

Gap-driven moves are discarded so futures rolls and weekend gaps don't manufacture zones. Enable
back-adjustment (B-ADJ) on futures charts.

## Instruments

| Pair | Primary | Reference | Class | Typical r | Grade |
|---|---|---|---|---|---|
| 01 | GBPUSD | EURUSD | FX majors | 0.79 | Primary |
| 02 | NQ1! | ES1! | Index futures | 0.90+ | Gated |
| 03 | XAUUSD | XAGUSD | Metals | 0.68–0.95 | Confirmation only |

Divergence is checked in both directions — either side of a pair can be the strong one.

**NQ/ES is currently decoupled** by the AI-concentration unwind. The correlation gate handles this
correctly by shutting; do not override it on this pair.

Parked for a later release: GBPJPY, USDJPY, USDCAD, WTI, YM/RTY, and cash-vs-futures basis pairs
(EURUSD/6E1!, XAUUSD/MGC1!, SP500/MES1!). The engine takes a pair config, so adding them is a config
entry rather than a rewrite.

## Timeframes

1H and 4H only. Below 15m SMT fires constantly on microstructure noise; daily and above is too
infrequent to be medium frequency. 4H carries more weight and scores +1.

## Installation

Both files are Pine Script v6. Paste into the TradingView Pine Editor and add to chart.

`smt-divergence.pine` auto-pairs from the chart symbol for the three shipped pairs. Override with the
**Reference symbol** input for anything else. The status panel shows the resolved pair, the live
correlation and whether the gate is open.

## No performance claims

No win rate, profit factor or expectancy figure appears in this repository or on the site, and none
will until it has been measured on logged out-of-sample signals with costs included. There is no
peer-reviewed study of SMT divergence and no published backtest with transaction costs; any figure
quoted for the technique elsewhere is unverified.

The product is the detection, the gate and the scoring — not a prediction.

## Risk

Analysis tooling, not investment advice. Nothing here is a personal recommendation. Trading leveraged
instruments carries a high risk of rapid loss. Past behaviour of a market relationship does not
predict its future behaviour — both the gold/silver and NQ/ES pairs are live demonstrations of
correlations breaking down.
