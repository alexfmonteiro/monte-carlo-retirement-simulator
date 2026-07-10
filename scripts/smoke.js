#!/usr/bin/env node
// Node smoke test for the simulation engines (browser-free sanity check).
// The js/ files are plain scripts declaring globals, so we concatenate and
// evaluate them inside a Function, then return the names we need.
const fs = require('fs');
const path = require('path');

const files = ['rng.js', 'mortality-data.js', 'historical-data.js',
               'engine-core.js', 'engine-projection.js', 'engine-historical.js',
               'engine-endowment.js'];
const src = files
    .map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'))
    .join('\n;\n');
const load = new Function(src + '\n;return { MonteCarloEngine, HISTORICAL_DATA };');
const { MonteCarloEngine, HISTORICAL_DATA } = load();

// Mirrors the useState defaults in js/app-main.js (plus the new params
// added by this plan — harmless before they are used).
const DEFAULTS = {
    initialPortfolioUSD: 800000, initialPortfolioBRL: 1030000, initialFX: 5.15,
    withdrawalRate: 3.5, equityReturn: 6.5, equityVolatility: 18.0,
    bondReturn: 5.5, bondVolatility: 3.0, inflation: 4.0, years: 58,
    tentInitialBondPercent: 40, tentDuration: 5, targetBondPercent: 40,
    useGuytonKlinger: true, preservationThreshold: 0.2, prosperityThreshold: 0.2,
    adjustmentPercent: 0.1, applyInflationRule: true,
    minimumWithdrawalBRL: 120000, useMinimumWithdrawal: true,
    useINSS: true, currentAge: 42, inssStartAge: 65, inssMonthlyBRL: 4000,
    bucketYears: 5, useBucketStrategy: true,
    useStudentT: true, degreesOfFreedom: 8,
    useDynamicCorrelation: true, baseCorrelation: -0.35, stressCorrelationMultiplier: 2.0,
    useIPCAModel: true, expectedIPCA: 4.0, ipcaVolatility: 2.0, realSpread: 5.5,
    useTaxModel: true, equityTaxRate: 15, fixedIncomeTaxRate: 15,
    useSpendingSmile: false, smileEarlyMultiplier: 1.2, smileMidMultiplier: 0.85, smileLateMultiplier: 1.1,
    useRegimeSwitching: false, bullEquityMean: 9.5, bullEquityVol: 12,
    bearEquityMean: -5, bearEquityVol: 25, bullToBullProb: 0.875, bearToBearProb: 0.5,
    useSequenceConstraint: false, maxNegativeSequence: 10,
    useMortalityAdjustment: true, mortalityGender: 'male',
    seed: 42,
    usdInflation: 2.3, usdBondReturn: 4.7, usdBondVolatility: 6.0,
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

// 6) Accumulation phase: two-phase run produces the expected history shape
// and no withdrawals before retirement.
const accYears = 5;
const accEngine = new MonteCarloEngine({
    ...DEFAULTS,
    useAccumulation: true,
    accumulationYears: accYears,
    monthlyContributionBRL: 10000,
    contributionSplitUSD: 80,
    spendingMode: 'rate',
});
const accHist = accEngine.runSimulation();
check('accumulation history length = accYears + years + 1',
    accHist.portfolioBRL.length === accYears + DEFAULTS.years + 1);
check('accumulation years have zero withdrawal',
    accHist.withdrawalBRL.slice(1, accYears + 1).every((w) => w === 0));
check('accumulation history all finite',
    accHist.portfolioBRL.every(Number.isFinite) && accHist.portfolioUSD.every(Number.isFinite));

// 7) Retirement-age sweep: shape + NaN check over a small sweep
(async () => {
    const sweepEngine = new MonteCarloEngine({
        ...DEFAULTS,
        currentAge: 55,
        targetSpendingBRL: 150000,
        monthlyContributionBRL: 10000,
        contributionSplitUSD: 80,
    });
    const sweep = await sweepEngine.runRetirementAgeSweep({
        maxExtraYears: 2,
        probeIterations: 100,
        confirmIterations: 150,
    });
    check('sweep returns byAge with 3 entries', sweep.byAge.length === 3);
    check('sweep entries all finite', sweep.byAge.every((row) =>
        Number.isFinite(row.age) &&
        Number.isFinite(row.portfolioRealMedian) &&
        Number.isFinite(row.swrConservative) &&
        Number.isFinite(row.swrAdjusted) &&
        Number.isFinite(row.monthlyConservative) &&
        Number.isFinite(row.monthlyAdjusted) &&
        Number.isFinite(row.survivalAtTarget) &&
        Number.isFinite(row.adjustedAtTarget)));

    console.log(failed ? 'SMOKE FAILED' : 'SMOKE PASSED');
    process.exit(failed ? 1 : 0);
})();
