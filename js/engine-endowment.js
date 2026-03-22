// ============================================
// ENDOWMENT-SPECIFIC METHODS
// ============================================

MonteCarloEngine.prototype.generateCAPE = function(currentCAPE) {
    const { medianCAPE, capeVolatility, capeMeanReversionSpeed } = this.params;
    const shock = this.randomNormal(0, capeVolatility);
    const meanReversion = capeMeanReversionSpeed * (medianCAPE - currentCAPE);
    return Math.max(7, Math.min(50, currentCAPE + meanReversion + shock));
};

MonteCarloEngine.prototype.runSimulationEndowment = function() {
    const {
        initialPortfolioUSD, initialFX, years,
        equityReturn, equityVolatility, targetBondPercent,
        endowmentAlpha, endowmentTargetRate,
        useEndowmentCAPE, initialCAPE, medianCAPE,
        endowmentDrawdownSensitivity, endowmentGuardrailCap
    } = this.params;

    let portfolioUSD = initialPortfolioUSD;
    let currentFX = initialFX;
    const bondAllocation = (targetBondPercent || 40) / 100;
    let currentWithdrawalUSD = initialPortfolioUSD * ((endowmentTargetRate || 4) / 100);
    let peakPortfolioUSD = initialPortfolioUSD;
    let currentCAPE = initialCAPE || 22;

    const history = {
        portfolioUSD: [portfolioUSD],
        portfolioBRL: [portfolioUSD * currentFX],
        withdrawalBRL: [currentWithdrawalUSD * currentFX],
        withdrawalUSD: [currentWithdrawalUSD],
        recommendedWithdrawalBRL: [currentWithdrawalUSD * currentFX],
        fxRate: [currentFX],
        bondAllocation: [bondAllocation * 100],
        rulesApplied: [null],
        minimumEnforced: [false],
        failed: false, failureYear: null, failureType: null, failureCause: null,
        stressPeriods: [],
        yearlyStressData: [{ minimumEnforced: false, extraWithdrawn: 0, percentExtra: 0 }],
        withdrawalSource: ['initial'],
        capeHistory: [currentCAPE],
        drawdownHistory: [0],
        inssIncomeBRL: [0],
        cumulativeIpcaFactor: [1.0],
    };

    let cumulativeIpcaFactor = 1.0;

    // Regime-switching state
    let currentRegime = 'bull';

    for (let year = 1; year <= years; year++) {
        if (history.failed) {
            history.portfolioUSD.push(0); history.portfolioBRL.push(0);
            history.withdrawalBRL.push(0); history.withdrawalUSD.push(0);
            history.recommendedWithdrawalBRL.push(0);
            history.fxRate.push(currentFX); history.bondAllocation.push(0);
            history.rulesApplied.push(null); history.minimumEnforced.push(false);
            history.yearlyStressData.push({ minimumEnforced: false, extraWithdrawn: 0, percentExtra: 0 });
            history.withdrawalSource.push('none');
            history.capeHistory.push(currentCAPE); history.drawdownHistory.push(0);
            history.inssIncomeBRL.push(0);
            history.cumulativeIpcaFactor.push(history.cumulativeIpcaFactor[year - 1]);
            continue;
        }

        let equityReturnYear;
        if (this.params.useRegimeSwitching) {
            const result = this.generateRegimeSwitchingReturn(currentRegime);
            equityReturnYear = result.return;
            currentRegime = result.newRegime;
        } else {
            equityReturnYear = this.generateReturn(equityReturn / 100, equityVolatility / 100);
        }
        const ipcaYear = this.generateIPCA(equityReturnYear);
        cumulativeIpcaFactor *= (1 + ipcaYear);
        const bondReturnYear = this.generateBondReturn(ipcaYear);
        currentFX = this.simulateCurrency(equityReturnYear, currentFX);

        const portfolioReturn = (1 - bondAllocation) * equityReturnYear + bondAllocation * bondReturnYear;
        portfolioUSD *= (1 + portfolioReturn);
        if (portfolioUSD > peakPortfolioUSD) peakPortfolioUSD = portfolioUSD;

        if (useEndowmentCAPE) currentCAPE = this.generateCAPE(currentCAPE);

        const alpha = endowmentAlpha || 0.70;
        const targetRate = (endowmentTargetRate || 4) / 100;
        let newWithdrawalUSD;

        if (useEndowmentCAPE) {
            const drawdown = Math.max(0, 1 - portfolioUSD / peakPortfolioUSD);
            const med = medianCAPE || 20;
            const xT = targetRate * (med / currentCAPE) * (1 - drawdown * (endowmentDrawdownSensitivity || 0.5));
            const raw = alpha * currentWithdrawalUSD + (1 - alpha) * xT * portfolioUSD;
            const cap = endowmentGuardrailCap || 0.15;
            newWithdrawalUSD = Math.max(currentWithdrawalUSD * (1 - cap), Math.min(currentWithdrawalUSD * (1 + cap), raw));
        } else {
            newWithdrawalUSD = alpha * currentWithdrawalUSD + (1 - alpha) * targetRate * portfolioUSD;
        }

        // Enforce minimum withdrawal floor (like main app)
        const { useMinimumWithdrawal, minimumWithdrawalBRL, useINSS, currentAge, inssStartAge, inssMonthlyBRL } = this.params;
        const minimumWithdrawalUSD = useMinimumWithdrawal && minimumWithdrawalBRL > 0
            ? (minimumWithdrawalBRL * cumulativeIpcaFactor) / currentFX
            : 0;

        // INSS income for this year
        const ageThisYear = currentAge + year - 1;
        const inssActive = useINSS && inssMonthlyBRL > 0 && ageThisYear >= inssStartAge;
        const annualINSSUSD = inssActive ? (inssMonthlyBRL * 12 * cumulativeIpcaFactor) / currentFX : 0;
        const annualINSSBRL = annualINSSUSD * currentFX;

        const portfolioWithdrawalUSD = Math.max(0, newWithdrawalUSD - annualINSSUSD);
        const effectiveMinimumUSD = Math.max(0, minimumWithdrawalUSD - annualINSSUSD);
        const actualWithdrawalUSD = useMinimumWithdrawal
            ? Math.max(portfolioWithdrawalUSD, effectiveMinimumUSD)
            : portfolioWithdrawalUSD;
        const minimumWasEnforced = useMinimumWithdrawal && minimumWithdrawalBRL > 0
            && actualWithdrawalUSD > portfolioWithdrawalUSD * 1.001;

        const gainRatio = Math.min(0.6, year * 0.06);
        const taxPaid = this.calculateTax(actualWithdrawalUSD, gainRatio, bondAllocation);
        portfolioUSD -= (actualWithdrawalUSD + taxPaid);
        // Formula continues from endowment result (not forced minimum)
        currentWithdrawalUSD = newWithdrawalUSD;

        const drawdown = Math.max(0, 1 - Math.max(0, portfolioUSD) / peakPortfolioUSD);
        const withdrawalBRL = actualWithdrawalUSD * currentFX;
        const portfolioBRL = Math.max(0, portfolioUSD) * currentFX;

        if (portfolioUSD <= 0) {
            history.failed = true; history.failureYear = year;
            history.failureType = 'depletion'; history.failureCause = ['Depleção do portfólio'];
            portfolioUSD = 0;
        }

        history.portfolioUSD.push(portfolioUSD); history.portfolioBRL.push(portfolioBRL);
        history.withdrawalBRL.push(withdrawalBRL); history.withdrawalUSD.push(actualWithdrawalUSD);
        history.recommendedWithdrawalBRL.push(newWithdrawalUSD * currentFX);
        history.fxRate.push(currentFX); history.bondAllocation.push(bondAllocation * 100);
        history.rulesApplied.push(null); history.minimumEnforced.push(minimumWasEnforced);
        const extraWithdrawnBRL = minimumWasEnforced ? (actualWithdrawalUSD - newWithdrawalUSD) * currentFX : 0;
        const percentExtra = minimumWasEnforced && newWithdrawalUSD > 0 ? ((actualWithdrawalUSD - newWithdrawalUSD) / newWithdrawalUSD) * 100 : 0;
        history.yearlyStressData.push({ minimumEnforced: minimumWasEnforced, extraWithdrawn: extraWithdrawnBRL, percentExtra });
        history.withdrawalSource.push('endowment');
        history.capeHistory.push(currentCAPE); history.drawdownHistory.push(drawdown);
        history.inssIncomeBRL.push(annualINSSBRL);
        history.cumulativeIpcaFactor.push(cumulativeIpcaFactor);
    }
    return history;
};

MonteCarloEngine.prototype.computeComparisonMetrics = function(endowmentSims, fixedSims, gkSims) {
    const numSims = endowmentSims.length;
    const years = this.params.years;
    const medianOf = (arr) => { const s = [...arr].filter(v => v > 0).sort((a,b) => a-b); return s.length > 0 ? s[Math.floor(s.length/2)] : 0; };

    const survivalRates = {
        endowment: (endowmentSims.filter(s => !s.failed).length / numSims) * 100,
        fixed: (fixedSims.filter(s => !s.failed).length / numSims) * 100,
        gk: (gkSims.filter(s => !s.failed).length / numSims) * 100
    };
    const simTotalIncome = (s, yr) => (s.withdrawalBRL[yr] || 0) + (s.inssIncomeBRL ? s.inssIncomeBRL[yr] || 0 : 0);
    const withdrawalAtYear = {};
    [5, 10, 20, 30].forEach(yr => {
        if (yr <= years) {
            withdrawalAtYear[`y${yr}`] = {
                endowment: medianOf(endowmentSims.map(s => simTotalIncome(s, yr))),
                fixed: medianOf(fixedSims.map(s => simTotalIncome(s, yr))),
                gk: medianOf(gkSims.map(s => simTotalIncome(s, yr)))
            };
        }
    });
    const getTerminalMedian = (sims) => { const v = sims.map(s => s.portfolioBRL[years] || 0).sort((a,b)=>a-b); return v[Math.floor(v.length/2)] || 0; };
    const getTerminalP10 = (sims) => { const v = sims.map(s => s.portfolioBRL[years] || 0).sort((a,b)=>a-b); return v[Math.floor(v.length*0.10)] || 0; };
    const getCV = (sims) => { const a = sims.flatMap(s => s.withdrawalBRL.filter(w => w > 0)); if (!a.length) return 0; const m = a.reduce((x,y)=>x+y,0)/a.length; return m > 0 ? Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/a.length)/m : 0; };
    const getWorst = (sims) => { const ti = (s,i) => (s.withdrawalBRL[i]||0)+(s.inssIncomeBRL?s.inssIncomeBRL[i]||0:0); const m = sims.map(s => { const v = s.withdrawalBRL.map((_,i)=>ti(s,i)).filter(v=>v>0); return v.length>0 ? Math.min(...v) : Infinity; }).filter(w=>w>0&&isFinite(w)); return m.length>0 ? Math.min(...m) : 0; };

    return {
        survivalRates,
        withdrawalAtYear,
        terminalPortfolio: { endowment: getTerminalMedian(endowmentSims), fixed: getTerminalMedian(fixedSims), gk: getTerminalMedian(gkSims) },
        terminalPortfolioP10: { endowment: getTerminalP10(endowmentSims), fixed: getTerminalP10(fixedSims), gk: getTerminalP10(gkSims) },
        withdrawalVolatility: { endowment: getCV(endowmentSims), fixed: getCV(fixedSims), gk: getCV(gkSims) },
        worstWithdrawal: { endowment: getWorst(endowmentSims), fixed: getWorst(fixedSims), gk: getWorst(gkSims) }
    };
};

MonteCarloEngine.prototype.runMonteCarloComparison = function(iterations) {
    const masterSeed = this.initialSeed;
    const endowmentSims = [], fixedSims = [], gkSims = [];

    const baseCompareParams = {
        ...this.params,
        initialPortfolioBRL: 0,
        useBucketStrategy: false,
        inflation: this.params.expectedIPCA,
        withdrawalRate: this.params.endowmentTargetRate,
        tentInitialBondPercent: this.params.targetBondPercent,
        tentDuration: this.params.years,
        useSequenceConstraint: false
    };

    for (let i = 0; i < iterations; i++) {
        const iterSeed = (masterSeed + i * 1000003) >>> 0;
        endowmentSims.push(new MonteCarloEngine({ ...this.params, seed: iterSeed }).runSimulationEndowment());
        fixedSims.push(new MonteCarloEngine({ ...baseCompareParams, seed: iterSeed, useGuytonKlinger: false }).runSimulation());
        gkSims.push(new MonteCarloEngine({ ...baseCompareParams, seed: iterSeed, useGuytonKlinger: true }).runSimulation());
    }

    const endowmentResults = this.analyzeResults(endowmentSims);
    const fixedResults = this.analyzeResults(fixedSims);
    const gkResults = this.analyzeResults(gkSims);

    const yr10 = Math.min(10, this.params.years);
    const year10Withdrawals = {
        endowment: endowmentSims.map(s => s.withdrawalBRL[yr10] || 0).filter(w => w > 0),
        fixed: fixedSims.map(s => s.withdrawalBRL[yr10] || 0).filter(w => w > 0),
        gk: gkSims.map(s => s.withdrawalBRL[yr10] || 0).filter(w => w > 0)
    };

    const capePercentiles = { p10: [], p50: [], p90: [] };
    for (let yr = 0; yr <= this.params.years; yr++) {
        const vals = endowmentSims.map(s => (s.capeHistory && s.capeHistory[yr]) || (this.params.initialCAPE || 22)).sort((a,b) => a-b);
        const n = vals.length;
        capePercentiles.p10.push(vals[Math.floor(n * 0.10)]);
        capePercentiles.p50.push(vals[Math.floor(n * 0.50)]);
        capePercentiles.p90.push(vals[Math.floor(n * 0.90)]);
    }

    return {
        endowment: endowmentResults, fixed: fixedResults, gk: gkResults,
        comparisonMetrics: this.computeComparisonMetrics(endowmentSims, fixedSims, gkSims),
        capePercentiles, year10Withdrawals, seed: masterSeed, years: this.params.years
    };
};
