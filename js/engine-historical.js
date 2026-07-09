// ============================================
// HISTORICAL BACKTESTING METHODS
// ============================================
// Extends MonteCarloEngine prototype with methods to run
// the withdrawal strategy against actual historical data
// instead of Monte Carlo random sampling.

/**
 * Run a single simulation using historical data starting at startIdx.
 * Mirrors runSimulation() closely but replaces random return generation
 * with actual historical values from HISTORICAL_DATA.
 *
 * @param {number} startIdx - Starting index in HISTORICAL_DATA arrays
 * @param {number} simYears - Number of years to simulate (may be less than params.years if data runs out)
 * @returns {object} History object compatible with runSimulation() output
 */
MonteCarloEngine.prototype.runHistoricalBacktest = function(startIdx, simYears) {
    const {
        initialPortfolioUSD,
        initialPortfolioBRL,
        initialFX,
        withdrawalRate,
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
    } = this.params;

    const data = HISTORICAL_DATA;

    // USD sleeve (equity + US bonds, subject to FX variation)
    let portfolioUSD = initialPortfolioUSD;
    // Use historical FX as the starting rate.
    // For startIdx > 0, use end-of-previous-year FX as start-of-year rate.
    // For startIdx == 0 (1995), use the user's initialFX as an approximation
    // since we don't have pre-1995 data. BRL was ~0.97/USD at end of 1995.
    let currentFX = startIdx > 0 ? data.fxRate[startIdx - 1] : initialFX;

    // BRL sleeve (Brazilian fixed income, no FX exposure)
    let portfolioBRLFixed = initialPortfolioBRL;

    let portfolioBRL = portfolioUSD * currentFX + portfolioBRLFixed;

    // Allocation applies to the USD sleeve only
    let bondAllocation = tentInitialBondPercent / 100;
    let equityAllocation = 1 - bondAllocation;
    let bondPortionUSD = portfolioUSD * bondAllocation;
    let equityPortionUSD = portfolioUSD * equityAllocation;

    // Spending target in BRL, adjusted by Guyton-Klinger + inflation
    const totalInitialPortfolioBRL = portfolioUSD * currentFX + initialPortfolioBRL;
    let currentWithdrawalBRL = totalInitialPortfolioBRL * (withdrawalRate / 100);
    const initialWithdrawalRate = withdrawalRate / 100;

    let previousReturn = 0;
    let cumulativeIpcaFactor = 1.0;

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
        yearlyStressData: [{ minimumEnforced: false, extraWithdrawn: 0, percentExtra: 0 }],
        withdrawalSource: ["initial"],
        inssIncomeBRL: [0],
        cumulativeIpcaFactor: [1.0],
        smileMultiplier: [1.0],
        regimeHistory: ['historical'],
    };

    for (let year = 1; year <= simYears; year++) {
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
            history.yearlyStressData.push({ minimumEnforced: false, extraWithdrawn: 0, percentExtra: 0 });
            history.withdrawalSource.push("none");
            history.inssIncomeBRL.push(0);
            history.cumulativeIpcaFactor.push(history.cumulativeIpcaFactor[year - 1]);
            history.smileMultiplier.push(1.0);
            history.regimeHistory.push('historical');
            continue;
        }

        // --- Historical market data for the year ---
        const dataIdx = startIdx + year - 1;
        const equityReturnYear = data.spReturn[dataIdx];
        const ipcaYear = data.ipca[dataIdx];
        const brlBondReturnYear = data.brBondReturn[dataIdx];
        const usdBondReturnYear = data.usBondReturn[dataIdx];

        cumulativeIpcaFactor *= (1 + ipcaYear);

        // Total BRL value before this year's returns (for previousReturn)
        const prevTotalBRL = portfolioUSD * currentFX + portfolioBRLFixed;

        // Grow the BRL sleeve
        portfolioBRLFixed *= (1 + brlBondReturnYear);

        // Use actual historical FX rate
        currentFX = data.fxRate[dataIdx];

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
                const transitionProgress = Math.min(1, (year - tentDuration) / transitionYears);
                bondAllocation = tentInitialBondPercent / 100 -
                    (tentInitialBondPercent / 100 - targetBondPercent / 100) * transitionProgress;
            }
            equityAllocation = 1 - bondAllocation;

            const usdReturn = equityAllocation * equityReturnYear + bondAllocation * usdBondReturnYear;
            portfolioUSD *= (1 + usdReturn);
            bondPortionUSD = portfolioUSD * bondAllocation;
            equityPortionUSD = portfolioUSD * equityAllocation;
        }

        // Total portfolio after returns, before withdrawal (BRL)
        const totalPortfolioBRL = portfolioUSD * currentFX + portfolioBRLFixed;

        // Total return in BRL terms drives the G-K inflation-skip rule
        const portfolioReturn = prevTotalBRL > 0 ? totalPortfolioBRL / prevTotalBRL - 1 : 0;

        // --- Withdrawal sizing (all BRL). Historical IPCA is real data,
        // so G-K always uses ipcaYear. ---
        const gkResult = this.applyGuytonKlinger(
            currentWithdrawalBRL,
            totalPortfolioBRL,
            initialWithdrawalRate,
            previousReturn,
            ipcaYear,
        );
        const gkBaseWithdrawalBRL = gkResult.withdrawal;
        const gkRuleApplied = gkResult.ruleApplied;

        let smileMultiplier = 1.0;
        if (this.params.useSpendingSmile) {
            smileMultiplier = this.getSpendingSmileMultiplier(year, simYears);
        }
        const recommendedWithdrawalBRL = gkBaseWithdrawalBRL * smileMultiplier;

        const minimumBRLYear =
            useMinimumWithdrawal && minimumWithdrawalBRL > 0
                ? minimumWithdrawalBRL * cumulativeIpcaFactor
                : 0;

        const ageThisYear = currentAge + year - 1;
        const inssActive = useINSS && inssMonthlyBRL > 0 && ageThisYear >= inssStartAge;
        const annualINSSBRL = inssActive ? inssMonthlyBRL * 12 * cumulativeIpcaFactor : 0;

        // INSS reduces what the portfolio must fund; the minimum applies
        // to the portfolio portion
        const portfolioWithdrawalBRL = Math.max(0, recommendedWithdrawalBRL - annualINSSBRL);
        const effectiveMinimumBRL = Math.max(0, minimumBRLYear - annualINSSBRL);
        const actualWithdrawalBRL = useMinimumWithdrawal
            ? Math.max(portfolioWithdrawalBRL, effectiveMinimumBRL)
            : portfolioWithdrawalBRL;

        const gainRatio = Math.min(0.6, year * 0.06);
        const taxPaid = this.calculateTax(actualWithdrawalBRL, gainRatio, bondAllocation);
        const totalNeedBRL = actualWithdrawalBRL + taxPaid;

        // --- Fund the withdrawal: BRL sleeve first (it pays BRL bills
        // without FX conversion), then the USD sleeve ---
        const fromBRLSleeve = Math.min(Math.max(0, portfolioBRLFixed), totalNeedBRL);
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
                bondAllocation = portfolioUSD > 0 ? bondPortionUSD / portfolioUSD : 0;
                equityAllocation = 1 - bondAllocation;
            } else {
                // Rebalance-aware withdrawal: after a strong equity year,
                // sell equity first to move back toward target allocation
                const currentEquityPercent = portfolioUSD > 0 ? equityPortionUSD / portfolioUSD : 0;
                const rebalanceThreshold = 0.1;
                if (equityReturnYear > 0.15 && currentEquityPercent > equityAllocation + rebalanceThreshold) {
                    withdrawalSource = "equity_rebalance";
                    const maxEquityWithdrawal = Math.max(0, equityPortionUSD - portfolioUSD * equityAllocation);
                    const equityWithdrawal = Math.min(remainderUSD, maxEquityWithdrawal);
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
                    totalExtraWithdrawn: currentStressExtraWithdrawn + extraWithdrawnBRL,
                    recovered: false,
                    recoveryYear: null,
                });
                inStressPeriod = false;
            }

            history.failed = true;
            history.failureYear = year;
            history.failureType = "depletion";
            history.failureCause = ["Depleção do portfólio com dados históricos"];
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
        history.regimeHistory.push('historical');
    }

    // Close any open stress period at end of simulation
    if (inStressPeriod && !history.failed) {
        history.stressPeriods.push({
            startYear: currentStressStart,
            endYear: simYears,
            duration: simYears - currentStressStart + 1,
            totalExtraWithdrawn: currentStressExtraWithdrawn,
            recovered: false,
            recoveryYear: null,
        });
    }

    return history;
};

/**
 * Run all possible historical windows (rolling start years).
 * For each starting year where we have at least 5 years of data,
 * run the full backtest.
 *
 * @returns {Array} Array of window result objects
 */
MonteCarloEngine.prototype.runAllHistoricalWindows = function() {
    const data = HISTORICAL_DATA;
    const dataLength = data.years.length;
    const windows = [];

    for (let startIdx = 0; startIdx < dataLength; startIdx++) {
        const availableYears = dataLength - startIdx;
        if (availableYears < 5) continue; // Skip windows with less than 5 years

        const simYears = Math.min(this.params.years, availableYears);
        const result = this.runHistoricalBacktest(startIdx, simYears);
        result.startYear = data.years[startIdx];
        result.windowYears = simYears;
        result.isComplete = availableYears >= this.params.years;
        windows.push(result);
    }

    return windows;
};

/**
 * Analyze all historical backtest windows and return summary statistics.
 *
 * @param {Array} windows - Array of window result objects from runAllHistoricalWindows()
 * @returns {object} Analysis results
 */
MonteCarloEngine.prototype.analyzeHistoricalResults = function(windows) {
    if (!windows || windows.length === 0) {
        return {
            totalWindows: 0,
            completeWindows: 0,
            survivalRate: 100,
            allWindowsSurvivalRate: 100,
            failedWindows: [],
            bestWindow: null,
            worstWindow: null,
            medianWithdrawal: 0,
            worstWithdrawal: 0,
            portfolioByYear: { p10: [], p25: [], p50: [], p75: [], p90: [] },
            withdrawalByYear: { mean: [], median: [] },
            windowResults: [],
        };
    }

    const completeWindows = windows.filter(w => w.isComplete);
    const failedWindows = windows.filter(w => w.failed);

    // Survival rate (complete windows only)
    const completeSurvived = completeWindows.filter(w => !w.failed).length;
    const survivalRate = completeWindows.length > 0
        ? (completeSurvived / completeWindows.length) * 100
        : 100;

    // All windows survival rate
    const allSurvived = windows.filter(w => !w.failed).length;
    const allWindowsSurvivalRate = (allSurvived / windows.length) * 100;

    // Failed windows details
    const failedDetails = failedWindows.map(w => ({
        startYear: w.startYear,
        failureYear: w.failureYear,
        windowYears: w.windowYears,
    }));

    // Best and worst windows (by final portfolio BRL)
    const sortedByFinal = [...windows].sort((a, b) => {
        const aFinal = a.portfolioBRL[a.portfolioBRL.length - 1] || 0;
        const bFinal = b.portfolioBRL[b.portfolioBRL.length - 1] || 0;
        return aFinal - bFinal;
    });

    const worstWindow = sortedByFinal[0];
    const bestWindow = sortedByFinal[sortedByFinal.length - 1];

    // Median and worst withdrawal across all windows
    const allWithdrawals = windows.flatMap(w =>
        w.withdrawalBRL.filter(v => v > 0)
    );
    allWithdrawals.sort((a, b) => a - b);
    const medianWithdrawal = allWithdrawals.length > 0
        ? allWithdrawals[Math.floor(allWithdrawals.length / 2)]
        : 0;
    const worstWithdrawal = allWithdrawals.length > 0
        ? allWithdrawals[0]
        : 0;

    // Portfolio evolution percentiles across windows (for chart)
    // Find the maximum number of years across all windows
    const maxYears = Math.max(...windows.map(w => w.portfolioBRL.length));
    const portfolioByYear = { p10: [], p25: [], p50: [], p75: [], p90: [] };
    const withdrawalByYear = { mean: [], median: [] };

    for (let yr = 0; yr < maxYears; yr++) {
        // Collect portfolio values at this year across all windows that have data
        const portfolioValues = windows
            .filter(w => yr < w.portfolioBRL.length)
            .map(w => w.portfolioBRL[yr])
            .sort((a, b) => a - b);

        const n = portfolioValues.length;
        if (n > 0) {
            portfolioByYear.p10.push(portfolioValues[Math.floor(n * 0.10)] || 0);
            portfolioByYear.p25.push(portfolioValues[Math.floor(n * 0.25)] || 0);
            portfolioByYear.p50.push(portfolioValues[Math.floor(n * 0.50)] || 0);
            portfolioByYear.p75.push(portfolioValues[Math.floor(n * 0.75)] || 0);
            portfolioByYear.p90.push(portfolioValues[Math.floor(n * 0.90)] || 0);
        }

        // Collect withdrawal values
        const withdrawalValues = windows
            .filter(w => yr < w.withdrawalBRL.length)
            .map(w => w.withdrawalBRL[yr])
            .filter(v => v > 0)
            .sort((a, b) => a - b);

        const nw = withdrawalValues.length;
        if (nw > 0) {
            withdrawalByYear.mean.push(
                withdrawalValues.reduce((a, b) => a + b, 0) / nw
            );
            withdrawalByYear.median.push(
                withdrawalValues[Math.floor(nw / 2)]
            );
        } else {
            withdrawalByYear.mean.push(0);
            withdrawalByYear.median.push(0);
        }
    }

    // Individual window data for spaghetti chart
    const windowResults = windows.map(w => ({
        startYear: w.startYear,
        portfolioBRL: w.portfolioBRL,
        withdrawalBRL: w.withdrawalBRL,
        failed: w.failed,
        failureYear: w.failureYear,
        isComplete: w.isComplete,
        windowYears: w.windowYears,
        finalPortfolioBRL: w.portfolioBRL[w.portfolioBRL.length - 1] || 0,
        worstWithdrawalBRL: Math.min(...w.withdrawalBRL.filter(v => v > 0).concat([Infinity])),
    }));

    return {
        totalWindows: windows.length,
        completeWindows: completeWindows.length,
        survivalRate,
        allWindowsSurvivalRate,
        failedWindows: failedDetails,
        bestWindow: {
            startYear: bestWindow.startYear,
            finalPortfolioBRL: bestWindow.portfolioBRL[bestWindow.portfolioBRL.length - 1] || 0,
            windowYears: bestWindow.windowYears,
            isComplete: bestWindow.isComplete,
        },
        worstWindow: {
            startYear: worstWindow.startYear,
            finalPortfolioBRL: worstWindow.portfolioBRL[worstWindow.portfolioBRL.length - 1] || 0,
            windowYears: worstWindow.windowYears,
            isComplete: worstWindow.isComplete,
            failed: worstWindow.failed,
            failureYear: worstWindow.failureYear,
        },
        medianWithdrawal,
        worstWithdrawal,
        portfolioByYear,
        withdrawalByYear,
        windowResults,
        dataRange: {
            start: HISTORICAL_DATA.years[0],
            end: HISTORICAL_DATA.years[HISTORICAL_DATA.years.length - 1],
            totalYears: HISTORICAL_DATA.years.length,
        },
    };
};
