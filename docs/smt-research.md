# SMT divergence — research notes for DRQuantMTF

Research backing the signal engine. Covers what SMT is, what the evidence does and does not
support, and the specific correlation behaviour of the three pairs we trade.

Last updated: 23 November 2026

---

## 1. Definition

SMT (Smart Money Technique) divergence is a **non-confirmation between two positively
correlated instruments at the same swing**.

| Setup | Instrument A | Instrument B | Reading |
|---|---|---|---|
| **Bullish SMT** | Lower Low | Higher Low | A swept liquidity, B refused to follow. A's low is suspect. |
| **Bearish SMT** | Higher High | Lower High | A ran stops above, B refused to follow. A's high is suspect. |

If both instruments make the new extreme together, **there is no divergence** — that is
confirmation, and the move is more likely real.

The logic: two instruments driven by the same underlying factor should print the same
structure. When one makes a new extreme and its partner does not, the extreme was more
likely driven by order flow local to that instrument — stop-hunting, thin liquidity, a
single large participant — than by the shared factor. The non-confirming instrument is the
control group.

## 2. What the evidence supports

**Honest summary: the mechanism is plausible, the published evidence is thin.**

- There is **no peer-reviewed study** of SMT divergence, and **no published backtest with
  transaction costs**. Every win rate and profit factor quoted by vendors is an
  unverified in-house number.
- The underlying statistical idea — that a divergence between co-integrated series tends to
  revert — *is* well established in pairs trading literature. SMT is a discretionary,
  chart-pattern expression of that idea rather than a formal statistical arbitrage.
- Sources consistently agree on one practical point: **SMT should not be a standalone
  trigger.** It is a filter. It needs a location (a zone) and a confirmation (a structure
  shift or displacement).

**Consequence for the product:** we publish no win rate, no profit factor and no expectancy
figure we have not measured ourselves on logged, out-of-sample signals with costs included.
Anything else is a fabricated performance claim, and under FCA rules on financial promotions
that is not a grey area.

## 3. The correlation gate — the thing that actually matters

The dominant failure mode is **correlation breakdown**. When two instruments stop moving
together, every swing disagrees, and a divergence detector fires constantly on noise. Two
unrelated charts disagreeing is not a signal.

Published guidance puts the usable floor at roughly **|r| > 0.7**, with 0.85 cited as a
stricter rule of thumb. We implement both: 0.70 as the hard gate, 0.85 as the threshold for
a "strong correlation" scoring bonus.

**We correlate log returns, not price levels.** Two trending series show a high price-level
correlation even when their day-to-day behaviour has decoupled entirely; it measures shared
trend, not shared movement. Returns correlation is the honest measure.

Rolling window: 60 bars. On 4H that is roughly two weeks; on 1H, about a week and a half.
Long enough to be stable, short enough to catch a regime change.

## 4. The three pairs

### GBPUSD ↔ EURUSD — the strongest of the three

- **Mean 60-day correlation 0.79, directional consistency 100%** — the strongest pairing in
  a September 2026 survey of commonly traded market relationships.
- Both are EUR/GBP against USD, so the shared factor is the dollar leg. Divergence isolates
  idiosyncratic sterling or euro flow.
- **Known breakdown risk:** BoE and ECB on opposite policy paths. As of this writing the
  market prices roughly an 80% chance of a 25bp BoE hike in December, which is exactly the
  kind of single-sided event that decouples the pair for days.
- **Treat as primary.** Highest confidence of the three.

### NQ1! ↔ ES1! — strong, with a structural caveat

- Both are US large-cap index futures with heavy constituent overlap, so baseline
  correlation is very high.
- **The caveat is current and severe.** The AI-concentration unwind has broken the
  historical relationship: in the week to 20 November 2026 the Nasdaq 100 fell 10.0% against
  the Dow's 8.0%, and on 20 November alone NDX fell 5.61% against the Dow's 1.93%. Tech
  weight means NQ and ES are presently driven by *different* factors — NQ by AI capex
  sentiment, ES by the broader market.
- This is precisely when the correlation gate earns its place. During a dispersion regime
  the gate should shut and suppress signals, because NQ/ES disagreement is currently
  structural rather than informational.
- **Do not override the gate on this pair.** The temptation will be strongest here because
  it produces the most apparent divergences.

### XAUUSD ↔ XAGUSD — weakest and most conditional

- Long-run one-year rolling correlation runs **0.68 to 0.95** — the widest band of the three.
- CME noted the two metals recently hit their **weakest price correlation in over two
  decades**. Current YTD performance confirms the dispersion: gold −19.9%, silver −43.6%.
- **Why it decouples:** silver is roughly half industrial demand, gold is almost purely
  monetary. An industrial-demand shock moves silver and not gold. That is a genuine
  divergence in the economic sense but not the order-flow sense SMT is trying to detect.
- Silver's higher beta means it overshoots gold in both directions. Useful at turning
  points — silver exhausts first — but it also means raw price divergence overstates the
  signal. Sizing the divergence in ATR units rather than percent partially normalises this.
- **Treat as confirmation-only.** Require the strong-correlation band (0.85) before acting,
  not the 0.70 floor.

## 5. Timeframe

The user specification is **1H and 4H only**, which the research supports as the sensible
middle:

- Below 15m, SMT fires constantly and most of it is microstructure noise.
- Daily and above produces clean signals but too few to build a medium-frequency product on,
  and the holding period stops being medium-frequency.
- 4H carries more weight than 1H, which is why the scoring model gives 4H a +1.

## 6. Scoring model

Out of 10, mirroring the MTF S&D script so both signals read on the same scale.

| Component | Points | Rationale |
|---|---|---|
| Base | 1 | A valid divergence exists |
| Divergence size | 1–3 | ≥1.0 ATR = 3, ≥0.5 = 2, else 1. Bigger disagreement, stronger signal |
| Correlation quality | 2–3 | 3 if \|r\| ≥ 0.85, else 2. How much the pairing can be trusted |
| Liquidity sweep | +2 | Prior swing taken out intrabar and given back by the close |
| 4H timeframe | +1 | Higher timeframe carries more weight |

Maximum 10. Default display threshold 5.

The sweep requirement is the strictest filter and the most important one. A divergence
*without* a sweep is just two charts drifting apart. A divergence *with* a sweep is the
actual footprint the technique is trying to catch: stops taken on one instrument, not
confirmed on its partner, price rejecting the level.

## 7. How the two signals combine

This is the whole product thesis and the name encodes it:

- **Direction** — SMT tells you which way the next move is more likely to resolve.
- **Resistance** — the MTF S&D zones tell you *where* price is likely to react.

Neither is a trade on its own. A high-scoring SMT divergence that fires **inside a
higher-timeframe demand zone** is the setup. SMT supplies the bias, the zone supplies the
location and the invalidation level. The confluence is the signal; either one alone is
context.

## 8. Open items

- Measure actual hit rate on logged out-of-sample signals before publishing any performance
  figure. Until then the site states plainly that no performance claim is made.
- Consider adding a cointegration test alongside the correlation gate for the metals pair,
  since correlation of returns misses level-divergence that mean-reverts.
- Evaluate whether the gold/silver ratio adds information beyond the raw correlation gate.

---

## Sources

- [FXStreet — Five market relationships traders rely on: which ones still work (Sep 2026)](https://www.fxstreet.com/analysis/five-market-relationships-traders-rely-on-which-ones-still-work-202609091047)
- [CME Group — Four major drivers of the gold/silver price ratio](https://www.cmegroup.com/insights/economic-research/2025/four-major-drivers-of-the-gold-silver-price-ratio.html)
- [Quantzee — SMT divergence: a correlated-pair workflow guide](https://quantzee.com/smt-divergence-correlated-pairs/)
- [The Right Trader — SMT divergence: how to spot correlated market signals](https://therighttrader.com/learn/smart-money-concepts/smt-divergence)
- [Volity — Slopes in SMT divergences (2026)](https://volity.io/forex/slopes-in-smt-divergences/)
- [SnappChart — What is SMT divergence? Bullish, bearish and NQ/ES examples](https://www.snappchart.app/blog/strategy-playbooks/smt-divergence)
- Market data and the AI-unwind context: Bigdata.com, 20–22 November 2026
