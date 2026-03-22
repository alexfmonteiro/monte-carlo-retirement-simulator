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
├── app-main.js             — Main App component + ReactDOM.createRoot mount
└── app-endowment.js        — Endowment App component + ReactDOM.createRoot mount
```

**Script loading rules**: `rng.js`, `mortality-data.js`, `historical-data.js`, and `engine-*.js` are plain `<script src>` (no JSX). All `ui-*.js` and `app-*.js` files use `<script type="text/babel" src="...">` (Babel Standalone compiles them). No `import`/`export` — all names are globals. Data files (`mortality-data.js`, `historical-data.js`) must load before `engine-core.js`.

## Key Technical Patterns

- **Statistical Methods**: Box-Muller transform for normal distribution; T-Student (chi-squared based) for fat-tail market returns; Cholesky decomposition for correlated asset returns
- **Dynamic FX Correlation**: Base -0.4 correlation with 2x stress multiplier during market downturns
- **Guyton-Klinger Rules**: Preservation (cut if rate rises 20% above initial), Prosperity (increase if rate drops 20% below), Inflation (skip adjustment after bad years). Preservation and Prosperity are mutually exclusive per year.
- **Bucket Strategy**: First N years withdraw exclusively from fixed income to protect equity from sequence-of-returns risk
- **Die With Zero Optimizer**: Two-phase bisection (coarse 200 iterations → fine 1000 iterations → full validation)
- **Spending Smile**: Blanchett (2014) spending curve — configurable multipliers for early/mid/late retirement phases with smooth cosine interpolation. Applied post-G-K so preservation/prosperity rules evaluate the sustainable rate, then smile adjusts actual spending.
- **Regime-Switching Returns**: 2-state Markov model (bull/bear) replacing IID returns. Calibrated defaults: bull 12%/12%vol, bear -5%/25%vol. Transition probabilities determine regime clustering. Uses `this.random()` for reproducible transitions.
- **Mortality-Adjusted Survival**: IBGE 2023 mortality table (male/female/couple). Weights failed simulations by P(dead before failure year). A failure at age 95 contributes less than a failure at age 65.
- **Historical Backtesting**: Rolling-window backtest against 1995-2024 historical data (S&P 500, CDI/Selic, IPCA, BRL/USD). Mirrors `runSimulation()` logic but with actual historical returns. Produces spaghetti charts, percentile bands, and per-window analysis.

## Modification Guide

- **Simulation Engine**: Edit `MonteCarloEngine` class — add rules in `runSimulation()`, extend `analyzeResults()` for new metrics
- **UI Changes**: Edit React components — add parameters to `useState` in `App` (line ~2549), new inputs to sidebar, new result views to main panel
- **Styling**: Tailwind classes + custom CSS (lines 38-83)
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
