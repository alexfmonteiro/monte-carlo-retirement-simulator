class MonteCarloEngine {
    constructor(params) {
        this.params = params;
        // Initialize RNG: use provided seed or generate random seed
        const seed =
            params.seed !== undefined
                ? params.seed
                : Math.floor(Math.random() * 2147483647);
        this.rng = new SeededRNG(seed);
        this.initialSeed = seed;
    }

    // Get the seed used for this engine (for reproducibility)
    getSeed() {
        return this.initialSeed;
    }

    // Uniform random in [0, 1) - uses seeded RNG
    random() {
        return this.rng.next();
    }

    // Box-Muller transform for normal distribution
    randomNormal(mean = 0, std = 1) {
        const u1 = this.random();
        const u2 = this.random();
        const z0 =
            Math.sqrt(-2.0 * Math.log(u1)) *
            Math.cos(2.0 * Math.PI * u2);
        return z0 * std + mean;
    }

    // Generate random number from Student's T distribution (fatter tails)
    randomStudentT(mean, std, df) {
        // Generate T-distributed random variable
        // T = Z / sqrt(V/df) where Z ~ N(0,1) and V ~ Chi-squared(df)
        const z = this.randomNormal(0, 1);

        // Generate chi-squared by summing df squared normals
        let chiSquared = 0;
        for (let i = 0; i < df; i++) {
            const n = this.randomNormal(0, 1);
            chiSquared += n * n;
        }

        // Scale factor to match desired volatility
        // T-distribution has variance df/(df-2), so we adjust
        const scaleFactor = df > 2 ? Math.sqrt((df - 2) / df) : 1;
        const t = (z / Math.sqrt(chiSquared / df)) * scaleFactor;

        return mean + std * t;
    }

    // Generate return with appropriate distribution
    generateReturn(mean, std) {
        if (this.params.useStudentT) {
            return this.randomStudentT(
                mean,
                std,
                this.params.degreesOfFreedom,
            );
        }
        return this.randomNormal(mean, std);
    }

    // Generate IPCA for the year (correlated with economic conditions)
    generateIPCA(equityReturn) {
        if (!this.params.useIPCAModel) {
            return this.params.inflation / 100;
        }

        // IPCA tends to be higher during economic stress (negative equity returns)
        const baseIPCA = this.params.expectedIPCA / 100;
        const ipcaVol = this.params.ipcaVolatility / 100;

        // Slight negative correlation with equity (-0.2)
        const equityMean = this.params.equityReturn / 100;
        const equityVol = this.params.equityVolatility / 100;
        const correlatedShock =
            (-0.2 * (equityReturn - equityMean)) / equityVol;
        const randomShock = this.randomNormal(0, ipcaVol);

        // IPCA bounded between 0% and 15%
        const ipca = Math.max(
            0,
            Math.min(
                0.15,
                baseIPCA + correlatedShock * ipcaVol + randomShock,
            ),
        );
        return ipca;
    }

    // Calculate bond return as IPCA + Real Spread
    generateBondReturn(ipca) {
        if (!this.params.useIPCAModel) {
            return this.generateReturn(
                this.params.bondReturn / 100,
                this.params.bondVolatility / 100,
            );
        }

        // Real spread varies slightly around target
        const realSpread = this.params.realSpread / 100;
        const spreadVariation = this.randomNormal(0, 0.005); // ±0.5% variation

        // Nominal return = IPCA + Real Spread + small random component
        return ipca + realSpread + spreadVariation;
    }

    // Calculate dynamic correlation based on market stress
    getDynamicCorrelation(equityReturn) {
        if (!this.params.useDynamicCorrelation) {
            return this.params.baseCorrelation;
        }

        const baseCorr = this.params.baseCorrelation;
        const stressMult = this.params.stressCorrelationMultiplier;
        const equityMean = this.params.equityReturn / 100;
        const equityVol = this.params.equityVolatility / 100;

        // Measure stress: how many std devs below mean
        const zScore = (equityReturn - equityMean) / equityVol;

        if (zScore < -1) {
            // Stress scenario: correlation becomes more negative (flight to USD)
            const stressFactor =
                Math.min(Math.abs(zScore) - 1, 2) / 2;
            return Math.max(
                -0.9,
                baseCorr * (1 + stressFactor * (stressMult - 1)),
            );
        } else if (zScore > 1) {
            // Boom scenario: correlation weakens (moves toward 0)
            const boomFactor = Math.min(zScore - 1, 2) / 2;
            return baseCorr * (1 - boomFactor * 0.5);
        }

        return baseCorr;
    }

    // Calculate tax on withdrawal
    calculateTax(withdrawalUSD, gainRatio, bondAllocation) {
        if (!this.params.useTaxModel) {
            return 0;
        }

        // Estimate gains vs principal
        const equityWithdrawal =
            withdrawalUSD * (1 - bondAllocation);
        const bondWithdrawal = withdrawalUSD * bondAllocation;

        // Tax on equity gains (Irish ETFs: 15% on gains only)
        const equityTax =
            equityWithdrawal *
            gainRatio *
            (this.params.equityTaxRate / 100);

        // Tax on fixed income (simplified: 15% on income portion)
        const bondTax =
            bondWithdrawal *
            gainRatio *
            (this.params.fixedIncomeTaxRate / 100);

        return equityTax + bondTax;
    }

    // Generate correlated random returns
    generateCorrelatedReturns(correlation) {
        const z1 = this.randomNormal();
        const z2 = this.randomNormal();
        const correlatedZ2 =
            correlation * z1 +
            Math.sqrt(1 - correlation * correlation) * z2;
        return [z1, correlatedZ2];
    }

    // Simulate currency dynamics with dynamic correlation
    simulateCurrency(equityReturn, baseFX, volatilityFX = 0.15) {
        // Get dynamic correlation based on market stress
        const correlation =
            this.getDynamicCorrelation(equityReturn);
        const [_, fxShock] =
            this.generateCorrelatedReturns(correlation);

        // Mean reversion component
        const meanFX = this.params.initialFX;
        const reversionSpeed = 0.1;
        const drift = (reversionSpeed * (meanFX - baseFX)) / meanFX;

        // Stronger FX move when equity is negative
        const stressMultiplier = equityReturn < 0 ? 1.3 : 1.0;
        const fxReturn =
            drift + fxShock * volatilityFX * stressMultiplier;

        return baseFX * (1 + fxReturn);
    }

    // Apply Guyton-Klinger rules
    // IMPORTANT: Rules are MUTUALLY EXCLUSIVE - only one adjustment rule can apply per year
    // Priority: 1) Inflation skip (if enabled), 2) Preservation (portfolio stress), 3) Prosperity (portfolio growth)
    applyGuytonKlinger(
        currentWithdrawal,
        portfolioValue,
        initialWithdrawalRate,
        previousReturn,
        inflation,
    ) {
        const {
            useGuytonKlinger,
            preservationThreshold,
            prosperityThreshold,
            adjustmentPercent,
            applyInflationRule,
        } = this.params;

        // If GK disabled, just apply flat inflation adjustment
        if (!useGuytonKlinger) {
            return {
                withdrawal: currentWithdrawal * (1 + inflation),
                ruleApplied: null,
                inflationApplied: true,
            };
        }

        const currentRate = currentWithdrawal / portfolioValue;

        let newWithdrawal = currentWithdrawal;
        let ruleApplied = null;
        let inflationApplied = true;

        // Inflation Rule: Don't adjust for inflation if previous year return was negative
        if (applyInflationRule && previousReturn < 0) {
            // Skip inflation adjustment
            ruleApplied = "inflation_skip";
            inflationApplied = false;
        } else {
            newWithdrawal *= 1 + inflation;
        }

        // Preservation Rule: If current rate > initial rate * (1 + threshold), reduce
        // Note: Uses currentRate (before inflation adjustment) to determine trigger
        if (
            currentRate >
            initialWithdrawalRate * (1 + preservationThreshold)
        ) {
            newWithdrawal *= 1 - adjustmentPercent;
            ruleApplied = "preservation";
        }
        // Prosperity Rule: ELSE IF current rate < initial rate * (1 - threshold), increase
        // Mutually exclusive with preservation - only one can apply per year
        else if (
            currentRate <
            initialWithdrawalRate * (1 - prosperityThreshold)
        ) {
            newWithdrawal *= 1 + adjustmentPercent;
            ruleApplied = "prosperity";
        }

        return {
            withdrawal: newWithdrawal,
            ruleApplied,
            inflationApplied,
        };
    }

    // Run single simulation path
    runSimulation() {
        const {
            initialPortfolioUSD,
            initialPortfolioBRL,
            initialFX,
            withdrawalRate,
            equityReturn,
            equityVolatility,
            bondReturn,
            bondVolatility,
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

        // USD portfolio (equity + bonds, subject to FX variation)
        let portfolioUSD = initialPortfolioUSD;
        let currentFX = initialFX;

        // BRL portfolio (Brazilian fixed income, no FX exposure)
        let portfolioBRLFixed = initialPortfolioBRL;

        // Total portfolio in BRL
        let portfolioBRL =
            portfolioUSD * currentFX + portfolioBRLFixed;

        // Initial allocation for USD portfolio only
        let bondAllocation = tentInitialBondPercent / 100;
        let equityAllocation = 1 - bondAllocation;

        // Separate tracking for USD portfolio (bucket strategy applies here)
        let bondPortionUSD = portfolioUSD * bondAllocation;
        let equityPortionUSD = portfolioUSD * equityAllocation;

        // Initial withdrawal calculated on total portfolio in BRL
        const totalInitialPortfolioBRL =
            portfolioUSD * initialFX + initialPortfolioBRL;
        const initialWithdrawalBRL =
            totalInitialPortfolioBRL * (withdrawalRate / 100);
        let currentWithdrawalUSD = initialWithdrawalBRL / initialFX;
        const initialWithdrawalRate = withdrawalRate / 100;

        let previousReturn = 0;
        let cumulativeIpcaFactor = 1.0;

        // Track consecutive negative returns for constraint
        let consecutiveNegativeYears = 0;

        // Stress period tracking (now: when minimum withdrawal was enforced)
        let inStressPeriod = false;
        let currentStressStart = null;
        let currentStressExtraWithdrawn = 0; // Extra amount withdrawn above recommended

        const history = {
            portfolioUSD: [portfolioUSD],
            portfolioBRL: [portfolioBRL],
            withdrawalBRL: [currentWithdrawalUSD * currentFX],
            withdrawalUSD: [currentWithdrawalUSD],
            recommendedWithdrawalBRL: [
                currentWithdrawalUSD * currentFX,
            ], // What G-K would have recommended
            fxRate: [currentFX],
            bondAllocation: [bondAllocation * 100],
            rulesApplied: [null],
            minimumEnforced: [false], // Track when minimum was enforced
            failed: false,
            failureYear: null,
            failureType: null,
            failureCause: null,
            // Stress tracking (periods where minimum withdrawal was enforced)
            stressPeriods: [], // Array of {startYear, endYear, duration, totalExtraWithdrawn, recovered}
            yearlyStressData: [
                {
                    minimumEnforced: false,
                    extraWithdrawn: 0,
                    percentExtra: 0,
                },
            ],
            withdrawalSource: ["initial"],
            inssIncomeBRL: [0],
        };

        for (let year = 1; year <= years; year++) {
            // Check if already failed
            if (history.failed) {
                // Pad remaining years
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
                continue;
            }

            // Generate equity return with appropriate distribution (Normal or Student's T)
            let equityReturnYear = this.generateReturn(
                equityReturn / 100,
                equityVolatility / 100,
            );

            // Apply constraint on consecutive negative returns (NON-IID MODE)
            // WARNING: This constraint breaks the IID assumption of pure Monte Carlo
            // Only enabled if useSequenceConstraint is true
            if (this.params.useSequenceConstraint) {
                if (equityReturnYear < 0) {
                    consecutiveNegativeYears++;
                    // If we've hit the max negative sequence, force a positive/neutral return
                    if (
                        consecutiveNegativeYears >=
                        this.params.maxNegativeSequence
                    ) {
                        // Generate a modest positive return (0% to +10%) using seeded RNG
                        equityReturnYear = this.random() * 0.1;
                        consecutiveNegativeYears = 0; // Reset counter
                    }
                } else {
                    consecutiveNegativeYears = 0; // Reset counter on positive year
                }
            }

            // Generate IPCA for the year (correlated with equity if using IPCA model)
            const ipcaYear = this.generateIPCA(equityReturnYear);
            cumulativeIpcaFactor *= (1 + ipcaYear);

            // Generate bond return (IPCA + Real Spread if using IPCA model)
            const bondReturnYear =
                this.generateBondReturn(ipcaYear);

            // Apply returns to BRL portfolio (Brazilian fixed income, no FX exposure)
            portfolioBRLFixed *= 1 + bondReturnYear;

            // Update FX with dynamic correlation (only affects USD portfolio)
            currentFX = this.simulateCurrency(
                equityReturnYear,
                currentFX,
            );

            // Calculate gain ratio for tax purposes (estimate based on years invested)
            const gainRatio = Math.min(0.6, year * 0.06);

            // Calculate minimum withdrawal in USD for this year
            const minimumWithdrawalUSD =
                useMinimumWithdrawal && minimumWithdrawalBRL > 0
                    ? minimumWithdrawalBRL / currentFX
                    : 0;

            // INSS income for this year
            const ageThisYear = currentAge + year - 1;
            const inssActive = useINSS && inssMonthlyBRL > 0 && ageThisYear >= inssStartAge;
            const annualINSSUSD = inssActive ? (inssMonthlyBRL * 12 * cumulativeIpcaFactor) / currentFX : 0;
            const annualINSSBRL = annualINSSUSD * currentFX;

            // Bucket Strategy: In bucket years, withdrawals come from bonds only
            let withdrawalSource = "mixed";
            let recommendedWithdrawalUSD = currentWithdrawalUSD;
            let actualWithdrawalUSD = currentWithdrawalUSD;
            let portfolioWithdrawalUSD = currentWithdrawalUSD;
            let gkRuleApplied = null;
            let taxPaid = 0;

            if (useBucketStrategy && year <= bucketYears) {
                // Apply returns to each portion separately
                equityPortionUSD *= 1 + equityReturnYear;
                bondPortionUSD *= 1 + bondReturnYear;

                withdrawalSource = "bonds";

                // Apply Guyton-Klinger rules to get recommended withdrawal
                const totalPortfolioUSD =
                    equityPortionUSD + bondPortionUSD;
                const gkResult = this.applyGuytonKlinger(
                    currentWithdrawalUSD,
                    totalPortfolioUSD,
                    initialWithdrawalRate,
                    previousReturn,
                    inflation / 100,
                );
                recommendedWithdrawalUSD = gkResult.withdrawal;
                gkRuleApplied = gkResult.ruleApplied;

                // ENFORCE MINIMUM: INSS reduces portfolio withdrawal; minimum applies to portfolio portion
                portfolioWithdrawalUSD = Math.max(0, recommendedWithdrawalUSD - annualINSSUSD);
                const effectiveMinimumUSD_b = Math.max(0, minimumWithdrawalUSD - annualINSSUSD);
                actualWithdrawalUSD = useMinimumWithdrawal
                    ? Math.max(portfolioWithdrawalUSD, effectiveMinimumUSD_b)
                    : portfolioWithdrawalUSD;

                // Calculate tax on withdrawal
                taxPaid = this.calculateTax(
                    actualWithdrawalUSD,
                    gainRatio,
                    bondAllocation,
                );

                // Total withdrawal including tax
                const totalWithdrawalUSD =
                    actualWithdrawalUSD + taxPaid;

                // Withdraw from bonds (including tax)
                bondPortionUSD -= totalWithdrawalUSD;

                // If bonds depleted, take from equity
                if (bondPortionUSD < 0) {
                    equityPortionUSD += bondPortionUSD;
                    bondPortionUSD = 0;
                    withdrawalSource = "equity_forced";
                }

                portfolioUSD = equityPortionUSD + bondPortionUSD;

                // Recalculate allocation
                bondAllocation =
                    portfolioUSD > 0
                        ? bondPortionUSD / portfolioUSD
                        : 0;
                equityAllocation = 1 - bondAllocation;

                // Update current withdrawal for next iteration (use recommended, not forced)
                currentWithdrawalUSD = recommendedWithdrawalUSD;
            } else {
                // Standard strategy: Tent/Glidepath with mixed withdrawals

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

                // Calculate portfolio return
                const portfolioReturn =
                    equityAllocation * equityReturnYear +
                    bondAllocation * bondReturnYear;

                // Apply return to portfolio (before withdrawal)
                portfolioUSD *= 1 + portfolioReturn;

                // Update portions for tracking
                bondPortionUSD = portfolioUSD * bondAllocation;
                equityPortionUSD = portfolioUSD * equityAllocation;

                // REBALANCING LOGIC: If equity performed very well, withdraw from equity to rebalance
                // This helps maintain target allocation and avoids depleting fixed income unnecessarily
                const currentEquityPercent =
                    equityPortionUSD / portfolioUSD;
                const targetEquityPercent = equityAllocation;
                const rebalanceThreshold = 0.1; // 10% above target triggers equity withdrawal

                let preferEquityWithdrawal = false;
                if (
                    equityReturnYear > 0.15 &&
                    currentEquityPercent >
                        targetEquityPercent + rebalanceThreshold
                ) {
                    // Equity had a great year (>15%) and is significantly above target allocation
                    preferEquityWithdrawal = true;
                    withdrawalSource = "equity_rebalance";
                }

                // Apply Guyton-Klinger rules to get recommended withdrawal
                const gkResult = this.applyGuytonKlinger(
                    currentWithdrawalUSD,
                    portfolioUSD,
                    initialWithdrawalRate,
                    previousReturn,
                    inflation / 100,
                );
                recommendedWithdrawalUSD = gkResult.withdrawal;
                gkRuleApplied = gkResult.ruleApplied;

                // ENFORCE MINIMUM: INSS reduces portfolio withdrawal; minimum applies to portfolio portion
                portfolioWithdrawalUSD = Math.max(0, recommendedWithdrawalUSD - annualINSSUSD);
                const effectiveMinimumUSD_s = Math.max(0, minimumWithdrawalUSD - annualINSSUSD);
                actualWithdrawalUSD = useMinimumWithdrawal
                    ? Math.max(portfolioWithdrawalUSD, effectiveMinimumUSD_s)
                    : portfolioWithdrawalUSD;

                // Calculate tax on withdrawal
                taxPaid = this.calculateTax(
                    actualWithdrawalUSD,
                    gainRatio,
                    bondAllocation,
                );

                // Total withdrawal including tax
                const totalWithdrawalUSD =
                    actualWithdrawalUSD + taxPaid;

                // Make withdrawal - prioritize equity if rebalancing
                if (preferEquityWithdrawal) {
                    // Withdraw from equity first to rebalance
                    const maxEquityWithdrawal = Math.max(
                        0,
                        equityPortionUSD -
                            portfolioUSD * targetEquityPercent,
                    );
                    const equityWithdrawal = Math.min(
                        totalWithdrawalUSD,
                        maxEquityWithdrawal,
                    );
                    const bondWithdrawal =
                        totalWithdrawalUSD - equityWithdrawal;

                    equityPortionUSD -= equityWithdrawal;
                    bondPortionUSD -= bondWithdrawal;
                    portfolioUSD =
                        equityPortionUSD + bondPortionUSD;
                } else {
                    // Standard proportional withdrawal
                    portfolioUSD -= totalWithdrawalUSD;
                }

                // Update current withdrawal for next iteration (use recommended, not forced)
                currentWithdrawalUSD = recommendedWithdrawalUSD;

                previousReturn = portfolioReturn;
            }

            // Calculate values in BRL
            const actualWithdrawalBRL =
                actualWithdrawalUSD * currentFX;
            const recommendedWithdrawalBRL =
                recommendedWithdrawalUSD * currentFX;

            // Check if minimum was enforced (stress condition)
            const minimumWasEnforced =
                useMinimumWithdrawal &&
                minimumWithdrawalBRL > 0 &&
                actualWithdrawalUSD >
                    portfolioWithdrawalUSD * 1.001; // Small tolerance for float comparison

            const extraWithdrawnBRL = minimumWasEnforced
                ? actualWithdrawalBRL - recommendedWithdrawalBRL
                : 0;
            const percentExtra =
                minimumWasEnforced && recommendedWithdrawalBRL > 0
                    ? (extraWithdrawnBRL /
                          recommendedWithdrawalBRL) *
                      100
                    : 0;

            history.yearlyStressData.push({
                minimumEnforced: minimumWasEnforced,
                extraWithdrawn: extraWithdrawnBRL,
                percentExtra,
            });

            // Track stress periods (when minimum withdrawal was enforced)
            if (minimumWasEnforced && !inStressPeriod) {
                // Starting a new stress period
                inStressPeriod = true;
                currentStressStart = year;
                currentStressExtraWithdrawn = extraWithdrawnBRL;
            } else if (minimumWasEnforced && inStressPeriod) {
                // Continuing stress period
                currentStressExtraWithdrawn += extraWithdrawnBRL;
            } else if (!minimumWasEnforced && inStressPeriod) {
                // Ending stress period - market recovered
                history.stressPeriods.push({
                    startYear: currentStressStart,
                    endYear: year - 1,
                    duration: year - currentStressStart,
                    totalExtraWithdrawn:
                        currentStressExtraWithdrawn,
                    recovered: true,
                    recoveryYear: year,
                });
                inStressPeriod = false;
                currentStressStart = null;
                currentStressExtraWithdrawn = 0;
            }

            // Check for failure (portfolio depleted)
            if (portfolioUSD <= 0) {
                // Close any open stress period
                if (inStressPeriod) {
                    history.stressPeriods.push({
                        startYear: currentStressStart,
                        endYear: year,
                        duration: year - currentStressStart + 1,
                        totalExtraWithdrawn:
                            currentStressExtraWithdrawn +
                            extraWithdrawnBRL,
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
            }

            // Update BRL values (USD portfolio converted + BRL fixed income)
            portfolioBRL =
                portfolioUSD * currentFX + portfolioBRLFixed;

            // Store history
            history.portfolioUSD.push(portfolioUSD);
            history.portfolioBRL.push(portfolioBRL);
            history.withdrawalBRL.push(actualWithdrawalBRL);
            history.withdrawalUSD.push(actualWithdrawalUSD);
            history.recommendedWithdrawalBRL.push(
                recommendedWithdrawalBRL,
            );
            history.fxRate.push(currentFX);
            history.bondAllocation.push(bondAllocation * 100);
            history.rulesApplied.push(gkRuleApplied);
            history.minimumEnforced.push(minimumWasEnforced);
            history.withdrawalSource.push(withdrawalSource);
            history.inssIncomeBRL.push(annualINSSBRL);
        }

        // Close any open stress period at end of simulation
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

    analyzeFailure(
        prevReturn,
        currentReturn,
        fx,
        bondAlloc,
        minimumEnforced,
    ) {
        const causes = [];
        if (minimumEnforced)
            causes.push("Saque mínimo forçado acelerou depleção");
        if (prevReturn < -0.15)
            causes.push("Queda severa no ano anterior");
        if (currentReturn < -0.2) causes.push("Crash de mercado");
        if (fx > this.params.initialFX * 1.3)
            causes.push("Desvalorização cambial extrema");
        if (bondAlloc < 0.15)
            causes.push("Baixa proteção em renda fixa");
        return causes.length > 0
            ? causes
            : ["Sequência prolongada de retornos negativos"];
    }

    // Run full Monte Carlo simulation
    runMonteCarlo(iterations) {
        const results = [];

        for (let i = 0; i < iterations; i++) {
            results.push(this.runSimulation());
        }

        return this.analyzeResults(results);
    }

    analyzeResults(simulations) {
        const years = this.params.years;
        const numSims = simulations.length;
        const { minimumWithdrawalBRL, useMinimumWithdrawal } =
            this.params;

        // Calculate percentiles for each year
        const percentiles = {
            p10: [],
            p25: [],
            p50: [],
            p75: [],
            p90: [],
        };

        const withdrawalPercentiles = {
            p10: [],
            p25: [],
            p50: [],
            p75: [],
            p90: [],
        };

        // Track mean withdrawals per year
        const withdrawalMeans = [];
        const withdrawalMedians = [];
        const inssIncomeMeans = [];

        // Track recommended vs actual withdrawal
        const recommendedWithdrawalMeans = [];

        // Stress chart data (% extra withdrawn above recommended by year)
        const stressChartData = {
            p10: [],
            p25: [],
            p50: [],
            p75: [],
            p90: [],
            mean: [],
            percentMinimumEnforced: [], // % of simulations where minimum was enforced each year
        };

        for (let year = 0; year <= years; year++) {
            const portfolioValues = simulations
                .map((s) => s.portfolioBRL[year] || 0)
                .sort((a, b) => a - b);

            const withdrawalValues = simulations
                .map((s) => s.withdrawalBRL[year] || 0)
                .sort((a, b) => a - b);

            // Filter out zero withdrawals for mean calculation (failed scenarios)
            const nonZeroWithdrawals = withdrawalValues.filter(
                (w) => w > 0,
            );

            // Recommended withdrawals (what G-K would have suggested)
            const recommendedValues = simulations
                .map((s) =>
                    s.recommendedWithdrawalBRL
                        ? s.recommendedWithdrawalBRL[year] || 0
                        : 0,
                )
                .filter((w) => w > 0);

            percentiles.p10.push(
                portfolioValues[Math.floor(numSims * 0.1)],
            );
            percentiles.p25.push(
                portfolioValues[Math.floor(numSims * 0.25)],
            );
            percentiles.p50.push(
                portfolioValues[Math.floor(numSims * 0.5)],
            );
            percentiles.p75.push(
                portfolioValues[Math.floor(numSims * 0.75)],
            );
            percentiles.p90.push(
                portfolioValues[Math.floor(numSims * 0.9)],
            );

            withdrawalPercentiles.p10.push(
                withdrawalValues[Math.floor(numSims * 0.1)],
            );
            withdrawalPercentiles.p25.push(
                withdrawalValues[Math.floor(numSims * 0.25)],
            );
            withdrawalPercentiles.p50.push(
                withdrawalValues[Math.floor(numSims * 0.5)],
            );
            withdrawalPercentiles.p75.push(
                withdrawalValues[Math.floor(numSims * 0.75)],
            );
            withdrawalPercentiles.p90.push(
                withdrawalValues[Math.floor(numSims * 0.9)],
            );

            // Calculate mean and median
            const mean =
                nonZeroWithdrawals.length > 0
                    ? nonZeroWithdrawals.reduce(
                          (a, b) => a + b,
                          0,
                      ) / nonZeroWithdrawals.length
                    : 0;
            const median =
                nonZeroWithdrawals.length > 0
                    ? nonZeroWithdrawals[
                          Math.floor(nonZeroWithdrawals.length / 2)
                      ]
                    : 0;

            withdrawalMeans.push(mean);
            withdrawalMedians.push(median);

            const inssValues = simulations.map(s => (s.inssIncomeBRL ? s.inssIncomeBRL[year] || 0 : 0));
            inssIncomeMeans.push(inssValues.reduce((a, b) => a + b, 0) / inssValues.length);

            // Recommended withdrawal mean
            const recommendedMean =
                recommendedValues.length > 0
                    ? recommendedValues.reduce((a, b) => a + b, 0) /
                      recommendedValues.length
                    : 0;
            recommendedWithdrawalMeans.push(recommendedMean);

            // Stress data (% extra withdrawn)
            if (useMinimumWithdrawal && minimumWithdrawalBRL > 0) {
                const percentExtraValues = simulations
                    .map(
                        (s) =>
                            s.yearlyStressData[year]
                                ?.percentExtra || 0,
                    )
                    .sort((a, b) => a - b);

                const minimumEnforcedCount = simulations.filter(
                    (s) =>
                        s.yearlyStressData[year]?.minimumEnforced,
                ).length;

                stressChartData.p10.push(
                    percentExtraValues[Math.floor(numSims * 0.1)],
                );
                stressChartData.p25.push(
                    percentExtraValues[Math.floor(numSims * 0.25)],
                );
                stressChartData.p50.push(
                    percentExtraValues[Math.floor(numSims * 0.5)],
                );
                stressChartData.p75.push(
                    percentExtraValues[Math.floor(numSims * 0.75)],
                );
                stressChartData.p90.push(
                    percentExtraValues[Math.floor(numSims * 0.9)],
                );
                stressChartData.mean.push(
                    percentExtraValues.reduce((a, b) => a + b, 0) /
                        numSims,
                );
                stressChartData.percentMinimumEnforced.push(
                    (minimumEnforcedCount / numSims) * 100,
                );
            }
        }

        // ==========================================
        // STRESS ANALYSIS (Options A, B, C, D, E)
        // ==========================================

        // Collect all stress periods from all simulations
        const allStressPeriods = simulations.flatMap(
            (s) => s.stressPeriods,
        );

        // Option A: Duration analysis
        const stressDurations = allStressPeriods.map(
            (sp) => sp.duration,
        );
        stressDurations.sort((a, b) => a - b);

        const durationAnalysis = {
            count: allStressPeriods.length,
            simsWithStress: simulations.filter(
                (s) => s.stressPeriods.length > 0,
            ).length,
            avgDuration:
                stressDurations.length > 0
                    ? stressDurations.reduce((a, b) => a + b, 0) /
                      stressDurations.length
                    : 0,
            medianDuration:
                stressDurations.length > 0
                    ? stressDurations[
                          Math.floor(stressDurations.length / 2)
                      ]
                    : 0,
            maxDuration:
                stressDurations.length > 0
                    ? Math.max(...stressDurations)
                    : 0,
            minDuration:
                stressDurations.length > 0
                    ? Math.min(...stressDurations)
                    : 0,
            // Distribution: count of periods by duration
            distribution: {},
        };

        // Build duration distribution
        stressDurations.forEach((d) => {
            durationAnalysis.distribution[d] =
                (durationAnalysis.distribution[d] || 0) + 1;
        });

        // Option B: Tolerance-based success rates
        // Now tolerance means: "I can tolerate having to withdraw the minimum for X years"
        const toleranceSuccessRates = [];
        for (let tolerance = 0; tolerance <= 10; tolerance++) {
            // A simulation "succeeds" with this tolerance if:
            // - It didn't fail by depletion, AND
            // - Total years where minimum was enforced <= tolerance
            const successCount = simulations.filter((s) => {
                if (s.failed && s.failureType === "depletion")
                    return false;
                const totalStressYears = s.stressPeriods.reduce(
                    (sum, sp) => sum + sp.duration,
                    0,
                );
                return totalStressYears <= tolerance;
            }).length;

            toleranceSuccessRates.push({
                tolerance,
                successRate: (successCount / numSims) * 100,
                successCount,
            });
        }

        // Option C: Extra withdrawal analysis (how much more was withdrawn than recommended)
        const allExtraWithdrawn = allStressPeriods.map(
            (sp) => sp.totalExtraWithdrawn,
        );
        allExtraWithdrawn.sort((a, b) => a - b);

        // This represents the "cost" of maintaining minimum lifestyle during stress
        const extraWithdrawalAnalysis = {
            avgExtra:
                allExtraWithdrawn.length > 0
                    ? allExtraWithdrawn.reduce((a, b) => a + b, 0) /
                      allExtraWithdrawn.length
                    : 0,
            medianExtra:
                allExtraWithdrawn.length > 0
                    ? allExtraWithdrawn[
                          Math.floor(allExtraWithdrawn.length / 2)
                      ]
                    : 0,
            maxExtra:
                allExtraWithdrawn.length > 0
                    ? Math.max(...allExtraWithdrawn)
                    : 0,
            // Impact on portfolio by percentile
            impactTable: [],
        };

        // Calculate total extra withdrawn per simulation (total portfolio impact)
        const simTotalExtra = simulations
            .map((s) =>
                s.stressPeriods.reduce(
                    (sum, sp) => sum + sp.totalExtraWithdrawn,
                    0,
                ),
            )
            .sort((a, b) => a - b);

        [50, 60, 70, 80, 90, 95, 99].forEach((percentile) => {
            const idx = Math.floor((numSims * percentile) / 100);
            extraWithdrawalAnalysis.impactTable.push({
                percentile,
                extraWithdrawn: simTotalExtra[idx] || 0,
            });
        });

        // Option E: Recovery analysis
        const recoveredPeriods = allStressPeriods.filter(
            (sp) => sp.recovered,
        );
        const unrecoveredPeriods = allStressPeriods.filter(
            (sp) => !sp.recovered,
        );

        const recoveryAnalysis = {
            totalPeriods: allStressPeriods.length,
            recoveredCount: recoveredPeriods.length,
            unrecoveredCount: unrecoveredPeriods.length,
            recoveryRate:
                allStressPeriods.length > 0
                    ? (recoveredPeriods.length /
                          allStressPeriods.length) *
                      100
                    : 100,
            avgRecoveryTime:
                recoveredPeriods.length > 0
                    ? recoveredPeriods.reduce(
                          (sum, sp) => sum + sp.duration,
                          0,
                      ) / recoveredPeriods.length
                    : 0,
            // Distribution of recovery times
            recoveryTimeDistribution: {},
        };

        recoveredPeriods.forEach((sp) => {
            const time = sp.duration;
            recoveryAnalysis.recoveryTimeDistribution[time] =
                (recoveryAnalysis.recoveryTimeDistribution[time] ||
                    0) + 1;
        });

        // Stress periods by starting year (to see when stress typically occurs)
        const stressByStartYear = {};
        allStressPeriods.forEach((sp) => {
            stressByStartYear[sp.startYear] =
                (stressByStartYear[sp.startYear] || 0) + 1;
        });

        // Total years of stress across all simulations
        const totalStressYearsPerSim = simulations.map(
            (s) =>
                s.yearlyStressData.filter((y) => y.minimumEnforced)
                    .length,
        );
        const avgStressYearsPerSim =
            totalStressYearsPerSim.reduce((a, b) => a + b, 0) /
            numSims;

        // ==========================================
        // ORIGINAL METRICS
        // ==========================================

        // Survival rate (portfolio depletion)
        const survived = simulations.filter(
            (s) => !s.failed,
        ).length;
        const survivalRate = (survived / numSims) * 100;

        // Failure count
        const failedByDepletion = simulations.filter(
            (s) => s.failed && s.failureType === "depletion",
        ).length;

        // Total income per year = portfolio withdrawal + INSS (what the user actually receives)
        const totalIncome = (s, i) =>
            (s.withdrawalBRL[i] || 0) + (s.inssIncomeBRL ? s.inssIncomeBRL[i] || 0 : 0);

        // Worst case total income (excluding zero-income years from failed scenarios)
        const allMinWithdrawals = simulations
            .map((s) => {
                const incomes = s.withdrawalBRL.map((_, i) => totalIncome(s, i)).filter((v) => v > 0);
                return incomes.length > 0 ? Math.min(...incomes) : Infinity;
            })
            .filter((w) => w > 0 && isFinite(w));
        const worstWithdrawal =
            allMinWithdrawals.length > 0
                ? Math.min(...allMinWithdrawals)
                : 0;

        // Best and median final portfolio
        const finalPortfolios = simulations.map(
            (s) => s.portfolioBRL[s.portfolioBRL.length - 1],
        );
        finalPortfolios.sort((a, b) => a - b);
        const medianFinal =
            finalPortfolios[Math.floor(numSims * 0.5)];
        const bestFinal = finalPortfolios[numSims - 1];

        // Average total income across all years and simulations (excluding zeros)
        const allWithdrawals = simulations.flatMap((s) =>
            s.withdrawalBRL.map((_, i) => totalIncome(s, i)).filter((v) => v > 0),
        );
        allWithdrawals.sort((a, b) => a - b);
        const overallMeanWithdrawal =
            allWithdrawals.length > 0
                ? allWithdrawals.reduce((a, b) => a + b, 0) /
                  allWithdrawals.length
                : 0;
        const overallMedianWithdrawal =
            allWithdrawals.length > 0
                ? allWithdrawals[
                      Math.floor(allWithdrawals.length / 2)
                  ]
                : 0;

        // Withdrawal stats by period (early, mid, late)
        const earlyYears = Math.floor(years / 3);
        const midYears = Math.floor((2 * years) / 3);

        const earlyWithdrawals = simulations.flatMap((s) =>
            s.withdrawalBRL
                .slice(0, earlyYears)
                .map((_, i) => totalIncome(s, i))
                .filter((v) => v > 0),
        );
        const midWithdrawals = simulations.flatMap((s) =>
            s.withdrawalBRL
                .slice(earlyYears, midYears)
                .map((_, i) => totalIncome(s, earlyYears + i))
                .filter((v) => v > 0),
        );
        const lateWithdrawals = simulations.flatMap((s) =>
            s.withdrawalBRL
                .slice(midYears)
                .map((_, i) => totalIncome(s, midYears + i))
                .filter((v) => v > 0),
        );

        const periodStats = {
            early: {
                mean:
                    earlyWithdrawals.length > 0
                        ? earlyWithdrawals.reduce(
                              (a, b) => a + b,
                              0,
                          ) / earlyWithdrawals.length
                        : 0,
                median:
                    earlyWithdrawals.length > 0
                        ? earlyWithdrawals.sort((a, b) => a - b)[
                              Math.floor(
                                  earlyWithdrawals.length / 2,
                              )
                          ]
                        : 0,
            },
            mid: {
                mean:
                    midWithdrawals.length > 0
                        ? midWithdrawals.reduce(
                              (a, b) => a + b,
                              0,
                          ) / midWithdrawals.length
                        : 0,
                median:
                    midWithdrawals.length > 0
                        ? midWithdrawals.sort((a, b) => a - b)[
                              Math.floor(midWithdrawals.length / 2)
                          ]
                        : 0,
            },
            late: {
                mean:
                    lateWithdrawals.length > 0
                        ? lateWithdrawals.reduce(
                              (a, b) => a + b,
                              0,
                          ) / lateWithdrawals.length
                        : 0,
                median:
                    lateWithdrawals.length > 0
                        ? lateWithdrawals.sort((a, b) => a - b)[
                              Math.floor(lateWithdrawals.length / 2)
                          ]
                        : 0,
            },
        };

        // Failure analysis
        const failures = simulations.filter((s) => s.failed);
        const failureCauses = {};
        failures.forEach((f) => {
            if (f.failureCause) {
                f.failureCause.forEach((cause) => {
                    failureCauses[cause] =
                        (failureCauses[cause] || 0) + 1;
                });
            }
        });

        // Average failure year
        const avgFailureYear =
            failures.length > 0
                ? failures.reduce(
                      (sum, f) => sum + f.failureYear,
                      0,
                  ) / failures.length
                : null;

        // Rule application stats
        const ruleStats = {
            preservation: 0,
            prosperity: 0,
            inflationSkip: 0,
        };

        simulations.forEach((s) => {
            s.rulesApplied.forEach((rule) => {
                if (rule === "preservation")
                    ruleStats.preservation++;
                if (rule === "prosperity") ruleStats.prosperity++;
                if (rule === "inflation_skip")
                    ruleStats.inflationSkip++;
            });
        });

        return {
            portfolioPercentiles: percentiles,
            withdrawalPercentiles,
            withdrawalMeans,
            withdrawalMedians,
            inssIncomeMeans,
            recommendedWithdrawalMeans,
            stressChartData,
            survivalRate,
            failedByDepletion,
            worstWithdrawal,
            overallMeanWithdrawal,
            overallMedianWithdrawal,
            periodStats,
            medianFinalPortfolio: medianFinal,
            bestFinalPortfolio: bestFinal,
            failureCauses,
            avgFailureYear,
            ruleStats,
            totalSimulations: numSims,
            failedSimulations: failures.length,
            // New stress analysis
            stressAnalysis: {
                duration: durationAnalysis,
                tolerance: toleranceSuccessRates,
                extraWithdrawal: extraWithdrawalAnalysis,
                recovery: recoveryAnalysis,
                stressByStartYear,
                avgStressYearsPerSim,
            },
        };
    }
}
