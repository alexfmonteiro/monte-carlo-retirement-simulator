#!/usr/bin/env node
// Safe-withdrawal-rate study for estudo.html.
// Runs the engine with a fixed seed over a small grid (horizon, equity share
// of the USD sleeve, USD share of the portfolio, with/without Guyton-Klinger)
// and finds the highest initial withdrawal rate that meets 90% and 95%
// survival, raw and mortality-adjusted. Writes estudo-swr.json at the repo
// root; every number on estudo.html comes from that file.
//
//   node scripts/estudo-swr.js            # regenerate estudo-swr.json
//   node scripts/estudo-swr.js --check    # exit 1 if the committed file differs
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = ['rng.js', 'mortality-data.js', 'historical-data.js', 'engine-core.js'];
const src = files
    .map(f => fs.readFileSync(path.join(root, 'js', f), 'utf8'))
    .join('\n;\n');
const { MonteCarloEngine } = new Function(src + '\n;return { MonteCarloEngine };')();

const OUTPUT = path.join(root, 'estudo-swr.json');
const ITERATIONS = 5000;
const SEED = 42;
const TOTAL_PORTFOLIO_BRL = 1000000; // scale-free: no fixed-BRL floor or INSS below
const END_AGE = 95; // start age = END_AGE - horizon
const STEP = 0.1; // withdrawal-rate resolution, %
const MAX_RATE = 20; // search ceiling, %
const TARGETS = [90, 95];

const GRID = {
    horizonYears: [30, 40, 50],
    equityPercent: [60, 80, 100], // equity share of the USD sleeve (rest: US bonds)
    usdPercent: [50, 75, 100], // USD sleeve share of the total (rest: BRL fixed income)
    guytonKlinger: [false, true],
};

// App defaults (js/app-main.js) for the market model, with the
// person-specific features off: no INSS, no spending floor, no bucket,
// no glide path (tent start = target), no spending smile, no accumulation.
const BASE_PARAMS = {
    initialFX: 5.15,
    equityReturn: 6.5,
    equityVolatility: 18.0,
    bondReturn: 5.5,
    bondVolatility: 3.0,
    inflation: 4.0,
    tentDuration: 0,
    preservationThreshold: 0.2,
    prosperityThreshold: 0.2,
    adjustmentPercent: 0.1,
    applyInflationRule: true,
    useMinimumWithdrawal: false,
    useINSS: false,
    useBucketStrategy: false,
    useStudentT: true,
    degreesOfFreedom: 8,
    useDynamicCorrelation: true,
    baseCorrelation: -0.35,
    stressCorrelationMultiplier: 2.0,
    useIPCAModel: true,
    expectedIPCA: 4.0,
    ipcaVolatility: 2.0,
    realSpread: 5.5,
    usdInflation: 2.3,
    usdBondReturn: 4.7,
    usdBondVolatility: 6.0,
    useTaxModel: true,
    equityTaxRate: 15,
    fixedIncomeTaxRate: 15,
    useSpendingSmile: false,
    useRegimeSwitching: false,
    useSequenceConstraint: false,
    useAccumulation: false,
    spendingMode: 'rate',
    useMortalityAdjustment: true,
    mortalityGender: 'male',
    seed: SEED,
};

// Shown on the page next to each default (pt-BR), from the app's comments.
const SOURCES = {
    initialFX: 'USD/BRL à vista em jul/2026. Focus 2026-28: 5,15-5,30.',
    equityReturn: 'Retorno real esperado de ações globais. CMAs 2026 para 10 anos: 5-6%. Histórico ~10% nominal.',
    equityVolatility: 'Volatilidade anual histórica do S&P 500: ~19,7%.',
    degreesOfFreedom: 'T-Student com caudas gordas. Retornos anuais: 8-15 graus de liberdade é típico.',
    baseCorrelation: 'Correlação realizada entre S&P 500 e variação do câmbio, 1996-2024: -0,33.',
    stressCorrelationMultiplier: 'A correlação dobra em anos de queda forte da bolsa.',
    expectedIPCA: 'Focus jul/2026: 5,3% (2026) até 3,5% (2029). Meta: 3%.',
    ipcaVolatility: 'Desvio-padrão do IPCA anual 2005-2024: ~1,9 p.p.',
    realSpread: 'Juro real da renda fixa em BRL. NTN-B longas: IPCA+7,3-8,3% (2026). Juro neutro BCB: 4,5-5,5%.',
    usdInflation: 'Breakeven de 10 anos nos EUA: ~2,24% (jul/2026). Meta do Fed: 2%.',
    usdBondReturn: 'Treasury de 10 anos: ~4,6% (jul/2026). Consenso de CMAs: 4,7%.',
    usdBondVolatility: 'Renda fixa americana agregada/intermediária: ~5-6% a.a.',
    equityTaxRate: 'IR sobre ganho de ETFs irlandeses (simplificado).',
    fixedIncomeTaxRate: 'IR sobre renda fixa (simplificado).',
    mortalityGender: 'Tábua de mortalidade IBGE 2023, homem.',
};

function rowParams(cell) {
    const usdBRL = TOTAL_PORTFOLIO_BRL * cell.usdPercent / 100;
    const bondPercent = 100 - cell.equityPercent;
    return {
        ...BASE_PARAMS,
        initialPortfolioUSD: usdBRL / BASE_PARAMS.initialFX,
        initialPortfolioBRL: TOTAL_PORTFOLIO_BRL - usdBRL,
        years: cell.horizonYears,
        currentAge: END_AGE - cell.horizonYears,
        tentInitialBondPercent: bondPercent,
        targetBondPercent: bondPercent,
        useGuytonKlinger: cell.guytonKlinger,
    };
}

// Highest rate on the STEP lattice whose survival metric meets each target.
// Survival falls as the rate rises, so a binary search per target works;
// probes are cached and shared between the four searches.
function findSWRs(params) {
    const cache = new Map();
    const survival = (k) => {
        if (!cache.has(k)) {
            const r = new MonteCarloEngine({ ...params, withdrawalRate: k * STEP }).runMonteCarlo(ITERATIONS);
            cache.set(k, { raw: r.survivalRate, adjusted: r.mortalityAdjustedSurvivalRate });
        }
        return cache.get(k);
    };
    const maxK = Math.round(MAX_RATE / STEP);
    const search = (metric, target) => {
        if (survival(maxK)[metric] >= target) return { rate: MAX_RATE, capped: true };
        let lo = 0; // k = 0 (no withdrawal) always survives
        let hi = maxK;
        while (hi - lo > 1) {
            const mid = Math.floor((lo + hi) / 2);
            if (survival(mid)[metric] >= target) lo = mid;
            else hi = mid;
        }
        return { rate: round(lo * STEP), capped: false };
    };
    const out = {};
    for (const metric of ['raw', 'adjusted']) {
        for (const target of TARGETS) out[`${metric}${target}`] = search(metric, target);
    }
    return out;
}

const round = (x) => Math.round(x * 1000) / 1000;

function simulatorQuery(params, withdrawalRate) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, withdrawalRate, iterations: ITERATIONS })) q.set(k, String(typeof v === 'number' ? round(v) : v));
    return q.toString();
}

function buildStudy() {
    const rows = [];
    for (const horizonYears of GRID.horizonYears) {
        for (const equityPercent of GRID.equityPercent) {
            for (const usdPercent of GRID.usdPercent) {
                for (const guytonKlinger of GRID.guytonKlinger) {
                    const cell = { horizonYears, equityPercent, usdPercent, guytonKlinger };
                    const params = rowParams(cell);
                    const swr = findSWRs(params);
                    rows.push({
                        ...cell,
                        startAge: params.currentAge,
                        swr,
                        simulatorQuery: simulatorQuery(params, swr.raw95.rate),
                    });
                    process.stderr.write('.');
                }
            }
        }
    }
    process.stderr.write('\n');
    return {
        method: {
            iterations: ITERATIONS,
            seed: SEED,
            totalPortfolioBRL: TOTAL_PORTFOLIO_BRL,
            endAge: END_AGE,
            rateStep: STEP,
            maxRate: MAX_RATE,
            targets: TARGETS,
        },
        grid: GRID,
        baseParams: BASE_PARAMS,
        sources: SOURCES,
        rows,
    };
}

// Three decimals keep the file readable (the USD amount is a BRL split / FX).
const json = JSON.stringify(buildStudy(), (k, v) => (typeof v === 'number' ? round(v) : v), 2) + '\n';

if (process.argv.includes('--check')) {
    const committed = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : '';
    if (committed !== json) {
        console.error('estudo-swr.json is out of date: run node scripts/estudo-swr.js');
        process.exit(1);
    }
    console.log('estudo-swr.json matches a fresh run');
} else {
    fs.writeFileSync(OUTPUT, json);
    console.log(`wrote ${path.relative(root, OUTPUT)} (${json.length} bytes)`);
}
