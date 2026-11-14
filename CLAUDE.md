# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Token Savings Rule

When reading files or web content for parsing, extraction, summarization, or pattern searching
(not for code reasoning/editing), delegate to `freeloader` via Bash instead of using
Read/Grep/WebFetch. This applies even mid-task (debugging, troubleshooting, etc.).

**Use freeloader for:**

```bash
# Log / output analysis
freeloader "find all ERROR entries with timestamps and messages" /var/log/app.log
bun test 2>&1 | freeloader "did tests pass? list any failures with their names"
npm run build 2>&1 | freeloader "any errors or warnings? be brief"

# Config / data extraction
freeloader "list all database hosts and ports" config.yaml
freeloader "find all rows where status is 'failed', list their IDs" data.csv

# Web content
curl -s '<url>' | freeloader '<what you need>'

# Git / diff review
git diff | freeloader "what changed? any risks or breaking changes?"
git log --oneline -50 | freeloader "summarize recent work in 3 bullet points"

# API responses
curl -s https://api.example.com/data | freeloader "extract the relevant fields as JSON"
```

**Only use Read/Grep directly** when you need to reason about code structure, understand logic,
or make edits. For everything else — freeloader.

## Project Overview

Monte Carlo retirement simulator for Brazilian investors with internationally-diversified portfolios (USD-denominated ETFs). A pure frontend application with no backend dependencies, using React 18, Babel (in-browser JSX), Tailwind CSS, and Chart.js for visualizations. Handles Brazilian-specific complexity: FX risk, IPCA inflation modeling, Irish ETF taxation, and dynamic BRL/USD correlation during market stress.

All UI text and tooltips are in Portuguese (pt-BR).

## Development Commands

**No build system** — static application served via HTTP:
- **Development**: `python -m http.server 8000` then open `http://localhost:8000` (**required** — `file://` won't work because Babel fetches external JS files via XHR)
- **Deployment**: Push to GitHub and enable Pages (main branch, root directory)
- **Testing**: Serve locally then open `http://localhost:8000/tests.html` and click "Run All Tests"
- **Headless testing**: `node scripts/run-tests.js` runs the full `tests.html` suite in Node (exits 1 on any failure); `node scripts/smoke.js` runs browser-free sanity checks
- **Manual testing**: Use browser console to inspect `engine.runSimulation()` (single path) or `engine.runMonteCarlo(100)` (quick 100-iteration test)

## Architecture

The application is split across HTML shells and a `js/` folder:

```
index.html          — HTML head (CDN imports + CSS) + script tags only
endowment.html      — HTML head + script tags for endowment simulator
tests.html          — Test runner (loads engine from js/)
js/
├── rng.js                  — SeededRNG class (Mulberry32 PRNG)
├── mortality-data.js       — IBGE 2023 mortality table (qx ages 0-110, male/female)
├── historical-data.js      — Historical annual data 1995-2024 (S&P 500, CDI, IPCA, BRL/USD)
├── engine-core.js          — MonteCarloEngine class (shared by both pages)
│                               Random generators, IPCA, currency, tax, Guyton-Klinger,
│                               spending smile, regime-switching, mortality adjustment,
│                               runSimulation(), runMonteCarlo(), analyzeResults()
├── engine-projection.js    — Retirement-age sweep (prototype extensions):
│                               _bisectSWR, runRetirementAgeSweep — used by the
│                               "Projeção" tab. Loads right after engine-core.js.
├── engine-historical.js    — Historical backtesting methods (prototype extensions):
│                               runHistoricalBacktest, runAllHistoricalWindows,
│                               analyzeHistoricalResults
├── engine-endowment.js     — Endowment-only engine methods (prototype extensions):
│                               generateCAPE, runSimulationEndowment,
│                               computeComparisonMetrics, runMonteCarloComparison
├── ui-primitives.js        — Icon, Tooltip, Input, DualCurrencyInput, BRLInputWithUSD, Toggle
├── ui-shared-charts.js     — StatCard, PortfolioChart (used by both pages)
├── ui-main-charts.js       — WithdrawalChart, WithdrawalEvolutionChart
├── ui-main-analysis.js     — WithdrawalStats, FailureAnalysis, RulesExplanation
├── ui-stress.js            — StressDurationAnalysis, ToleranceSuccessChart,
│                               PortfolioImpactAnalysis, StressChart,
│                               RecoveryAnalysis, StressSummaryCard
├── ui-historical.js        — HistoricalOverview, HistoricalSurvivalChart,
│                               HistoricalWindowTable, HistoricalWithdrawalChart,
│                               HistoricalPortfolioChart
├── ui-endowment.js         — ComparisonLineChart, SurvivalComparisonBar,
│                               CAPEEvolutionChart, WithdrawalDistributionChart,
│                               ComparisonTable, EndowmentExplainer
├── ui-projection.js        — SustainableSpendingByAgeChart and the "Projeção" tab's
│                               SHTF card, sweep table, and progress UI
├── local-profile.example.js — Template for personal default overrides (LOCAL_PROFILE);
│                               copy to the gitignored js/local-profile.js, which only
│                               index.html loads (a 404 is harmless)
├── app-main.js             — Main App component + ReactDOM.createRoot mount
└── app-endowment.js        — Endowment App component + ReactDOM.createRoot mount
scripts/
├── run-tests.js            — Runs the full tests.html suite in Node (exits 1 on any failure)
└── smoke.js                — Browser-free finiteness/shape smoke checks
```

**Script loading rules**: `rng.js`, `mortality-data.js`, `historical-data.js`, and `engine-*.js` are plain `<script src>` (no JSX). All `ui-*.js` and `app-*.js` files use `<script type="text/babel" src="...">` (Babel Standalone compiles them). No `import`/`export` — all names are globals. Data files (`mortality-data.js`, `historical-data.js`) are only read when engine methods run, so they may load before or after `engine-core.js` but must load before the `ui-*.js`/`app-*.js` scripts. `engine-projection.js`, `engine-historical.js` and `engine-endowment.js` must load after `engine-core.js` (they extend `MonteCarloEngine.prototype`); `ui-projection.js` and the optional `local-profile.js` must load before `app-main.js`.

## Key Technical Patterns

- **Statistical Methods**: Box-Muller transform for normal distribution; T-Student (chi-squared based) for fat-tail market returns; two-variable Cholesky step done inline for correlated draws (e.g. the FX shock in `simulateCurrency`; there is no general Cholesky helper)
- **Dynamic FX Correlation**: `baseCorrelation` made more negative by `stressCorrelationMultiplier` during market downturns (`getDynamicCorrelation`); defaults live in `js/app-main.js`. The FX shock is correlated with the standardized (z-score) *realized* equity return of the year, not a discarded auxiliary draw, so the realized correlation actually matches the configured parameter. Mean reversion targets a PPP-consistent fair value (`initialFX × cumulative IPCA ÷ cumulative US inflation`, via `usdInflation`), not the nominal initial FX forever.
- **Currency Denomination**: Two portfolio sleeves — USD (equity + US bonds, via `usdBondReturn`/`usdBondVolatility`, FX-exposed) and BRL (IPCA + real spread, no FX exposure). Spending is denominated in BRL and indexed by inflation; it is converted to USD only at the current-year FX rate to size the sale. Withdrawals fund from the BRL sleeve first (natural hedge), then the USD sleeve. Failure fires only when both sleeves are depleted.
- **Guyton-Klinger Rules**: Preservation (cut if rate rises 20% above initial), Prosperity (increase if rate drops 20% below), Inflation (skip adjustment after bad years). Preservation and Prosperity are mutually exclusive per year. Inflation input is the simulated `ipcaYear` when `useIPCAModel` is on, else the fixed `inflation` param — kept consistent with the minimum-withdrawal/INSS indexation.
- **Bucket Strategy**: First N years withdraw exclusively from fixed income to protect equity from sequence-of-returns risk
- **Die With Zero Optimizer**: Two-phase bisection (coarse 200 iterations → fine 1000 iterations → full validation). When `targetEndBalance > 0`, the acceptance criterion also requires the median final balance (deflated to today's BRL by cumulative simulated IPCA) to meet the target, not just the survival rate. Probes always run in `spendingMode: 'rate'` and the deflator is the last element of `meanCumulativeIpca` (covers accumulation years); helpers live as statics on `MonteCarloEngine` (`optimizerParams`, `meetsOptimizerTarget`, `optimizerAnnualWithdrawalBRL`).
- **Spending Smile**: Blanchett (2014) spending curve — configurable multipliers for early/mid/late retirement phases with smooth cosine interpolation. Applied post-G-K so preservation/prosperity rules evaluate the sustainable rate, then smile adjusts actual spending.
- **Regime-Switching Returns**: 2-state Markov model (bull/bear) replacing IID returns. Bull/bear means and vols (`bullEquityMean`, `bullEquityVol`, `bearEquityMean`, `bearEquityVol`) default in `js/app-main.js`. Transition probabilities determine regime clustering. Uses `this.random()` for reproducible transitions.
- **Mortality-Adjusted Survival**: IBGE 2023 mortality table (male/female/couple). Weights failed simulations by P(dead before failure year). A failure at age 95 contributes less than a failure at age 65.
- **Historical Backtesting**: Rolling-window backtest against 1995-2024 historical data (S&P 500, CDI/Selic, IPCA, BRL/USD). Mirrors `runSimulation()` logic but with actual historical returns. Produces spaghetti charts, percentile bands, and per-window analysis.
- **Accumulation Phase**: Optional pre-retirement phase inside `runSimulation()` (`useAccumulation`/`accumulationYears`, off by default). Draws the SAME stochastic returns (equity/regime, IPCA, BRL bond, USD bond, FX) as the retirement loop, so sequence risk while saving is captured. No withdrawals/G-K/failure during accumulation. Each year adds an IPCA-indexed contribution (`monthlyContributionBRL`, optionally growing at `contributionGrowthReal`%) split between the USD sleeve (`contributionSplitUSD`%, at the current-year FX) and the BRL sleeve. History gets one `withdrawalSource: 'accumulating'` entry per accumulation year, so `history` length = `accumulationYears + years + 1`. At the retirement boundary the first withdrawal is sized either as `withdrawalRate`% of the boundary portfolio (`spendingMode: 'rate'`) or as `targetSpendingBRL × cumulativeIpcaFactor` (`spendingMode: 'target'`); INSS/mortality/bucket/tent clocks all start counting at the boundary, not at simulation start.
- **Retirement-Age Sweep**: `js/engine-projection.js` extends `MonteCarloEngine.prototype` with `runRetirementAgeSweep()` — for each candidate number of extra years worked, runs the two-phase Monte Carlo and bisects (coarse to 0.5 pp, then fine to `tolerance`, default 0.1 pp) the max sustainable SWR meeting raw/mortality-adjusted survival criteria, plus survival at the user's actual `targetSpendingBRL`. Every probe and target run in one sweep shares the engine's seed (common random numbers), so a numeric `params.seed` makes the sweep reproducible. Rows carry `belowFloorConservative`/`belowFloorAdjusted` when even 0.5% misses the criterion. Powers the "Projeção" tab (SHTF card at 0 extra years, sustainable-spending-by-age curve, per-age table).

## Modification Guide

- **Simulation Engine**: Edit `MonteCarloEngine` class — add rules in `runSimulation()`, extend `analyzeResults()` for new metrics
- **UI Changes**: Edit React components — add parameters to the `params` `useState` at the top of `App` in `js/app-main.js` (also the source of truth for default values), new inputs to sidebar, new result views to main panel
- **Styling**: Tailwind classes + custom CSS in the `<style>` block of each HTML file's `<head>`
- **Tooltips**: All tooltip texts are in Portuguese and explain concepts in detail — keep them educational
- **Dual Currency Inputs**: `DualCurrencyInput` (USD primary, BRL converted) and `BRLInputWithUSD` (BRL primary, USD converted) — all monetary inputs show both currencies

## Test Suite

The test suite (`tests.html`) is a zero-dependency browser-based test framework covering:

1. **Statistical Distributions**: Box-Muller, T-Student fat tails, Cholesky correlation accuracy
2. **Guyton-Klinger Rules**: Preservation, Prosperity, Inflation rule triggers and mutual exclusivity
3. **Tax Calculations**: Equity/bond allocation splits, different tax rates
4. **IPCA Model**: Bounds checking (0-15%), negative correlation with equity
5. **Dynamic FX Correlation**: Stress/boom scenarios, correlation caps
6. **Currency Simulation**: Mean reversion, stress volatility multiplier
7. **Edge Cases**: Zero portfolio, extreme correlations, low degrees of freedom
8. **Deterministic Scenarios**: Multi-year seeded sequences triggering specific rules
9. **Optimizer**: Bisection convergence, limits, seed consistency
10. **Accumulation Phase**: Closed-form contribution/growth indexation, history-length and no-withdrawal boundary correctness, spending-target vs. rate-mode boundary sizing
11. **FX-Equity Realized Correlation**: Realized corr(equity, ΔFX) matches the configured parameter
12. **BRL Sleeve and BRL Spending**: BRL-only portfolios, failure only when both sleeves are depleted, BRL withdrawal indexed at exactly (1+inflation)
13. **Retirement-Age Sweep**: Shape/finiteness of `runRetirementAgeSweep()` output, sustainable-SWR monotonicity vs. extra years worked
14. **Historical Backtest**: Spending-target vs. rate-mode first-withdrawal sizing, window count/finiteness, BRL-only portfolio, IPCA-indexed BRL spending, worst window in the late-1990s/early-2000s crisis
15. **Endowment**: Seeded reproducibility and finite metrics of `runMonteCarloComparison()`, CAPE process bounds

## Backlog and the governor

This repo's backlog is its GitHub Issues. Alex's claude-governor works approved issues overnight and opens draft PRs from `agent/<n>-<slug>` branches.

- **Ideas become issues.** When Alex shares an idea or feature request, or you notice follow-up work outside the current task, capture it as an issue instead of starting it (unless he asks you to build it now). Use `/backlog <idea>` if the skill is available; otherwise `gh issue create` with the sections Context / Proposed change / Acceptance criteria / Out of scope / Unattended suitability, and the labels `proposed`, one of `p1`–`p3`, and one of `size:S|M|L`. He approves items in the morning check-in.
- **Approval words.** "For tonight" or "go ahead" means `auto-ok` instead of `proposed`; "now" also adds `run-now`. Something only Alex can decide gets `needs-decision` with the question and options in the body.
- **Avoid overlap.** Before starting work, check for an open `agent/` PR or an `agent-wip` issue covering the same change.
- **Public repo.** Issues are public: no personal portfolio figures or profile values in titles or bodies.
