// ============================================
// RETIREMENT-AGE SWEEP (accumulation phase projection)
// ============================================
// Extends MonteCarloEngine prototype with a driver that, for each
// candidate number of extra years worked (0..maxExtraYears), runs the
// two-phase (accumulation + retirement) Monte Carlo and answers:
//   - what's the max sustainable SWR at that retirement age (conservative
//     = raw survival target; adjusted = mortality-adjusted survival target)?
//   - would the user's actual target spending survive at that age?
//   - what's the (real, today's-BRL) portfolio at retirement?
// This is the "how much longer should I work?" answer.

/**
 * Two-phase bisection search for the maximum withdrawalRate (%) such that
 * a given survival metric meets targetRate, holding all other params
 * (including accumulationYears/useAccumulation) fixed.
 *
 * Mirrors the app's Die-With-Zero optimizer bisection pattern
 * (js/app-main.js findOptimalSWR), but is engine-only/synchronous-ish
 * (yields to the event loop between probes via a 0ms setTimeout so a UI
 * progress callback can repaint) and reads whichever survival metric the
 * caller asks for (raw or mortality-adjusted).
 *
 * @param {object} baseParams - params to run the engine with (already
 *   includes useAccumulation/accumulationYears/years/currentAge etc.)
 * @param {number} targetRate - survival % the search must meet
 * @param {(results:object)=>number} getSurvival - extracts the relevant
 *   survival rate (raw or mortality-adjusted) from analyzeResults() output
 * @param {object} opts - { probeIterations, confirmIterations, seed, onProbe }
 * @returns {{swr:number, results:object}}
 */
MonteCarloEngine.prototype._bisectSWR = async function (
    baseParams,
    targetRate,
    getSurvival,
    opts = {},
) {
    const probeIterations = opts.probeIterations || 1200;
    const confirmIterations = opts.confirmIterations || 3500;
    const seed = opts.seed || Math.floor(Math.random() * 2147483647);

    const runWithSWR = (swr, iterations) => {
        const testParams = { ...baseParams, withdrawalRate: swr, seed };
        const engine = new MonteCarloEngine(testParams);
        return engine.runMonteCarlo(iterations);
    };

    const meets = (results) => getSurvival(results) >= targetRate;

    let minSWR = 0.5;
    let maxSWR = 15.0;
    let bestSWR = minSWR;
    let bestResults = runWithSWR(minSWR, probeIterations);

    // Coarse phase: 0.5% tolerance
    while (maxSWR - minSWR > 0.5) {
        const midSWR = (minSWR + maxSWR) / 2;
        const results = runWithSWR(midSWR, probeIterations);
        if (meets(results)) {
            bestSWR = midSWR;
            bestResults = results;
            minSWR = midSWR;
        } else {
            maxSWR = midSWR;
        }
        if (opts.onProbe) opts.onProbe({ swr: midSWR, survival: getSurvival(results) });
        await new Promise((r) => setTimeout(r, 0));
    }

    // Confirmation run at the best SWR found, with more iterations, to
    // settle on a stable final estimate (per the plan: confirm best at
    // 3-4k iterations).
    const finalResults = runWithSWR(bestSWR, confirmIterations);
    return { swr: bestSWR, results: finalResults };
};

/**
 * Sweep candidate retirement ages (0..maxExtraYears extra years worked)
 * and, for each, compute the sustainable SWR (conservative/adjusted) and
 * whether the user's actual target spending survives.
 *
 * @param {object} options
 * @param {number} options.maxExtraYears - sweep n = 0..maxExtraYears
 * @param {object} options.criteria - { rawSurvival, adjustedSurvival } (%)
 * @param {number} options.probeIterations - iterations per bisection probe
 * @param {number} options.confirmIterations - iterations for confirm/target runs
 * @param {(progress:object)=>void} options.onProgress - called after each age
 * @returns {Promise<{byAge: Array, criteria: object}>}
 */
MonteCarloEngine.prototype.runRetirementAgeSweep = async function (options = {}) {
    const maxExtraYears = options.maxExtraYears ?? 10;
    const criteria = {
        rawSurvival: options.criteria?.rawSurvival ?? 83,
        adjustedSurvival: options.criteria?.adjustedSurvival ?? 96.5,
    };
    const probeIterations = options.probeIterations || 1200;
    const confirmIterations = options.confirmIterations || 3500;
    const onProgress = options.onProgress || (() => {});

    const currentAge = this.params.currentAge || 60;
    const targetSpendingBRL = this.params.targetSpendingBRL || 0;
    const byAge = [];

    for (let n = 0; n <= maxExtraYears; n++) {
        // Horizon to age 100, regardless of how many extra years are worked.
        const ageAtRetirement = currentAge + n;
        const horizonYears = Math.max(1, 100 - ageAtRetirement);

        const baseParams = {
            ...this.params,
            useAccumulation: true,
            accumulationYears: n,
            years: horizonYears,
            spendingMode: "rate",
        };

        // (a) Bisected max SWR meeting the raw ("conservative") and
        // mortality-adjusted survival criteria.
        const rawSearch = await this._bisectSWR(
            baseParams,
            criteria.rawSurvival,
            (r) => r.survivalRate,
            { probeIterations, confirmIterations },
        );
        const adjustedSearch = await this._bisectSWR(
            baseParams,
            criteria.adjustedSurvival,
            (r) => r.mortalityAdjustedSurvivalRate ?? r.survivalRate,
            { probeIterations, confirmIterations },
        );

        // (c) Median real portfolio at the retirement boundary (year index
        // n in the history arrays), deflated by cumulative IPCA so it's
        // comparable across ages in today's BRL.
        const boundaryIpca = rawSearch.results.meanCumulativeIpca[n] ?? 1;
        const portfolioRealMedian =
            (rawSearch.results.portfolioPercentiles.p50[n] || 0) / boundaryIpca;

        const monthlyConservative =
            (portfolioRealMedian * (rawSearch.swr / 100)) / 12;
        const monthlyAdjusted =
            (portfolioRealMedian * (adjustedSearch.swr / 100)) / 12;

        // (b) Survival (raw + adjusted) at the user's actual target
        // spending, holding accumulationYears at n.
        const targetParams = {
            ...this.params,
            useAccumulation: true,
            accumulationYears: n,
            years: horizonYears,
            spendingMode: "target",
            targetSpendingBRL,
        };
        const targetEngine = new MonteCarloEngine({
            ...targetParams,
            seed: this.params.seed || Math.floor(Math.random() * 2147483647),
        });
        const targetResults = targetEngine.runMonteCarlo(confirmIterations);

        const ageResult = {
            age: ageAtRetirement,
            portfolioRealMedian,
            swrConservative: rawSearch.swr,
            swrAdjusted: adjustedSearch.swr,
            monthlyConservative,
            monthlyAdjusted,
            survivalAtTarget: targetResults.survivalRate,
            adjustedAtTarget:
                targetResults.mortalityAdjustedSurvivalRate ??
                targetResults.survivalRate,
        };

        byAge.push(ageResult);
        onProgress({ n, maxExtraYears, ageResult });
        await new Promise((r) => setTimeout(r, 0));
    }

    return { byAge, criteria };
};
