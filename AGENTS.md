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

**No npm test command exists** - tests run entirely in the browser.

### Deployment

Push to GitHub and enable Pages (main branch, root directory).

## Architecture

```
index.html          — Main app HTML shell
endowment.html      — Endowment simulator HTML shell
tests.html          — Browser-based test runner
js/
├── rng.js                  — SeededRNG class (Mulberry32 PRNG)
├── engine-core.js          — MonteCarloEngine class (core simulation logic)
├── engine-endowment.js    — Endowment-specific methods (prototype extensions)
├── ui-primitives.js        — Reusable UI components (Icon, Tooltip, Input, etc.)
├── ui-shared-charts.js     — Charts shared between apps
├── ui-main-charts.js       — Main app charts
├── ui-main-analysis.js     — Main app analysis components
├── ui-stress.js            — Stress analysis components
├── ui-endowment.js         — Endowment app components
├── app-main.js             — Main App React component
└── app-endowment.js        — Endowment App React component
```

## Script Loading Rules

- `rng.js` and `engine-*.js`: Plain `<script src>` (no JSX)
- `ui-*.js` and `app-*.js`: `<script type="text/babel" src="...">` (Babel Standalone)
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
- Custom CSS in `<style>` block (lines 38-83 of index.html)
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
- **Cholesky decomposition**: Correlated asset returns (`generateCorrelatedReturns`)

### Financial Models

- **Dynamic FX Correlation**: Base -0.4 correlation with 2x stress multiplier during market downturns
- **Guyton-Klinger Rules**: Preservation (cut if rate rises 20%), Prosperity (increase if rate drops 20%), Inflation skip rule
- **Bucket Strategy**: First N years withdraw from fixed income only
- **IPCA Model**: Brazilian inflation modeling with equity correlation

### Configuration Parameters

All simulation parameters are in a single object passed to `MonteCarloEngine`:
- Portfolio: `initialPortfolioUSD`, `initialPortfolioBRL`, `initialFX`
- Returns: `equityReturn`, `equityVolatility`, `bondReturn`, `bondVolatility`
- Withdrawal: `withdrawalRate`, `useGuytonKlinger`, `useBucketStrategy`
- Tax: `useTaxModel`, `equityTaxRate`, `fixedIncomeTaxRate`
- Inflation: `useIPCAModel`, `expectedIPCA`, `ipcaVolatility`

## Modification Guide

### Adding New Simulation Features

1. Edit `MonteCarloEngine` class in `js/engine-core.js`
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
