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
        let u1 = this.random();
        if (u1 < 1e-12) u1 = 1e-12; // Mulberry32 can emit exactly 0; log(0) = -Infinity
        const u2 = this.random();
        const z0 =
            Math.sqrt(-2.0 * Math.log(u1)) *
            Math.cos(2.0 * Math.PI * u2);
        return z0 * std + mean;
    }

    // Generate random number from Student's T distribution (fatter tails)
    randomStudentT(mean, std, df) {
        // Chi-squared is built by summing df squared normals, so df must be
        // an integer; df <= 2 has undefined/infinite variance for the scaling.
        df = Math.max(3, Math.round(df));

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

    // Generate equity return using 2-state Markov regime-switching model
    // Bull state: higher mean, lower vol. Bear state: lower mean, higher vol.
    generateRegimeSwitchingReturn(currentRegime) {
        const {
            bullEquityMean, bullEquityVol,
            bearEquityMean, bearEquityVol,
            bullToBullProb, bearToBearProb
        } = this.params;

        // Determine next regime using transition probabilities
        const stayProb = currentRegime === 'bull' ? bullToBullProb : bearToBearProb;
        const newRegime = this.random() < stayProb ? currentRegime : (currentRegime === 'bull' ? 'bear' : 'bull');

        // Generate return using the appropriate regime parameters
        const mean = newRegime === 'bull' ? bullEquityMean / 100 : bearEquityMean / 100;
        const vol = newRegime === 'bull' ? bullEquityVol / 100 : bearEquityVol / 100;
        const ret = this.generateReturn(mean, vol);

        return { return: ret, newRegime };
    }

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

    // Spending Smile multiplier: retirees spend more early (travel/leisure),
    // less mid-retirement, more late (healthcare). Returns a multiplier for
    // the target withdrawal. Uses smooth cosine interpolation between phases.
    getSpendingSmileMultiplier(year, totalYears) {
        const earlyMult = this.params.smileEarlyMultiplier || 1.20;
        const midMult = this.params.smileMidMultiplier || 0.85;
        const lateMult = this.params.smileLateMultiplier || 1.10;

        const thirdLen = totalYears / 3;
        const transitionWidth = Math.min(3, thirdLen / 2); // ~3 year smooth window

        // Phase boundaries (centers of transitions)
        const boundary1 = thirdLen;   // early → mid
        const boundary2 = 2 * thirdLen; // mid → late

        // Smooth cosine interpolation: returns 0→1 as x goes from center-width to center+width
        const cosInterp = (x, center, width) => {
            const t = (x - center) / width;
            if (t <= -1) return 0;
            if (t >= 1) return 1;
            return 0.5 * (1 - Math.cos(Math.PI * (t + 1) / 2));
        };

        // Blend between the three phases
        const blend1 = cosInterp(year, boundary1, transitionWidth); // 0 = early, 1 = mid
        const blend2 = cosInterp(year, boundary2, transitionWidth); // 0 = mid, 1 = late

        // Two-stage blend: early→mid then mid→late
        const earlyMidBlend = earlyMult * (1 - blend1) + midMult * blend1;
        const multiplier = earlyMidBlend * (1 - blend2) + lateMult * blend2;

        return multiplier;
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

        // Accumulation phase (pre-retirement contributions) — off by default
        const useAccumulation = this.params.useAccumulation || false;
        const accYears =
            useAccumulation && this.params.accumulationYears > 0
                ? this.params.accumulationYears
                : 0;
        const monthlyContributionBRL = this.params.monthlyContributionBRL || 0;
        const contributionSplitUSD = this.params.contributionSplitUSD ?? 80;
        const contributionGrowthReal = this.params.contributionGrowthReal || 0;
        const spendingMode = this.params.spendingMode || "rate";
        const targetSpendingBRL = this.params.targetSpendingBRL || 0;

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

        // Spending target in BRL, adjusted by Guyton-Klinger + inflation.
        // When accumulating, this is deferred until the retirement boundary
        // (computed from the portfolio value AT that point, not today's).
        let currentWithdrawalBRL = 0;
        let initialWithdrawalRate = 0;
        if (accYears === 0) {
            const totalInitialPortfolioBRL =
                portfolioUSD * initialFX + initialPortfolioBRL;
            currentWithdrawalBRL =
                totalInitialPortfolioBRL * (withdrawalRate / 100);
            initialWithdrawalRate = withdrawalRate / 100;
        }

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
            withdrawalSource: [accYears > 0 ? "accumulating" : "initial"],
            inssIncomeBRL: [0],
            cumulativeIpcaFactor: [1.0],
            smileMultiplier: [1.0],
            regimeHistory: [currentRegime],
        };

        // --- Accumulation phase: contributions in, no withdrawals ---
        // Draws the SAME stochastic returns as the retirement loop below
        // (equity/regime, IPCA, BRL bond, USD bond, FX) so sequence risk
        // while saving is captured, then adds the year's IPCA-indexed
        // contribution split between the USD and BRL sleeves at the
        // current-year FX.
        for (let totalYear = 1; totalYear <= accYears; totalYear++) {
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

            const brlBondReturnYear = this.generateBondReturn(ipcaYear);
            const usdBondReturnYear = this.generateUsdBondReturn();

            const prevTotalBRL = portfolioUSD * currentFX + portfolioBRLFixed;

            // Grow the BRL sleeve
            portfolioBRLFixed *= (1 + brlBondReturnYear);

            // Update FX (correlated with the actual equity shock, PPP anchor)
            currentFX = this.simulateCurrency(
                equityReturnYear,
                currentFX,
                totalYear,
                cumulativeIpcaFactor,
            );

            // Grow the USD sleeve at the initial static allocation — tent/
            // bucket glide paths only start once retirement begins.
            const usdReturn =
                equityAllocation * equityReturnYear +
                bondAllocation * usdBondReturnYear;
            portfolioUSD *= (1 + usdReturn);

            // Add this year's IPCA-indexed contribution, split at the
            // current-year FX
            const annualContributionBRL =
                monthlyContributionBRL *
                12 *
                cumulativeIpcaFactor *
                Math.pow(1 + contributionGrowthReal / 100, totalYear - 1);
            const contributionToUSD_BRL =
                annualContributionBRL * (contributionSplitUSD / 100);
            const contributionToUSD = contributionToUSD_BRL / currentFX;
            const contributionToBRL =
                annualContributionBRL * (1 - contributionSplitUSD / 100);
            portfolioUSD += contributionToUSD;
            portfolioBRLFixed += contributionToBRL;

            bondPortionUSD = portfolioUSD * bondAllocation;
            equityPortionUSD = portfolioUSD * equityAllocation;

            const totalPortfolioBRL =
                portfolioUSD * currentFX + portfolioBRLFixed;
            previousReturn =
                prevTotalBRL > 0 ? totalPortfolioBRL / prevTotalBRL - 1 : 0;

            portfolioBRL = totalPortfolioBRL;

            history.portfolioUSD.push(portfolioUSD);
            history.portfolioBRL.push(portfolioBRL);
            history.withdrawalBRL.push(0);
            history.withdrawalUSD.push(0);
            history.recommendedWithdrawalBRL.push(0);
            history.fxRate.push(currentFX);
            history.bondAllocation.push(bondAllocation * 100);
            history.rulesApplied.push(null);
            history.minimumEnforced.push(false);
            history.yearlyStressData.push({
                minimumEnforced: false,
                extraWithdrawn: 0,
                percentExtra: 0,
            });
            history.withdrawalSource.push("accumulating");
            history.inssIncomeBRL.push(0);
            history.cumulativeIpcaFactor.push(cumulativeIpcaFactor);
            history.smileMultiplier.push(1.0);
            history.regimeHistory.push(currentRegime);
        }

        // --- Retirement boundary: size the first withdrawal ---
        if (accYears > 0) {
            const boundaryPortfolioBRL =
                portfolioUSD * currentFX + portfolioBRLFixed;
            if (spendingMode === "target") {
                currentWithdrawalBRL = targetSpendingBRL * cumulativeIpcaFactor;
            } else {
                currentWithdrawalBRL =
                    boundaryPortfolioBRL * (withdrawalRate / 100);
            }
            initialWithdrawalRate =
                boundaryPortfolioBRL > 0
                    ? currentWithdrawalBRL / boundaryPortfolioBRL
                    : 0;
        }

        for (let year = 1; year <= years; year++) {
            const totalYear = accYears + year;
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

            const ageThisYear = currentAge + totalYear - 1;
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
                currentStressStart = totalYear;
                currentStressExtraWithdrawn = extraWithdrawnBRL;
            } else if (minimumWasEnforced && inStressPeriod) {
                currentStressExtraWithdrawn += extraWithdrawnBRL;
            } else if (!minimumWasEnforced && inStressPeriod) {
                history.stressPeriods.push({
                    startYear: currentStressStart,
                    endYear: totalYear - 1,
                    duration: totalYear - currentStressStart,
                    totalExtraWithdrawn: currentStressExtraWithdrawn,
                    recovered: true,
                    recoveryYear: totalYear,
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
                        endYear: totalYear,
                        duration: totalYear - currentStressStart + 1,
                        totalExtraWithdrawn:
                            currentStressExtraWithdrawn + extraWithdrawnBRL,
                        recovered: false,
                        recoveryYear: null,
                    });
                    inStressPeriod = false;
                }
                history.failed = true;
                history.failureYear = totalYear;
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
                endYear: accYears + years,
                duration: accYears + years - currentStressStart + 1,
                totalExtraWithdrawn: currentStressExtraWithdrawn,
                recovered: false,
                recoveryYear: null,
            });
        }

        return history;
    }

    // Compute survival probability from mortality tables (IBGE)
    // Returns array of length years+1 where [0] = 1.0 (alive at start)
    // and [t] = probability of surviving from startAge to startAge+t
    computeSurvivalProbability(startAge, years, gender) {
        if (gender === 'couple') {
            // Joint survival: P(at least one alive) = 1 - P(both dead)
            const maleSurv = this.computeSurvivalProbability(startAge, years, 'male');
            const femaleSurv = this.computeSurvivalProbability(startAge, years, 'female');
            return maleSurv.map((pm, t) => 1 - (1 - pm) * (1 - femaleSurv[t]));
        }

        const table = IBGE_MORTALITY_TABLE[gender];
        const probs = [1.0];
        let cumSurvival = 1.0;
        for (let t = 1; t <= years; t++) {
            const age = startAge + t - 1;
            const qx = table[Math.min(age, 110)] || 1.0;
            cumSurvival *= (1 - qx);
            probs.push(cumSurvival);
        }
        return probs;
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
        // Total history length: retirement years plus any accumulation
        // years prepended by runSimulation() (0 when useAccumulation is
        // off, keeping this identical to the pre-accumulation behavior).
        const accYears =
            this.params.useAccumulation && this.params.accumulationYears > 0
                ? this.params.accumulationYears
                : 0;
        const years = accYears + this.params.years;
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

        // Track mean cumulative IPCA for inflation-adjusted minimum withdrawal line
        const meanCumulativeIpca = [];

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

            // Mean cumulative IPCA factor for this year
            const ipcaFactors = simulations.map(s => s.cumulativeIpcaFactor ? s.cumulativeIpcaFactor[year] || 1.0 : 1.0);
            meanCumulativeIpca.push(ipcaFactors.reduce((a, b) => a + b, 0) / ipcaFactors.length);

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

        // Mortality-adjusted survival rate
        let mortalityAdjustedSurvivalRate = null;
        let survivalProbabilityByYear = null;
        let lifeExpectancyAtStart = null;

        if (this.params.useMortalityAdjustment && typeof IBGE_MORTALITY_TABLE !== 'undefined') {
            const gender = this.params.mortalityGender || 'male';
            const startAge = this.params.currentAge || 60;
            const survProbs = this.computeSurvivalProbability(startAge, years, gender);

            // For each simulation:
            // - If it survived all years: contributes 1.0
            // - If it failed at year t: contributes (1 - survProbs[t])
            //   i.e., the probability the person would have died before the failure
            let adjustedSuccesses = 0;
            simulations.forEach(s => {
                if (!s.failed) {
                    adjustedSuccesses += 1;
                } else {
                    adjustedSuccesses += (1 - survProbs[s.failureYear]);
                }
            });
            mortalityAdjustedSurvivalRate = (adjustedSuccesses / numSims) * 100;
            survivalProbabilityByYear = survProbs;

            // Compute life expectancy
            if (gender === 'couple') {
                const leMale = computeLifeExpectancy(startAge, 'male');
                const leFemale = computeLifeExpectancy(startAge, 'female');
                lifeExpectancyAtStart = Math.max(leMale, leFemale);
            } else {
                lifeExpectancyAtStart = computeLifeExpectancy(startAge, gender);
            }
        }

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

        // Inflation-adjusted minimum withdrawal line (for chart)
        const minimumWithdrawalAdjusted =
            useMinimumWithdrawal && minimumWithdrawalBRL > 0
                ? meanCumulativeIpca.map(f => minimumWithdrawalBRL * f)
                : [];

        // Regime-switching statistics
        let regimeStats = null;
        if (this.params.useRegimeSwitching) {
            let totalBullYears = 0;
            let totalBearYears = 0;
            let totalBearEpisodes = 0;

            simulations.forEach(s => {
                const rh = s.regimeHistory || [];
                let bearYears = 0;
                let bullYears = 0;
                let bearEpisodes = 0;
                for (let i = 1; i < rh.length; i++) {
                    if (rh[i] === 'bull') bullYears++;
                    if (rh[i] === 'bear') {
                        bearYears++;
                        if (rh[i - 1] === 'bull') bearEpisodes++;
                    }
                }
                totalBullYears += bullYears;
                totalBearYears += bearYears;
                totalBearEpisodes += bearEpisodes;
            });

            regimeStats = {
                avgBullYears: totalBullYears / numSims,
                avgBearYears: totalBearYears / numSims,
                avgBearEpisodes: totalBearEpisodes / numSims,
            };
        }

        return {
            portfolioPercentiles: percentiles,
            withdrawalPercentiles,
            withdrawalMeans,
            withdrawalMedians,
            inssIncomeMeans,
            minimumWithdrawalAdjusted,
            meanCumulativeIpca,
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
            // Regime-switching statistics (null if not enabled)
            regimeStats,
            // Mortality-adjusted metrics (null if not enabled)
            mortalityAdjustedSurvivalRate,
            survivalProbabilityByYear,
            lifeExpectancyAtStart,
        };
    }
}
