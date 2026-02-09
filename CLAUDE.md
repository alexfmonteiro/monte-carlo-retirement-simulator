# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Monte Carlo retirement simulator for Brazilian investors with internationally-diversified portfolios (USD-denominated ETFs). A pure frontend application with no backend dependencies, using React 18, Babel (in-browser JSX), Tailwind CSS, and Chart.js for visualizations. Handles Brazilian-specific complexity: FX risk, IPCA inflation modeling, Irish ETF taxation, and dynamic BRL/USD correlation during market stress.

All UI text and tooltips are in Portuguese (pt-BR).

## Development Commands

**No build system** — completely static, self-contained application:
- **Development**: Open `index.html` directly in a browser or serve via `python -m http.server 8000`
- **Deployment**: Push to GitHub and enable Pages (main branch, root directory)
- **Testing**: Open `tests.html` in browser and click "Run All Tests"
- **Manual testing**: Use browser console to inspect `engine.runSimulation()` (single path) or `engine.runMonteCarlo(100)` (quick 100-iteration test)

## Architecture

The entire application lives in a single `index.html` file (~4,079 lines) with embedded JavaScript and React:

```
index.html
├── HTML Head (CDN imports: Tailwind, React 18, Babel, Chart.js, Lucide Icons)
├── Custom CSS (lines 38-83) — colors: midnight, deep, surface, accent, danger, warning, info
├── JavaScript Section <script type="text/babel">
│   ├── SeededRNG class (line ~100) — Mulberry32 PRNG for reproducibility
│   ├── MonteCarloEngine class (line ~119, ~950 lines)
│   │   ├── Random generators (Box-Muller, T-Student with fat tails)
│   │   ├── IPCA modeling, currency simulation with dynamic correlation
│   │   ├── Tax calculation, Guyton-Klinger rules, Bucket strategy
│   │   ├── runSimulation() — single path
│   │   ├── runMonteCarlo() — full simulation
│   │   ├── findMaxWithdrawalRate() — bisection optimizer (Die With Zero)
│   │   └── analyzeResults() — result analysis & percentile calculation
│   └── React Components (line ~1071, ~2,900 lines)
│       ├── Utility: Icon, Tooltip, Input, DualCurrencyInput, BRLInputWithUSD, Toggle
│       ├── Display: StatCard, PortfolioChart, WithdrawalChart, WithdrawalEvolutionChart
│       ├── Analysis: WithdrawalStats, FailureAnalysis, RulesExplanation
│       ├── Stress: StressDurationAnalysis, ToleranceSuccessChart, PortfolioImpactAnalysis
│       ├── Stress: StressChart, RecoveryAnalysis, StressSummaryCard
│       └── App (line ~2547) — main container, all state in single useState (line ~2549)
└── Body: <div id="root"></div>
```

## Key Technical Patterns

- **Statistical Methods**: Box-Muller transform for normal distribution; T-Student (chi-squared based) for fat-tail market returns; Cholesky decomposition for correlated asset returns
- **Dynamic FX Correlation**: Base -0.4 correlation with 2x stress multiplier during market downturns
- **Guyton-Klinger Rules**: Preservation (cut if rate rises 20% above initial), Prosperity (increase if rate drops 20% below), Inflation (skip adjustment after bad years). Preservation and Prosperity are mutually exclusive per year.
- **Bucket Strategy**: First N years withdraw exclusively from fixed income to protect equity from sequence-of-returns risk
- **Die With Zero Optimizer**: Two-phase bisection (coarse 200 iterations → fine 1000 iterations → full validation)

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
