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
    } = this.params;

    const data = HISTORICAL_DATA;

    // USD portfolio (equity + bonds, subject to FX variation)
    let portfolioUSD = initialPortfolioUSD;
    // Use historical FX as the starting rate.
    // For startIdx > 0, use end-of-previous-year FX as start-of-year rate.
    // For startIdx == 0 (1995), use the user's initialFX as an approximation
    // since we don't have pre-1995 data. BRL was ~0.97/USD at end of 1995.
    let currentFX = startIdx > 0 ? data.fxRate[startIdx - 1] : initialFX;

    // BRL portfolio (Brazilian fixed income, no FX exposure)
    let portfolioBRLFixed = initialPortfolioBRL;

    // Total portfolio in BRL
    let portfolioBRL = portfolioUSD * currentFX + portfolioBRLFixed;

    // Initial allocation for USD portfolio only
    let bondAllocation = tentInitialBondPercent / 100;
    let equityAllocation = 1 - bondAllocation;

    // Separate tracking for USD portfolio (bucket strategy applies here)
    let bondPortionUSD = portfolioUSD * bondAllocation;
    let equityPortionUSD = portfolioUSD * equityAllocation;

    // Initial withdrawal calculated on total portfolio in BRL
    const totalInitialPortfolioBRL = portfolioUSD * currentFX + initialPortfolioBRL;
    const initialWithdrawalBRL = totalInitialPortfolioBRL * (withdrawalRate / 100);
    let currentWithdrawalUSD = initialWithdrawalBRL / currentFX;
    const initialWithdrawalRate = withdrawalRate / 100;

    let previousReturn = 0;
    let cumulativeIpcaFactor = 1.0;

    const history = {
        portfolioUSD: [portfolioUSD],
        portfolioBRL: [portfolioBRL],
        withdrawalBRL: [currentWithdrawalUSD * currentFX],
        withdrawalUSD: [currentWithdrawalUSD],
        recommendedWithdrawalBRL: [currentWithdrawalUSD * currentFX],
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

    // Stress period tracking
    let inStressPeriod = false;
    let currentStressStart = null;
    let currentStressExtraWithdrawn = 0;

    for (let year = 1; year <= simYears; year++) {
        // Check if already failed
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

        // Historical data index for this year
        const dataIdx = startIdx + year - 1;

        // Read historical returns
        const equityReturnYear = data.spReturn[dataIdx];
        const ipcaYear = data.ipca[dataIdx];
        const bondReturnYear = data.brBondReturn[dataIdx];

        // Update cumulative IPCA
        cumulativeIpcaFactor *= (1 + ipcaYear);

        // Apply returns to BRL portfolio (Brazilian fixed income, no FX exposure)
        portfolioBRLFixed *= (1 + bondReturnYear);

        // Use actual historical FX rate
        currentFX = data.fxRate[dataIdx];

        // Calculate gain ratio for tax purposes
        const gainRatio = Math.min(0.6, year * 0.06);

        // Calculate minimum withdrawal in USD for this year (inflation-adjusted)
        const minimumWithdrawalUSD =
            useMinimumWithdrawal && minimumWithdrawalBRL > 0
                ? (minimumWithdrawalBRL * cumulativeIpcaFactor) / currentFX
                : 0;

        // INSS income for this year
        const ageThisYear = currentAge + year - 1;
        const inssActive = useINSS && inssMonthlyBRL > 0 && ageThisYear >= inssStartAge;
        const annualINSSUSD = inssActive ? (inssMonthlyBRL * 12 * cumulativeIpcaFactor) / currentFX : 0;
        const annualINSSBRL = annualINSSUSD * currentFX;

        // Spending Smile
        let smileMultiplier = 1.0;
        if (this.params.useSpendingSmile) {
            smileMultiplier = this.getSpendingSmileMultiplier(year, simYears);
        }

        // Withdrawal logic - mirrors runSimulation() closely
        let withdrawalSource = "mixed";
        let recommendedWithdrawalUSD = currentWithdrawalUSD;
        let actualWithdrawalUSD = currentWithdrawalUSD;
        let portfolioWithdrawalUSD = currentWithdrawalUSD;
        let gkRuleApplied = null;
        let gkBaseWithdrawalUSD = currentWithdrawalUSD;
        let taxPaid = 0;

        if (useBucketStrategy && year <= bucketYears) {
            // Apply returns to each portion separately
            equityPortionUSD *= (1 + equityReturnYear);
            bondPortionUSD *= (1 + bondReturnYear);

            withdrawalSource = "bonds";

            // Apply Guyton-Klinger rules
            const totalPortfolioUSD = equityPortionUSD + bondPortionUSD;
            const gkResult = this.applyGuytonKlinger(
                currentWithdrawalUSD,
                totalPortfolioUSD,
                initialWithdrawalRate,
                previousReturn,
                ipcaYear,
            );
            gkBaseWithdrawalUSD = gkResult.withdrawal;
            recommendedWithdrawalUSD = gkBaseWithdrawalUSD * smileMultiplier;
            gkRuleApplied = gkResult.ruleApplied;

            // ENFORCE MINIMUM
            portfolioWithdrawalUSD = Math.max(0, recommendedWithdrawalUSD - annualINSSUSD);
            const effectiveMinimumUSD_b = Math.max(0, minimumWithdrawalUSD - annualINSSUSD);
            actualWithdrawalUSD = useMinimumWithdrawal
                ? Math.max(portfolioWithdrawalUSD, effectiveMinimumUSD_b)
                : portfolioWithdrawalUSD;

            // Calculate tax
            taxPaid = this.calculateTax(actualWithdrawalUSD, gainRatio, bondAllocation);
            const totalWithdrawalUSD = actualWithdrawalUSD + taxPaid;

            // Withdraw from bonds
            bondPortionUSD -= totalWithdrawalUSD;
            if (bondPortionUSD < 0) {
                equityPortionUSD += bondPortionUSD;
                bondPortionUSD = 0;
                withdrawalSource = "equity_forced";
            }

            portfolioUSD = equityPortionUSD + bondPortionUSD;

            // Recalculate allocation
            bondAllocation = portfolioUSD > 0 ? bondPortionUSD / portfolioUSD : 0;
            equityAllocation = 1 - bondAllocation;

            currentWithdrawalUSD = gkBaseWithdrawalUSD;
        } else {
            // Standard strategy: Tent/Glidepath with mixed withdrawals
            if (year <= tentDuration) {
                bondAllocation = tentInitialBondPercent / 100;
            } else {
                const transitionYears = 3;
                const transitionProgress = Math.min(1, (year - tentDuration) / transitionYears);
                bondAllocation = tentInitialBondPercent / 100 -
                    (tentInitialBondPercent / 100 - targetBondPercent / 100) * transitionProgress;
            }
            equityAllocation = 1 - bondAllocation;

            // Calculate portfolio return
            const portfolioReturn = equityAllocation * equityReturnYear + bondAllocation * bondReturnYear;

            // Apply return to portfolio
            portfolioUSD *= (1 + portfolioReturn);

            // Update portions for tracking
            bondPortionUSD = portfolioUSD * bondAllocation;
            equityPortionUSD = portfolioUSD * equityAllocation;

            // Rebalancing logic
            const currentEquityPercent = equityPortionUSD / portfolioUSD;
            const targetEquityPercent = equityAllocation;
            const rebalanceThreshold = 0.1;

            let preferEquityWithdrawal = false;
            if (equityReturnYear > 0.15 && currentEquityPercent > targetEquityPercent + rebalanceThreshold) {
                preferEquityWithdrawal = true;
                withdrawalSource = "equity_rebalance";
            }

            // Apply Guyton-Klinger rules
            const gkResult = this.applyGuytonKlinger(
                currentWithdrawalUSD,
                portfolioUSD,
                initialWithdrawalRate,
                previousReturn,
                ipcaYear,
            );
            gkBaseWithdrawalUSD = gkResult.withdrawal;
            recommendedWithdrawalUSD = gkBaseWithdrawalUSD * smileMultiplier;
            gkRuleApplied = gkResult.ruleApplied;

            // ENFORCE MINIMUM
            portfolioWithdrawalUSD = Math.max(0, recommendedWithdrawalUSD - annualINSSUSD);
            const effectiveMinimumUSD_s = Math.max(0, minimumWithdrawalUSD - annualINSSUSD);
            actualWithdrawalUSD = useMinimumWithdrawal
                ? Math.max(portfolioWithdrawalUSD, effectiveMinimumUSD_s)
                : portfolioWithdrawalUSD;

            // Calculate tax
            taxPaid = this.calculateTax(actualWithdrawalUSD, gainRatio, bondAllocation);
            const totalWithdrawalUSD = actualWithdrawalUSD + taxPaid;

            // Make withdrawal
            if (preferEquityWithdrawal) {
                const maxEquityWithdrawal = Math.max(0, equityPortionUSD - portfolioUSD * targetEquityPercent);
                const equityWithdrawal = Math.min(totalWithdrawalUSD, maxEquityWithdrawal);
                const bondWithdrawal = totalWithdrawalUSD - equityWithdrawal;
                equityPortionUSD -= equityWithdrawal;
                bondPortionUSD -= bondWithdrawal;
                portfolioUSD = equityPortionUSD + bondPortionUSD;
            } else {
                portfolioUSD -= totalWithdrawalUSD;
            }

            currentWithdrawalUSD = gkBaseWithdrawalUSD;
            previousReturn = portfolioReturn;
        }

        // Calculate values in BRL
        const actualWithdrawalBRL = actualWithdrawalUSD * currentFX;
        const recommendedWithdrawalBRL = recommendedWithdrawalUSD * currentFX;

        // Check if minimum was enforced (stress condition)
        const minimumWasEnforced =
            useMinimumWithdrawal &&
            minimumWithdrawalBRL > 0 &&
            actualWithdrawalUSD > portfolioWithdrawalUSD * 1.001;

        const extraWithdrawnBRL = minimumWasEnforced
            ? actualWithdrawalBRL - recommendedWithdrawalBRL
            : 0;
        const percentExtra =
            minimumWasEnforced && recommendedWithdrawalBRL > 0
                ? (extraWithdrawnBRL / recommendedWithdrawalBRL) * 100
                : 0;

        history.yearlyStressData.push({
            minimumEnforced: minimumWasEnforced,
            extraWithdrawn: extraWithdrawnBRL,
            percentExtra,
        });

        // Track stress periods
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

        // Check for failure
        if (portfolioUSD <= 0) {
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
        }

        // Update BRL values
        portfolioBRL = portfolioUSD * currentFX + portfolioBRLFixed;

        // Store history
        history.portfolioUSD.push(portfolioUSD);
        history.portfolioBRL.push(portfolioBRL);
        history.withdrawalBRL.push(actualWithdrawalBRL);
        history.withdrawalUSD.push(actualWithdrawalUSD);
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
