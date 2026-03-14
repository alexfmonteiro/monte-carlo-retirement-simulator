const { useState, useEffect, useRef, useCallback, useMemo } = React;

            // ============================================
            // STRESS ANALYSIS COMPONENTS
            // ============================================

            // Option A: Duration Analysis Component
            const StressDurationAnalysis = ({
                durationAnalysis,
                formatCurrency,
            }) => {
                const chartRef = useRef(null);
                const canvasRef = useRef(null);

                useEffect(() => {
                    if (
                        !durationAnalysis ||
                        !canvasRef.current ||
                        Object.keys(durationAnalysis.distribution).length === 0
                    )
                        return;

                    if (chartRef.current) {
                        chartRef.current.destroy();
                    }

                    const ctx = canvasRef.current.getContext("2d");
                    const labels = Object.keys(
                        durationAnalysis.distribution,
                    ).map((d) => `${d} ano${d > 1 ? "s" : ""}`);
                    const data = Object.values(durationAnalysis.distribution);

                    chartRef.current = new Chart(ctx, {
                        type: "bar",
                        data: {
                            labels,
                            datasets: [
                                {
                                    label: "Períodos",
                                    data,
                                    backgroundColor: "rgba(245, 158, 11, 0.7)",
                                    borderColor: "#f59e0b",
                                    borderWidth: 1,
                                    borderRadius: 4,
                                },
                            ],
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { display: false },
                                tooltip: {
                                    backgroundColor: "#1a2234",
                                    titleColor: "#fff",
                                    bodyColor: "#9ca3af",
                                    callbacks: {
                                        label: (ctx) => `${ctx.raw} períodos`,
                                    },
                                },
                            },
                            scales: {
                                x: {
                                    grid: { display: false },
                                    ticks: {
                                        color: "#6b7280",
                                        font: {
                                            family: "JetBrains Mono",
                                            size: 10,
                                        },
                                    },
                                },
                                y: {
                                    grid: { color: "rgba(55, 65, 81, 0.3)" },
                                    ticks: {
                                        color: "#6b7280",
                                        font: {
                                            family: "JetBrains Mono",
                                            size: 10,
                                        },
                                    },
                                },
                            },
                        },
                    });

                    return () => {
                        if (chartRef.current) chartRef.current.destroy();
                    };
                }, [durationAnalysis]);

                if (!durationAnalysis || durationAnalysis.count === 0) {
                    return (
                        <div className="bg-surface rounded-xl p-4 border border-accent/30">
                            <div className="flex items-center gap-2 mb-3">
                                <Icon
                                    name="Clock"
                                    size={20}
                                    className="text-accent"
                                />
                                <h3 className="font-semibold text-accent">
                                    Duração dos Períodos
                                </h3>
                            </div>
                            <p className="text-gray-400 text-sm">
                                Nenhum período onde o mínimo foi necessário! As
                                regras de G-K sempre recomendaram valores acima
                                do seu mínimo.
                            </p>
                        </div>
                    );
                }

                return (
                    <div className="bg-surface rounded-xl p-4 border border-warning/30">
                        <div className="flex items-center gap-2 mb-3">
                            <Icon
                                name="Clock"
                                size={20}
                                className="text-warning"
                            />
                            <h3 className="font-semibold">
                                Duração (Mínimo Forçado)
                            </h3>
                        </div>

                        <div className="grid grid-cols-4 gap-2 mb-4">
                            <div className="text-center p-2 bg-deep rounded-lg">
                                <div className="text-lg font-mono text-warning">
                                    {durationAnalysis.count}
                                </div>
                                <div className="text-xs text-gray-500">
                                    Total
                                </div>
                            </div>
                            <div className="text-center p-2 bg-deep rounded-lg">
                                <div className="text-lg font-mono text-yellow-400">
                                    {durationAnalysis.avgDuration.toFixed(1)}
                                </div>
                                <div className="text-xs text-gray-500">
                                    Média
                                </div>
                            </div>
                            <div className="text-center p-2 bg-deep rounded-lg">
                                <div className="text-lg font-mono text-orange-400">
                                    {durationAnalysis.medianDuration}
                                </div>
                                <div className="text-xs text-gray-500">
                                    Mediana
                                </div>
                            </div>
                            <div className="text-center p-2 bg-deep rounded-lg">
                                <div className="text-lg font-mono text-red-400">
                                    {durationAnalysis.maxDuration}
                                </div>
                                <div className="text-xs text-gray-500">
                                    Máximo
                                </div>
                            </div>
                        </div>

                        <div className="h-40">
                            <canvas ref={canvasRef} />
                        </div>

                        <p className="text-xs text-gray-500 mt-3">
                            Distribuição de quanto tempo (anos consecutivos) o
                            saque mínimo precisou ser forçado em cada período de
                            stress.
                        </p>
                    </div>
                );
            };

            // Option B: Tolerance Success Rate Component
            const ToleranceSuccessChart = ({
                toleranceData,
                currentSurvivalRate,
            }) => {
                const chartRef = useRef(null);
                const canvasRef = useRef(null);

                useEffect(() => {
                    if (!toleranceData || !canvasRef.current) return;

                    if (chartRef.current) {
                        chartRef.current.destroy();
                    }

                    const ctx = canvasRef.current.getContext("2d");

                    chartRef.current = new Chart(ctx, {
                        type: "line",
                        data: {
                            labels: toleranceData.map(
                                (d) =>
                                    `${d.tolerance} ano${d.tolerance !== 1 ? "s" : ""}`,
                            ),
                            datasets: [
                                {
                                    label: "Taxa de Sucesso",
                                    data: toleranceData.map(
                                        (d) => d.successRate,
                                    ),
                                    borderColor: "#10b981",
                                    backgroundColor: "rgba(16, 185, 129, 0.1)",
                                    fill: true,
                                    tension: 0.3,
                                    borderWidth: 2,
                                    pointRadius: 4,
                                    pointBackgroundColor: "#10b981",
                                },
                            ],
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { display: false },
                                tooltip: {
                                    backgroundColor: "#1a2234",
                                    titleColor: "#fff",
                                    bodyColor: "#9ca3af",
                                    callbacks: {
                                        label: (ctx) =>
                                            `Taxa de sucesso: ${ctx.raw.toFixed(1)}%`,
                                    },
                                },
                            },
                            scales: {
                                x: {
                                    grid: { display: false },
                                    ticks: {
                                        color: "#6b7280",
                                        font: {
                                            family: "JetBrains Mono",
                                            size: 10,
                                        },
                                    },
                                    title: {
                                        display: true,
                                        text: "Tolerância a Stress",
                                        color: "#9ca3af",
                                    },
                                },
                                y: {
                                    min: 0,
                                    max: 100,
                                    grid: { color: "rgba(55, 65, 81, 0.3)" },
                                    ticks: {
                                        color: "#6b7280",
                                        font: {
                                            family: "JetBrains Mono",
                                            size: 10,
                                        },
                                        callback: (v) => `${v}%`,
                                    },
                                },
                            },
                        },
                    });

                    return () => {
                        if (chartRef.current) chartRef.current.destroy();
                    };
                }, [toleranceData]);

                // Find the tolerance needed for 90% and 95% success
                const find90 = toleranceData?.find((d) => d.successRate >= 90);
                const find95 = toleranceData?.find((d) => d.successRate >= 95);

                return (
                    <div className="bg-surface rounded-xl p-4 border border-gray-800">
                        <div className="flex items-center gap-2 mb-3">
                            <Icon
                                name="Target"
                                size={20}
                                className="text-accent"
                            />
                            <h3 className="font-semibold">
                                Taxa de Sucesso vs Tolerância
                            </h3>
                        </div>

                        <div className="h-48 mb-4">
                            <canvas ref={canvasRef} />
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="p-2 bg-deep rounded-lg">
                                <span className="text-gray-400">
                                    Para 90% de sucesso:
                                </span>
                                <span className="ml-2 font-mono text-accent">
                                    {find90
                                        ? `≤ ${find90.tolerance} anos de stress`
                                        : "N/A"}
                                </span>
                            </div>
                            <div className="p-2 bg-deep rounded-lg">
                                <span className="text-gray-400">
                                    Para 95% de sucesso:
                                </span>
                                <span className="ml-2 font-mono text-accent">
                                    {find95
                                        ? `≤ ${find95.tolerance} anos de stress`
                                        : "N/A"}
                                </span>
                            </div>
                        </div>

                        <p className="text-xs text-gray-500 mt-3">
                            Este gráfico mostra como a taxa de sucesso aumenta
                            se você puder tolerar períodos de stress. "Tolerar"
                            significa ter reserva ou flexibilidade para manter
                            seu padrão de vida.
                        </p>
                    </div>
                );
            };

            // Option C: Portfolio Impact Analysis Component (extra withdrawn due to enforced minimum)
            const PortfolioImpactAnalysis = ({
                extraWithdrawalAnalysis,
                formatCurrency,
            }) => {
                const chartRef = useRef(null);
                const canvasRef = useRef(null);

                useEffect(() => {
                    if (
                        !extraWithdrawalAnalysis ||
                        !canvasRef.current ||
                        extraWithdrawalAnalysis.impactTable.length === 0
                    )
                        return;

                    if (chartRef.current) {
                        chartRef.current.destroy();
                    }

                    const ctx = canvasRef.current.getContext("2d");

                    chartRef.current = new Chart(ctx, {
                        type: "bar",
                        data: {
                            labels: extraWithdrawalAnalysis.impactTable.map(
                                (d) => `${d.percentile}%`,
                            ),
                            datasets: [
                                {
                                    label: "Saque Extra Acumulado",
                                    data: extraWithdrawalAnalysis.impactTable.map(
                                        (d) => d.extraWithdrawn,
                                    ),
                                    backgroundColor: "rgba(239, 68, 68, 0.7)",
                                    borderColor: "#ef4444",
                                    borderWidth: 1,
                                    borderRadius: 4,
                                },
                            ],
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { display: false },
                                tooltip: {
                                    backgroundColor: "#1a2234",
                                    titleColor: "#fff",
                                    bodyColor: "#9ca3af",
                                    callbacks: {
                                        label: (ctx) =>
                                            `R$ ${(ctx.raw / 1000).toFixed(0)}k extra sacado`,
                                    },
                                },
                            },
                            scales: {
                                x: {
                                    grid: { display: false },
                                    ticks: {
                                        color: "#6b7280",
                                        font: {
                                            family: "JetBrains Mono",
                                            size: 10,
                                        },
                                    },
                                    title: {
                                        display: true,
                                        text: "Percentil de Simulações",
                                        color: "#9ca3af",
                                    },
                                },
                                y: {
                                    grid: { color: "rgba(55, 65, 81, 0.3)" },
                                    ticks: {
                                        color: "#6b7280",
                                        font: {
                                            family: "JetBrains Mono",
                                            size: 10,
                                        },
                                        callback: (v) =>
                                            `R$ ${(v / 1000).toFixed(0)}k`,
                                    },
                                },
                            },
                        },
                    });

                    return () => {
                        if (chartRef.current) chartRef.current.destroy();
                    };
                }, [extraWithdrawalAnalysis]);

                if (
                    !extraWithdrawalAnalysis ||
                    extraWithdrawalAnalysis.maxExtra === 0
                ) {
                    return (
                        <div className="bg-surface rounded-xl p-4 border border-accent/30">
                            <div className="flex items-center gap-2 mb-3">
                                <Icon
                                    name="PiggyBank"
                                    size={20}
                                    className="text-accent"
                                />
                                <h3 className="font-semibold text-accent">
                                    Impacto no Portfólio
                                </h3>
                            </div>
                            <p className="text-gray-400 text-sm">
                                Nenhum impacto extra! O saque recomendado sempre
                                ficou acima ou igual ao mínimo necessário.
                            </p>
                        </div>
                    );
                }

                const impact90 = extraWithdrawalAnalysis.impactTable.find(
                    (d) => d.percentile === 90,
                );
                const impact95 = extraWithdrawalAnalysis.impactTable.find(
                    (d) => d.percentile === 95,
                );

                return (
                    <div className="bg-surface rounded-xl p-4 border border-red-500/30">
                        <div className="flex items-center gap-2 mb-3">
                            <Icon
                                name="TrendingDown"
                                size={20}
                                className="text-red-400"
                            />
                            <h3 className="font-semibold">
                                Impacto no Portfólio (Saque Extra)
                            </h3>
                        </div>

                        <div className="grid grid-cols-3 gap-2 mb-4">
                            <div className="text-center p-2 bg-deep rounded-lg">
                                <div className="text-sm font-mono text-red-400">
                                    {formatCurrency(
                                        extraWithdrawalAnalysis.avgExtra,
                                    )}
                                </div>
                                <div className="text-xs text-gray-500">
                                    Média por Período
                                </div>
                            </div>
                            <div className="text-center p-2 bg-deep rounded-lg border border-red-500/30">
                                <div className="text-sm font-mono text-red-300">
                                    {impact90
                                        ? formatCurrency(
                                              impact90.extraWithdrawn,
                                          )
                                        : "N/A"}
                                </div>
                                <div className="text-xs text-gray-500">
                                    90% dos Cenários
                                </div>
                            </div>
                            <div className="text-center p-2 bg-deep rounded-lg border border-red-500/50">
                                <div className="text-sm font-mono text-red-200">
                                    {impact95
                                        ? formatCurrency(
                                              impact95.extraWithdrawn,
                                          )
                                        : "N/A"}
                                </div>
                                <div className="text-xs text-gray-500">
                                    95% dos Cenários
                                </div>
                            </div>
                        </div>

                        <div className="h-40">
                            <canvas ref={canvasRef} />
                        </div>

                        <p className="text-xs text-gray-500 mt-3">
                            Quanto a mais foi retirado do portfólio (além do
                            recomendado por G-K) para manter o saque mínimo.
                            Este é o "custo" de manter seu padrão de vida
                            durante períodos de stress.
                        </p>
                    </div>
                );
            };

            // Option D: Stress Chart Component (% of simulations where minimum was enforced)
            const StressChart = ({
                stressChartData,
                years,
                minimumWithdrawal,
            }) => {
                const chartRef = useRef(null);
                const canvasRef = useRef(null);

                useEffect(() => {
                    if (
                        !stressChartData ||
                        !canvasRef.current ||
                        stressChartData.percentMinimumEnforced.length === 0
                    )
                        return;

                    if (chartRef.current) {
                        chartRef.current.destroy();
                    }

                    const ctx = canvasRef.current.getContext("2d");
                    const labels = Array.from(
                        { length: years + 1 },
                        (_, i) => `Ano ${i}`,
                    );

                    chartRef.current = new Chart(ctx, {
                        type: "line",
                        data: {
                            labels,
                            datasets: [
                                {
                                    label: "% Simulações com Mínimo Forçado",
                                    data: stressChartData.percentMinimumEnforced,
                                    borderColor: "#ef4444",
                                    backgroundColor: "rgba(239, 68, 68, 0.1)",
                                    fill: true,
                                    tension: 0.3,
                                    borderWidth: 2,
                                    pointRadius: 0,
                                },
                            ],
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            interaction: {
                                intersect: false,
                                mode: "index",
                            },
                            plugins: {
                                legend: {
                                    display: true,
                                    position: "top",
                                    labels: {
                                        color: "#9ca3af",
                                        font: { family: "Outfit", size: 10 },
                                        usePointStyle: true,
                                        padding: 10,
                                    },
                                },
                                tooltip: {
                                    backgroundColor: "#1a2234",
                                    titleColor: "#fff",
                                    bodyColor: "#9ca3af",
                                    callbacks: {
                                        label: (ctx) =>
                                            `${ctx.raw.toFixed(1)}% das simulações precisaram do saque mínimo`,
                                    },
                                },
                            },
                            scales: {
                                x: {
                                    grid: { color: "rgba(55, 65, 81, 0.3)" },
                                    ticks: {
                                        color: "#6b7280",
                                        font: {
                                            family: "JetBrains Mono",
                                            size: 10,
                                        },
                                    },
                                },
                                y: {
                                    min: 0,
                                    max: 100,
                                    grid: { color: "rgba(55, 65, 81, 0.3)" },
                                    ticks: {
                                        color: "#6b7280",
                                        font: {
                                            family: "JetBrains Mono",
                                            size: 10,
                                        },
                                        callback: (v) => `${v}%`,
                                    },
                                    title: {
                                        display: true,
                                        text: "% Simulações",
                                        color: "#9ca3af",
                                    },
                                },
                            },
                        },
                    });

                    return () => {
                        if (chartRef.current) chartRef.current.destroy();
                    };
                }, [stressChartData, years]);

                if (
                    !stressChartData ||
                    stressChartData.percentMinimumEnforced.length === 0
                ) {
                    return null;
                }

                // Find peak stress year
                const maxStressPercent = Math.max(
                    ...stressChartData.percentMinimumEnforced,
                );
                const peakYear =
                    stressChartData.percentMinimumEnforced.indexOf(
                        maxStressPercent,
                    );

                return (
                    <div className="bg-surface rounded-xl p-4 border border-gray-800">
                        <div className="flex items-center gap-2 mb-3">
                            <Icon
                                name="Activity"
                                size={20}
                                className="text-red-400"
                            />
                            <h3 className="font-semibold">
                                Quando o Saque Mínimo Foi Necessário
                            </h3>
                        </div>

                        <div className="h-56">
                            <canvas ref={canvasRef} />
                        </div>

                        <div className="flex justify-between items-center mt-3 p-2 bg-deep rounded-lg text-xs">
                            <span className="text-gray-400">
                                Pico de stress:
                            </span>
                            <span className="font-mono text-red-400">
                                Ano {peakYear} ({maxStressPercent.toFixed(1)}%
                                das simulações)
                            </span>
                        </div>

                        <p className="text-xs text-gray-500 mt-3">
                            Mostra em quais anos o saque mínimo de{" "}
                            {new Intl.NumberFormat("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                            }).format(minimumWithdrawal)}{" "}
                            precisou ser forçado (G-K recomendaria menos). O
                            saque SEMPRE será pelo menos o mínimo.
                        </p>
                    </div>
                );
            };

            // Option E: Recovery Analysis Component
            const RecoveryAnalysis = ({ recoveryAnalysis }) => {
                const chartRef = useRef(null);
                const canvasRef = useRef(null);

                useEffect(() => {
                    if (
                        !recoveryAnalysis ||
                        !canvasRef.current ||
                        Object.keys(recoveryAnalysis.recoveryTimeDistribution)
                            .length === 0
                    )
                        return;

                    if (chartRef.current) {
                        chartRef.current.destroy();
                    }

                    const ctx = canvasRef.current.getContext("2d");
                    const labels = Object.keys(
                        recoveryAnalysis.recoveryTimeDistribution,
                    ).map((d) => `${d} ano${d > 1 ? "s" : ""}`);
                    const data = Object.values(
                        recoveryAnalysis.recoveryTimeDistribution,
                    );

                    chartRef.current = new Chart(ctx, {
                        type: "bar",
                        data: {
                            labels,
                            datasets: [
                                {
                                    label: "Recuperações",
                                    data,
                                    backgroundColor: "rgba(16, 185, 129, 0.7)",
                                    borderColor: "#10b981",
                                    borderWidth: 1,
                                    borderRadius: 4,
                                },
                            ],
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { display: false },
                                tooltip: {
                                    backgroundColor: "#1a2234",
                                    titleColor: "#fff",
                                    bodyColor: "#9ca3af",
                                },
                            },
                            scales: {
                                x: {
                                    grid: { display: false },
                                    ticks: {
                                        color: "#6b7280",
                                        font: {
                                            family: "JetBrains Mono",
                                            size: 10,
                                        },
                                    },
                                    title: {
                                        display: true,
                                        text: "Tempo até G-K > Mínimo",
                                        color: "#9ca3af",
                                    },
                                },
                                y: {
                                    grid: { color: "rgba(55, 65, 81, 0.3)" },
                                    ticks: {
                                        color: "#6b7280",
                                        font: {
                                            family: "JetBrains Mono",
                                            size: 10,
                                        },
                                    },
                                },
                            },
                        },
                    });

                    return () => {
                        if (chartRef.current) chartRef.current.destroy();
                    };
                }, [recoveryAnalysis]);

                if (!recoveryAnalysis || recoveryAnalysis.totalPeriods === 0) {
                    return (
                        <div className="bg-surface rounded-xl p-4 border border-accent/30">
                            <div className="flex items-center gap-2 mb-3">
                                <Icon
                                    name="RefreshCw"
                                    size={20}
                                    className="text-accent"
                                />
                                <h3 className="font-semibold text-accent">
                                    Análise de Recuperação
                                </h3>
                            </div>
                            <p className="text-gray-400 text-sm">
                                Sem períodos de stress para analisar. G-K sempre
                                recomendou acima do mínimo.
                            </p>
                        </div>
                    );
                }

                return (
                    <div className="bg-surface rounded-xl p-4 border border-gray-800">
                        <div className="flex items-center gap-2 mb-3">
                            <Icon
                                name="RefreshCw"
                                size={20}
                                className="text-accent"
                            />
                            <h3 className="font-semibold">
                                Recuperação do Mercado
                            </h3>
                        </div>

                        <div className="grid grid-cols-4 gap-2 mb-4">
                            <div className="text-center p-2 bg-deep rounded-lg">
                                <div className="text-lg font-mono text-white">
                                    {recoveryAnalysis.totalPeriods}
                                </div>
                                <div className="text-xs text-gray-500">
                                    Períodos
                                </div>
                            </div>
                            <div className="text-center p-2 bg-deep rounded-lg border border-accent/30">
                                <div className="text-lg font-mono text-accent">
                                    {recoveryAnalysis.recoveredCount}
                                </div>
                                <div className="text-xs text-gray-500">
                                    Recuperou
                                </div>
                            </div>
                            <div className="text-center p-2 bg-deep rounded-lg border border-red-500/30">
                                <div className="text-lg font-mono text-red-400">
                                    {recoveryAnalysis.unrecoveredCount}
                                </div>
                                <div className="text-xs text-gray-500">
                                    Não Recuperou
                                </div>
                            </div>
                            <div className="text-center p-2 bg-deep rounded-lg">
                                <div className="text-lg font-mono text-yellow-400">
                                    {recoveryAnalysis.avgRecoveryTime.toFixed(
                                        1,
                                    )}
                                </div>
                                <div className="text-xs text-gray-500">
                                    Anos Médio
                                </div>
                            </div>
                        </div>

                        {Object.keys(recoveryAnalysis.recoveryTimeDistribution)
                            .length > 0 && (
                            <div className="h-32 mb-3">
                                <canvas ref={canvasRef} />
                            </div>
                        )}

                        <div className="flex items-center justify-between p-2 bg-deep rounded-lg">
                            <span className="text-xs text-gray-400">
                                Taxa de Recuperação:
                            </span>
                            <span
                                className={`font-mono text-sm ${recoveryAnalysis.recoveryRate >= 80 ? "text-accent" : "text-warning"}`}
                            >
                                {recoveryAnalysis.recoveryRate.toFixed(1)}%
                            </span>
                        </div>

                        <p className="text-xs text-gray-500 mt-3">
                            {recoveryAnalysis.recoveryRate >= 90
                                ? "Excelente! O mercado geralmente se recupera e G-K volta a recomendar acima do mínimo."
                                : recoveryAnalysis.recoveryRate >= 70
                                  ? "Boa recuperação, mas alguns períodos persistem até a depleção."
                                  : "Muitos períodos não se recuperam - o mínimo forçado pode estar acelerando a depleção."}
                        </p>
                    </div>
                );
            };

            // Stress Summary Card
            const StressSummaryCard = ({
                stressAnalysis,
                params,
                formatCurrency,
            }) => {
                if (!stressAnalysis) return null;

                const {
                    duration,
                    tolerance,
                    extraWithdrawal,
                    recovery,
                    avgStressYearsPerSim,
                } = stressAnalysis;

                // Find key thresholds
                const tolerance95 = tolerance.find((t) => t.successRate >= 95);
                const impact90 = extraWithdrawal.impactTable.find(
                    (r) => r.percentile === 90,
                );

                return (
                    <div className="bg-gradient-to-br from-surface via-deep to-surface rounded-xl p-5 border border-gray-700">
                        <div className="flex items-center gap-2 mb-4">
                            <Icon
                                name="Shield"
                                size={24}
                                className="text-accent"
                            />
                            <h3 className="text-lg font-semibold">
                                Resumo da Análise de Stress
                            </h3>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-400">
                                        Simulações com stress:
                                    </span>
                                    <span className="font-mono text-warning">
                                        {duration.simsWithStress} (
                                        {(
                                            (duration.simsWithStress /
                                                params.iterations) *
                                            100
                                        ).toFixed(1)}
                                        %)
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-400">
                                        Média anos c/ mínimo forçado:
                                    </span>
                                    <span className="font-mono text-yellow-400">
                                        {avgStressYearsPerSim.toFixed(1)} anos
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-400">
                                        Pior caso (duração contínua):
                                    </span>
                                    <span className="font-mono text-red-400">
                                        {duration.maxDuration} anos
                                    </span>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-400">
                                        Tolerância p/ 95% sucesso:
                                    </span>
                                    <span className="font-mono text-accent">
                                        {tolerance95
                                            ? `${tolerance95.tolerance} anos`
                                            : "N/A"}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-400">
                                        Impacto extra (90%):
                                    </span>
                                    <span className="font-mono text-red-400">
                                        {impact90
                                            ? formatCurrency(
                                                  impact90.extraWithdrawn,
                                              )
                                            : "R$ 0"}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-400">
                                        Taxa de recuperação:
                                    </span>
                                    <span
                                        className={`font-mono ${recovery.recoveryRate >= 80 ? "text-accent" : "text-warning"}`}
                                    >
                                        {recovery.recoveryRate.toFixed(1)}%
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="p-3 bg-midnight rounded-lg border border-gray-800">
                            <p className="text-sm text-gray-300">
                                {duration.simsWithStress === 0 ? (
                                    <span className="text-accent">
                                        <strong>Estratégia robusta!</strong> Em
                                        nenhuma simulação o saque mínimo de{" "}
                                        {formatCurrency(
                                            params.minimumWithdrawalBRL,
                                        )}
                                        precisou ser forçado. As regras de
                                        Guyton-Klinger sempre recomendaram
                                        valores acima do seu mínimo.
                                    </span>
                                ) : recovery.recoveryRate >= 90 &&
                                  duration.avgDuration <= 2 ? (
                                    <span>
                                        <strong className="text-accent">
                                            Boa resiliência:
                                        </strong>{" "}
                                        Quando o mínimo precisou ser forçado, os
                                        períodos foram curtos (média{" "}
                                        {duration.avgDuration.toFixed(1)} anos)
                                        e {recovery.recoveryRate.toFixed(0)}%
                                        das vezes o mercado se recuperou. O
                                        impacto extra no portfólio foi de{" "}
                                        {impact90
                                            ? formatCurrency(
                                                  impact90.extraWithdrawn,
                                              )
                                            : "R$ 0"}{" "}
                                        em 90% dos casos.
                                    </span>
                                ) : recovery.recoveryRate >= 70 ? (
                                    <span>
                                        <strong className="text-warning">
                                            Atenção moderada:
                                        </strong>{" "}
                                        O saque mínimo precisou ser forçado em{" "}
                                        {duration.simsWithStress} simulações por
                                        média de{" "}
                                        {avgStressYearsPerSim.toFixed(1)} anos
                                        cada. Isso acelera a depleção do
                                        portfólio.
                                    </span>
                                ) : (
                                    <span>
                                        <strong className="text-danger">
                                            Risco significativo:
                                        </strong>{" "}
                                        O mínimo foi forçado frequentemente e
                                        muitos períodos não se recuperaram.
                                        Considere reduzir o saque mínimo
                                        necessário ou aumentar o patrimônio
                                        inicial.
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>
                );
            };
