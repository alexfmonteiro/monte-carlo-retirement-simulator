# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Monte Carlo retirement simulator for Brazilian investors with internationally-diversified portfolios (USD-denominated ETFs). A pure frontend application with no backend dependencies, using React and Canvas.js for visualizations. Handles Brazilian-specific complexity: FX risk, IPCA inflation modeling, Irish ETF taxation, and dynamic BRL/USD correlation during market stress.

## Development Commands

**No build system** - this is a completely static, self-contained application:
- **Development**: Open `index.html` directly in a browser or serve via `python -m http.server 8000`
- **Deployment**: Push to GitHub and enable Pages (main branch, root directory)
- **Testing**: Open `tests.html` in browser and click "Run All Tests"
- **Manual testing**: Use browser console to inspect `engine.runSimulation()` (single path) or `engine.runMonteCarlo(100)` (quick 100-iteration test)

## Test Suite

The test suite (`tests.html`) is a zero-dependency browser-based test framework covering:

1. **Statistical Distribution Validation**
   - Box-Muller: mean, std deviation, 68-95 rule compliance
   - T-Student: fat tails verification, correct mean/std after scaling
   - Cholesky: correlation accuracy for positive, negative, and zero correlation

2. **Financial Logic (Guyton-Klinger Rules)**
   - Preservation rule: triggers when withdrawal rate exceeds threshold
   - Prosperity rule: triggers when withdrawal rate drops below threshold
   - Inflation rule: skips adjustment after negative return years

3. **Tax Calculations**: equity/bond allocation splits, different tax rates

4. **IPCA Model**: bounds checking (0-15%), negative correlation with equity

5. **Dynamic FX Correlation**: stress/boom scenarios, correlation caps

6. **Currency Simulation**: mean reversion, stress volatility multiplier

7. **Edge Cases**: zero portfolio, extreme correlations, low degrees of freedom

8. **Deterministic Scenarios**: multi-year sequences triggering specific rules

## Architecture

The entire application lives in a single `index.html` file (3,261 lines) with embedded JavaScript and React:

```
index.html
├── HTML Head (CDN imports: Tailwind, React 18, Babel, Chart.js, Lucide Icons)
├── JavaScript Section <script type="text/babel">
│   ├── MonteCarloEngine Class (~700 lines)
│   │   ├── Random generators (Box-Muller, T-Student with fat tails)
│   │   ├── IPCA modeling, currency simulation with dynamic correlation
│   │   ├── Tax calculation, Guyton-Klinger rules, Bucket strategy
│   │   ├── runSimulation() - single path, runMonteCarlo() - full simulation
│   │   └── Result analysis & percentile calculation
│   └── React Components (~1,800 lines)
│       ├── Form inputs: Input, Toggle, Tooltip, DualCurrencyInput, BRLInputWithUSD
│       ├── Display: StatCard, PortfolioChart, WithdrawalChart, StressChart
│       ├── Analysis: RecoveryAnalysis, TaxImpactChart, RuleStatsTable
│       └── App (main container & state management)
└── Body: <div id="root"></div>
```

## Key Technical Patterns

**Statistical Methods**:
- Box-Muller transform for normal distribution
- T-Student distribution (chi-squared based) for fat-tail market returns
- Cholesky decomposition for correlated asset returns

**Dynamic FX Correlation**: Base -0.4 correlation with 2x stress multiplier during market downturns

**Guyton-Klinger Rules**: Preservation (cut if rate rises 20% above initial), Prosperity (increase if rate drops 20% below), Inflation (skip adjustment after bad years)

**Bucket Strategy**: First N years withdraw exclusively from fixed income to protect equity from sequence-of-returns risk

## UI Components

- **Tooltip**: Hover/click tooltip with Portuguese explanations for all parameters
- **DualCurrencyInput**: USD input with auto-converted BRL equivalent (for USD-denominated assets)
- **BRLInputWithUSD**: BRL input with auto-converted USD equivalent (for BRL-denominated values)
- All monetary inputs show both currencies with automatic conversion based on current FX rate

## Modification Guide

- **Simulation Engine**: Edit `MonteCarloEngine` class - add rules in `runSimulation()`, extend `analyzeResults()` for new metrics
- **UI Changes**: Edit React components - add parameters to `useState` in `App`, new inputs to sidebar, new result views to main panel
- **Parameters**: All defaults in `useState` object at line ~2479 (shifted due to new components)
- **Styling**: Tailwind classes + custom CSS (lines 38-83) - colors: midnight, deep, surface, accent, danger, warning, info
- **Tooltips**: All tooltip texts are in Portuguese and explain concepts in detail - keep them educational
