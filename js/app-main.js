const { useState, useEffect, useRef, useCallback, useMemo } = React;

            // Main App
            const App = () => {
                // Parameters state
                const [params, setParams] = useState({
                    initialPortfolioUSD: 1000000,
                    initialPortfolioBRL: 0, // Portfolio in BRL (Brazilian fixed income)
                    initialFX: 5.8,
                    withdrawalRate: 4.0,
                    equityReturn: 8.0,
                    equityVolatility: 18.0,
                    bondReturn: 5.0,
                    bondVolatility: 2.0,
                    inflation: 4.5,
                    years: 50,
                    iterations: 20000,
                    tentInitialBondPercent: 40,
                    tentDuration: 5,
                    targetBondPercent: 40,
                    useGuytonKlinger: true,
                    preservationThreshold: 0.2,
                    prosperityThreshold: 0.2,
                    adjustmentPercent: 0.1,
                    applyInflationRule: true,
                    minimumWithdrawalBRL: 120000,
                    useMinimumWithdrawal: false,
                    useINSS: false,
                    currentAge: 60,
                    inssStartAge: 65,
                    inssMonthlyBRL: 3000,
                    bucketYears: 5,
                    useBucketStrategy: true,
                    // Advanced modeling parameters
                    useStudentT: true,
                    degreesOfFreedom: 5, // Lower = fatter tails (5-7 typical for markets)
                    useDynamicCorrelation: true,
                    baseCorrelation: -0.4,
                    stressCorrelationMultiplier: 2.0, // Correlation becomes more negative in stress
                    // IPCA + Real Rate model
                    useIPCAModel: true,
                    expectedIPCA: 4.5, // Expected IPCA %
                    ipcaVolatility: 2.0, // IPCA volatility %
                    realSpread: 5.0, // Real spread over IPCA for fixed income %
                    // Tax model
                    useTaxModel: true,
                    equityTaxRate: 15, // % tax on equity gains (Irish ETFs)
                    fixedIncomeTaxRate: 15, // % tax on fixed income (simplified)
                    // Sequence of returns constraint (NON-IID)
                    useSequenceConstraint: false, // OFF by default - pure IID Monte Carlo
                    maxNegativeSequence: 10, // Max consecutive years of negative returns (only if constraint enabled)
                    // Reproducibility
                    seed: null, // null = random seed each run, number = deterministic
                    // Objective Mode: Maximum Consumption Optimizer
                    objectiveMode: "preservation", // 'preservation' | 'consumption'
                    targetSuccessRate: 90, // Target survival rate for consumption mode (%)
                    targetEndBalance: 0, // Target end balance in BRL (Die With Zero)
                    optimizerTolerance: 0.1, // Tolerance for bisection search (%)
                    sidebarMode: "simple", // 'simple' | 'advanced'
                });

                const [results, setResults] = useState(null);
                const [isRunning, setIsRunning] = useState(false);
                const [progress, setProgress] = useState(0);
                const [isOptimizing, setIsOptimizing] = useState(false);
                const [optimizationProgress, setOptimizationProgress] =
                    useState(null);
                const [optimizationResult, setOptimizationResult] =
                    useState(null);

                const updateParam = (key, value) => {
                    setParams((prev) => ({ ...prev, [key]: value }));
                    // Clear optimization result when switching modes or changing key params
                    if (key === "objectiveMode") {
                        setOptimizationResult(null);
                        setResults(null);
                    }
                };

                const runSimulation = () => {
                    setIsRunning(true);
                    setProgress(0);

                    // Run in chunks to allow UI updates
                    setTimeout(() => {
                        const engine = new MonteCarloEngine(params);
                        const results = engine.runMonteCarlo(params.iterations);
                        // Add seed to results for reproducibility tracking
                        results.seed = engine.getSeed();
                        results.mode = params.useSequenceConstraint
                            ? "constrained"
                            : "pure_iid";
                        setResults(results);
                        setIsRunning(false);
                        setProgress(100);
                    }, 100);
                };

                // ============================================
                // MAXIMUM CONSUMPTION OPTIMIZER (Bisection)
                // ============================================

                // Helper function to run Monte Carlo with specific SWR
                const runMonteCarloWithSWR = (swr, iterations, masterSeed) => {
                    const testParams = {
                        ...params,
                        withdrawalRate: swr,
                        seed: masterSeed,
                    };
                    const engine = new MonteCarloEngine(testParams);
                    return engine.runMonteCarlo(iterations);
                };

                // Two-phase bisection search for optimal SWR
                const findOptimalSWR = async (
                    targetRate,
                    tolerance,
                    onProgress,
                ) => {
                    const startTime = Date.now();
                    const masterSeed =
                        params.seed || Math.floor(Math.random() * 2147483647);

                    let minSWR = 0.5;
                    let maxSWR = 15.0;
                    let bestSWR = minSWR;
                    let bestResults = null;
                    let totalSteps = 0;
                    let totalSimulations = 0;

                    // Phase 1: Coarse search (200 iterations, 0.5% tolerance)
                    const phase1Tolerance = 0.5;
                    const phase1Iterations = 200;
                    let phase1Steps = 0;

                    onProgress({
                        phase: 1,
                        step: 0,
                        minSWR,
                        maxSWR,
                        currentSWR: (minSWR + maxSWR) / 2,
                        survivalRate: null,
                    });

                    while (maxSWR - minSWR > phase1Tolerance) {
                        const midSWR = (minSWR + maxSWR) / 2;
                        const results = runMonteCarloWithSWR(
                            midSWR,
                            phase1Iterations,
                            masterSeed,
                        );
                        totalSimulations += phase1Iterations;
                        phase1Steps++;
                        totalSteps++;

                        onProgress({
                            phase: 1,
                            step: phase1Steps,
                            minSWR,
                            maxSWR,
                            currentSWR: midSWR,
                            survivalRate: results.survivalRate,
                            totalSimulations,
                        });

                        if (results.survivalRate >= targetRate) {
                            // Can try higher SWR
                            bestSWR = midSWR;
                            bestResults = results;
                            minSWR = midSWR;
                        } else {
                            // Need lower SWR
                            maxSWR = midSWR;
                        }

                        // Allow UI to update
                        await new Promise((r) => setTimeout(r, 10));
                    }

                    // Phase 2: Fine search (1000 iterations, user-defined tolerance)
                    const phase2Iterations = 1000;
                    let phase2Steps = 0;

                    // Narrow the search range around the coarse result
                    minSWR = Math.max(0.5, bestSWR - 1.0);
                    maxSWR = Math.min(15.0, bestSWR + 1.0);

                    onProgress({
                        phase: 2,
                        step: 0,
                        minSWR,
                        maxSWR,
                        currentSWR: bestSWR,
                        survivalRate: bestResults?.survivalRate,
                        totalSimulations,
                    });

                    while (maxSWR - minSWR > tolerance) {
                        const midSWR = (minSWR + maxSWR) / 2;
                        const results = runMonteCarloWithSWR(
                            midSWR,
                            phase2Iterations,
                            masterSeed,
                        );
                        totalSimulations += phase2Iterations;
                        phase2Steps++;
                        totalSteps++;

                        onProgress({
                            phase: 2,
                            step: phase2Steps,
                            minSWR,
                            maxSWR,
                            currentSWR: midSWR,
                            survivalRate: results.survivalRate,
                            totalSimulations,
                        });

                        if (results.survivalRate >= targetRate) {
                            bestSWR = midSWR;
                            bestResults = results;
                            minSWR = midSWR;
                        } else {
                            maxSWR = midSWR;
                        }

                        await new Promise((r) => setTimeout(r, 10));
                    }

                    // Final validation run with full iterations
                    const finalResults = runMonteCarloWithSWR(
                        bestSWR,
                        params.iterations,
                        masterSeed,
                    );
                    totalSimulations += params.iterations;
                    finalResults.seed = masterSeed;
                    finalResults.mode = params.useSequenceConstraint
                        ? "constrained"
                        : "pure_iid";

                    const computeTimeMs = Date.now() - startTime;

                    return {
                        optimalSWR: bestSWR,
                        survivalRate: finalResults.survivalRate,
                        medianEndBalance: finalResults.medianFinalPortfolio,
                        monthlyWithdrawalBRL:
                            (params.initialPortfolioUSD *
                                params.initialFX *
                                (bestSWR / 100)) /
                            12,
                        annualWithdrawalBRL:
                            params.initialPortfolioUSD *
                            params.initialFX *
                            (bestSWR / 100),
                        confidenceInterval: [
                            Math.max(0.5, bestSWR - tolerance),
                            Math.min(15, bestSWR + tolerance),
                        ],
                        searchSteps: totalSteps,
                        totalSimulations,
                        computeTimeMs,
                        masterSeed,
                        finalResults,
                    };
                };

                const runOptimization = async () => {
                    setIsOptimizing(true);
                    setOptimizationProgress({
                        phase: 0,
                        step: 0,
                        message: "Iniciando otimização...",
                    });
                    setOptimizationResult(null);
                    setResults(null);

                    try {
                        const result = await findOptimalSWR(
                            params.targetSuccessRate,
                            params.optimizerTolerance,
                            (progress) => {
                                setOptimizationProgress({
                                    ...progress,
                                    message:
                                        progress.phase === 1
                                            ? `Fase 1 (busca grossa): Testando ${progress.currentSWR?.toFixed(2)}% → ${progress.survivalRate?.toFixed(1) || "..."}% sobrevivência`
                                            : `Fase 2 (busca fina): Refinando ${progress.currentSWR?.toFixed(2)}% → ${progress.survivalRate?.toFixed(1) || "..."}% sobrevivência`,
                                });
                            },
                        );

                        setOptimizationResult(result);
                        setResults(result.finalResults);

                        // Update the withdrawalRate param to show the optimal value
                        updateParam(
                            "withdrawalRate",
                            parseFloat(result.optimalSWR.toFixed(2)),
                        );
                    } catch (error) {
                        console.error("Optimization error:", error);
                        setOptimizationProgress({
                            phase: -1,
                            message: `Erro: ${error.message}`,
                        });
                    }

                    setIsOptimizing(false);
                };

                const formatCurrency = (value, decimals = 0) => {
                    return new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                        maximumFractionDigits: decimals,
                    }).format(value);
                };

                const downloadExport = () => {
                    if (!results) return;

                    const fmt = (v, d = 0) =>
                        new Intl.NumberFormat("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                            maximumFractionDigits: d,
                        }).format(v);

                    const date = new Date().toISOString().split("T")[0];
                    const mode =
                        results.mode === "pure_iid"
                            ? "Monte Carlo Puro (IID)"
                            : "Monte Carlo Restrito (NON-IID)";
                    const totalYearDecisions =
                        results.totalSimulations * params.years;
                    const lastIdx = params.years;
                    const p = results.portfolioPercentiles;

                    const lines = [
                        "======================================",
                        "MONTE CARLO RETIREMENT SIMULATOR",
                        "======================================",
                        `Data: ${date}`,
                        `Seed: ${results.seed}`,
                        `Modo: ${mode}`,
                        "",
                        "--- PARÂMETROS DE ENTRADA ---",
                        "",
                        "Portfólio & Saque:",
                        `  Patrimônio USD: $${params.initialPortfolioUSD.toLocaleString("en-US")}`,
                        `  Patrimônio BRL (renda fixa): ${fmt(params.initialPortfolioBRL)}`,
                        `  Câmbio USD/BRL: ${params.initialFX.toFixed(2)}`,
                        `  Taxa de Saque (SWR): ${params.withdrawalRate}%`,
                        `  Horizonte: ${params.years} anos`,
                        `  Iterações: ${params.iterations}`,
                        "",
                        "Retornos & Volatilidade:",
                        `  Retorno Renda Variável: ${params.equityReturn}%`,
                        `  Volatilidade RV: ${params.equityVolatility}%`,
                        `  Retorno Renda Fixa: ${params.bondReturn}%`,
                        `  Volatilidade RF: ${params.bondVolatility}%`,
                        `  Inflação: ${params.inflation}%`,
                        "",
                        "Estratégia Tenda:",
                        `  Alocação Inicial RF: ${params.tentInitialBondPercent}%`,
                        `  Duração Transição: ${params.tentDuration} anos`,
                        `  Alocação Alvo RF: ${params.targetBondPercent}%`,
                        "",
                        "Regras Guyton-Klinger:",
                        `  Ativado: ${params.useGuytonKlinger ? "Sim" : "Não"}`,
                        ...(params.useGuytonKlinger
                            ? [
                                  `  Limiar Preservação: ${(params.preservationThreshold * 100).toFixed(0)}%`,
                                  `  Limiar Prosperidade: ${(params.prosperityThreshold * 100).toFixed(0)}%`,
                                  `  Ajuste: ${(params.adjustmentPercent * 100).toFixed(0)}%`,
                                  `  Regra de Inflação: ${params.applyInflationRule ? "Sim" : "Não"}`,
                              ]
                            : []),
                        "",
                        "Saque Mínimo:",
                        `  Usar Saque Mínimo: ${params.useMinimumWithdrawal ? "Sim" : "Não"}`,
                        `  Valor Mínimo: ${fmt(params.minimumWithdrawalBRL)}`,
                        "",
                        "Benefício INSS:",
                        `  Receber INSS: ${params.useINSS ? "Sim" : "Não"}`,
                        ...(params.useINSS
                            ? [
                                  `  Idade Atual: ${params.currentAge} anos`,
                                  `  Idade de Início: ${params.inssStartAge} anos`,
                                  `  Benefício Mensal: ${fmt(params.inssMonthlyBRL)}`,
                                  `  Início no Ano: ${params.inssStartAge - params.currentAge + 1} (corrigido pelo IPCA simulado)`,
                              ]
                            : []),
                        "",
                        "Bucket Strategy:",
                        `  Usar Bucket Strategy: ${params.useBucketStrategy ? "Sim" : "Não"}`,
                        `  Anos de Bucket: ${params.bucketYears}`,
                        "",
                        "Modelagem Avançada:",
                        `  Distribuição T-Student: ${params.useStudentT ? "Sim" : "Não"}`,
                        `  Graus de Liberdade: ${params.degreesOfFreedom}`,
                        `  Correlação Dinâmica: ${params.useDynamicCorrelation ? "Sim" : "Não"}`,
                        `  Correlação Base: ${params.baseCorrelation}`,
                        `  Multiplicador Estresse: ${params.stressCorrelationMultiplier}x`,
                        `  Modelo IPCA: ${params.useIPCAModel ? "Sim" : "Não"}`,
                        `  IPCA Esperada: ${params.expectedIPCA}%`,
                        `  Volatilidade IPCA: ${params.ipcaVolatility}%`,
                        `  Spread Real: ${params.realSpread}%`,
                        `  Modelo Tributário: ${params.useTaxModel ? "Sim" : "Não"}`,
                        `  Imposto RV: ${params.equityTaxRate}%`,
                        `  Imposto RF: ${params.fixedIncomeTaxRate}%`,
                        `  Restrição de Sequência: ${params.useSequenceConstraint ? "Sim" : "Não"}`,
                        `  Máx Sequência Negativa: ${params.maxNegativeSequence} anos`,
                        "",
                        "Modo Objetivo:",
                        `  Modo: ${params.objectiveMode === "preservation" ? "Preservação" : "Consumo Máximo (Die With Zero)"}`,
                        `  Taxa de Sucesso Alvo: ${params.targetSuccessRate}%`,
                        `  Saldo Final Alvo: ${fmt(params.targetEndBalance)}`,
                        `  Tolerância Otimizador: ${params.optimizerTolerance}%`,
                        "",
                        "--- RESULTADOS ---",
                        "",
                        `Taxa de Sobrevivência: ${results.survivalRate.toFixed(1)}%`,
                        `Iterações: ${results.totalSimulations}`,
                        `Falhas: ${results.failedSimulations}`,
                        `Saque Médio Anual: ${fmt(results.overallMeanWithdrawal)}`,
                        `Saque Mediano Anual: ${fmt(results.overallMedianWithdrawal)}`,
                        `Pior Saque: ${fmt(results.worstWithdrawal)}`,
                        `Patrimônio Final Mediano: ${fmt(results.medianFinalPortfolio)}`,
                        `Patrimônio Final Melhor: ${fmt(results.bestFinalPortfolio)}`,
                        "",
                        "Percentis do Patrimônio Final:",
                        `  P10: ${fmt(p.p10[lastIdx])}`,
                        `  P25: ${fmt(p.p25[lastIdx])}`,
                        `  P50: ${fmt(p.p50[lastIdx])}`,
                        `  P75: ${fmt(p.p75[lastIdx])}`,
                        `  P90: ${fmt(p.p90[lastIdx])}`,
                        "",
                        "Regras Guyton-Klinger Disparadas:",
                        `  Preservação: ${((results.ruleStats.preservation / totalYearDecisions) * 100).toFixed(1)}%`,
                        `  Prosperidade: ${((results.ruleStats.prosperity / totalYearDecisions) * 100).toFixed(1)}%`,
                        `  Inflação Suprimida: ${((results.ruleStats.inflationSkip / totalYearDecisions) * 100).toFixed(1)}%`,
                    ];

                    if (results.avgFailureYear !== null) {
                        lines.push("");
                        lines.push(
                            `Ano Médio de Falha: ${results.avgFailureYear.toFixed(1)}`,
                        );
                    }

                    if (optimizationResult) {
                        lines.push("");
                        lines.push("Otimizador (Consumo Máximo):");
                        lines.push(
                            `  Taxa Ótima: ${optimizationResult.optimalSWR.toFixed(2)}%`,
                        );
                        lines.push(
                            `  Saque Mensal: ${fmt(optimizationResult.monthlyWithdrawalBRL)}`,
                        );
                        lines.push(
                            `  Saque Anual: ${fmt(optimizationResult.annualWithdrawalBRL)}`,
                        );
                        lines.push(
                            `  Sobrevivência Validada: ${optimizationResult.survivalRate.toFixed(1)}%`,
                        );
                        lines.push(
                            `  Saldo Final Mediano: ${fmt(optimizationResult.medianEndBalance)}`,
                        );
                        lines.push(
                            `  Simulações Totais: ${optimizationResult.totalSimulations}`,
                        );
                        lines.push(
                            `  Tempo de Cálculo: ${(optimizationResult.computeTimeMs / 1000).toFixed(1)}s`,
                        );
                    }

                    lines.push("");
                    lines.push("======================================");
                    lines.push("Gerado por Monte Carlo Retirement Simulator");
                    lines.push(
                        "https://github.com/alexfmonteiro/monte-carlo-retirement-simulator",
                    );

                    const text = lines.join("\n");
                    const blob = new Blob([text], {
                        type: "text/plain;charset=utf-8",
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `simulacao-monte-carlo-${results.seed}.txt`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                };

                return (
                    <div className="min-h-screen flex flex-col lg:flex-row">
                        {/* Sidebar */}
                        <aside className="w-full lg:w-80 bg-deep border-b lg:border-b-0 lg:border-r border-gray-800 p-4 lg:p-5 lg:overflow-y-auto">
                            <div className="mb-6">
                                <div className="flex items-center gap-2 mb-1">
                                    <Icon
                                        name="TrendingUp"
                                        size={24}
                                        className="text-accent"
                                    />
                                    <h1 className="text-xl font-bold">
                                        Monte Carlo
                                    </h1>
                                </div>
                                <p className="text-xs text-gray-500">
                                    Simulador de Aposentadoria SWR
                                </p>
                                <a
                                    href="https://github.com/alexfmonteiro/monte-carlo-retirement-simulator"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-accent transition-colors mt-1"
                                >
                                    <Icon name="Github" size={14} />
                                    <span>GitHub</span>
                                </a>
                                <a
                                    href="endowment.html"
                                    className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors mt-1"
                                >
                                    <Icon name="GraduationCap" size={14} />
                                    <span>Estratégia Yale Endowment →</span>
                                </a>
                            </div>

                            {/* Simple / Advanced Mode Tabs */}
                            <div className="flex bg-midnight rounded-lg p-1 mb-6">
                                <button
                                    onClick={() =>
                                        updateParam("sidebarMode", "simple")
                                    }
                                    className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-colors ${
                                        params.sidebarMode === "simple"
                                            ? "bg-accent text-white"
                                            : "text-gray-400 hover:text-gray-200"
                                    }`}
                                >
                                    Simples
                                </button>
                                <button
                                    onClick={() =>
                                        updateParam("sidebarMode", "advanced")
                                    }
                                    className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-colors ${
                                        params.sidebarMode === "advanced"
                                            ? "bg-accent text-white"
                                            : "text-gray-400 hover:text-gray-200"
                                    }`}
                                >
                                    Avançado
                                </button>
                            </div>

                            {/* Objective Mode Selector */}
                            <div className="mb-6">
                                <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                                    <Icon name="Target" size={16} />
                                    Objetivo de Vida
                                    <Tooltip text="Escolha entre duas filosofias: (1) Preservação - você define a taxa de saque e vê a probabilidade de sucesso. (2) Consumo Máximo (Die With Zero) - você define a probabilidade de sucesso desejada e o sistema calcula a maior taxa de saque possível." />
                                </h2>
                                <div className="flex gap-2 p-1 bg-midnight rounded-lg">
                                    <button
                                        onClick={() =>
                                            updateParam(
                                                "objectiveMode",
                                                "preservation",
                                            )
                                        }
                                        className={`flex-1 py-2 px-3 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                                            params.objectiveMode ===
                                            "preservation"
                                                ? "bg-accent text-white"
                                                : "text-gray-400 hover:text-white hover:bg-surface"
                                        }`}
                                    >
                                        <Icon name="Shield" size={14} />
                                        Preservação
                                    </button>
                                    <button
                                        onClick={() =>
                                            updateParam(
                                                "objectiveMode",
                                                "consumption",
                                            )
                                        }
                                        className={`flex-1 py-2 px-3 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                                            params.objectiveMode ===
                                            "consumption"
                                                ? "bg-warning text-white"
                                                : "text-gray-400 hover:text-white hover:bg-surface"
                                        }`}
                                    >
                                        <Icon name="Sparkles" size={14} />
                                        Consumo Máximo
                                    </button>
                                </div>
                                <div className="text-xs text-gray-500 mt-2 p-2 bg-midnight rounded">
                                    {params.objectiveMode === "preservation" ? (
                                        <span>
                                            <strong className="text-accent">
                                                Modo Preservação:
                                            </strong>{" "}
                                            Você define a taxa de saque (SWR) e
                                            o simulador calcula a probabilidade
                                            de sucesso. Ideal para planejamento
                                            conservador focado em deixar
                                            herança.
                                        </span>
                                    ) : (
                                        <span>
                                            <strong className="text-warning">
                                                Modo Consumo Máximo:
                                            </strong>{" "}
                                            Você define a probabilidade de
                                            sucesso desejada e o sistema
                                            encontra a maior taxa de saque
                                            possível. Filosofia "Die With Zero"
                                            - maximizar consumo em vida.
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Portfolio Section */}
                            <div className="mb-6">
                                <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                                    <Icon name="Wallet" size={16} />
                                    Portfólio Inicial
                                </h2>
                                <DualCurrencyInput
                                    label="Patrimônio Total"
                                    valueUSD={params.initialPortfolioUSD}
                                    onChangeUSD={(v) =>
                                        updateParam("initialPortfolioUSD", v)
                                    }
                                    fx={params.initialFX}
                                    minUSD={10000}
                                    stepUSD={50000}
                                    tooltip="Valor total do seu portfólio de investimentos. Pode ser inserido em USD ou BRL - o outro campo será calculado automaticamente usando o câmbio. A divisão entre Renda Variável e Renda Fixa será definida pelo '% RF Inicial' na seção Estratégia Tenda abaixo."
                                />
                                <Input
                                    label="Câmbio Inicial"
                                    value={params.initialFX}
                                    onChange={(v) =>
                                        updateParam("initialFX", v)
                                    }
                                    unit="BRL/USD"
                                    min={3}
                                    max={10}
                                    step={0.1}
                                    tooltip="Taxa de câmbio atual (quantos reais por dólar). Este valor serve como ponto de partida e também como 'âncora' para o modelo de reversão à média do câmbio. Durante a simulação, o câmbio varia de forma estocástica mas tende a retornar a este valor no longo prazo."
                                />
                                {params.objectiveMode === "preservation" ? (
                                    <Input
                                        label="Taxa de Retirada (SWR)"
                                        value={params.withdrawalRate}
                                        onChange={(v) =>
                                            updateParam("withdrawalRate", v)
                                        }
                                        unit="%"
                                        min={2}
                                        max={8}
                                        step={0.1}
                                        tooltip="Safe Withdrawal Rate - percentual do portfólio total retirado no primeiro ano, ajustado pela inflação nos anos seguintes. O estudo original de Bengen (1994) sugeriu 4% para portfólios americanos. Para investidores internacionais com risco cambial, 3.5-4.0% é mais prudente. Com regras Guyton-Klinger ativadas, taxas até ~4.5% podem ser viáveis. Taxas mais altas aumentam o risco de depleção; mais baixas deixam mais herança."
                                    />
                                ) : (
                                    <div className="mb-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <label className="text-xs text-warning font-medium uppercase tracking-wide">
                                                Taxa de Retirada (SWR)
                                            </label>
                                            <span className="text-xs px-2 py-0.5 bg-warning/20 text-warning rounded">
                                                Auto
                                            </span>
                                        </div>
                                        <div className="bg-midnight border border-warning/30 rounded-lg px-3 py-2 text-sm font-mono text-warning">
                                            {optimizationResult
                                                ? `${optimizationResult.optimalSWR.toFixed(2)}%`
                                                : "Será calculado automaticamente"}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">
                                            O sistema encontrará a maior taxa
                                            com ≥{params.targetSuccessRate}% de
                                            sucesso
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Consumption Mode Parameters */}
                            {params.objectiveMode === "consumption" && (
                                <div className="mb-6 p-3 bg-warning/5 border border-warning/30 rounded-lg">
                                    <h2 className="text-sm font-semibold text-warning mb-3 flex items-center gap-2">
                                        <Icon name="Sliders" size={16} />
                                        Parâmetros de Otimização
                                    </h2>
                                    <Input
                                        label="Confiança Desejada"
                                        value={params.targetSuccessRate}
                                        onChange={(v) =>
                                            updateParam("targetSuccessRate", v)
                                        }
                                        unit="%"
                                        min={70}
                                        max={99}
                                        step={1}
                                        tooltip="Probabilidade mínima de sucesso que você deseja. O otimizador encontrará a MAIOR taxa de saque onde a taxa de sobrevivência ainda é ≥ este valor. Ex: 90% significa que você aceita 10% de chance de o dinheiro acabar antes do horizonte."
                                    />
                                    <BRLInputWithUSD
                                        label="Patrimônio Final Desejado"
                                        valueBRL={params.targetEndBalance}
                                        onChange={(v) =>
                                            updateParam("targetEndBalance", v)
                                        }
                                        fx={params.initialFX}
                                        min={0}
                                        step={100000}
                                        tooltip="Quanto você deseja deixar ao final do horizonte (filosofia Die With Zero = R$ 0). Este valor é usado como referência - a mediana dos cenários bem-sucedidos tenderá a este valor. Zero significa maximizar consumo sem deixar herança."
                                    />
                                    <Input
                                        label="Tolerância da Busca"
                                        value={params.optimizerTolerance}
                                        onChange={(v) =>
                                            updateParam("optimizerTolerance", v)
                                        }
                                        unit="%"
                                        min={0.05}
                                        max={0.5}
                                        step={0.05}
                                        tooltip="Precisão da busca da taxa ótima. Valores menores = resultado mais preciso, mas mais demorado. 0.1% é um bom equilíbrio. Com 0.1%, o resultado será tipo '4.73% ± 0.1%'."
                                    />
                                    <div className="text-xs text-gray-500 mt-2 p-2 bg-midnight rounded">
                                        <div className="font-semibold text-warning mb-1">
                                            Como funciona:
                                        </div>
                                        <div>
                                            1. Busca grossa: testa taxas de 0.5%
                                            a 15% (rápido)
                                        </div>
                                        <div>
                                            2. Busca fina: refina ao redor do
                                            melhor resultado
                                        </div>
                                        <div>
                                            3. Validação final: confirma com{" "}
                                            {params.iterations} simulações
                                        </div>
                                    </div>
                                </div>
                            )}

                            {params.sidebarMode === "advanced" && (
                                <>
                                    {/* Returns Section */}
                                    <div className="mb-6">
                                        <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                                            <Icon name="BarChart3" size={16} />
                                            Retornos Esperados
                                        </h2>
                                        <Input
                                            label="Retorno RV (a.a.)"
                                            value={params.equityReturn}
                                            onChange={(v) =>
                                                updateParam("equityReturn", v)
                                            }
                                            unit="%"
                                            min={0}
                                            max={15}
                                            step={0.5}
                                            tooltip="Retorno médio anual esperado (nominal, em USD) da renda variável. Historicamente, o S&P 500 retorna ~10% a.a. nominal e ~7% real. O valor de 7% já embute conservadorismo ao assumir retornos reais como proxy para nominal. ETFs irlandeses têm drag de ~0.3% (WHT + TER). Para planejamento conservador, use 5-6%."
                                        />
                                        <Input
                                            label="Volatilidade RV"
                                            value={params.equityVolatility}
                                            onChange={(v) =>
                                                updateParam(
                                                    "equityVolatility",
                                                    v,
                                                )
                                            }
                                            unit="%"
                                            min={5}
                                            max={40}
                                            step={1}
                                            tooltip="Desvio padrão dos retornos anuais da renda variável. Mede o quanto o retorno varia de ano para ano. O S&P 500 historicamente tem ~15-18%. Mercados emergentes podem chegar a 25%+. Maior volatilidade significa maiores oscilações tanto para cima quanto para baixo."
                                        />
                                        <Input
                                            label="Retorno RF Real (a.a.)"
                                            value={params.bondReturn}
                                            onChange={(v) =>
                                                updateParam("bondReturn", v)
                                            }
                                            unit="%"
                                            min={0}
                                            max={10}
                                            step={0.5}
                                            tooltip="Retorno REAL (acima da inflação) esperado da renda fixa. No Brasil, títulos IPCA+ historicamente pagam 4-6% + IPCA. Se usar o modelo IPCA (abaixo), este valor é substituído pelo 'Spread Real RF'. Em países desenvolvidos, RF real é tipicamente 1-2%."
                                        />
                                        <Input
                                            label="Volatilidade RF"
                                            value={params.bondVolatility}
                                            onChange={(v) =>
                                                updateParam("bondVolatility", v)
                                            }
                                            unit="%"
                                            min={1}
                                            max={15}
                                            step={0.5}
                                            tooltip="Desvio padrão dos retornos anuais da renda fixa. Títulos de curto prazo têm volatilidade baixa (~2-4%). Títulos longos (Tesouro IPCA+ 2045) podem ter volatilidade de 10%+ devido à marcação a mercado. Fundos de RF também variam."
                                        />
                                        <Input
                                            label="Inflação Brasil"
                                            value={params.inflation}
                                            onChange={(v) =>
                                                updateParam("inflation", v)
                                            }
                                            unit="%"
                                            min={2}
                                            max={12}
                                            step={0.5}
                                            tooltip="Taxa de inflação anual esperada no Brasil (IPCA). A meta do Banco Central é 3% a.a. com tolerância de 1.5pp. Historicamente, a inflação brasileira fica entre 4-6%. Este valor é usado para ajustar os saques e manter o poder de compra. Se usar o modelo IPCA, este valor vira a 'Inflação Esperada'."
                                        />
                                    </div>

                                    {/* Tent Strategy Section */}
                                    <div className="mb-6">
                                        <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                                            <Icon name="Tent" size={16} />
                                            Estratégia Tenda (Glidepath)
                                        </h2>
                                        <Input
                                            label="% RF Inicial (Tenda)"
                                            value={
                                                params.tentInitialBondPercent
                                            }
                                            onChange={(v) =>
                                                updateParam(
                                                    "tentInitialBondPercent",
                                                    v,
                                                )
                                            }
                                            unit="%"
                                            min={10}
                                            max={60}
                                            step={5}
                                            tooltip="A 'Estratégia Tenda' (ou Rising Equity Glidepath) começa com mais RF para proteger contra o 'Sequence of Returns Risk' - o risco de retornos ruins nos primeiros anos da aposentadoria. Este é o percentual em RF no início. Exemplo: 40% significa 60% em RV + 40% em RF."
                                        />
                                        <Input
                                            label="Duração da Tenda"
                                            value={params.tentDuration}
                                            onChange={(v) =>
                                                updateParam("tentDuration", v)
                                            }
                                            unit="anos"
                                            min={1}
                                            max={15}
                                            step={1}
                                            tooltip="Quantos anos manter a alocação elevada em RF antes de começar a transição para o percentual alvo. Pesquisas sugerem 5-10 anos. Após este período, a alocação gradualmente migra para o alvo de longo prazo. Esta proteção inicial é crítica porque perdas nos primeiros anos têm impacto desproporcional no portfólio."
                                        />
                                        <Input
                                            label="% RF Alvo (Longo Prazo)"
                                            value={params.targetBondPercent}
                                            onChange={(v) =>
                                                updateParam(
                                                    "targetBondPercent",
                                                    v,
                                                )
                                            }
                                            unit="%"
                                            min={5}
                                            max={50}
                                            step={5}
                                            tooltip="Alocação em RF após a fase de proteção e período de transição. Com os primeiros anos críticos superados, pode-se assumir mais risco para capturar retornos. Valores típicos: 20-30%. A transição leva 3 anos. Exemplo: se inicial=40% e alvo=20%, após a tenda a RF reduz gradualmente de 40% → 20%."
                                        />
                                    </div>

                                    {/* Guyton-Klinger Section */}
                                    <div className="mb-6">
                                        <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                                            <Icon name="Settings2" size={16} />
                                            Regras Guyton-Klinger
                                        </h2>
                                        <div className="mb-2">
                                            <Toggle
                                                label="Ativar Guyton-Klinger"
                                                checked={
                                                    params.useGuytonKlinger
                                                }
                                                onChange={(v) =>
                                                    updateParam(
                                                        "useGuytonKlinger",
                                                        v,
                                                    )
                                                }
                                            />
                                            <div className="text-xs text-gray-600 -mt-2 mb-2">
                                                Ajusta saques dinamicamente
                                                conforme desempenho do portfólio
                                            </div>
                                        </div>
                                        {params.useGuytonKlinger && (
                                            <>
                                                <div className="mb-2">
                                                    <Toggle
                                                        label="Regra da Inflação"
                                                        checked={
                                                            params.applyInflationRule
                                                        }
                                                        onChange={(v) =>
                                                            updateParam(
                                                                "applyInflationRule",
                                                                v,
                                                            )
                                                        }
                                                    />
                                                    <div className="text-xs text-gray-600 -mt-2 mb-2">
                                                        Pula ajuste
                                                        inflacionário após anos
                                                        de retorno negativo
                                                    </div>
                                                </div>
                                                <Input
                                                    label="Gatilho Preservation"
                                                    value={
                                                        params.preservationThreshold *
                                                        100
                                                    }
                                                    onChange={(v) =>
                                                        updateParam(
                                                            "preservationThreshold",
                                                            v / 100,
                                                        )
                                                    }
                                                    unit="%"
                                                    min={5}
                                                    max={50}
                                                    step={5}
                                                    tooltip="REGRA DE PRESERVAÇÃO: Quando o portfólio cai, a taxa de retirada atual (saque ÷ portfólio) sobe. Se esta taxa ultrapassar a taxa inicial em mais de X%, o saque é REDUZIDO. Exemplo: taxa inicial 4%, gatilho 20%. Se taxa atual > 4.8% (4% × 1.2), reduz o saque. Protege o portfólio em bear markets."
                                                />
                                                <Input
                                                    label="Gatilho Prosperity"
                                                    value={
                                                        params.prosperityThreshold *
                                                        100
                                                    }
                                                    onChange={(v) =>
                                                        updateParam(
                                                            "prosperityThreshold",
                                                            v / 100,
                                                        )
                                                    }
                                                    unit="%"
                                                    min={5}
                                                    max={50}
                                                    step={5}
                                                    tooltip="REGRA DE PROSPERIDADE: Quando o portfólio sobe, a taxa de retirada atual cai. Se esta taxa ficar abaixo da taxa inicial em mais de X%, o saque é AUMENTADO. Exemplo: taxa inicial 4%, gatilho 20%. Se taxa atual < 3.2% (4% × 0.8), aumenta o saque. Permite aproveitar bull markets."
                                                />
                                                <Input
                                                    label="Ajuste Percentual"
                                                    value={
                                                        params.adjustmentPercent *
                                                        100
                                                    }
                                                    onChange={(v) =>
                                                        updateParam(
                                                            "adjustmentPercent",
                                                            v / 100,
                                                        )
                                                    }
                                                    unit="%"
                                                    min={5}
                                                    max={25}
                                                    step={5}
                                                    tooltip="Magnitude do ajuste quando os gatilhos são ativados. Se 10%, o saque é reduzido/aumentado em 10% do valor atual. Valores típicos: 10% (moderado) a 15% (agressivo). Ajustes maiores protegem mais o portfólio mas causam maior variação no padrão de vida."
                                                />
                                                <div className="text-xs text-gray-500 mb-3 p-2 bg-midnight rounded">
                                                    <strong>Resumo G-K:</strong>{" "}
                                                    Taxa inicial{" "}
                                                    {params.withdrawalRate}% →
                                                    Gatilhos em{" "}
                                                    {(
                                                        params.withdrawalRate *
                                                        (1 +
                                                            params.preservationThreshold)
                                                    ).toFixed(1)}
                                                    % (↓) e{" "}
                                                    {(
                                                        params.withdrawalRate *
                                                        (1 -
                                                            params.prosperityThreshold)
                                                    ).toFixed(1)}
                                                    % (↑) → Ajuste de ±
                                                    {(
                                                        params.adjustmentPercent *
                                                        100
                                                    ).toFixed(0)}
                                                    %
                                                </div>
                                            </>
                                        )}
                                        {!params.useGuytonKlinger && (
                                            <div className="text-xs text-gray-500 p-2 bg-midnight rounded">
                                                Desativado: saques recebem
                                                apenas ajuste inflacionário
                                                anual, sem regras dinâmicas de
                                                preservação ou prosperidade.
                                            </div>
                                        )}
                                    </div>

                                    {/* Minimum Withdrawal Section */}
                                    <div className="mb-6">
                                        <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                                            <Icon
                                                name="ShieldAlert"
                                                size={16}
                                            />
                                            Saque Mínimo Necessário
                                        </h2>
                                        <div className="mb-2">
                                            <Toggle
                                                label="Definir Saque Mínimo"
                                                checked={
                                                    params.useMinimumWithdrawal
                                                }
                                                onChange={(v) =>
                                                    updateParam(
                                                        "useMinimumWithdrawal",
                                                        v,
                                                    )
                                                }
                                            />
                                            <div className="text-xs text-gray-600 -mt-2 mb-2">
                                                Garante um piso de saque
                                                independente das regras G-K
                                            </div>
                                        </div>
                                        {params.useMinimumWithdrawal && (
                                            <BRLInputWithUSD
                                                label="Valor Mínimo Anual"
                                                valueBRL={
                                                    params.minimumWithdrawalBRL
                                                }
                                                onChange={(v) =>
                                                    updateParam(
                                                        "minimumWithdrawalBRL",
                                                        v,
                                                    )
                                                }
                                                fx={params.initialFX}
                                                min={0}
                                                step={10000}
                                                tooltip="O saque NUNCA será menor que este valor, mesmo que as regras de Guyton-Klinger recomendem menos. Representa seu custo de vida mínimo irredutível (despesas essenciais: moradia, alimentação, saúde, impostos). ATENÇÃO: Forçar um saque acima do recomendado por G-K acelera a depleção do portfólio. A análise de stress mostrará quando e por quanto tempo este mínimo foi necessário."
                                            />
                                        )}
                                        <div className="text-xs text-gray-500 mt-1 p-2 bg-midnight rounded">
                                            {params.useMinimumWithdrawal ? (
                                                <span className="text-warning">
                                                    ⚠️ Saque mínimo garantido:{" "}
                                                    {formatCurrency(
                                                        params.minimumWithdrawalBRL,
                                                    )}
                                                    /ano (
                                                    {formatCurrency(
                                                        params.minimumWithdrawalBRL /
                                                            12,
                                                    )}
                                                    /mês). Pode acelerar
                                                    depleção em cenários
                                                    adversos.
                                                </span>
                                            ) : (
                                                "✓ Desativado: saques seguem apenas as regras de G-K (máxima preservação do portfólio)"
                                            )}
                                        </div>
                                    </div>

                                    {/* INSS / Previdência Social */}
                                    <div className="mb-6">
                                        <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                                            <Icon name="Landmark" size={16} /> Benefício INSS
                                        </h2>
                                        <Toggle label="Receber Benefício INSS" checked={params.useINSS}
                                            onChange={(v) => updateParam('useINSS', v)} />
                                        {params.useINSS && <>
                                            <Input label="Idade Atual (Aposentadoria)" value={params.currentAge}
                                                onChange={(v) => updateParam('currentAge', Math.round(v))}
                                                unit="anos" min={40} max={80} step={1}
                                                tooltip="Sua idade no início da simulação (ano 1). Usada para calcular em que ano o INSS começa." />
                                            <Input label="Idade de Início do INSS" value={params.inssStartAge}
                                                onChange={(v) => updateParam('inssStartAge', Math.round(v))}
                                                unit="anos" min={params.currentAge} max={params.currentAge + params.years - 1} step={1}
                                                tooltip="Idade de elegibilidade ao INSS. Em 2024: 65 anos (homens, 20 anos contrib.), 62 anos (mulheres, 15 anos contrib.)." />
                                            <BRLInputWithUSD label="Benefício Mensal INSS" valueBRL={params.inssMonthlyBRL}
                                                onChange={(v) => updateParam('inssMonthlyBRL', v)}
                                                fx={params.initialFX} min={0} step={500}
                                                tooltip="Valor mensal bruto em BRL. Reajustado pelo IPCA simulado a cada ano. Reduz o saque do portfólio — você retira menos dos investimentos. INSS já tributado na fonte." />
                                            {params.inssStartAge >= params.currentAge + params.years && (
                                                <div className="text-xs text-warning p-2 bg-warning/10 rounded mt-1">
                                                    ⚠ INSS nunca ativará: horizonte de {params.years} anos termina antes dos {params.inssStartAge} anos
                                                </div>
                                            )}
                                            <div className="text-xs text-gray-500 mt-2 p-2 bg-midnight rounded">
                                                {params.inssStartAge <= params.currentAge
                                                    ? `✓ INSS ativo desde o início: R$ ${(params.inssMonthlyBRL * 12 / 1000).toFixed(0)}k/ano, corrigido pelo IPCA`
                                                    : `✓ INSS inicia no ano ${params.inssStartAge - params.currentAge + 1} (aos ${params.inssStartAge} anos): R$ ${(params.inssMonthlyBRL * 12 / 1000).toFixed(0)}k/ano`
                                                }
                                            </div>
                                        </>}
                                    </div>

                                    {/* Bucket Strategy Section */}
                                    <div className="mb-6">
                                        <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                                            <Icon name="Layers" size={16} />
                                            Estratégia de Buckets
                                        </h2>
                                        <div className="mb-2">
                                            <Toggle
                                                label="Usar Buckets"
                                                checked={
                                                    params.useBucketStrategy
                                                }
                                                onChange={(v) =>
                                                    updateParam(
                                                        "useBucketStrategy",
                                                        v,
                                                    )
                                                }
                                            />
                                            <div className="text-xs text-gray-600 -mt-2 mb-2">
                                                Separa fontes de saque por
                                                horizonte de tempo
                                            </div>
                                        </div>
                                        {params.useBucketStrategy && (
                                            <Input
                                                label="Anos de Proteção"
                                                value={params.bucketYears}
                                                onChange={(v) =>
                                                    updateParam(
                                                        "bucketYears",
                                                        v,
                                                    )
                                                }
                                                unit="anos"
                                                min={1}
                                                max={15}
                                                step={1}
                                                tooltip="BUCKET STRATEGY: Nos primeiros X anos, os saques vêm EXCLUSIVAMENTE da renda fixa, protegendo a renda variável de vendas forçadas durante quedas de mercado. Isso dá tempo para a RV se recuperar de bear markets. Após este período, pode-se rebalancear normalmente. Típico: 3-7 anos. Deve ser compatível com a % RF inicial da estratégia tenda."
                                            />
                                        )}
                                        <div className="text-xs text-gray-500 p-2 bg-midnight rounded">
                                            {params.useBucketStrategy
                                                ? `🪣 Primeiros ${params.bucketYears} anos: saques vêm da RF (${params.tentInitialBondPercent}% = ${formatCurrency(params.initialPortfolioUSD * params.initialFX * (params.tentInitialBondPercent / 100))})`
                                                : "Desativado: saques proporcionais à alocação atual RV/RF"}
                                        </div>
                                    </div>

                                    {/* Advanced Modeling Section */}
                                    <div className="mb-6">
                                        <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                                            <Icon
                                                name="FlaskConical"
                                                size={16}
                                            />
                                            Modelagem Avançada
                                        </h2>

                                        {/* Distribution Model */}
                                        <div className="mb-2 p-2 bg-midnight rounded border border-gray-800">
                                            <Toggle
                                                label="Distribuição T-Student"
                                                checked={params.useStudentT}
                                                onChange={(v) =>
                                                    updateParam(
                                                        "useStudentT",
                                                        v,
                                                    )
                                                }
                                            />
                                            <div className="text-xs text-gray-600 -mt-2 mb-1">
                                                Modela 'cisnes negros' com
                                                caudas mais gordas que normal
                                            </div>
                                            {params.useStudentT && (
                                                <Input
                                                    label="Graus de Liberdade (ν)"
                                                    value={
                                                        params.degreesOfFreedom
                                                    }
                                                    onChange={(v) =>
                                                        updateParam(
                                                            "degreesOfFreedom",
                                                            v,
                                                        )
                                                    }
                                                    min={3}
                                                    max={30}
                                                    step={1}
                                                    tooltip="A distribuição T-Student captura eventos extremos ('cisnes negros') melhor que a distribuição normal. Os graus de liberdade (ν) controlam o 'peso' das caudas: valores menores = caudas mais gordas = mais eventos extremos. Típico para mercados: ν=5-7. Com ν=5, há ~3x mais chance de retornos além de 3 desvios padrão comparado à normal. Com ν→∞, converge para normal."
                                                />
                                            )}
                                        </div>

                                        {/* Dynamic Correlation */}
                                        <div className="mb-2 p-2 bg-midnight rounded border border-gray-800">
                                            <Toggle
                                                label="Correlação Dinâmica FX"
                                                checked={
                                                    params.useDynamicCorrelation
                                                }
                                                onChange={(v) =>
                                                    updateParam(
                                                        "useDynamicCorrelation",
                                                        v,
                                                    )
                                                }
                                            />
                                            <div className="text-xs text-gray-600 -mt-2 mb-1">
                                                Dólar sobe mais forte quando
                                                bolsa cai forte
                                            </div>
                                            {params.useDynamicCorrelation && (
                                                <>
                                                    <Input
                                                        label="Correlação Base"
                                                        value={
                                                            params.baseCorrelation
                                                        }
                                                        onChange={(v) =>
                                                            updateParam(
                                                                "baseCorrelation",
                                                                v,
                                                            )
                                                        }
                                                        min={-0.9}
                                                        max={0}
                                                        step={0.1}
                                                        tooltip="Correlação entre retornos de RV e variação cambial em condições NORMAIS de mercado. Valor NEGATIVO significa que quando a bolsa cai, o dólar sobe (protegendo parcialmente o investidor brasileiro). Historicamente ~-0.3 a -0.5 para Brasil. Valor 0 = sem correlação. Esta é a correlação 'base' que é amplificada em crises."
                                                    />
                                                    <Input
                                                        label="Multiplicador em Crises"
                                                        value={
                                                            params.stressCorrelationMultiplier
                                                        }
                                                        onChange={(v) =>
                                                            updateParam(
                                                                "stressCorrelationMultiplier",
                                                                v,
                                                            )
                                                        }
                                                        min={1}
                                                        max={3}
                                                        step={0.1}
                                                        tooltip="Em crises (quedas >1σ), a correlação negativa se INTENSIFICA: investidores globais fogem para ativos seguros (USD), enfraquecendo moedas emergentes como o BRL. Este multiplicador define quanto a correlação base é amplificada. Ex: base -0.4 com mult. 2.0 → correlação -0.8 em crises severas. Fenômeno conhecido como 'flight to quality'."
                                                    />
                                                </>
                                            )}
                                        </div>

                                        {/* IPCA Model */}
                                        <div className="mb-2 p-2 bg-midnight rounded border border-gray-800">
                                            <Toggle
                                                label="Modelo IPCA + Juro Real"
                                                checked={params.useIPCAModel}
                                                onChange={(v) =>
                                                    updateParam(
                                                        "useIPCAModel",
                                                        v,
                                                    )
                                                }
                                            />
                                            <div className="text-xs text-gray-600 -mt-2 mb-1">
                                                RF = IPCA variável + spread real
                                                (mais realista)
                                            </div>
                                            {params.useIPCAModel && (
                                                <>
                                                    <Input
                                                        label="IPCA Esperado"
                                                        value={
                                                            params.expectedIPCA
                                                        }
                                                        onChange={(v) =>
                                                            updateParam(
                                                                "expectedIPCA",
                                                                v,
                                                            )
                                                        }
                                                        unit="%"
                                                        min={0}
                                                        max={15}
                                                        step={0.5}
                                                        tooltip="Inflação média anual esperada no Brasil (IPCA). A meta do BC é 3% com banda de 1.5pp. Historicamente fica entre 4-6%. O modelo simula variação ano a ano ao redor desta média, com leve correlação negativa com RV (inflação tende a subir em crises econômicas). IPCA é limitado entre 0% e 15% na simulação."
                                                    />
                                                    <Input
                                                        label="Spread Real sobre IPCA"
                                                        value={
                                                            params.realSpread
                                                        }
                                                        onChange={(v) =>
                                                            updateParam(
                                                                "realSpread",
                                                                v,
                                                            )
                                                        }
                                                        unit="%"
                                                        min={0}
                                                        max={10}
                                                        step={0.5}
                                                        tooltip="Prêmio de juro REAL (acima da inflação) da renda fixa brasileira. Tesouro IPCA+ historicamente paga 4-6% + IPCA. Com este modelo ativado, o retorno da RF = IPCA do ano + este spread. Substitui o 'Retorno RF Real' fixo da seção anterior. Mais realista pois captura a relação entre inflação e juros nominais."
                                                    />
                                                </>
                                            )}
                                        </div>

                                        {/* Tax Model */}
                                        <div className="mb-2 p-2 bg-midnight rounded border border-gray-800">
                                            <Toggle
                                                label="Modelo Tributário"
                                                checked={params.useTaxModel}
                                                onChange={(v) =>
                                                    updateParam(
                                                        "useTaxModel",
                                                        v,
                                                    )
                                                }
                                            />
                                            <div className="text-xs text-gray-600 -mt-2 mb-1">
                                                Desconta IR sobre ganhos nos
                                                saques
                                            </div>
                                            {params.useTaxModel && (
                                                <>
                                                    <Input
                                                        label="IR ETFs Irlandeses"
                                                        value={
                                                            params.equityTaxRate
                                                        }
                                                        onChange={(v) =>
                                                            updateParam(
                                                                "equityTaxRate",
                                                                v,
                                                            )
                                                        }
                                                        unit="%"
                                                        min={0}
                                                        max={30}
                                                        step={1}
                                                        tooltip="Alíquota de IR sobre GANHOS de capital em ETFs irlandeses (não sobre principal). ETFs irlandeses (UCITS) são tributados a 15% no Brasil sobre o ganho na venda. O modelo estima que a proporção de ganho aumenta ~6% ao ano até 60% máximo. Ex: ano 10 → ~60% do saque é ganho → IR = saque × 60% × 15%."
                                                    />
                                                    <Input
                                                        label="IR Renda Fixa BR"
                                                        value={
                                                            params.fixedIncomeTaxRate
                                                        }
                                                        onChange={(v) =>
                                                            updateParam(
                                                                "fixedIncomeTaxRate",
                                                                v,
                                                            )
                                                        }
                                                        unit="%"
                                                        min={0}
                                                        max={25}
                                                        step={1}
                                                        tooltip="Alíquota simplificada de IR sobre rendimentos da RF brasileira. Na realidade, segue tabela regressiva (22.5% a 15% conforme prazo). Para simulação de longo prazo, 15% é uma aproximação razoável. Aplicado sobre a parcela de ganhos dos saques de RF."
                                                    />
                                                </>
                                            )}
                                        </div>

                                        {/* Sequence Constraint - NON-IID MODE */}
                                        <div className="p-2 bg-midnight rounded border border-warning/30">
                                            <Toggle
                                                label="Restrição de Sequência (NON-IID)"
                                                checked={
                                                    params.useSequenceConstraint
                                                }
                                                onChange={(v) =>
                                                    updateParam(
                                                        "useSequenceConstraint",
                                                        v,
                                                    )
                                                }
                                            />
                                            <div className="text-xs text-warning -mt-2 mb-2">
                                                ⚠️ ATENÇÃO: Viola premissa IID
                                                do Monte Carlo puro
                                            </div>
                                            {params.useSequenceConstraint && (
                                                <Input
                                                    label="Máx. Anos Negativos Consecutivos"
                                                    value={
                                                        params.maxNegativeSequence
                                                    }
                                                    onChange={(v) =>
                                                        updateParam(
                                                            "maxNegativeSequence",
                                                            v,
                                                        )
                                                    }
                                                    min={3}
                                                    max={20}
                                                    step={1}
                                                    tooltip="MODO NON-IID: Limita sequências de retornos negativos, violando a premissa de independência (IID) do Monte Carlo puro. Historicamente, S&P 500 nunca teve mais de 4 anos negativos consecutivos (1929-1932). Ativar esta opção pode gerar resultados MAIS OTIMISTAS que a realidade estatística. Use com cautela e documente nas análises."
                                                />
                                            )}
                                        </div>

                                        <div className="text-xs text-gray-500 mt-3 p-2 bg-surface rounded space-y-1">
                                            <div className="font-semibold text-gray-400 mb-1">
                                                Resumo da Modelagem:
                                            </div>
                                            <div>
                                                •{" "}
                                                <span
                                                    className={
                                                        params.useSequenceConstraint
                                                            ? "text-warning"
                                                            : "text-accent"
                                                    }
                                                >
                                                    Modo:{" "}
                                                    {params.useSequenceConstraint
                                                        ? `NON-IID (máx ${params.maxNegativeSequence} anos negativos)`
                                                        : "Monte Carlo Puro (IID)"}
                                                </span>
                                            </div>
                                            {params.useStudentT && (
                                                <div>
                                                    •{" "}
                                                    <span className="text-purple-400">
                                                        T-Student (ν=
                                                        {
                                                            params.degreesOfFreedom
                                                        }
                                                        )
                                                    </span>
                                                    : caudas gordas ~aproximadas
                                                </div>
                                            )}
                                            {params.useDynamicCorrelation && (
                                                <div>
                                                    •{" "}
                                                    <span className="text-blue-400">
                                                        Correl. dinâmica
                                                    </span>
                                                    : {params.baseCorrelation} →{" "}
                                                    {(
                                                        params.baseCorrelation *
                                                        params.stressCorrelationMultiplier
                                                    ).toFixed(1)}{" "}
                                                    em crises
                                                </div>
                                            )}
                                            {params.useIPCAModel && (
                                                <div>
                                                    •{" "}
                                                    <span className="text-green-400">
                                                        Modelo IPCA
                                                    </span>
                                                    : RF = IPCA~
                                                    {params.expectedIPCA}% +{" "}
                                                    {params.realSpread}% real
                                                </div>
                                            )}
                                            {params.useTaxModel && (
                                                <div>
                                                    •{" "}
                                                    <span className="text-yellow-400">
                                                        Tributação
                                                    </span>
                                                    : {params.equityTaxRate}% RV
                                                    /{" "}
                                                    {params.fixedIncomeTaxRate}%
                                                    RF
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}

                            {params.sidebarMode === "simple" && (
                                <div className="text-xs text-gray-500 p-3 bg-midnight rounded-lg border border-gray-800 mb-6">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Icon name="Info" size={12} />
                                        <span className="font-medium text-gray-400">
                                            Usando valores padrão
                                        </span>
                                    </div>
                                    Retornos, volatilidade, regras G-K,
                                    tributação e outros parâmetros avançados
                                    estão configurados com valores recomendados.
                                    Troque para{" "}
                                    <strong className="text-gray-300">
                                        Avançado
                                    </strong>{" "}
                                    para personalizar.
                                </div>
                            )}

                            {/* Simulation Section */}
                            <div className="mb-6">
                                <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                                    <Icon name="Play" size={16} />
                                    Simulação
                                </h2>
                                <Input
                                    label="Horizonte (Duração)"
                                    value={params.years}
                                    onChange={(v) => updateParam("years", v)}
                                    unit="anos"
                                    min={10}
                                    max={50}
                                    step={5}
                                    tooltip="Por quantos anos você precisa que seu portfólio dure. Para aposentadoria tradicional (65 anos), considere 30 anos. Para FIRE (aposentadoria antecipada aos 40-50 anos), considere 40-50 anos. Este é o período sobre o qual a simulação avalia a sobrevivência do portfólio."
                                />
                                <Input
                                    label="Iterações Monte Carlo"
                                    value={params.iterations}
                                    onChange={(v) =>
                                        updateParam("iterations", v)
                                    }
                                    min={500}
                                    max={10000}
                                    step={500}
                                    tooltip="Número de cenários independentes simulados. Cada iteração gera uma 'história alternativa' de retornos, câmbio e inflação. Mais iterações = resultados mais estáveis e confiáveis, mas mais demorado. 1000-2000 é um bom equilíbrio entre precisão e velocidade. Para análise final, use 5000+."
                                />
                                <div className="p-2 bg-midnight rounded border border-gray-800">
                                    <div className="flex items-center gap-2 mb-2">
                                        <label className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                                            Seed (Reprodutibilidade)
                                            <Tooltip text="Para reproduzir exatamente os mesmos resultados, insira um número inteiro como seed. Deixe vazio para gerar uma seed aleatória a cada execução. O seed usado será exibido após a simulação para que você possa salvá-lo e reproduzir os resultados posteriormente." />
                                        </label>
                                    </div>
                                    <input
                                        type="number"
                                        value={params.seed || ""}
                                        onChange={(e) =>
                                            updateParam(
                                                "seed",
                                                e.target.value
                                                    ? parseInt(e.target.value)
                                                    : null,
                                            )
                                        }
                                        placeholder="Aleatório"
                                        className="w-full bg-deep border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-accent input-focus transition-all"
                                    />
                                    <div className="text-xs text-gray-600 mt-1">
                                        {params.seed
                                            ? `Seed fixo: ${params.seed}`
                                            : "Seed aleatório a cada execução"}
                                    </div>
                                </div>
                            </div>

                            {/* Run Button */}
                            {params.objectiveMode === "preservation" ? (
                                <button
                                    onClick={runSimulation}
                                    disabled={isRunning || isOptimizing}
                                    className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2
                                    ${
                                        isRunning || isOptimizing
                                            ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                                            : "bg-gradient-to-r from-accent to-accent-dim hover:opacity-90 text-white"
                                    } transition-all`}
                                >
                                    {isRunning ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                                            Simulando...
                                        </>
                                    ) : (
                                        <>
                                            <Icon name="Play" size={18} />
                                            Executar Simulação
                                        </>
                                    )}
                                </button>
                            ) : (
                                <button
                                    onClick={runOptimization}
                                    disabled={isRunning || isOptimizing}
                                    className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2
                                    ${
                                        isRunning || isOptimizing
                                            ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                                            : "bg-gradient-to-r from-warning to-orange-600 hover:opacity-90 text-white"
                                    } transition-all`}
                                >
                                    {isOptimizing ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                                            Otimizando...
                                        </>
                                    ) : (
                                        <>
                                            <Icon name="Sparkles" size={18} />
                                            Calcular Saque Ótimo
                                        </>
                                    )}
                                </button>
                            )}

                            {/* Optimization Progress */}
                            {isOptimizing && optimizationProgress && (
                                <div className="mt-3 p-3 bg-warning/10 border border-warning/30 rounded-lg">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-3 h-3 border-2 border-warning border-t-transparent rounded-full animate-spin" />
                                        <span className="text-xs font-medium text-warning">
                                            Fase {optimizationProgress.phase}/2
                                        </span>
                                    </div>
                                    <div className="text-xs text-gray-400 mb-2">
                                        {optimizationProgress.message}
                                    </div>
                                    <div className="w-full bg-midnight rounded-full h-1.5">
                                        <div
                                            className="bg-warning h-1.5 rounded-full transition-all duration-300"
                                            style={{
                                                width: `${
                                                    optimizationProgress.phase ===
                                                    1
                                                        ? Math.min(
                                                              optimizationProgress.step *
                                                                  10,
                                                              50,
                                                          )
                                                        : 50 +
                                                          Math.min(
                                                              optimizationProgress.step *
                                                                  10,
                                                              50,
                                                          )
                                                }%`,
                                            }}
                                        />
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">
                                        {optimizationProgress.totalSimulations?.toLocaleString() ||
                                            0}{" "}
                                        simulações executadas
                                    </div>
                                </div>
                            )}

                            {/* Initial values display */}
                            <div className="mt-4 p-3 bg-midnight rounded-lg border border-gray-800">
                                <div className="text-xs text-gray-500 mb-2">
                                    {params.objectiveMode === "preservation"
                                        ? "Valores Iniciais Calculados"
                                        : "Configuração para Otimização"}
                                </div>
                                <div className="space-y-1 text-xs">
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">
                                            Portfólio Total:
                                        </span>
                                        <span className="font-mono text-accent">
                                            {formatCurrency(
                                                params.initialPortfolioUSD *
                                                    params.initialFX,
                                            )}
                                        </span>
                                    </div>
                                    <div className="flex justify-between pl-2 text-gray-500">
                                        <span>
                                            ├ RV (
                                            {100 -
                                                params.tentInitialBondPercent}
                                            %):
                                        </span>
                                        <span className="font-mono">
                                            {formatCurrency(
                                                params.initialPortfolioUSD *
                                                    params.initialFX *
                                                    (1 -
                                                        params.tentInitialBondPercent /
                                                            100),
                                            )}
                                        </span>
                                    </div>
                                    <div className="flex justify-between pl-2 text-gray-500">
                                        <span>
                                            └ RF (
                                            {params.tentInitialBondPercent}%):
                                        </span>
                                        <span className="font-mono">
                                            {formatCurrency(
                                                params.initialPortfolioUSD *
                                                    params.initialFX *
                                                    (params.tentInitialBondPercent /
                                                        100),
                                            )}
                                        </span>
                                    </div>
                                    {params.objectiveMode === "preservation" ? (
                                        <>
                                            <div className="flex justify-between pt-1 border-t border-gray-800 mt-1">
                                                <span className="text-gray-400">
                                                    Saque Anual:
                                                </span>
                                                <span className="font-mono text-info">
                                                    {formatCurrency(
                                                        params.initialPortfolioUSD *
                                                            (params.withdrawalRate /
                                                                100) *
                                                            params.initialFX,
                                                    )}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-400">
                                                    Saque Mensal:
                                                </span>
                                                <span className="font-mono text-info">
                                                    {formatCurrency(
                                                        (params.initialPortfolioUSD *
                                                            (params.withdrawalRate /
                                                                100) *
                                                            params.initialFX) /
                                                            12,
                                                    )}
                                                </span>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex justify-between pt-1 border-t border-gray-800 mt-1">
                                                <span className="text-gray-400">
                                                    Confiança Alvo:
                                                </span>
                                                <span className="font-mono text-warning">
                                                    {params.targetSuccessRate}%
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-400">
                                                    Patrimônio Final Alvo:
                                                </span>
                                                <span className="font-mono text-warning">
                                                    {params.targetEndBalance ===
                                                    0
                                                        ? "Zero (Die With Zero)"
                                                        : formatCurrency(
                                                              params.targetEndBalance,
                                                          )}
                                                </span>
                                            </div>
                                            {optimizationResult && (
                                                <>
                                                    <div className="flex justify-between pt-1 border-t border-warning/30 mt-1">
                                                        <span className="text-warning">
                                                            Taxa Ótima:
                                                        </span>
                                                        <span className="font-mono text-warning font-semibold">
                                                            {optimizationResult.optimalSWR.toFixed(
                                                                2,
                                                            )}
                                                            %
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-warning">
                                                            Saque Mensal:
                                                        </span>
                                                        <span className="font-mono text-warning font-semibold">
                                                            {formatCurrency(
                                                                optimizationResult.monthlyWithdrawalBRL,
                                                            )}
                                                        </span>
                                                    </div>
                                                </>
                                            )}
                                        </>
                                    )}
                                    {params.useMinimumWithdrawal && (
                                        <div className="flex justify-between pt-1 border-t border-gray-800 mt-1">
                                            <span className="text-gray-400">
                                                Mínimo Aceitável:
                                            </span>
                                            <span className="font-mono text-warning">
                                                {formatCurrency(
                                                    params.minimumWithdrawalBRL,
                                                )}
                                                /ano
                                            </span>
                                        </div>
                                    )}
                                    {params.useBucketStrategy && (
                                        <div className="flex justify-between pt-1 border-t border-gray-800 mt-1">
                                            <span className="text-gray-400">
                                                Bucket RF ({params.bucketYears}
                                                a):
                                            </span>
                                            <span className="font-mono text-blue-400">
                                                {formatCurrency(
                                                    params.initialPortfolioUSD *
                                                        params.initialFX *
                                                        (params.tentInitialBondPercent /
                                                            100),
                                                )}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </aside>

                        {/* Main Content */}
                        <main className="flex-1 p-4 lg:p-6 lg:overflow-y-auto">
                            {!results ? (
                                <div className="flex justify-center pt-10">
                                    <div className="text-center max-w-md">
                                        <div
                                            className={`w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center ${
                                                params.objectiveMode ===
                                                "consumption"
                                                    ? "bg-warning/20"
                                                    : "bg-surface"
                                            }`}
                                        >
                                            <Icon
                                                name={
                                                    params.objectiveMode ===
                                                    "consumption"
                                                        ? "Sparkles"
                                                        : "LineChart"
                                                }
                                                size={40}
                                                className={
                                                    params.objectiveMode ===
                                                    "consumption"
                                                        ? "text-warning"
                                                        : "text-accent"
                                                }
                                            />
                                        </div>
                                        <h2 className="text-2xl font-bold mb-3">
                                            {params.objectiveMode ===
                                            "consumption"
                                                ? "Otimizador de Consumo Máximo"
                                                : "Simulador Monte Carlo"}
                                        </h2>
                                        <p className="text-gray-400 mb-6">
                                            {params.objectiveMode ===
                                            "consumption" ? (
                                                <>
                                                    Clique em{" "}
                                                    <strong className="text-warning">
                                                        "Calcular Saque Ótimo"
                                                    </strong>{" "}
                                                    para descobrir a maior taxa
                                                    de saque que atinge{" "}
                                                    {params.targetSuccessRate}%
                                                    de probabilidade de sucesso
                                                    em {params.years} anos.
                                                    Filosofia "Die With Zero".
                                                </>
                                            ) : (
                                                <>
                                                    Configure os parâmetros na
                                                    barra lateral e execute a
                                                    simulação para visualizar os
                                                    cenários de aposentadoria
                                                    baseados na estratégia Safe
                                                    Withdrawal Rate com as
                                                    regras de Guyton-Klinger.
                                                </>
                                            )}
                                        </p>
                                        <div className="grid grid-cols-2 gap-3 text-left">
                                            {params.objectiveMode ===
                                            "consumption" ? (
                                                <>
                                                    <div className="p-3 bg-warning/10 rounded-lg border border-warning/30">
                                                        <Icon
                                                            name="Search"
                                                            size={18}
                                                            className="text-warning mb-2"
                                                        />
                                                        <div className="text-sm font-medium">
                                                            Busca Inteligente
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            Bissecção em duas
                                                            fases
                                                        </div>
                                                    </div>
                                                    <div className="p-3 bg-warning/10 rounded-lg border border-warning/30">
                                                        <Icon
                                                            name="Target"
                                                            size={18}
                                                            className="text-warning mb-2"
                                                        />
                                                        <div className="text-sm font-medium">
                                                            {
                                                                params.targetSuccessRate
                                                            }
                                                            % Confiança
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            Probabilidade de
                                                            sucesso
                                                        </div>
                                                    </div>
                                                    <div className="p-3 bg-warning/10 rounded-lg border border-warning/30">
                                                        <Icon
                                                            name="TrendingUp"
                                                            size={18}
                                                            className="text-warning mb-2"
                                                        />
                                                        <div className="text-sm font-medium">
                                                            Maximizar Consumo
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            Maior saque possível
                                                        </div>
                                                    </div>
                                                    <div className="p-3 bg-warning/10 rounded-lg border border-warning/30">
                                                        <Icon
                                                            name="Zap"
                                                            size={18}
                                                            className="text-warning mb-2"
                                                        />
                                                        <div className="text-sm font-medium">
                                                            Die With Zero
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            Aproveitar a vida ao
                                                            máximo
                                                        </div>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="p-3 bg-surface rounded-lg border border-gray-800">
                                                        <Icon
                                                            name="Shield"
                                                            size={18}
                                                            className="text-accent mb-2"
                                                        />
                                                        <div className="text-sm font-medium">
                                                            Estratégia Tenda
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            Proteção nos
                                                            primeiros anos
                                                        </div>
                                                    </div>
                                                    <div className="p-3 bg-surface rounded-lg border border-gray-800">
                                                        <Icon
                                                            name="ArrowUpDown"
                                                            size={18}
                                                            className="text-info mb-2"
                                                        />
                                                        <div className="text-sm font-medium">
                                                            Guyton-Klinger
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            Ajustes dinâmicos
                                                        </div>
                                                    </div>
                                                    <div className="p-3 bg-surface rounded-lg border border-gray-800">
                                                        <Icon
                                                            name="DollarSign"
                                                            size={18}
                                                            className="text-warning mb-2"
                                                        />
                                                        <div className="text-sm font-medium">
                                                            Câmbio Dinâmico
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            Correlação USD/BRL
                                                        </div>
                                                    </div>
                                                    <div className="p-3 bg-surface rounded-lg border border-gray-800">
                                                        <Icon
                                                            name="Target"
                                                            size={18}
                                                            className="text-danger mb-2"
                                                        />
                                                        <div className="text-sm font-medium">
                                                            Taxa Sobrevivência
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            Análise de cenários
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="fade-in space-y-6">
                                    {/* Optimization Result Card (Consumption Mode) */}
                                    {params.objectiveMode === "consumption" &&
                                        optimizationResult && (
                                            <div className="bg-gradient-to-r from-warning/20 to-orange-600/20 rounded-xl p-5 border border-warning/40">
                                                <div className="flex items-start justify-between mb-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-12 h-12 rounded-xl bg-warning/20 flex items-center justify-center">
                                                            <Icon
                                                                name="Sparkles"
                                                                size={24}
                                                                className="text-warning"
                                                            />
                                                        </div>
                                                        <div>
                                                            <h3 className="font-bold text-lg text-warning">
                                                                Plano de Consumo
                                                                Máximo
                                                            </h3>
                                                            <p className="text-xs text-gray-400">
                                                                Com{" "}
                                                                {
                                                                    params.targetSuccessRate
                                                                }
                                                                % de confiança
                                                                por{" "}
                                                                {params.years}{" "}
                                                                anos
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-xs text-gray-500">
                                                            Taxa Ótima
                                                        </div>
                                                        <div className="text-2xl font-bold font-mono text-warning">
                                                            {optimizationResult.optimalSWR.toFixed(
                                                                2,
                                                            )}
                                                            %
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            ±
                                                            {
                                                                params.optimizerTolerance
                                                            }
                                                            %
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4">
                                                    <div className="bg-midnight/50 rounded-lg p-3 text-center">
                                                        <div className="text-xs text-gray-500 mb-1">
                                                            Saque Mensal
                                                        </div>
                                                        <div className="text-xl font-bold font-mono text-white">
                                                            {formatCurrency(
                                                                optimizationResult.monthlyWithdrawalBRL,
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="bg-midnight/50 rounded-lg p-3 text-center">
                                                        <div className="text-xs text-gray-500 mb-1">
                                                            Saque Anual
                                                        </div>
                                                        <div className="text-xl font-bold font-mono text-white">
                                                            {formatCurrency(
                                                                optimizationResult.annualWithdrawalBRL,
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="bg-midnight/50 rounded-lg p-3 text-center">
                                                        <div className="text-xs text-gray-500 mb-1">
                                                            Sobrevivência Real
                                                        </div>
                                                        <div className="text-xl font-bold font-mono text-accent">
                                                            {optimizationResult.survivalRate.toFixed(
                                                                1,
                                                            )}
                                                            %
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between text-xs text-gray-500 border-t border-warning/20 pt-3">
                                                    <div className="flex items-center gap-4">
                                                        <span>
                                                            Patrimônio Final
                                                            Mediano:{" "}
                                                            <span className="text-white font-mono">
                                                                {formatCurrency(
                                                                    optimizationResult.medianEndBalance,
                                                                )}
                                                            </span>
                                                        </span>
                                                        {params.targetEndBalance >
                                                            0 && (
                                                            <span className="text-gray-600">
                                                                | Meta:{" "}
                                                                {formatCurrency(
                                                                    params.targetEndBalance,
                                                                )}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span>
                                                            {
                                                                optimizationResult.searchSteps
                                                            }{" "}
                                                            passos
                                                        </span>
                                                        <span>
                                                            {(
                                                                optimizationResult.totalSimulations /
                                                                1000
                                                            ).toFixed(1)}
                                                            k simulações
                                                        </span>
                                                        <span>
                                                            {(
                                                                optimizationResult.computeTimeMs /
                                                                1000
                                                            ).toFixed(1)}
                                                            s
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="mt-4 p-3 bg-midnight/50 rounded-lg text-sm text-gray-300">
                                                    <Icon
                                                        name="Info"
                                                        size={14}
                                                        className="inline mr-2 text-warning"
                                                    />
                                                    <strong>
                                                        Interpretação:
                                                    </strong>{" "}
                                                    Para{" "}
                                                    {params.targetSuccessRate}%
                                                    de chance de não faltar
                                                    dinheiro em {params.years}{" "}
                                                    anos, usando as regras de
                                                    Guyton-Klinger, você pode
                                                    sacar inicialmente{" "}
                                                    <strong className="text-warning">
                                                        {formatCurrency(
                                                            optimizationResult.monthlyWithdrawalBRL,
                                                        )}
                                                        /mês
                                                    </strong>{" "}
                                                    (taxa de{" "}
                                                    <strong className="text-warning">
                                                        {optimizationResult.optimalSWR.toFixed(
                                                            2,
                                                        )}
                                                        %
                                                    </strong>
                                                    ).
                                                    {params.targetEndBalance ===
                                                        0 &&
                                                        ' Esta é a filosofia "Die With Zero" - maximizar consumo em vida.'}
                                                </div>
                                            </div>
                                        )}

                                    {/* Reproducibility Info Bar */}
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 p-3 bg-surface rounded-lg border border-gray-800 text-xs">
                                        <div className="flex items-center gap-4">
                                            <span className="text-gray-400">
                                                Modo:{" "}
                                                <span
                                                    className={
                                                        results.mode ===
                                                        "pure_iid"
                                                            ? "text-accent font-semibold"
                                                            : "text-warning font-semibold"
                                                    }
                                                >
                                                    {results.mode === "pure_iid"
                                                        ? "Monte Carlo Puro (IID)"
                                                        : "Monte Carlo Restrito (NON-IID)"}
                                                </span>
                                            </span>
                                            <span className="text-gray-600">
                                                |
                                            </span>
                                            <span className="text-gray-400">
                                                Seed:{" "}
                                                <span className="font-mono text-info">
                                                    {results.seed}
                                                </span>
                                            </span>
                                            {params.objectiveMode ===
                                                "consumption" && (
                                                <>
                                                    <span className="text-gray-600">
                                                        |
                                                    </span>
                                                    <span className="text-gray-400">
                                                        Objetivo:{" "}
                                                        <span className="text-warning font-semibold">
                                                            Consumo Máximo
                                                        </span>
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(
                                                        results.seed.toString(),
                                                    );
                                                }}
                                                className="text-gray-500 hover:text-accent transition-colors flex items-center gap-1"
                                                title="Copiar seed"
                                            >
                                                <Icon name="Copy" size={14} />
                                                <span>Copiar</span>
                                            </button>
                                            <button
                                                onClick={downloadExport}
                                                className="text-gray-500 hover:text-accent transition-colors flex items-center gap-1"
                                                title="Exportar simulação (.txt)"
                                            >
                                                <Icon
                                                    name="Download"
                                                    size={14}
                                                />
                                                <span>Exportar</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Header Stats */}
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 lg:gap-4">
                                        <StatCard
                                            title="Taxa de Sobrevivência"
                                            value={results.survivalRate.toFixed(
                                                1,
                                            )}
                                            unit="%"
                                            icon="ShieldCheck"
                                            color={
                                                results.survivalRate >= 95
                                                    ? "accent"
                                                    : results.survivalRate >= 80
                                                      ? "warning"
                                                      : "danger"
                                            }
                                            subtitle={`${results.totalSimulations - results.failedSimulations} de ${results.totalSimulations} cenários`}
                                        />
                                        <StatCard
                                            title="Saque Médio Anual"
                                            value={(
                                                results.overallMeanWithdrawal /
                                                1000
                                            ).toFixed(0)}
                                            unit="k BRL"
                                            icon="Calculator"
                                            color="info"
                                            subtitle={`~R$ ${(results.overallMeanWithdrawal / 12 / 1000).toFixed(0)}k/mês`}
                                        />
                                        <StatCard
                                            title="Saque Mediano Anual"
                                            value={(
                                                results.overallMedianWithdrawal /
                                                1000
                                            ).toFixed(0)}
                                            unit="k BRL"
                                            icon="BarChart2"
                                            color="accent"
                                            subtitle={`~R$ ${(results.overallMedianWithdrawal / 12 / 1000).toFixed(0)}k/mês`}
                                        />
                                        <StatCard
                                            title="Pior Saque Anual"
                                            value={(
                                                results.worstWithdrawal / 1000
                                            ).toFixed(0)}
                                            unit="k BRL"
                                            icon="TrendingDown"
                                            color="warning"
                                            subtitle="Cenário mais adverso"
                                        />
                                        <StatCard
                                            title="Portfólio Final Mediano"
                                            value={(
                                                results.medianFinalPortfolio /
                                                1000000
                                            ).toFixed(2)}
                                            unit="M BRL"
                                            icon="PiggyBank"
                                            color="info"
                                            subtitle="Percentil 50"
                                        />
                                    </div>

                                    {/* Charts Row 1 */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
                                        <div className="bg-surface rounded-xl p-4 border border-gray-800">
                                            <div className="flex items-center gap-2 mb-4">
                                                <Icon
                                                    name="LineChart"
                                                    size={20}
                                                    className="text-accent"
                                                />
                                                <h3 className="font-semibold">
                                                    Evolução do Portfólio (BRL)
                                                </h3>
                                            </div>
                                            <PortfolioChart
                                                data={
                                                    results.portfolioPercentiles
                                                }
                                                years={params.years}
                                            />
                                            <p className="text-xs text-gray-500 mt-3">
                                                Faixas de probabilidade: P10
                                                (vermelho tracejado) a P90
                                                (verde). A linha central
                                                representa a mediana dos
                                                cenários.
                                            </p>
                                        </div>
                                        <div className="bg-surface rounded-xl p-4 border border-gray-800">
                                            <div className="flex items-center gap-2 mb-4">
                                                <Icon
                                                    name="Banknote"
                                                    size={20}
                                                    className="text-info"
                                                />
                                                <h3 className="font-semibold">
                                                    Saques Anuais - Percentis
                                                    (BRL)
                                                </h3>
                                            </div>
                                            <WithdrawalChart
                                                data={
                                                    results.withdrawalPercentiles
                                                }
                                                years={params.years}
                                            />
                                            <p className="text-xs text-gray-500 mt-3">
                                                Variação dos saques ao longo do
                                                tempo devido aos gatilhos de
                                                Klinger, inflação e dinâmica
                                                cambial.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Charts Row 2 - Withdrawal Evolution */}
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
                                        <div className="lg:col-span-2 bg-surface rounded-xl p-4 border border-gray-800">
                                            <div className="flex items-center gap-2 mb-4">
                                                <Icon
                                                    name="TrendingUp"
                                                    size={20}
                                                    className="text-purple-400"
                                                />
                                                <h3 className="font-semibold">
                                                    Evolução Média vs Mediana
                                                    dos Saques
                                                </h3>
                                            </div>
                                            <WithdrawalEvolutionChart
                                                means={results.withdrawalMeans}
                                                medians={
                                                    results.withdrawalMedians
                                                }
                                                years={params.years}
                                                minimumWithdrawal={
                                                    params.minimumWithdrawalBRL
                                                }
                                                useMinimum={
                                                    params.useMinimumWithdrawal
                                                }
                                                inssIncomeMeans={results.inssIncomeMeans}
                                                useINSS={params.useINSS}
                                            />
                                            <p className="text-xs text-gray-500 mt-3">
                                                Comparação entre média e mediana
                                                dos saques anuais.
                                                {params.useMinimumWithdrawal &&
                                                    params.minimumWithdrawalBRL >
                                                        0 &&
                                                    ` Linha vermelha indica o saque mínimo aceitável de ${formatCurrency(params.minimumWithdrawalBRL)}.`}
                                            </p>
                                        </div>
                                        <WithdrawalStats
                                            results={results}
                                            formatCurrency={formatCurrency}
                                            initialWithdrawalBRL={
                                                params.initialPortfolioUSD *
                                                (params.withdrawalRate / 100) *
                                                params.initialFX
                                            }
                                        />
                                    </div>

                                    {/* Analysis Section */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
                                        <FailureAnalysis
                                            failureCauses={
                                                results.failureCauses
                                            }
                                            avgFailureYear={
                                                results.avgFailureYear
                                            }
                                            failedCount={
                                                results.failedSimulations
                                            }
                                            total={results.totalSimulations}
                                            failedByDepletion={
                                                results.failedByDepletion
                                            }
                                        />
                                        <RulesExplanation
                                            ruleStats={results.ruleStats}
                                            survivalRate={results.survivalRate}
                                        />
                                    </div>

                                    {/* Stress Analysis Section */}
                                    {params.useMinimumWithdrawal &&
                                        results.stressAnalysis && (
                                            <div className="space-y-6">
                                                <div className="flex items-center gap-3 pt-4 border-t border-gray-800">
                                                    <Icon
                                                        name="Activity"
                                                        size={24}
                                                        className="text-warning"
                                                    />
                                                    <div>
                                                        <h2 className="text-lg font-bold">
                                                            Análise de Períodos
                                                            de Stress
                                                        </h2>
                                                        <p className="text-xs text-gray-500">
                                                            Quando o saque
                                                            mínimo de{" "}
                                                            {formatCurrency(
                                                                params.minimumWithdrawalBRL,
                                                            )}
                                                            /ano precisou ser
                                                            forçado
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Stress Summary */}
                                                <StressSummaryCard
                                                    stressAnalysis={
                                                        results.stressAnalysis
                                                    }
                                                    params={params}
                                                    formatCurrency={
                                                        formatCurrency
                                                    }
                                                />

                                                {/* Option B & D: Tolerance and Stress Timeline */}
                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
                                                    <ToleranceSuccessChart
                                                        toleranceData={
                                                            results
                                                                .stressAnalysis
                                                                .tolerance
                                                        }
                                                        currentSurvivalRate={
                                                            results.survivalRate
                                                        }
                                                    />
                                                    <StressChart
                                                        stressChartData={
                                                            results.stressChartData
                                                        }
                                                        years={params.years}
                                                        minimumWithdrawal={
                                                            params.minimumWithdrawalBRL
                                                        }
                                                    />
                                                </div>

                                                {/* Options A, C, E: Duration, Portfolio Impact, Recovery */}
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
                                                    <StressDurationAnalysis
                                                        durationAnalysis={
                                                            results
                                                                .stressAnalysis
                                                                .duration
                                                        }
                                                        formatCurrency={
                                                            formatCurrency
                                                        }
                                                    />
                                                    <PortfolioImpactAnalysis
                                                        extraWithdrawalAnalysis={
                                                            results
                                                                .stressAnalysis
                                                                .extraWithdrawal
                                                        }
                                                        formatCurrency={
                                                            formatCurrency
                                                        }
                                                    />
                                                    <RecoveryAnalysis
                                                        recoveryAnalysis={
                                                            results
                                                                .stressAnalysis
                                                                .recovery
                                                        }
                                                    />
                                                </div>
                                            </div>
                                        )}

                                    {/* Dynamic Explanation */}
                                    <div className="bg-gradient-to-r from-surface to-deep rounded-xl p-5 border border-gray-800">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Icon
                                                name="MessageSquare"
                                                size={20}
                                                className="text-accent"
                                            />
                                            <h3 className="font-semibold">
                                                Análise dos Resultados
                                            </h3>
                                        </div>
                                        <div className="text-sm text-gray-300 space-y-3">
                                            {results.survivalRate >= 95 ? (
                                                <p>
                                                    <span className="text-accent font-semibold">
                                                        Excelente!
                                                    </span>{" "}
                                                    Sua estratégia apresenta uma
                                                    taxa de sobrevivência de{" "}
                                                    {results.survivalRate.toFixed(
                                                        1,
                                                    )}
                                                    %, indicando alta
                                                    probabilidade de sucesso ao
                                                    longo de {params.years}{" "}
                                                    anos.
                                                    {params.useBucketStrategy && (
                                                        <span>
                                                            {" "}
                                                            A estratégia de
                                                            buckets protege
                                                            contra o risco de
                                                            sequência de
                                                            retornos nos
                                                            primeiros{" "}
                                                            {
                                                                params.bucketYears
                                                            }{" "}
                                                            anos.
                                                        </span>
                                                    )}
                                                </p>
                                            ) : results.survivalRate >= 80 ? (
                                                <p>
                                                    <span className="text-warning font-semibold">
                                                        Atenção:
                                                    </span>{" "}
                                                    A taxa de sobrevivência de{" "}
                                                    {results.survivalRate.toFixed(
                                                        1,
                                                    )}
                                                    % está em um nível moderado.
                                                    {params.useMinimumWithdrawal && (
                                                        <span>
                                                            {" "}
                                                            O saque mínimo de{" "}
                                                            {formatCurrency(
                                                                params.minimumWithdrawalBRL,
                                                            )}{" "}
                                                            está acelerando a
                                                            depleção do
                                                            portfólio em
                                                            cenários adversos.
                                                        </span>
                                                    )}{" "}
                                                    Considere reduzir a taxa de
                                                    retirada ou aumentar o
                                                    período da estratégia Tenda.
                                                </p>
                                            ) : (
                                                <p>
                                                    <span className="text-danger font-semibold">
                                                        Risco elevado:
                                                    </span>{" "}
                                                    Com{" "}
                                                    {results.survivalRate.toFixed(
                                                        1,
                                                    )}
                                                    % de taxa de sobrevivência,
                                                    há risco significativo de
                                                    depleção do portfólio.
                                                    {params.useMinimumWithdrawal && (
                                                        <span>
                                                            {" "}
                                                            O saque mínimo
                                                            forçado de{" "}
                                                            {formatCurrency(
                                                                params.minimumWithdrawalBRL,
                                                            )}{" "}
                                                            contribui para este
                                                            resultado.
                                                        </span>
                                                    )}
                                                </p>
                                            )}

                                            {/* Advanced modeling impact */}
                                            {(params.useStudentT ||
                                                params.useTaxModel ||
                                                params.useIPCAModel) && (
                                                <p>
                                                    <span className="text-purple-400 font-medium">
                                                        Modelagem Avançada:
                                                    </span>{" "}
                                                    {params.useStudentT && (
                                                        <span>
                                                            Distribuição
                                                            T-Student (df=
                                                            {
                                                                params.degreesOfFreedom
                                                            }
                                                            ) captura eventos
                                                            extremos ("cisnes
                                                            negros").{" "}
                                                        </span>
                                                    )}
                                                    {params.useIPCAModel && (
                                                        <span>
                                                            RF modelada como
                                                            IPCA (
                                                            {
                                                                params.expectedIPCA
                                                            }
                                                            %) +{" "}
                                                            {params.realSpread}%
                                                            real.{" "}
                                                        </span>
                                                    )}
                                                    {params.useTaxModel && (
                                                        <span>
                                                            Tributação de{" "}
                                                            {
                                                                params.equityTaxRate
                                                            }
                                                            % em RV e{" "}
                                                            {
                                                                params.fixedIncomeTaxRate
                                                            }
                                                            % em RF reduz
                                                            retorno líquido.
                                                        </span>
                                                    )}
                                                </p>
                                            )}

                                            <p>
                                                <span className="text-purple-400 font-medium">
                                                    Saques:
                                                </span>{" "}
                                                O saque médio ao longo de toda a
                                                simulação é de{" "}
                                                {formatCurrency(
                                                    results.overallMeanWithdrawal,
                                                )}
                                                /ano, com mediana de{" "}
                                                {formatCurrency(
                                                    results.overallMedianWithdrawal,
                                                )}
                                                /ano.
                                                {params.useMinimumWithdrawal && (
                                                    <span className="text-gray-400">
                                                        {" "}
                                                        O saque{" "}
                                                        <strong>
                                                            nunca
                                                        </strong>{" "}
                                                        fica abaixo de{" "}
                                                        {formatCurrency(
                                                            params.minimumWithdrawalBRL,
                                                        )}
                                                        .
                                                    </span>
                                                )}
                                            </p>

                                            {params.useBucketStrategy && (
                                                <p>
                                                    <span className="text-blue-400 font-medium">
                                                        Bucket Strategy:
                                                    </span>{" "}
                                                    Nos primeiros{" "}
                                                    {params.bucketYears} anos,
                                                    os saques vêm exclusivamente
                                                    da renda fixa, isolando a
                                                    carteira de renda variável
                                                    de vendas forçadas durante
                                                    eventuais quedas de mercado.
                                                    Isso mitiga o "sequence of
                                                    returns risk".
                                                </p>
                                            )}

                                            {params.useMinimumWithdrawal &&
                                                params.minimumWithdrawalBRL >
                                                    0 &&
                                                results.stressAnalysis && (
                                                    <p>
                                                        <span className="text-orange-400 font-medium">
                                                            Períodos de Stress:
                                                        </span>{" "}
                                                        {results.stressAnalysis
                                                            .duration
                                                            .simsWithStress >
                                                        0 ? (
                                                            <span>
                                                                Em{" "}
                                                                {
                                                                    results
                                                                        .stressAnalysis
                                                                        .duration
                                                                        .simsWithStress
                                                                }{" "}
                                                                simulações (
                                                                {(
                                                                    (results
                                                                        .stressAnalysis
                                                                        .duration
                                                                        .simsWithStress /
                                                                        params.iterations) *
                                                                    100
                                                                ).toFixed(1)}
                                                                %), o saque
                                                                mínimo precisou
                                                                ser forçado (G-K
                                                                teria
                                                                recomendado
                                                                menos). Isso
                                                                durou em média{" "}
                                                                {results.stressAnalysis.avgStressYearsPerSim.toFixed(
                                                                    1,
                                                                )}{" "}
                                                                anos por
                                                                simulação, com{" "}
                                                                {results.stressAnalysis.recovery.recoveryRate.toFixed(
                                                                    0,
                                                                )}
                                                                % de
                                                                recuperação.
                                                            </span>
                                                        ) : (
                                                            <span className="text-accent">
                                                                O saque mínimo
                                                                nunca precisou
                                                                ser forçado - as
                                                                regras de G-K
                                                                sempre
                                                                recomendaram
                                                                valores acima!
                                                            </span>
                                                        )}
                                                    </p>
                                                )}

                                            {results.avgFailureYear && (
                                                <p className="text-gray-400">
                                                    Nos cenários de falha, a
                                                    depleção ocorreu em média no
                                                    ano{" "}
                                                    {results.avgFailureYear.toFixed(
                                                        0,
                                                    )}
                                                    . Os principais fatores
                                                    foram:{" "}
                                                    {Object.keys(
                                                        results.failureCauses,
                                                    )
                                                        .slice(0, 2)
                                                        .join(" e ")
                                                        .toLowerCase()}
                                                    .
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Technical Details */}
                                    <details className="bg-surface rounded-xl border border-gray-800 overflow-hidden">
                                        <summary className="p-4 cursor-pointer flex items-center gap-2 hover:bg-deep transition-colors">
                                            <Icon
                                                name="Code"
                                                size={18}
                                                className="text-gray-400"
                                            />
                                            <span className="text-sm font-medium">
                                                Detalhes Técnicos da Simulação
                                            </span>
                                        </summary>
                                        <div className="p-4 pt-0 text-xs text-gray-400 font-mono space-y-2 border-t border-gray-800 mt-2">
                                            <div>
                                                Iterações:{" "}
                                                {params.iterations.toLocaleString()}
                                            </div>
                                            <div>
                                                Distribuição:{" "}
                                                {params.useStudentT
                                                    ? `T-Student (df=${params.degreesOfFreedom})`
                                                    : "Normal (Box-Muller)"}
                                            </div>
                                            <div className="border-t border-gray-700 pt-2 mt-2">
                                                --- Correlação FX ---
                                            </div>
                                            {params.useDynamicCorrelation ? (
                                                <>
                                                    <div>
                                                        Correlação base:{" "}
                                                        {params.baseCorrelation}
                                                    </div>
                                                    <div>
                                                        Mult. stress:{" "}
                                                        {
                                                            params.stressCorrelationMultiplier
                                                        }
                                                        x
                                                    </div>
                                                    <div className="text-blue-400">
                                                        Em crises: até{" "}
                                                        {(
                                                            params.baseCorrelation *
                                                            params.stressCorrelationMultiplier
                                                        ).toFixed(2)}
                                                    </div>
                                                </>
                                            ) : (
                                                <div>
                                                    Correlação RV/Câmbio: -0.40
                                                    (fixa)
                                                </div>
                                            )}
                                            <div>
                                                Reversion to mean FX: 10% a.a.
                                            </div>
                                            <div>
                                                Stress multiplier FX: 1.30x em
                                                quedas
                                            </div>
                                            <div className="border-t border-gray-700 pt-2 mt-2">
                                                --- Retornos ---
                                            </div>
                                            {params.useIPCAModel ? (
                                                <>
                                                    <div className="text-green-400">
                                                        RF = IPCA + Juro Real
                                                    </div>
                                                    <div>
                                                        IPCA esperado:{" "}
                                                        {params.expectedIPCA}%
                                                        (±
                                                        {params.ipcaVolatility}
                                                        %)
                                                    </div>
                                                    <div>
                                                        Spread real:{" "}
                                                        {params.realSpread}%
                                                    </div>
                                                </>
                                            ) : (
                                                <div>
                                                    RF nominal:{" "}
                                                    {params.bondReturn}% (±
                                                    {params.bondVolatility}%)
                                                </div>
                                            )}
                                            <div>
                                                RV: {params.equityReturn}% (±
                                                {params.equityVolatility}%)
                                            </div>
                                            <div className="border-t border-gray-700 pt-2 mt-2">
                                                --- Tributação ---
                                            </div>
                                            {params.useTaxModel ? (
                                                <>
                                                    <div className="text-yellow-400">
                                                        Modelo tributário ativo
                                                    </div>
                                                    <div>
                                                        IR ETFs irlandeses:{" "}
                                                        {params.equityTaxRate}%
                                                    </div>
                                                    <div>
                                                        IR RF brasileira:{" "}
                                                        {
                                                            params.fixedIncomeTaxRate
                                                        }
                                                        %
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="text-gray-500">
                                                    Sem tributação (cenário
                                                    bruto)
                                                </div>
                                            )}
                                            <div className="border-t border-gray-700 pt-2 mt-2">
                                                --- Regras ---
                                            </div>
                                            <div>
                                                G-K:{" "}
                                                {params.useGuytonKlinger
                                                    ? `±${(params.preservationThreshold * 100).toFixed(0)}% → ±${(params.adjustmentPercent * 100).toFixed(0)}%`
                                                    : "Desativado"}
                                            </div>
                                            <div>
                                                Transição Tenda → Alvo: 3 anos
                                                linear
                                            </div>
                                            {params.useBucketStrategy && (
                                                <div className="text-blue-400">
                                                    Bucket Strategy:{" "}
                                                    {params.bucketYears} anos
                                                    (saques da RF)
                                                </div>
                                            )}
                                            {params.useMinimumWithdrawal && (
                                                <div className="text-warning">
                                                    Saque Mínimo:{" "}
                                                    {formatCurrency(
                                                        params.minimumWithdrawalBRL,
                                                    )}
                                                    /ano
                                                </div>
                                            )}
                                            {results.stressAnalysis &&
                                                results.stressAnalysis.duration
                                                    .count > 0 && (
                                                    <>
                                                        <div className="border-t border-gray-700 pt-2 mt-2">
                                                            --- Análise de
                                                            Stress ---
                                                        </div>
                                                        <div>
                                                            Total períodos de
                                                            stress:{" "}
                                                            {
                                                                results
                                                                    .stressAnalysis
                                                                    .duration
                                                                    .count
                                                            }
                                                        </div>
                                                        <div>
                                                            Duração média:{" "}
                                                            {results.stressAnalysis.duration.avgDuration.toFixed(
                                                                2,
                                                            )}{" "}
                                                            anos
                                                        </div>
                                                        <div>
                                                            Taxa de recuperação:{" "}
                                                            {results.stressAnalysis.recovery.recoveryRate.toFixed(
                                                                1,
                                                            )}
                                                            %
                                                        </div>
                                                    </>
                                                )}
                                        </div>
                                    </details>
                                </div>
                            )}
                        </main>
                    </div>
                );
            };

            ReactDOM.createRoot(document.getElementById("root")).render(
                <App />,
            );
