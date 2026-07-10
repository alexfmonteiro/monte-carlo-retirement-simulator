# Accumulation Phase & Retirement-Age Sweep — Feature Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. This is a design-level plan; expand each task with full code before executing (or let each builder derive it from the referenced patterns).

**Goal:** Answer "how much longer should I work?" inside the product: simulate an accumulation phase (monthly savings while still working) feeding into the existing retirement simulation, and sweep retirement ages to show how the sustainable SWR/spending evolves — including the "stop today" (shit-hits-the-fan) baseline.

**Architecture:** Extend `MonteCarloEngine.runSimulation()` with an optional pre-retirement phase (contributions in, no withdrawals) so accumulation is **stochastic** (sequence risk while saving is captured, unlike a deterministic projection). Add a sweep driver that, for each candidate retirement age, bisects the SWR meeting a confidence target AND evaluates survival at the user's actual spending. New "Projeção" tab on the main page renders the curve + table. Every existing knob (returns, IPCA, FX, G-K, taxes, INSS, mortality, floors) applies to both phases automatically because it's the same engine.

**Tech stack:** same as repo — plain-JS engine (`js/engine-core.js` + new `js/engine-projection.js` prototype extensions), Babel JSX UI (`js/app-main.js`, new `js/ui-projection.js`), browser tests in `tests.html`, Node smoke in `scripts/smoke.js`.

---

## New parameters (defaults from the owner's profile)

```js
// Accumulation phase (main app defaults)
useAccumulation: false,          // off by default — existing behavior unchanged
accumulationYears: 0,            // years of work/saving before withdrawals start
monthlyContributionBRL: 30000,   // today's BRL; indexed by simulated IPCA each year
contributionSplitUSD: 80,        // % of each contribution buying USD assets (rest → BRL sleeve)
contributionGrowthReal: 0,       // optional % a.a. real growth of savings capacity (raises/promotions)
// Spending-target mode (alternative to rate mode)
spendingMode: 'rate',            // 'rate' (SWR % as today) | 'target' (fixed real spending)
targetSpendingBRL: 240000,       // today's BRL per year; indexed by simulated IPCA to retirement date
```

## Engine changes

### 1. `runSimulation()` accumulation phase (js/engine-core.js)
Insert a phase-1 loop before the existing year loop when `useAccumulation && accumulationYears > 0`:

- Each accumulation year: draw the SAME stochastic returns as retirement years (equity/regime, IPCA, BRL bond, USD bond, FX via `simulateCurrency` with the running `cumulativeIpcaFactor`), grow both sleeves, then add the year's contribution: `annual = monthlyContributionBRL * 12 * cumulativeIpcaFactor * (1 + contributionGrowthReal/100)^yearIdx`, split `contributionSplitUSD`% to the USD sleeve (converted at current FX) and the rest to the BRL sleeve. No withdrawals, no G-K, no failure possible.
- History arrays still get one entry per accumulation year (`withdrawalBRL: 0`, `withdrawalSource: 'accumulating'`) so charts show the full timeline; total `history` length = `accumulationYears + years + 1`.
- At the retirement boundary, compute the initial withdrawal: `spendingMode === 'rate'` → `withdrawalRate% × portfolio at that point` (as today); `'target'` → `targetSpendingBRL × cumulativeIpcaFactor` (the user's real spending carried to the retirement date). `initialWithdrawalRate` for G-K = initial withdrawal ÷ retirement-date portfolio in both modes.
- Ages: `currentAge` stays "age today"; INSS/mortality/tent/bucket clocks all shift to start at retirement (`year <= bucketYears` becomes `retirementYear <= bucketYears`, INSS uses `currentAge + totalYear - 1` which already works, mortality failure ages are already absolute). Minimum-withdrawal floor only applies after retirement.

### 2. Retirement-age sweep (new js/engine-projection.js)
`MonteCarloEngine.prototype.runRetirementAgeSweep({maxExtraYears, criteria})`:

- For n = 0..maxExtraYears: run the two-phase Monte Carlo with `accumulationYears: n`, horizon to age 100.
- Per n, compute: (a) bisected max SWR meeting `criteria.adjustedSurvival` (default 96.5%) and `criteria.rawSurvival` (default 83%) — reuse the app's bisection pattern with ~1,200 iterations per probe, confirm best at 3–4k; (b) survival (raw + adjusted) at the user's `targetSpendingBRL`; (c) median real portfolio at retirement (deflate by `meanCumulativeIpca`).
- Return `{byAge: [{age, portfolioRealMedian, swrConservative, swrAdjusted, monthlyConservative, monthlyAdjusted, survivalAtTarget, adjustedAtTarget}], criteria}`.
- Runs in chunks with a progress callback (the UI needs it — this is ~10 ages × ~12 bisection probes).

## UI (js/app-main.js + new js/ui-projection.js)

- New third tab in the main results panel: **"Projeção"** (alongside Monte Carlo / Backtesting).
- Sidebar gains a "Fase de Acumulação" section (visible in both simple and advanced): toggle, monthly contribution (BRLInputWithUSD), years-more-to-work slider (0–15), contribution split, spending mode toggle + target spending input. Tooltips in pt-BR explaining IPCA indexing of contributions and the two spending modes.
- Tab content:
  1. **"Se parar hoje" card** — survival raw/adjusted at target spending with `accumulationYears: 0` (the SHTF baseline), rendered prominently with a status color.
  2. **Curve chart** (`SustainableSpendingByAgeChart`) — sustainable monthly spending (today's BRL) vs retirement age, two series (conservative / adjusted-risk), horizontal reference line at the user's target spending; intersection = earliest comfortable retirement age, called out in text.
  3. **Table** — one row per age: portfolio (real), both SWRs, monthly spending, survival at target.
  4. Existing portfolio-evolution chart already works for a selected age (history includes the accumulation years); add a vertical "aposentadoria" marker at the boundary.
- All monetary outputs deflated to today's BRL via `meanCumulativeIpca` (already exposed by `analyzeResults`).

## Tests (tests.html) + smoke

- Accumulation indexation: with all vols = 0-ish and IPCA model off, portfolio after n years equals closed-form `P·(1+r)^n + Σ contrib`.
- Boundary correctness: history length = accumulation + retirement + 1; no withdrawals before retirement; floor/INSS only after.
- Target mode: `spendingMode:'target'` first-year withdrawal = `targetSpendingBRL × cumIpca` at boundary (±float).
- Sweep monotonicity: sustainable SWR non-decreasing in extra years worked (statistical tolerance).
- `scripts/smoke.js`: add a two-phase run + sweep(3 ages) NaN/shape check.

## Task breakdown (sequential, same swarm pattern as the fixes plan)

1. **Engine: accumulation phase in `runSimulation`** + smoke check (closed-form test first, TDD).
2. **Engine: `runRetirementAgeSweep`** in new `engine-projection.js` (+ script tag in index.html, load order after engine-core).
3. **Sidebar section + params** (defaults above, pt-BR tooltips).
4. **Projeção tab**: SHTF card + sweep table + progress UI.
5. **Curve chart component** in `ui-projection.js` (Chart.js, two series + reference line).
6. **Tests + docs** (tests.html suites above; README/CLAUDE.md sections).

## Notes / decisions taken

- Stochastic accumulation (not deterministic median) is the point of doing this in-engine: a 2008 in year 2 of saving vs year 8 produces different retirement pots; the sweep's percentiles will honestly show that spread.
- Contributions are BRL-denominated and IPCA-indexed (salary reality), split at the current-year FX — this makes the USD sleeve accumulation FX-path-dependent, which is realistic (you buy fewer dollars when the BRL is weak).
- Income (10.5k USD/mo) is deliberately NOT a parameter — only savings flow matters to the model; spending while working is outside the portfolio.
- Endowment page untouched.
