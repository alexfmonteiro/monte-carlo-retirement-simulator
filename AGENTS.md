# AGENTS.md - Agentic Coding Guidelines

This file provides guidance for AI agents operating in this repository.

## Project Overview

Monte Carlo retirement simulator for Brazilian investors with internationally-diversified portfolios (USD-denominated ETFs). A pure frontend application with no backend dependencies, using React 18, Babel (in-browser JSX compilation), Tailwind CSS, and Chart.js for visualizations.

## Development Commands

### Running the Application

```bash
# Start local development server (required - Babel fetches files via XHR)
python -m http.server 8000

# Then open http://localhost:8000 in browser
# Main app: http://localhost:8000
# Endowment app: http://localhost:8000/endowment.html
```

### Running Tests

```bash
# Start server first
python -m http.server 8000

# Open in browser: http://localhost:8000/tests.html
# Click "Run All Tests" button

# Manual testing via browser console:
engine = new MonteCarloEngine({ /* params */ });
engine.runSimulation()  # Single simulation path
engine.runMonteCarlo(100)  # 100-iteration Monte Carlo
```

**Headless (no browser):**

```bash
node scripts/run-tests.js  # Full tests.html suite; prints failures, exits 1 on any failure
node scripts/smoke.js      # Finiteness/shape smoke checks
```

**No npm test command exists** - use the Node scripts above or the browser runner.

### Deployment

Push to GitHub and enable Pages (main branch, root directory).

## Architecture

```
index.html          — Main app HTML shell
endowment.html      — Endowment simulator HTML shell
tests.html          — Browser-based test runner
js/
├── rng.js                  — SeededRNG class (Mulberry32 PRNG)
├── mortality-data.js       — IBGE 2023 mortality table (qx ages 0-110, male/female)
├── historical-data.js      — Historical annual data 1995-2024 (S&P 500, CDI, IPCA, BRL/USD)
├── engine-core.js          — MonteCarloEngine class (core simulation logic)
├── engine-projection.js    — Retirement-age sweep (prototype extensions, "Projeção" tab)
├── engine-historical.js    — Historical backtesting methods (prototype extensions)
├── engine-endowment.js     — Endowment-specific methods (prototype extensions)
├── ui-primitives.js        — Reusable UI components (Icon, Tooltip, Input, etc.)
├── ui-shared-charts.js     — Charts shared between apps
├── ui-main-charts.js       — Main app charts
├── ui-main-analysis.js     — Main app analysis components
├── ui-stress.js            — Stress analysis components
├── ui-historical.js        — Historical backtesting UI components
├── ui-endowment.js         — Endowment app components
├── ui-projection.js        — "Projeção" tab components (retirement-age sweep UI)
├── local-profile.example.js — Template for personal default overrides (LOCAL_PROFILE)
├── local-profile.js        — Gitignored copy of the template; optional, loaded by index.html only
├── app-main.js             — Main App React component
└── app-endowment.js        — Endowment App React component
scripts/
├── run-tests.js            — Runs the full tests.html suite in Node (exits 1 on any failure)
└── smoke.js                — Browser-free finiteness/shape smoke checks
```

## Script Loading Rules

- `rng.js`, `mortality-data.js`, `historical-data.js`, and `engine-*.js`: Plain `<script src>` (no JSX)
- `ui-*.js` and `app-*.js`: `<script type="text/babel" src="...">` (Babel Standalone)
- Data files (`mortality-data.js`, `historical-data.js`) are only read when engine methods run, so they can load before or after `engine-core.js`, as long as they load before the `ui-*.js`/`app-*.js` scripts
- `engine-projection.js`, `engine-historical.js` and `engine-endowment.js` extend `MonteCarloEngine.prototype` and must load after `engine-core.js`
- `local-profile.js` (optional, gitignored) must load before `app-main.js`, which spreads `LOCAL_PROFILE` over its default params
- `ui-projection.js` must load before `app-main.js`
- **No ES6 modules** - all names are globals attached to window

## Code Style Guidelines

### General

- **Language**: All UI text and tooltips in Portuguese (pt-BR)
- **Styling**: Tailwind CSS + custom CSS in HTML files
- **No build step** - static files served directly
- **No linting** - no ESLint/Prettier configuration exists

### JavaScript Conventions

- **Variables/Functions**: camelCase (`initialPortfolioUSD`, `runSimulation`)
- **Classes**: PascalCase (`MonteCarloEngine`, `SeededRNG`)
- **React Components**: PascalCase (defined as arrow functions)
- **Constants**: UPPER_SNAKE_CASE for configuration values
- **No `const` for React components** - use `const` for hooks, direct assignment for components

### Engine Code (js/engine-*.js, js/rng.js)

```javascript
// Class definition
class MonteCarloEngine {
    constructor(params) {
        this.params = params;
        this.rng = new SeededRNG(seed);
    }

    // Method with default parameters
    randomNormal(mean = 0, std = 1) {
        // Box-Muller transform
        const u1 = this.random();
        const u2 = this.random();
        const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
        return z0 * std + mean;
    }
}
```

### React Components (js/ui-*.js, js/app-*.js)

```javascript
// React hooks
const { useState, useEffect, useRef, useCallback, useMemo } = React;

// Component definition (no const, assigned directly)
const Icon = ({ name, size = 20, className = "" }) => {
    const ref = useRef(null);
    useEffect(() => {
        // Lucide icon setup
    }, [name, size, className]);
    return <span ref={ref} className="..." />;
};

// Main App component structure
function App() {
    const [params, setParams] = useState(defaultParams);
    
    const handleCalculate = useCallback(() => {
        // ...
    }, []);
    
    return (
        <div className="flex">
            <Sidebar />
            <MainPanel />
        </div>
    );
}
```

### HTML Files

- Keep minimal - mostly CDN imports and script tags
- Custom CSS in the `<style>` block in each HTML file's `<head>`
- Tailwind CDN for utility classes

### Imports and Globals

**DO NOT use ES6 imports/exports:**
```javascript
// WRONG
import { useState } from 'react';
export default function App() { }

// CORRECT - all globals
const { useState, useEffect } = React;
function App() { }
// Mount manually at end of file
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
```

## Key Technical Patterns

### Statistical Methods

- **Box-Muller transform**: Normal distribution (`randomNormal`)
- **T-Student**: Fat-tail returns for worst-case scenarios (`randomStudentT`)
- **Two-variable Cholesky step**: Correlated draws are built inline (e.g. the FX shock in `simulateCurrency`); there is no general Cholesky helper

### Financial Models

- **Dynamic FX Correlation**: `baseCorrelation` made more negative by `stressCorrelationMultiplier` during market downturns (`getDynamicCorrelation`); defaults live in `js/app-main.js`
- **Guyton-Klinger Rules**: Preservation (cut if rate rises 20%), Prosperity (increase if rate drops 20%), Inflation skip rule
- **Bucket Strategy**: First N years withdraw from fixed income only
- **IPCA Model**: Brazilian inflation modeling with equity correlation
- **Spending Smile**: Blanchett (2014) curve — early/mid/late multipliers with cosine interpolation, applied post-G-K
- **Regime-Switching**: 2-state Markov model (bull/bear) with configurable transition probabilities
- **Mortality Adjustment**: IBGE mortality table weighting for mortality-adjusted survival rate (male/female/couple)
- **Historical Backtesting**: Rolling-window backtest against 1995-2024 data (S&P 500, CDI, IPCA, BRL/USD)

### Configuration Parameters

All simulation parameters are in a single object passed to `MonteCarloEngine`:
- Portfolio: `initialPortfolioUSD`, `initialPortfolioBRL`, `initialFX`
- Returns: `equityReturn`, `equityVolatility`, `bondReturn`, `bondVolatility`
- Withdrawal: `withdrawalRate`, `useGuytonKlinger`, `useBucketStrategy`
- Tax: `useTaxModel`, `equityTaxRate`, `fixedIncomeTaxRate`
- Inflation: `useIPCAModel`, `expectedIPCA`, `ipcaVolatility`
- Spending Smile: `useSpendingSmile`, `smileEarlyMultiplier`, `smileMidMultiplier`, `smileLateMultiplier`
- Regime-Switching: `useRegimeSwitching`, `bullEquityMean`, `bullEquityVol`, `bearEquityMean`, `bearEquityVol`, `bullToBullProb`, `bearToBearProb`
- Mortality: `useMortalityAdjustment`, `mortalityGender`
- Accumulation: `useAccumulation`, `accumulationYears`, `monthlyContributionBRL`, `contributionSplitUSD`, `contributionGrowthReal`
- Spending mode: `spendingMode` (`'rate'` or `'target'`), `targetSpendingBRL`
- USD side: `usdInflation`, `usdBondReturn`, `usdBondVolatility`

Default values live in the `useState` at the top of `js/app-main.js`; read them there instead of copying numbers into docs.

## Modification Guide

### Adding New Simulation Features

1. Edit `MonteCarloEngine` class in `js/engine-core.js` (or the matching `js/engine-*.js` prototype extension)
2. Add method or extend `runSimulation()` for new logic
3. Extend `analyzeResults()` for new metrics
4. Test in browser console with seeded engine

### Adding New UI Components

1. Edit React component in appropriate `js/ui-*.js` file
2. Add to component in `js/app-main.js` or `js/app-endowment.js`
3. Use existing patterns: `DualCurrencyInput`, `BRLInputWithUSD`, `Toggle`

### Adding Tests

1. Edit `tests.html`
2. Add test suite using `tf.describe(name, fn)` and `tf.it(name, fn)`
3. Use assertion helpers: `assert`, `assertEqual`, `assertAlmostEqual`, `assertInRange`

## Testing Guidelines

- Tests are browser-based with zero dependencies
- Use seeded RNG for reproducibility (`seed` parameter)
- Test edge cases: zero portfolio, extreme correlations, low degrees of freedom
- Verify deterministic scenarios with specific seed values

## Error Handling

- Engine methods should handle edge cases gracefully (no throwing)
- Use `isFinite()` checks for financial calculations
- Validate inputs with reasonable bounds (e.g., IPCA 0-15%)

## Tooltips

All tooltip texts must be in Portuguese and explain concepts educationally. Use the `Tooltip` component with detailed explanations of financial concepts.
