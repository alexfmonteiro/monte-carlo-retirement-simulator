# Model Correctness Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five correctness bugs in the Monte Carlo retirement simulator's financial model — currency-denomination of spending, dead BRL sleeve, wrong bond-sleeve currency, non-functional FX–equity correlation, and inconsistent inflation indexing — plus the unused Die-With-Zero target and several numeric hardening issues.

**Architecture:** Pure-frontend app; engine is a global `MonteCarloEngine` class in `js/engine-core.js` with prototype extensions in `js/engine-historical.js` and `js/engine-endowment.js`. No build system, no modules — all names are globals. Tasks are **sequential** (they touch the same files); a Node smoke harness (`scripts/smoke.js`, Task 1) makes the engine verifiable without a browser.

**Tech Stack:** Vanilla JS (browser globals, no import/export), React 18 + Babel-standalone for UI (`js/app-main.js` is JSX), browser test harness in `tests.html`, Node ≥ 18 for the smoke script.

**Workflow rules for every task:**
- Work on branch `model-correctness-fixes` (created in Task 1).
- After every task: run `node scripts/smoke.js` — must print `SMOKE PASSED`.
- Engine files (`js/engine-*.js`, `js/rng.js`, data files) must stay plain JS — **no JSX, no import/export, no TypeScript**.
- All user-facing text/tooltips in `js/app-main.js` are Portuguese (pt-BR). Keep them educational.
- Do NOT reformat untouched code. Match existing style (4-space indent, existing comment tone).
- Commit at the end of each task with the message given in the task.

---

## Background: the bugs being fixed (read before starting)

1. **Spending is USD-denominated but the retiree spends BRL.** `runSimulation()` converts the initial BRL withdrawal to USD once at initial FX and thereafter keeps the target in USD, inflating it by *Brazilian* inflation. BRL spending = USD target × FX, so it grows at IPCA **plus** FX depreciation (double counting). Fix: the spending target lives in BRL, indexed by inflation; convert to USD at *current* FX only to size the sale.
2. **BRL fixed-income sleeve (`portfolioBRLFixed`) is dead money.** It compounds forever, is never withdrawn from, and failure fires on `portfolioUSD <= 0` alone. Fix: withdraw BRL-sleeve-first (natural hedge), fail only when the *total* portfolio is depleted.
3. **The USD portfolio's bond portion earns Brazilian nominal returns (IPCA + spread; CDI in the backtest) without FX translation.** Fix: the USD sleeve's bonds are US bonds with their own return/vol params and historical US Treasury data; IPCA+spread / CDI apply only to the BRL sleeve.
4. **FX–equity correlation is not applied.** `simulateCurrency` correlates the FX shock with a *freshly drawn, discarded* normal, not the equity shock. Realized correlation ≈ 0. Fix: standardize the actual equity return and correlate against that. Also anchor FX mean-reversion to a PPP-consistent fair value (initial FX × cumulative IPCA ÷ cumulative US inflation) instead of the nominal initial FX forever.
5. **Two inflation indexes in one path.** G-K withdrawals grow at fixed `params.inflation` while the minimum withdrawal / INSS use simulated `cumulativeIpcaFactor`. Fix: when `useIPCAModel` is on, G-K uses the year's simulated `ipcaYear`.
6. **`targetEndBalance` (Die With Zero) is UI-only** — the optimizer never uses it. Fix: add it to the bisection acceptance criterion (compared in real terms).
7. **Hardening:** Box-Muller can hit `log(0)`; Student-T silently misbehaves for non-integer or ≤2 df; regime-switching always starts in `bull`; `previousReturn` is never updated in the bucket branch (inflation-skip rule inert during bucket years).

New parameters introduced (defaults): `usdInflation: 2.0` (%), `usdBondReturn: 4.5` (%), `usdBondVolatility: 7.0` (%). Engine code must tolerate their absence via `?? default` so old tests/params keep working.

---

### Task 1: Branch + Node smoke harness

**Files:**
- Create: `scripts/smoke.js`

- [ ] **Step 1: Create the branch**

```bash
git checkout -b model-correctness-fixes
```

- [ ] **Step 2: Write `scripts/smoke.js`**

```js
#!/usr/bin/env node
// Node smoke test for the simulation engines (browser-free sanity check).
// The js/ files are plain scripts declaring globals, so we concatenate and
// evaluate them inside a Function, then return the names we need.
const fs = require('fs');
const path = require('path');

const files = ['rng.js', 'mortality-data.js', 'historical-data.js',
               'engine-core.js', 'engine-historical.js', 'engine-endowment.js'];
const src = files
    .map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'))
    .join('\n;\n');
const load = new Function(src + '\n;return { MonteCarloEngine, HISTORICAL_DATA };');
const { MonteCarloEngine, HISTORICAL_DATA } = load();

// Mirrors the useState defaults in js/app-main.js (plus the new params
// added by this plan — harmless before they are used).
const DEFAULTS = {
    initialPortfolioUSD: 1000000, initialPortfolioBRL: 0, initialFX: 5.8,
    withdrawalRate: 4.0, equityReturn: 8.0, equityVolatility: 18.0,
    bondReturn: 5.0, bondVolatility: 2.0, inflation: 4.5, years: 50,
    tentInitialBondPercent: 40, tentDuration: 5, targetBondPercent: 40,
    useGuytonKlinger: true, preservationThreshold: 0.2, prosperityThreshold: 0.2,
    adjustmentPercent: 0.1, applyInflationRule: true,
    minimumWithdrawalBRL: 120000, useMinimumWithdrawal: false,
    useINSS: false, currentAge: 60, inssStartAge: 65, inssMonthlyBRL: 3000,
    bucketYears: 5, useBucketStrategy: true,
    useStudentT: true, degreesOfFreedom: 5,
    useDynamicCorrelation: true, baseCorrelation: -0.4, stressCorrelationMultiplier: 2.0,
    useIPCAModel: true, expectedIPCA: 4.5, ipcaVolatility: 2.0, realSpread: 5.0,
    useTaxModel: true, equityTaxRate: 15, fixedIncomeTaxRate: 15,
    useSpendingSmile: false, smileEarlyMultiplier: 1.2, smileMidMultiplier: 0.85, smileLateMultiplier: 1.1,
    useRegimeSwitching: false, bullEquityMean: 12, bullEquityVol: 12,
    bearEquityMean: -5, bearEquityVol: 25, bullToBullProb: 0.875, bearToBearProb: 0.5,
    useSequenceConstraint: false, maxNegativeSequence: 10,
    useMortalityAdjustment: false, mortalityGender: 'male',
    seed: 42,
    usdInflation: 2.0, usdBondReturn: 4.5, usdBondVolatility: 7.0,
};

let failed = false;
function check(name, cond) {
    if (!cond) { failed = true; console.error(`FAIL: ${name}`); }
    else console.log(`ok: ${name}`);
}

// 1) Monte Carlo runs clean
const engine = new MonteCarloEngine(DEFAULTS);
const res = engine.runMonteCarlo(300);
check('survivalRate in [0,100]', res.survivalRate >= 0 && res.survivalRate <= 100);
check('portfolio p50 all finite', res.portfolioPercentiles.p50.every(Number.isFinite));
check('withdrawal means all finite', res.withdrawalMeans.every(Number.isFinite));

// 2) Reproducibility: same seed => identical result
const res2 = new MonteCarloEngine(DEFAULTS).runMonteCarlo(300);
check('same seed reproduces survivalRate', res.survivalRate === res2.survivalRate);

// 3) BRL-sleeve path runs clean
const brlRes = new MonteCarloEngine({ ...DEFAULTS, initialPortfolioUSD: 500000, initialPortfolioBRL: 2000000 }).runMonteCarlo(200);
check('mixed BRL/USD survivalRate finite', Number.isFinite(brlRes.survivalRate));

// 4) Historical backtest runs clean
const hist = new MonteCarloEngine(DEFAULTS);
const windows = hist.runAllHistoricalWindows();
const hRes = hist.analyzeHistoricalResults(windows);
check('historical windows > 0', hRes.totalWindows > 0);
check('historical p50 all finite', hRes.portfolioByYear.p50.every(Number.isFinite));

// 5) Endowment engine runs clean
const endow = new MonteCarloEngine({
    ...DEFAULTS, endowmentAlpha: 0.7, endowmentTargetRate: 4,
    useEndowmentCAPE: true, initialCAPE: 22, medianCAPE: 20,
    capeVolatility: 3, capeMeanReversionSpeed: 0.15,
    endowmentDrawdownSensitivity: 0.5, endowmentGuardrailCap: 0.15,
});
const eh = endow.runSimulationEndowment();
check('endowment history all finite', eh.portfolioUSD.every(Number.isFinite));

console.log(failed ? 'SMOKE FAILED' : 'SMOKE PASSED');
process.exit(failed ? 1 : 0);
```

- [ ] **Step 3: Run it**

Run: `node scripts/smoke.js`
Expected: every line `ok: ...`, final line `SMOKE PASSED` (the current engine, pre-fix, should already pass these generic checks).

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke.js docs/superpowers/plans/2026-07-09-model-correctness-fixes.md
git commit -m "chore: add node smoke harness and model-fix plan"
```

---

### Task 2: Numeric hardening (Box-Muller, Student-T, regime start)

**Files:**
- Modify: `js/engine-core.js` (methods `randomNormal`, `randomStudentT`; add `initialRegime`; use it in `runSimulation`)
- Modify: `js/engine-endowment.js` (use `initialRegime` in `runSimulationEndowment`)

- [ ] **Step 1: Guard Box-Muller against log(0)** — in `randomNormal` (engine-core.js:24), replace the first line of the body:

```js
    randomNormal(mean = 0, std = 1) {
        let u1 = this.random();
        if (u1 < 1e-12) u1 = 1e-12; // Mulberry32 can emit exactly 0; log(0) = -Infinity
        const u2 = this.random();
        const z0 =
            Math.sqrt(-2.0 * Math.log(u1)) *
            Math.cos(2.0 * Math.PI * u2);
        return z0 * std + mean;
    }
```

- [ ] **Step 2: Validate Student-T degrees of freedom** — at the top of `randomStudentT` (engine-core.js:34), before generating `z`:

```js
        // Chi-squared is built by summing df squared normals, so df must be
        // an integer; df <= 2 has undefined/infinite variance for the scaling.
        df = Math.max(3, Math.round(df));
```

- [ ] **Step 3: Add `initialRegime()`** — insert as a new method right after `generateRegimeSwitchingReturn` (engine-core.js:85):

```js
    // Draw the starting regime from the Markov chain's stationary
    // distribution instead of always starting in 'bull' (which biases
    // early-retirement sequence risk downward).
    initialRegime() {
        if (!this.params.useRegimeSwitching) return 'bull';
        const pLeaveBull = 1 - this.params.bullToBullProb;
        const pLeaveBear = 1 - this.params.bearToBearProb;
        const pBull = pLeaveBear / (pLeaveBull + pLeaveBear);
        return this.random() < pBull ? 'bull' : 'bear';
    }
```

- [ ] **Step 4: Use it** — in `runSimulation` replace `let currentRegime = 'bull';` (engine-core.js:382) with `let currentRegime = this.initialRegime();`. Also update the history seed value `regimeHistory: ['bull']` (engine-core.js:418) to `regimeHistory: [currentRegime]`. In `js/engine-endowment.js` replace `let currentRegime = 'bull';` (engine-endowment.js:51) with `let currentRegime = this.initialRegime();`.

- [ ] **Step 5: Verify**

Run: `node scripts/smoke.js`
Expected: `SMOKE PASSED`
Also run this spot check (stationary distribution ≈ 0.8 bull for defaults 0.875/0.5):

```bash
node -e "
const fs=require('fs'),p=require('path');
const src=['rng.js','engine-core.js'].map(f=>fs.readFileSync(p.join('js',f),'utf8')).join(';');
const {MonteCarloEngine}=new Function(src+';return {MonteCarloEngine};')();
const e=new MonteCarloEngine({seed:1,useRegimeSwitching:true,bullToBullProb:0.875,bearToBearProb:0.5});
let bull=0; for(let i=0;i<10000;i++) if(e.initialRegime()==='bull') bull++;
console.log('pBull~', bull/10000); if(Math.abs(bull/10000-0.8)>0.02) process.exit(1);
"
```

Expected: `pBull~ 0.8` ± 0.02, exit code 0. (Note: `mortality-data.js` isn't loaded here — that's fine, these methods don't touch it.)

- [ ] **Step 6: Commit**

```bash
git add js/engine-core.js js/engine-endowment.js
git commit -m "fix: guard Box-Muller log(0), validate Student-T df, stationary initial regime"
```

---

### Task 3: FX model — real equity correlation + PPP anchor

**Files:**
- Modify: `js/engine-core.js` (`simulateCurrency` rewrite; delete `generateCorrelatedReturns`; update the call in `runSimulation`)
- Modify: `js/engine-endowment.js` (update the `simulateCurrency` call)
- Modify: `tests.html` (Currency Simulation suite calls — new signature; Cholesky suite if it uses `generateCorrelatedReturns`)

- [ ] **Step 1: Replace `simulateCurrency`** (engine-core.js:199-218) with:

```js
    // Simulate BRL/USD dynamics.
    // - The FX shock is correlated with the ACTUAL equity shock of the year
    //   (z-score of the realized equity return), so the realized equity-FX
    //   correlation matches getDynamicCorrelation(). The previous version
    //   correlated against a fresh, discarded normal — realized corr was ~0.
    // - Mean reversion targets a PPP-consistent fair value: initial FX
    //   inflated by accumulated IPCA and deflated by accumulated US
    //   inflation, instead of the nominal initial FX forever.
    simulateCurrency(equityReturn, baseFX, year, cumIpcaFactor, volatilityFX = 0.15) {
        const correlation = this.getDynamicCorrelation(equityReturn);
        const equityMean = this.params.equityReturn / 100;
        const equityVol = this.params.equityVolatility / 100;
        const zEquity = equityVol > 0
            ? Math.max(-4, Math.min(4, (equityReturn - equityMean) / equityVol))
            : 0;
        const z = this.randomNormal();
        const fxShock =
            correlation * zEquity +
            Math.sqrt(1 - correlation * correlation) * z;

        const usdInflation = (this.params.usdInflation ?? 2.0) / 100;
        const fairFX =
            this.params.initialFX * (cumIpcaFactor ?? 1) /
            Math.pow(1 + usdInflation, year ?? 1);
        const reversionSpeed = 0.1;
        const drift = (reversionSpeed * (fairFX - baseFX)) / baseFX;

        // Stronger FX move when equity is negative (flight to USD)
        const stressMultiplier = equityReturn < 0 ? 1.3 : 1.0;
        const fxReturn = drift + fxShock * volatilityFX * stressMultiplier;

        return Math.max(baseFX * 0.5, baseFX * (1 + fxReturn));
    }
```

- [ ] **Step 2: Delete `generateCorrelatedReturns`** (engine-core.js:189-197). Grep for other callers first: `grep -rn "generateCorrelatedReturns" js/ tests.html`. If `tests.html` uses it (the Cholesky suite around line 389), rewrite those tests to exercise the same math inline: build `corrZ2 = corr*z1 + Math.sqrt(1-corr*corr)*z2` from two `engine.randomNormal()` draws and keep the existing assertions about achieved correlation.

- [ ] **Step 3: Update callers** — in `runSimulation`, the FX update currently reads `currentFX = this.simulateCurrency(equityReturnYear, currentFX);` (engine-core.js:493). It must be moved to AFTER the line `cumulativeIpcaFactor *= (1 + ipcaYear);` (it already is) and become:

```js
            currentFX = this.simulateCurrency(
                equityReturnYear,
                currentFX,
                year,
                cumulativeIpcaFactor,
            );
```

In `js/engine-endowment.js` (engine-endowment.js:79) similarly:

```js
        currentFX = this.simulateCurrency(equityReturnYear, currentFX, year, cumulativeIpcaFactor);
```

- [ ] **Step 4: Verify realized correlation**

```bash
node -e "
const fs=require('fs'),p=require('path');
const src=['rng.js','engine-core.js'].map(f=>fs.readFileSync(p.join('js',f),'utf8')).join(';');
const {MonteCarloEngine}=new Function(src+';return {MonteCarloEngine};')();
const e=new MonteCarloEngine({seed:9,equityReturn:8,equityVolatility:18,initialFX:5.8,usdInflation:2,useDynamicCorrelation:false,baseCorrelation:-0.4});
const eq=[],fx=[];
for(let i=0;i<20000;i++){const r=e.randomNormal(0.08,0.18);const f=e.simulateCurrency(r,5.8,1,1.0);eq.push(r);fx.push(f/5.8-1);}
const m=a=>a.reduce((x,y)=>x+y,0)/a.length;const me=m(eq),mf=m(fx);
let c=0,ve=0,vf=0;for(let i=0;i<eq.length;i++){c+=(eq[i]-me)*(fx[i]-mf);ve+=(eq[i]-me)**2;vf+=(fx[i]-mf)**2;}
const corr=c/Math.sqrt(ve*vf);console.log('realized corr',corr.toFixed(3));
if(corr>-0.25||corr<-0.55)process.exit(1);
"
```

Expected: realized corr ≈ −0.35 to −0.40 (the stress vol multiplier drags it slightly off −0.4), exit 0. **Before this task the same script prints ~0.00** — run it before implementing to confirm the bug, and after to confirm the fix.

Run: `node scripts/smoke.js` → `SMOKE PASSED`.

- [ ] **Step 5: Fix broken browser tests** — serve `python -m http.server 8000`, open `http://localhost:8000/tests.html`, Run All Tests. The "Currency Simulation" suite calls `simulateCurrency(ret, fx)` with the old signature; update those calls to `simulateCurrency(ret, fx, 1, 1.0)` and keep the assertions' intent (mean reversion direction, stress volatility). Update any Cholesky-suite usage per Step 2. All suites must pass.

- [ ] **Step 6: Commit**

```bash
git add js/engine-core.js js/engine-endowment.js tests.html
git commit -m "fix: FX shock correlates with actual equity shock; PPP-anchored mean reversion"
```

---

### Task 4: USD bond sleeve gets USD bond returns

**Files:**
- Modify: `js/engine-core.js` (add `generateUsdBondReturn` after `generateBondReturn`)
- Modify: `js/engine-endowment.js` (portfolio return uses USD bonds)
- Modify: `js/historical-data.js` (add `usBondReturn` array)

Note: `runSimulation` and `runHistoricalBacktest` still use the BRL bond return for the USD sleeve after this task — they are rewritten in Tasks 5 and 6, which consume what this task adds. Only the endowment engine is switched here.

- [ ] **Step 1: Add the generator** — insert after `generateBondReturn` (engine-core.js:130):

```js
    // Return for the USD-denominated bond sleeve (US Treasuries / aggregate).
    // The BRL sleeve keeps using generateBondReturn (IPCA + real spread);
    // applying Brazilian nominal rates to a USD sleeve without FX
    // translation was overstating USD returns.
    generateUsdBondReturn() {
        return this.randomNormal(
            (this.params.usdBondReturn ?? 4.5) / 100,
            (this.params.usdBondVolatility ?? 7.0) / 100,
        );
    }
```

- [ ] **Step 2: Endowment uses it** — in `js/engine-endowment.js`, after the line `const bondReturnYear = this.generateBondReturn(ipcaYear);` (engine-endowment.js:78) add `const usdBondReturnYear = this.generateUsdBondReturn();` and change the portfolio return (engine-endowment.js:81) to:

```js
        const portfolioReturn = (1 - bondAllocation) * equityReturnYear + bondAllocation * usdBondReturnYear;
```

(Keep the `bondReturnYear` line — deleting it would shift the RNG draw sequence and change every seeded path unnecessarily; it is intentionally unused now. Add a trailing comment `// kept: preserves RNG draw order`.)

- [ ] **Step 3: Historical US bond data** — in `js/historical-data.js`, add to the `HISTORICAL_DATA` object after `brBondReturn`:

```js
    // US 10Y Treasury total return (approximate, nominal USD)
    // Source: aggregate of published annual 10Y T-bond total returns
    usBondReturn: [0.2348, 0.0143, 0.0994, 0.1492, -0.0825, 0.1666, 0.0557, 0.1512, 0.0038, 0.0449,
                   0.0287, 0.0196, 0.1021, 0.2010, -0.1112, 0.0846, 0.1604, 0.0297, -0.0910, 0.1075,
                   0.0128, 0.0069, 0.0280, -0.0002, 0.0964, 0.1133, -0.0442, -0.1783, 0.0388, -0.0170],
```

- [ ] **Step 4: Verify**

Run: `node scripts/smoke.js` → `SMOKE PASSED`.
Run: `node -e "const d=require('fs').readFileSync('js/historical-data.js','utf8');const{HISTORICAL_DATA}=new Function(d+';return {HISTORICAL_DATA};')();console.log(HISTORICAL_DATA.usBondReturn.length===HISTORICAL_DATA.years.length?'ok':'LENGTH MISMATCH')"` → `ok`

- [ ] **Step 5: Commit**

```bash
git add js/engine-core.js js/engine-endowment.js js/historical-data.js
git commit -m "fix: USD bond sleeve earns USD bond returns; add historical US Treasury data"
```

---

### Task 5: Re-denominate spending in BRL; fund from BRL sleeve first; total-portfolio failure (core engine)

This is the central task: a full rewrite of the year-loop in `runSimulation()`.

**Files:**
- Modify: `js/engine-core.js` (`runSimulation`, engine-core.js:322-818)

**Design (all in BRL):**
- The spending target `currentWithdrawalBRL` starts at `(USD×FX₀ + BRL) × rate` and is what G-K adjusts. G-K's rate = `currentWithdrawalBRL / totalPortfolioBRL`.
- G-K's inflation input = simulated `ipcaYear` when `useIPCAModel`, else `params.inflation/100`.
- `previousReturn` (G-K inflation-skip input) = total portfolio return in BRL terms, updated **every** year (fixes the bucket-branch bug).
- Minimum withdrawal and INSS stay in BRL (drop the USD round-trips).
- Funding order: BRL sleeve first, then the USD sleeve (bucket/tent logic governs *which USD portion*).
- Failure only when USD sleeve **and** BRL sleeve are both depleted.
- History arrays keep the exact same keys (the UI depends on them); `withdrawalUSD` is now derived as `actualWithdrawalBRL / currentFX`.

- [ ] **Step 1: Write the failing check** (BRL-only portfolio must not fail instantly; BRL indexation must hold):

```bash
node -e "
const fs=require('fs'),p=require('path');
const src=['rng.js','mortality-data.js','historical-data.js','engine-core.js'].map(f=>fs.readFileSync(p.join('js',f),'utf8')).join(';');
const {MonteCarloEngine}=new Function(src+';return {MonteCarloEngine};')();
const base={initialFX:5.8,withdrawalRate:4,equityReturn:8,equityVolatility:18,bondReturn:5,bondVolatility:2,inflation:5,years:30,tentInitialBondPercent:40,tentDuration:5,targetBondPercent:40,useGuytonKlinger:false,preservationThreshold:0.2,prosperityThreshold:0.2,adjustmentPercent:0.1,applyInflationRule:true,useMinimumWithdrawal:false,minimumWithdrawalBRL:0,useINSS:false,currentAge:60,inssStartAge:65,inssMonthlyBRL:0,useBucketStrategy:false,bucketYears:5,useStudentT:false,degreesOfFreedom:5,useDynamicCorrelation:false,baseCorrelation:-0.4,stressCorrelationMultiplier:2,useIPCAModel:false,expectedIPCA:4.5,ipcaVolatility:2,realSpread:5,useTaxModel:false,equityTaxRate:15,fixedIncomeTaxRate:15,useSpendingSmile:false,useRegimeSwitching:false,useSequenceConstraint:false,useMortalityAdjustment:false,seed:11,usdInflation:2,usdBondReturn:4.5,usdBondVolatility:7};
// A) BRL-only portfolio must be usable
const h1=new MonteCarloEngine({...base,initialPortfolioUSD:0,initialPortfolioBRL:5000000}).runSimulation();
console.log('A failed?',h1.failed,'failureYear',h1.failureYear);
if(h1.failed && h1.failureYear<=5){console.log('A: FAIL (BRL sleeve is dead money)');process.exit(1);}
// B) BRL withdrawal must grow at exactly (1+inflation) when GK off, IPCA model off
const h2=new MonteCarloEngine({...base,initialPortfolioUSD:1000000,initialPortfolioBRL:0}).runSimulation();
for(let y=2;y<=5;y++){const g=h2.withdrawalBRL[y]/h2.withdrawalBRL[y-1];
  if(Math.abs(g-1.05)>0.001){console.log('B: FAIL year',y,'BRL growth',g,'(spending is USD-denominated)');process.exit(1);}}
console.log('PASS');
"
```

Run it now. Expected: **FAIL** (A fails immediately — with `initialPortfolioUSD: 0` the current code declares failure in year 1; B fails because BRL withdrawals move with FX). Save this exact command; it is the acceptance check.

- [ ] **Step 2: Rewrite `runSimulation`** — replace the whole method (engine-core.js:322-818) with the version below. The failed-year padding block, stress-period bookkeeping, `analyzeFailure` call, and history keys are intentionally identical to today's; only the economics change.

```js
    // Run single simulation path.
    // All spending is denominated in BRL (the retiree's spending currency):
    // the target is indexed by inflation in BRL and converted to USD at the
    // CURRENT FX rate only to size the sale from the USD sleeve.
    runSimulation() {
        const {
            initialPortfolioUSD,
            initialPortfolioBRL,
            initialFX,
            withdrawalRate,
            equityReturn,
            equityVolatility,
            inflation,
            years,
            tentInitialBondPercent,
            tentDuration,
            targetBondPercent,
            useBucketStrategy,
            bucketYears,
            useMinimumWithdrawal,
            minimumWithdrawalBRL,
            useINSS,
            currentAge,
            inssStartAge,
            inssMonthlyBRL,
            useIPCAModel,
        } = this.params;

        // USD sleeve (equity + US bonds, subject to FX variation)
        let portfolioUSD = initialPortfolioUSD;
        let currentFX = initialFX;

        // BRL sleeve (Brazilian fixed income, no FX exposure)
        let portfolioBRLFixed = initialPortfolioBRL;

        let portfolioBRL = portfolioUSD * currentFX + portfolioBRLFixed;

        // Allocation applies to the USD sleeve only
        let bondAllocation = tentInitialBondPercent / 100;
        let equityAllocation = 1 - bondAllocation;
        let bondPortionUSD = portfolioUSD * bondAllocation;
        let equityPortionUSD = portfolioUSD * equityAllocation;

        // Spending target in BRL, adjusted by Guyton-Klinger + inflation
        const totalInitialPortfolioBRL =
            portfolioUSD * initialFX + initialPortfolioBRL;
        let currentWithdrawalBRL =
            totalInitialPortfolioBRL * (withdrawalRate / 100);
        const initialWithdrawalRate = withdrawalRate / 100;

        let previousReturn = 0;
        let cumulativeIpcaFactor = 1.0;
        let consecutiveNegativeYears = 0;
        let currentRegime = this.initialRegime();

        // Stress period tracking (when minimum withdrawal was enforced)
        let inStressPeriod = false;
        let currentStressStart = null;
        let currentStressExtraWithdrawn = 0;

        const history = {
            portfolioUSD: [portfolioUSD],
            portfolioBRL: [portfolioBRL],
            withdrawalBRL: [currentWithdrawalBRL],
            withdrawalUSD: [currentWithdrawalBRL / currentFX],
            recommendedWithdrawalBRL: [currentWithdrawalBRL],
            fxRate: [currentFX],
            bondAllocation: [bondAllocation * 100],
            rulesApplied: [null],
            minimumEnforced: [false],
            failed: false,
            failureYear: null,
            failureType: null,
            failureCause: null,
            stressPeriods: [],
            yearlyStressData: [
                { minimumEnforced: false, extraWithdrawn: 0, percentExtra: 0 },
            ],
            withdrawalSource: ["initial"],
            inssIncomeBRL: [0],
            cumulativeIpcaFactor: [1.0],
            smileMultiplier: [1.0],
            regimeHistory: [currentRegime],
        };

        for (let year = 1; year <= years; year++) {
            if (history.failed) {
                history.portfolioUSD.push(0);
                history.portfolioBRL.push(0);
                history.withdrawalBRL.push(0);
                history.withdrawalUSD.push(0);
                history.recommendedWithdrawalBRL.push(0);
                history.fxRate.push(currentFX);
                history.bondAllocation.push(0);
                history.rulesApplied.push(null);
                history.minimumEnforced.push(false);
                history.yearlyStressData.push({
                    minimumEnforced: false,
                    extraWithdrawn: 0,
                    percentExtra: 0,
                });
                history.withdrawalSource.push("none");
                history.inssIncomeBRL.push(0);
                history.cumulativeIpcaFactor.push(history.cumulativeIpcaFactor[year - 1]);
                history.smileMultiplier.push(1.0);
                history.regimeHistory.push(currentRegime);
                continue;
            }

            // --- Market returns for the year ---
            let equityReturnYear;
            if (this.params.useRegimeSwitching) {
                const result = this.generateRegimeSwitchingReturn(currentRegime);
                equityReturnYear = result.return;
                currentRegime = result.newRegime;
            } else {
                equityReturnYear = this.generateReturn(
                    equityReturn / 100,
                    equityVolatility / 100,
                );
            }

            // Optional non-IID constraint on consecutive negative returns
            if (this.params.useSequenceConstraint) {
                if (equityReturnYear < 0) {
                    consecutiveNegativeYears++;
                    if (consecutiveNegativeYears >= this.params.maxNegativeSequence) {
                        equityReturnYear = this.random() * 0.1;
                        consecutiveNegativeYears = 0;
                    }
                } else {
                    consecutiveNegativeYears = 0;
                }
            }

            const ipcaYear = this.generateIPCA(equityReturnYear);
            cumulativeIpcaFactor *= (1 + ipcaYear);

            const brlBondReturnYear = this.generateBondReturn(ipcaYear); // BRL sleeve
            const usdBondReturnYear = this.generateUsdBondReturn();      // USD sleeve bonds

            // Total BRL value before this year's returns (for previousReturn)
            const prevTotalBRL = portfolioUSD * currentFX + portfolioBRLFixed;

            // Grow the BRL sleeve
            portfolioBRLFixed *= (1 + brlBondReturnYear);

            // Update FX (correlated with the actual equity shock, PPP anchor)
            currentFX = this.simulateCurrency(
                equityReturnYear,
                currentFX,
                year,
                cumulativeIpcaFactor,
            );

            // Grow the USD sleeve
            if (useBucketStrategy && year <= bucketYears) {
                equityPortionUSD *= (1 + equityReturnYear);
                bondPortionUSD *= (1 + usdBondReturnYear);
                portfolioUSD = equityPortionUSD + bondPortionUSD;
            } else {
                // Tent strategy: adjust allocation
                if (year <= tentDuration) {
                    bondAllocation = tentInitialBondPercent / 100;
                } else {
                    const transitionYears = 3;
                    const transitionProgress = Math.min(
                        1,
                        (year - tentDuration) / transitionYears,
                    );
                    bondAllocation =
                        tentInitialBondPercent / 100 -
                        (tentInitialBondPercent / 100 -
                            targetBondPercent / 100) *
                            transitionProgress;
                }
                equityAllocation = 1 - bondAllocation;

                const usdReturn =
                    equityAllocation * equityReturnYear +
                    bondAllocation * usdBondReturnYear;
                portfolioUSD *= (1 + usdReturn);
                bondPortionUSD = portfolioUSD * bondAllocation;
                equityPortionUSD = portfolioUSD * equityAllocation;
            }

            // Total portfolio after returns, before withdrawal (BRL)
            const totalPortfolioBRL =
                portfolioUSD * currentFX + portfolioBRLFixed;

            // Total return in BRL terms drives the G-K inflation-skip rule
            const portfolioReturn =
                prevTotalBRL > 0 ? totalPortfolioBRL / prevTotalBRL - 1 : 0;

            // --- Withdrawal sizing (all BRL) ---
            const gkInflation = useIPCAModel ? ipcaYear : inflation / 100;
            const gkResult = this.applyGuytonKlinger(
                currentWithdrawalBRL,
                totalPortfolioBRL,
                initialWithdrawalRate,
                previousReturn,
                gkInflation,
            );
            const gkBaseWithdrawalBRL = gkResult.withdrawal;
            const gkRuleApplied = gkResult.ruleApplied;

            let smileMultiplier = 1.0;
            if (this.params.useSpendingSmile) {
                smileMultiplier = this.getSpendingSmileMultiplier(year, years);
            }
            const recommendedWithdrawalBRL =
                gkBaseWithdrawalBRL * smileMultiplier;

            const minimumBRLYear =
                useMinimumWithdrawal && minimumWithdrawalBRL > 0
                    ? minimumWithdrawalBRL * cumulativeIpcaFactor
                    : 0;

            const ageThisYear = currentAge + year - 1;
            const inssActive =
                useINSS && inssMonthlyBRL > 0 && ageThisYear >= inssStartAge;
            const annualINSSBRL = inssActive
                ? inssMonthlyBRL * 12 * cumulativeIpcaFactor
                : 0;

            // INSS reduces what the portfolio must fund; the minimum applies
            // to the portfolio portion
            const portfolioWithdrawalBRL = Math.max(
                0,
                recommendedWithdrawalBRL - annualINSSBRL,
            );
            const effectiveMinimumBRL = Math.max(
                0,
                minimumBRLYear - annualINSSBRL,
            );
            const actualWithdrawalBRL = useMinimumWithdrawal
                ? Math.max(portfolioWithdrawalBRL, effectiveMinimumBRL)
                : portfolioWithdrawalBRL;

            const gainRatio = Math.min(0.6, year * 0.06);
            const taxPaid = this.calculateTax(
                actualWithdrawalBRL,
                gainRatio,
                bondAllocation,
            );
            const totalNeedBRL = actualWithdrawalBRL + taxPaid;

            // --- Fund the withdrawal: BRL sleeve first (it pays BRL bills
            // without FX conversion), then the USD sleeve ---
            const fromBRLSleeve = Math.min(
                Math.max(0, portfolioBRLFixed),
                totalNeedBRL,
            );
            portfolioBRLFixed -= fromBRLSleeve;
            const remainderUSD = (totalNeedBRL - fromBRLSleeve) / currentFX;

            let withdrawalSource = fromBRLSleeve > 0 ? "brl_fixed" : "mixed";
            if (remainderUSD > 0) {
                if (useBucketStrategy && year <= bucketYears) {
                    withdrawalSource = "bonds";
                    bondPortionUSD -= remainderUSD;
                    if (bondPortionUSD < 0) {
                        equityPortionUSD += bondPortionUSD;
                        bondPortionUSD = 0;
                        withdrawalSource = "equity_forced";
                    }
                    portfolioUSD = equityPortionUSD + bondPortionUSD;
                    bondAllocation =
                        portfolioUSD > 0 ? bondPortionUSD / portfolioUSD : 0;
                    equityAllocation = 1 - bondAllocation;
                } else {
                    // Rebalance-aware withdrawal: after a strong equity year,
                    // sell equity first to move back toward target allocation
                    const currentEquityPercent =
                        portfolioUSD > 0 ? equityPortionUSD / portfolioUSD : 0;
                    const rebalanceThreshold = 0.1;
                    if (
                        equityReturnYear > 0.15 &&
                        currentEquityPercent >
                            equityAllocation + rebalanceThreshold
                    ) {
                        withdrawalSource = "equity_rebalance";
                        const maxEquityWithdrawal = Math.max(
                            0,
                            equityPortionUSD -
                                portfolioUSD * equityAllocation,
                        );
                        const equityWithdrawal = Math.min(
                            remainderUSD,
                            maxEquityWithdrawal,
                        );
                        equityPortionUSD -= equityWithdrawal;
                        bondPortionUSD -= remainderUSD - equityWithdrawal;
                        portfolioUSD = equityPortionUSD + bondPortionUSD;
                    } else {
                        portfolioUSD -= remainderUSD;
                        bondPortionUSD = portfolioUSD * bondAllocation;
                        equityPortionUSD = portfolioUSD * equityAllocation;
                    }
                }
            }

            // Base for next year's G-K is the pre-smile G-K output
            currentWithdrawalBRL = gkBaseWithdrawalBRL;
            previousReturn = portfolioReturn;

            // --- Stress bookkeeping (minimum enforced) ---
            const minimumWasEnforced =
                useMinimumWithdrawal &&
                minimumWithdrawalBRL > 0 &&
                actualWithdrawalBRL > portfolioWithdrawalBRL * 1.001;
            const extraWithdrawnBRL = minimumWasEnforced
                ? actualWithdrawalBRL - portfolioWithdrawalBRL
                : 0;
            const percentExtra =
                minimumWasEnforced && portfolioWithdrawalBRL > 0
                    ? (extraWithdrawnBRL / portfolioWithdrawalBRL) * 100
                    : 0;

            history.yearlyStressData.push({
                minimumEnforced: minimumWasEnforced,
                extraWithdrawn: extraWithdrawnBRL,
                percentExtra,
            });

            if (minimumWasEnforced && !inStressPeriod) {
                inStressPeriod = true;
                currentStressStart = year;
                currentStressExtraWithdrawn = extraWithdrawnBRL;
            } else if (minimumWasEnforced && inStressPeriod) {
                currentStressExtraWithdrawn += extraWithdrawnBRL;
            } else if (!minimumWasEnforced && inStressPeriod) {
                history.stressPeriods.push({
                    startYear: currentStressStart,
                    endYear: year - 1,
                    duration: year - currentStressStart,
                    totalExtraWithdrawn: currentStressExtraWithdrawn,
                    recovered: true,
                    recoveryYear: year,
                });
                inStressPeriod = false;
                currentStressStart = null;
                currentStressExtraWithdrawn = 0;
            }

            // --- Failure: only when the TOTAL portfolio is depleted ---
            if (portfolioUSD < 0) {
                // USD sleeve overdrawn; net any residual against the BRL
                // sleeve (defensive — normally the BRL sleeve is already 0
                // here because it is drawn first)
                portfolioBRLFixed += portfolioUSD * currentFX;
                portfolioUSD = 0;
                bondPortionUSD = 0;
                equityPortionUSD = 0;
            }
            if (portfolioUSD <= 0 && portfolioBRLFixed <= 0) {
                if (inStressPeriod) {
                    history.stressPeriods.push({
                        startYear: currentStressStart,
                        endYear: year,
                        duration: year - currentStressStart + 1,
                        totalExtraWithdrawn:
                            currentStressExtraWithdrawn + extraWithdrawnBRL,
                        recovered: false,
                        recoveryYear: null,
                    });
                    inStressPeriod = false;
                }
                history.failed = true;
                history.failureYear = year;
                history.failureType = "depletion";
                history.failureCause = this.analyzeFailure(
                    previousReturn,
                    equityReturnYear,
                    currentFX,
                    bondAllocation,
                    minimumWasEnforced,
                );
                portfolioUSD = 0;
                portfolioBRLFixed = 0;
            }

            portfolioBRL = portfolioUSD * currentFX + portfolioBRLFixed;

            history.portfolioUSD.push(portfolioUSD);
            history.portfolioBRL.push(portfolioBRL);
            history.withdrawalBRL.push(actualWithdrawalBRL);
            history.withdrawalUSD.push(actualWithdrawalBRL / currentFX);
            history.recommendedWithdrawalBRL.push(recommendedWithdrawalBRL);
            history.fxRate.push(currentFX);
            history.bondAllocation.push(bondAllocation * 100);
            history.rulesApplied.push(gkRuleApplied);
            history.minimumEnforced.push(minimumWasEnforced);
            history.withdrawalSource.push(withdrawalSource);
            history.inssIncomeBRL.push(annualINSSBRL);
            history.cumulativeIpcaFactor.push(cumulativeIpcaFactor);
            history.smileMultiplier.push(smileMultiplier);
            history.regimeHistory.push(currentRegime);
        }

        if (inStressPeriod && !history.failed) {
            history.stressPeriods.push({
                startYear: currentStressStart,
                endYear: years,
                duration: years - currentStressStart + 1,
                totalExtraWithdrawn: currentStressExtraWithdrawn,
                recovered: false,
                recoveryYear: null,
            });
        }

        return history;
    }
```

Note two intentional semantic changes vs. today, besides the headline fixes: (a) `extraWithdrawnBRL` now compares against `portfolioWithdrawalBRL` (what the portfolio would otherwise fund) instead of `recommendedWithdrawalBRL` — the old comparison could go negative when INSS was active; (b) the tent glidepath applies in every non-bucket year as before.

- [ ] **Step 3: Run the acceptance check from Step 1**

Expected: `PASS` (both A and B).

- [ ] **Step 4: Run smoke + browser tests**

Run: `node scripts/smoke.js` → `SMOKE PASSED`.
Open `http://localhost:8000/tests.html` → the "Deterministic Scenarios", "Edge Cases", and "Optimizer" suites exercise `runSimulation`; rule-trigger assertions (preservation/prosperity/inflation-skip names) should still pass because `applyGuytonKlinger` is unchanged. Any test asserting exact portfolio/withdrawal *amounts* must be re-derived: run the new engine with the test's seed, confirm the produced value is economically sane (right order of magnitude, right direction), and update the expected constant. Do not weaken rule-name or direction assertions.

- [ ] **Step 5: Commit**

```bash
git add js/engine-core.js tests.html
git commit -m "fix: BRL-denominated spending, BRL-sleeve-first funding, total-portfolio failure"
```

---

### Task 6: Mirror the re-denomination in the historical backtest

**Files:**
- Modify: `js/engine-historical.js` (`runHistoricalBacktest`, engine-historical.js:17-384)

The historical engine mirrors `runSimulation` with these substitutions — apply the SAME year-loop structure as Task 5's code with:
- `equityReturnYear = data.spReturn[dataIdx]`, `ipcaYear = data.ipca[dataIdx]`, `brlBondReturnYear = data.brBondReturn[dataIdx]`, `usdBondReturnYear = data.usBondReturn[dataIdx]` where `const dataIdx = startIdx + year - 1;`
- `currentFX = data.fxRate[dataIdx];` replaces the `simulateCurrency` call (compute `prevTotalBRL` with the *previous* FX before reassigning, exactly as in Task 5).
- G-K inflation input is always `ipcaYear` (historical IPCA is real data).
- No regime switching / sequence constraint / random draws at all; `regimeHistory` entries stay `'historical'`; `smileMultiplier` uses `simYears` as the horizon (as today).
- Keep the function signature `(startIdx, simYears)`, the initial-FX convention (`startIdx > 0 ? data.fxRate[startIdx-1] : initialFX`), the history keys, the failure cause string `["Depleção do portfólio com dados históricos"]`, and `runAllHistoricalWindows` / `analyzeHistoricalResults` untouched.

- [ ] **Step 1: Rewrite the loop body** of `runHistoricalBacktest` per the above. The withdrawal-sizing and funding block (G-K in BRL → smile → minimum/INSS in BRL → tax → BRL-sleeve-first → USD remainder → failure when both sleeves ≤ 0) must be copied verbatim from Task 5's code, including the defensive `portfolioUSD < 0` netting. Initial `currentWithdrawalBRL = totalInitialPortfolioBRL * (withdrawalRate / 100)` (drop `currentWithdrawalUSD`).

- [ ] **Step 2: Verify against known history** — the worst complete windows should be the 2000-start (dot-com + GFC) era, and no window may produce NaN:

```bash
node -e "
const fs=require('fs'),p=require('path');
const src=['rng.js','mortality-data.js','historical-data.js','engine-core.js','engine-historical.js'].map(f=>fs.readFileSync(p.join('js',f),'utf8')).join(';');
const {MonteCarloEngine}=new Function(src+';return {MonteCarloEngine};')();
const params={initialPortfolioUSD:1000000,initialPortfolioBRL:0,initialFX:5.8,withdrawalRate:4,equityReturn:8,equityVolatility:18,inflation:4.5,years:30,tentInitialBondPercent:40,tentDuration:5,targetBondPercent:40,useGuytonKlinger:true,preservationThreshold:0.2,prosperityThreshold:0.2,adjustmentPercent:0.1,applyInflationRule:true,useBucketStrategy:true,bucketYears:5,useMinimumWithdrawal:false,minimumWithdrawalBRL:0,useINSS:false,currentAge:60,inssStartAge:65,inssMonthlyBRL:0,useIPCAModel:true,expectedIPCA:4.5,ipcaVolatility:2,realSpread:5,useTaxModel:true,equityTaxRate:15,fixedIncomeTaxRate:15,useSpendingSmile:false,useStudentT:false,useDynamicCorrelation:false,baseCorrelation:-0.4,useRegimeSwitching:false,useSequenceConstraint:false,useMortalityAdjustment:false,seed:1,usdInflation:2,usdBondReturn:4.5,usdBondVolatility:7};
const e=new MonteCarloEngine(params);
const ws=e.runAllHistoricalWindows();
const bad=ws.filter(w=>w.portfolioBRL.some(v=>!Number.isFinite(v)));
console.log('windows',ws.length,'NaN windows',bad.length);
const r=e.analyzeHistoricalResults(ws);
console.log('survival(all windows)',r.allWindowsSurvivalRate.toFixed(1),'worst start',r.worstWindow.startYear);
if(bad.length>0)process.exit(1);
"
```

Expected: `NaN windows 0`, exit 0; worst window start year plausibly in 1998–2001.

Run: `node scripts/smoke.js` → `SMOKE PASSED`.

- [ ] **Step 3: Commit**

```bash
git add js/engine-historical.js
git commit -m "fix: historical backtest uses BRL spending, US bonds for USD sleeve, total failure"
```

---

### Task 7: Optimizer honors targetEndBalance; BRL-inclusive outputs

**Files:**
- Modify: `js/engine-core.js` (`analyzeResults` return object)
- Modify: `js/app-main.js` (`findOptimalSWR`, app-main.js:151-303)

- [ ] **Step 1: Expose `meanCumulativeIpca`** — in `analyzeResults`, the array `meanCumulativeIpca` is already computed (engine-core.js:905, filled at ~engine-core.js:999). Add it to the returned object (after `minimumWithdrawalAdjusted`):

```js
            meanCumulativeIpca,
```

- [ ] **Step 2: Acceptance criterion** — in `findOptimalSWR` in `js/app-main.js`, add this helper right after `masterSeed` is computed (app-main.js:159):

```js
                    // Success = survival target met AND (if a Die-With-Zero
                    // target is set) the median final balance, deflated to
                    // today's BRL, still meets the target.
                    const meetsTarget = (results) => {
                        if (results.survivalRate < targetRate) return false;
                        if (params.targetEndBalance > 0) {
                            const finalIpca =
                                results.meanCumulativeIpca?.[params.years] ?? 1;
                            const medianFinalReal =
                                results.medianFinalPortfolio / finalIpca;
                            return medianFinalReal >= params.targetEndBalance;
                        }
                        return true;
                    };
```

Then in BOTH bisection loops replace `if (results.survivalRate >= targetRate) {` (app-main.js:202 and app-main.js:255) with `if (meetsTarget(results)) {`.

- [ ] **Step 3: BRL-inclusive withdrawal outputs** — in the return object of `findOptimalSWR` (app-main.js:284-292), replace the two fields:

```js
                        monthlyWithdrawalBRL:
                            ((params.initialPortfolioUSD * params.initialFX +
                                (params.initialPortfolioBRL || 0)) *
                                (bestSWR / 100)) /
                            12,
                        annualWithdrawalBRL:
                            (params.initialPortfolioUSD * params.initialFX +
                                (params.initialPortfolioBRL || 0)) *
                            (bestSWR / 100),
```

- [ ] **Step 4: Verify** — `node scripts/smoke.js` → `SMOKE PASSED`. Then serve the app (`python -m http.server 8000`), open `http://localhost:8000`, switch to consumption mode, set "Saldo Final Alvo" > 0, run the optimizer, and confirm the found SWR is LOWER than with target 0 (a positive end-balance target must reduce sustainable spending). If no browser automation is available, verify the logic with a node check calling `runMonteCarlo` at two SWRs and applying `meetsTarget` manually.

- [ ] **Step 5: Commit**

```bash
git add js/engine-core.js js/app-main.js
git commit -m "fix: optimizer enforces Die-With-Zero target; withdrawal outputs include BRL sleeve"
```

---

### Task 8: UI — new parameters with Portuguese tooltips

**Files:**
- Modify: `js/app-main.js` (defaults in `useState` at app-main.js:6-76; advanced sidebar inputs)

- [ ] **Step 1: Add defaults** — in the `useState` params object, after `realSpread: 5.0,` (app-main.js:44) add:

```js
                    // USD-side assumptions
                    usdInflation: 2.0, // Expected US CPI % (PPP anchor for FX)
                    usdBondReturn: 4.5, // USD bond sleeve nominal return %
                    usdBondVolatility: 7.0, // USD bond sleeve volatility %
```

- [ ] **Step 2: Add sidebar inputs** — locate the advanced-mode sidebar section that renders the IPCA-model inputs (search for `realSpread` around app-main.js:900-1000) and add three `Input` components immediately after it, matching the surrounding component style exactly (same props pattern as the `bondReturn` input at app-main.js:906):

```jsx
                                    <Input
                                        label="Inflação EUA (%)"
                                        value={params.usdInflation}
                                        onChange={(v) => updateParam("usdInflation", v)}
                                        step={0.1}
                                        tooltip="Inflação anual esperada nos EUA (CPI). Usada como âncora de paridade do poder de compra (PPP) para o câmbio de longo prazo: o BRL tende a se desvalorizar aproximadamente pela diferença entre o IPCA e a inflação americana. Valor típico: 2%."
                                    />
                                    <Input
                                        label="Retorno Bonds EUA (%)"
                                        value={params.usdBondReturn}
                                        onChange={(v) => updateParam("usdBondReturn", v)}
                                        step={0.1}
                                        tooltip="Retorno nominal esperado da parcela de renda fixa em dólar (Treasuries/agregado). Esta parcela pertence à carteira em USD — diferente da renda fixa brasileira (IPCA + spread), que não tem exposição cambial."
                                    />
                                    <Input
                                        label="Volatilidade Bonds EUA (%)"
                                        value={params.usdBondVolatility}
                                        onChange={(v) => updateParam("usdBondVolatility", v)}
                                        step={0.5}
                                        tooltip="Volatilidade anual da renda fixa em dólar. Títulos de prazo intermediário historicamente oscilam entre 5% e 8% ao ano."
                                    />
```

If the `Input` component in `js/ui-primitives.js` uses different prop names (check its definition first), adapt to the actual API — the surrounding inputs are the source of truth.

- [ ] **Step 3: Verify in browser** — serve, open `http://localhost:8000`, switch sidebar to "advanced", confirm the three inputs render with tooltips and that changing them + running a simulation works (no console errors). Check the browser console for Babel compile errors.

- [ ] **Step 4: Commit**

```bash
git add js/app-main.js
git commit -m "feat: expose US inflation and USD bond assumptions in advanced sidebar"
```

---

### Task 9: Regression tests + documentation

**Files:**
- Modify: `tests.html` (new suites at the end of the test definitions, before the runner wiring)
- Modify: `README.md`, `CLAUDE.md` (model-change notes)

- [ ] **Step 1: Add new test suites to `tests.html`** — find where existing suites end (after the Optimizer suite) and add. Reuse the file's `baseParams`-style object if one exists; otherwise define `const fixParams = {...}` with the DEFAULTS from Task 1 (minus seed):

```js
        tf.describe('FX-Equity Realized Correlation', () => {
            tf.it('realized correlation matches baseCorrelation sign and magnitude', () => {
                const engine = new MonteCarloEngine({ ...fixParams, seed: 9, useDynamicCorrelation: false, baseCorrelation: -0.4, useStudentT: false });
                const eq = [], fx = [];
                for (let i = 0; i < 10000; i++) {
                    const r = engine.randomNormal(0.08, 0.18);
                    const f = engine.simulateCurrency(r, 5.8, 1, 1.0);
                    eq.push(r); fx.push(f / 5.8 - 1);
                }
                const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
                const me = mean(eq), mf = mean(fx);
                let c = 0, ve = 0, vf = 0;
                for (let i = 0; i < eq.length; i++) {
                    c += (eq[i] - me) * (fx[i] - mf);
                    ve += (eq[i] - me) ** 2; vf += (fx[i] - mf) ** 2;
                }
                const corr = c / Math.sqrt(ve * vf);
                assertInRange(corr, -0.55, -0.25, `realized equity-FX corr was ${corr.toFixed(3)}`);
            });
        });

        tf.describe('BRL Sleeve Integration', () => {
            tf.it('BRL-only portfolio does not fail immediately', () => {
                const engine = new MonteCarloEngine({ ...fixParams, seed: 7, initialPortfolioUSD: 0, initialPortfolioBRL: 5000000, useTaxModel: false });
                const h = engine.runSimulation();
                assert(!h.failed || h.failureYear > 10, `BRL-only portfolio failed at year ${h.failureYear}`);
            });
            tf.it('failure requires BOTH sleeves depleted', () => {
                // Absurd withdrawal rate: must eventually fail, and when it
                // does, both sleeves must be zero
                const engine = new MonteCarloEngine({ ...fixParams, seed: 3, initialPortfolioUSD: 100000, initialPortfolioBRL: 100000, withdrawalRate: 25, useMinimumWithdrawal: false });
                const h = engine.runSimulation();
                assert(h.failed, 'expected failure at 25% SWR');
                const fy = h.failureYear;
                assertEqual(h.portfolioBRL[fy], 0, 'total BRL portfolio must be 0 at failure');
            });
        });

        tf.describe('BRL Spending Denomination', () => {
            tf.it('withdrawal grows at exactly (1+inflation) in BRL when GK and IPCA model are off', () => {
                const engine = new MonteCarloEngine({ ...fixParams, seed: 11, useGuytonKlinger: false, useIPCAModel: false, inflation: 5, useTaxModel: false, useMinimumWithdrawal: false, useSpendingSmile: false, useBucketStrategy: false, useStudentT: false });
                const h = engine.runSimulation();
                for (let y = 2; y <= 5; y++) {
                    const g = h.withdrawalBRL[y] / h.withdrawalBRL[y - 1];
                    assertAlmostEqual(g, 1.05, 0.001, `year ${y}: BRL withdrawal growth was ${g}`);
                }
            });
        });
```

- [ ] **Step 2: Run all browser tests** — serve, open `http://localhost:8000/tests.html`, Run All Tests. Everything green.

- [ ] **Step 3: Update docs** — in `README.md`, update the modeling sections that describe: FX correlation (now applied to the actual equity shock; PPP-anchored mean reversion with `usdInflation`), the bond sleeve currencies (USD sleeve = US bonds; BRL sleeve = IPCA + spread), BRL-denominated spending, BRL-sleeve-first funding and total-portfolio failure, and the Die-With-Zero target now enforced by the optimizer. Add one honest caveat to the historical-backtest section: rolling windows overlap heavily, so window survival rates are illustrative, not independent probabilities. In `CLAUDE.md`, update the "Key Technical Patterns" bullet list to match (Dynamic FX Correlation bullet, add a "Currency denomination" bullet). Keep README language consistent with its existing style (it is largely Portuguese/educational).

- [ ] **Step 4: Final verification**

```bash
node scripts/smoke.js
```
Expected: `SMOKE PASSED`. Browser: run `tests.html` (all green) and load both `index.html` and `endowment.html`, run a simulation on each, no console errors.

- [ ] **Step 5: Commit**

```bash
git add tests.html README.md CLAUDE.md
git commit -m "test: regression suites for FX correlation, BRL sleeve, spending denomination; docs"
```

---

## Out of scope (deliberately)

- Replacing the approximated IBGE mortality qx values with the exact published table (data-sourcing task, no code risk).
- Path-matching the endowment-vs-fixed-vs-GK comparison (endowment draws one extra normal per year; statistically fine at 20k iterations).
- Restructuring the tax model (gainRatio heuristic stays; it is a disclosed simplification).
- De-overlapping historical windows (documented as a caveat instead).

## Acceptance summary (what "done" means)

1. `node scripts/smoke.js` → `SMOKE PASSED`.
2. Task 3's correlation script → realized corr in [−0.55, −0.25].
3. Task 5's acceptance script → `PASS` (BRL-only portfolio usable; BRL indexation exact).
4. Task 6's historical script → 0 NaN windows, worst window ≈ 1998–2001.
5. All `tests.html` suites green in a browser.
6. Optimizer with `targetEndBalance > 0` returns a lower SWR than with 0.
7. Both pages load and run without console errors.
