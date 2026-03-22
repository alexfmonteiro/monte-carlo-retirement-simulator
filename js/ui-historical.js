const { useState, useEffect, useRef, useCallback, useMemo } = React;

            // ============================================
            // HISTORICAL BACKTESTING UI COMPONENTS
            // ============================================

            // Summary overview card
            const HistoricalOverview = ({ data, monteCarloSurvivalRate, formatCurrency }) => {
                if (!data) return null;

                const survivalColor = data.survivalRate >= 95 ? "accent" : data.survivalRate >= 80 ? "warning" : "danger";
                const mcComparison = monteCarloSurvivalRate != null
                    ? data.survivalRate - monteCarloSurvivalRate
                    : null;

                return (
                    <div className="space-y-4">
                        {/* Stats grid */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 lg:gap-4">
                            <StatCard
                                title="Taxa de Sobrevivencia"
                                value={data.survivalRate.toFixed(1)}
                                unit="%"
                                icon="ShieldCheck"
                                color={survivalColor}
                                subtitle={`${data.completeWindows} janelas completas`}
                            />
                            <StatCard
                                title="Janelas Testadas"
                                value={data.totalWindows}
                                icon="Layers"
                                color="info"
                                subtitle={`${data.completeWindows} completas, ${data.totalWindows - data.completeWindows} parciais`}
                            />
                            <StatCard
                                title="Saque Mediano"
                                value={(data.medianWithdrawal / 1000).toFixed(0)}
                                unit="k BRL"
                                icon="Calculator"
                                color="accent"
                                subtitle={`~R$ ${(data.medianWithdrawal / 12 / 1000).toFixed(0)}k/mes`}
                            />
                            <StatCard
                                title="Pior Saque"
                                value={(data.worstWithdrawal / 1000).toFixed(0)}
                                unit="k BRL"
                                icon="TrendingDown"
                                color="warning"
                                subtitle="Cenario mais adverso"
                            />
                            <StatCard
                                title="Melhor Ano Inicial"
                                value={data.bestWindow ? data.bestWindow.startYear : "-"}
                                icon="Trophy"
                                color="accent"
                                subtitle={data.bestWindow ? formatCurrency(data.bestWindow.finalPortfolioBRL) + " final" : ""}
                            />
                        </div>

                        {/* Comparison note with Monte Carlo */}
                        {mcComparison != null && (
                            <div className="bg-surface rounded-xl p-4 border border-gray-800">
                                <div className="flex items-center gap-2 mb-2">
                                    <Icon name="GitCompare" size={18} className="text-purple-400" />
                                    <span className="text-sm font-semibold text-gray-300">
                                        Comparativo com Monte Carlo
                                    </span>
                                </div>
                                <div className="text-sm text-gray-400">
                                    <p>
                                        <span className="text-purple-400 font-medium">Backtesting Historico:</span>{" "}
                                        {data.survivalRate.toFixed(1)}% de sobrevivencia
                                        ({data.completeWindows} janelas de {data.dataRange.start} a {data.dataRange.end})
                                    </p>
                                    <p className="mt-1">
                                        <span className="text-accent font-medium">Monte Carlo:</span>{" "}
                                        {monteCarloSurvivalRate.toFixed(1)}% de sobrevivencia
                                        (simulacoes estocasticas)
                                    </p>
                                    <p className="mt-2 text-xs text-gray-500">
                                        {Math.abs(mcComparison) < 3
                                            ? "Os resultados sao consistentes entre os dois metodos, o que reforça a confiabilidade da estrategia."
                                            : mcComparison > 0
                                                ? "O backtesting historico sugere resultados melhores que o Monte Carlo. Isso pode indicar que os parametros do MC sao conservadores, ou que o periodo historico brasileiro foi relativamente favoravel."
                                                : "O Monte Carlo sugere resultados melhores que o backtesting. O periodo historico brasileiro incluiu crises severas (1999, 2002, 2008, 2015, 2020) que impactaram os resultados."
                                        }
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Data range info */}
                        <div className="bg-midnight rounded-lg p-3 border border-gray-800">
                            <div className="flex items-center gap-2 mb-1">
                                <Icon name="Database" size={14} className="text-gray-500" />
                                <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                                    Dados Historicos
                                </span>
                            </div>
                            <p className="text-xs text-gray-400">
                                Periodo: {data.dataRange.start}-{data.dataRange.end} ({data.dataRange.totalYears} anos).
                                Inclui S&P 500 (retorno total), CDI/Selic, IPCA e cambio BRL/USD.
                                Cada janela inicia em um ano diferente e simula a estrategia com dados reais.
                            </p>
                            {data.failedWindows.length > 0 && (
                                <p className="text-xs text-danger mt-1">
                                    {data.failedWindows.length} janela(s) resultaram em falha:
                                    {" "}
                                    {data.failedWindows.map(f =>
                                        `${f.startYear} (falha no ano ${f.failureYear})`
                                    ).join(", ")}
                                </p>
                            )}
                        </div>
                    </div>
                );
            };

            // Spaghetti chart - portfolio evolution for all windows
            const HistoricalSurvivalChart = ({ data }) => {
                const chartRef = useRef(null);
                const canvasRef = useRef(null);

                useEffect(() => {
                    if (!data || !data.windowResults || !canvasRef.current) return;

                    if (chartRef.current) {
                        chartRef.current.destroy();
                    }

                    const ctx = canvasRef.current.getContext("2d");
                    const maxYears = Math.max(...data.windowResults.map(w => w.portfolioBRL.length));
                    const labels = Array.from({ length: maxYears }, (_, i) => `Ano ${i}`);

                    // Find best and worst windows
                    const sortedWindows = [...data.windowResults].sort((a, b) =>
                        (a.portfolioBRL[a.portfolioBRL.length - 1] || 0) -
                        (b.portfolioBRL[b.portfolioBRL.length - 1] || 0)
                    );
                    const worstStartYear = sortedWindows[0]?.startYear;
                    const bestStartYear = sortedWindows[sortedWindows.length - 1]?.startYear;

                    const datasets = data.windowResults.map(w => {
                        const isBest = w.startYear === bestStartYear;
                        const isWorst = w.startYear === worstStartYear;
                        const isFailed = w.failed;

                        // Pad data to maxYears length (null for missing years)
                        const paddedData = [...w.portfolioBRL];
                        while (paddedData.length < maxYears) {
                            paddedData.push(null);
                        }

                        let borderColor, borderWidth, zIndex;
                        if (isBest) {
                            borderColor = "rgba(16, 185, 129, 0.9)";
                            borderWidth = 3;
                            zIndex = 10;
                        } else if (isWorst) {
                            borderColor = "rgba(239, 68, 68, 0.9)";
                            borderWidth = 3;
                            zIndex = 10;
                        } else if (isFailed) {
                            borderColor = "rgba(239, 68, 68, 0.25)";
                            borderWidth = 1.5;
                            zIndex = 5;
                        } else {
                            borderColor = "rgba(59, 130, 246, 0.15)";
                            borderWidth = 1;
                            zIndex = 1;
                        }

                        return {
                            label: `${w.startYear}${isBest ? " (melhor)" : isWorst ? " (pior)" : ""}`,
                            data: paddedData,
                            borderColor,
                            borderWidth,
                            pointRadius: 0,
                            tension: 0.3,
                            fill: false,
                            order: -zIndex,
                            spanGaps: false,
                        };
                    });

                    chartRef.current = new Chart(ctx, {
                        type: "line",
                        data: { labels, datasets },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            interaction: {
                                intersect: false,
                                mode: "nearest",
                            },
                            plugins: {
                                legend: {
                                    display: false,
                                },
                                tooltip: {
                                    backgroundColor: "#1a2234",
                                    titleColor: "#fff",
                                    bodyColor: "#9ca3af",
                                    borderColor: "#374151",
                                    borderWidth: 1,
                                    padding: 12,
                                    filter: (tooltipItem) => {
                                        // Only show tooltip for highlighted lines
                                        return tooltipItem.dataset.borderWidth >= 3;
                                    },
                                    callbacks: {
                                        label: (ctx) =>
                                            `${ctx.dataset.label}: R$ ${(ctx.raw / 1000000).toFixed(2)}M`,
                                    },
                                },
                            },
                            scales: {
                                x: {
                                    grid: { color: "rgba(55, 65, 81, 0.3)" },
                                    ticks: {
                                        color: "#6b7280",
                                        font: { family: "JetBrains Mono", size: 10 },
                                    },
                                },
                                y: {
                                    grid: { color: "rgba(55, 65, 81, 0.3)" },
                                    ticks: {
                                        color: "#6b7280",
                                        font: { family: "JetBrains Mono", size: 10 },
                                        callback: (value) => `R$ ${(value / 1000000).toFixed(1)}M`,
                                    },
                                },
                            },
                        },
                    });

                    return () => {
                        if (chartRef.current) {
                            chartRef.current.destroy();
                        }
                    };
                }, [data]);

                return (
                    <div className="chart-container">
                        <canvas ref={canvasRef} />
                    </div>
                );
            };

            // Table of all historical windows
            const HistoricalWindowTable = ({ data, formatCurrency }) => {
                const [sortKey, setSortKey] = useState("startYear");
                const [sortAsc, setSortAsc] = useState(true);

                if (!data || !data.windowResults) return null;

                const handleSort = (key) => {
                    if (sortKey === key) {
                        setSortAsc(!sortAsc);
                    } else {
                        setSortKey(key);
                        setSortAsc(true);
                    }
                };

                const sorted = [...data.windowResults].sort((a, b) => {
                    let va, vb;
                    switch (sortKey) {
                        case "startYear": va = a.startYear; vb = b.startYear; break;
                        case "windowYears": va = a.windowYears; vb = b.windowYears; break;
                        case "finalPortfolioBRL": va = a.finalPortfolioBRL; vb = b.finalPortfolioBRL; break;
                        case "worstWithdrawalBRL": va = a.worstWithdrawalBRL === Infinity ? 0 : a.worstWithdrawalBRL; vb = b.worstWithdrawalBRL === Infinity ? 0 : b.worstWithdrawalBRL; break;
                        case "status": va = a.failed ? 0 : 1; vb = b.failed ? 0 : 1; break;
                        default: va = a.startYear; vb = b.startYear;
                    }
                    return sortAsc ? va - vb : vb - va;
                });

                const SortIcon = ({ column }) => {
                    if (sortKey !== column) return <Icon name="ArrowUpDown" size={12} className="text-gray-600" />;
                    return <Icon name={sortAsc ? "ArrowUp" : "ArrowDown"} size={12} className="text-accent" />;
                };

                return (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs font-mono">
                            <thead>
                                <tr className="border-b border-gray-700">
                                    <th className="text-left py-2 px-3 text-gray-400 cursor-pointer hover:text-accent transition-colors" onClick={() => handleSort("startYear")}>
                                        <div className="flex items-center gap-1">Ano Inicial <SortIcon column="startYear" /></div>
                                    </th>
                                    <th className="text-center py-2 px-3 text-gray-400 cursor-pointer hover:text-accent transition-colors" onClick={() => handleSort("windowYears")}>
                                        <div className="flex items-center gap-1 justify-center">Anos <SortIcon column="windowYears" /></div>
                                    </th>
                                    <th className="text-center py-2 px-3 text-gray-400 cursor-pointer hover:text-accent transition-colors" onClick={() => handleSort("status")}>
                                        <div className="flex items-center gap-1 justify-center">Status <SortIcon column="status" /></div>
                                    </th>
                                    <th className="text-right py-2 px-3 text-gray-400 cursor-pointer hover:text-accent transition-colors" onClick={() => handleSort("finalPortfolioBRL")}>
                                        <div className="flex items-center gap-1 justify-end">Patrimonio Final <SortIcon column="finalPortfolioBRL" /></div>
                                    </th>
                                    <th className="text-right py-2 px-3 text-gray-400 cursor-pointer hover:text-accent transition-colors" onClick={() => handleSort("worstWithdrawalBRL")}>
                                        <div className="flex items-center gap-1 justify-end">Pior Saque <SortIcon column="worstWithdrawalBRL" /></div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {sorted.map((w, i) => (
                                    <tr
                                        key={w.startYear}
                                        className={`border-b border-gray-800 ${
                                            w.failed
                                                ? "bg-danger/5 hover:bg-danger/10"
                                                : "hover:bg-surface/50"
                                        } transition-colors`}
                                    >
                                        <td className="py-2 px-3 font-semibold text-gray-200">
                                            {w.startYear}
                                            {!w.isComplete && (
                                                <span className="ml-1 text-gray-600 text-[10px]">(parcial)</span>
                                            )}
                                        </td>
                                        <td className="py-2 px-3 text-center text-gray-400">{w.windowYears}</td>
                                        <td className="py-2 px-3 text-center">
                                            {w.failed ? (
                                                <span className="text-danger">
                                                    Falha ano {w.failureYear}
                                                </span>
                                            ) : (
                                                <span className="text-accent">Sobreviveu</span>
                                            )}
                                        </td>
                                        <td className="py-2 px-3 text-right text-gray-300">
                                            {w.failed
                                                ? <span className="text-danger">R$ 0</span>
                                                : formatCurrency(w.finalPortfolioBRL)
                                            }
                                        </td>
                                        <td className="py-2 px-3 text-right text-gray-300">
                                            {w.worstWithdrawalBRL === Infinity
                                                ? "-"
                                                : formatCurrency(w.worstWithdrawalBRL)
                                            }
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            };

            // Withdrawal evolution chart (mean/median across windows)
            const HistoricalWithdrawalChart = ({ data }) => {
                const chartRef = useRef(null);
                const canvasRef = useRef(null);

                useEffect(() => {
                    if (!data || !data.withdrawalByYear || !canvasRef.current) return;

                    if (chartRef.current) {
                        chartRef.current.destroy();
                    }

                    const ctx = canvasRef.current.getContext("2d");
                    const labels = Array.from(
                        { length: data.withdrawalByYear.mean.length },
                        (_, i) => `Ano ${i}`,
                    );

                    chartRef.current = new Chart(ctx, {
                        type: "line",
                        data: {
                            labels,
                            datasets: [
                                {
                                    label: "Media",
                                    data: data.withdrawalByYear.mean,
                                    borderColor: "#8b5cf6",
                                    backgroundColor: "rgba(139, 92, 246, 0.1)",
                                    fill: false,
                                    tension: 0.3,
                                    borderWidth: 2,
                                    pointRadius: 0,
                                },
                                {
                                    label: "Mediana",
                                    data: data.withdrawalByYear.median,
                                    borderColor: "#10b981",
                                    backgroundColor: "rgba(16, 185, 129, 0.1)",
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
                                        font: { family: "Outfit", size: 11 },
                                        usePointStyle: true,
                                        padding: 15,
                                    },
                                },
                                tooltip: {
                                    backgroundColor: "#1a2234",
                                    titleColor: "#fff",
                                    bodyColor: "#9ca3af",
                                    borderColor: "#374151",
                                    borderWidth: 1,
                                    padding: 12,
                                    callbacks: {
                                        label: (ctx) =>
                                            `${ctx.dataset.label}: R$ ${ctx.raw.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`,
                                    },
                                },
                            },
                            scales: {
                                x: {
                                    grid: { color: "rgba(55, 65, 81, 0.3)" },
                                    ticks: {
                                        color: "#6b7280",
                                        font: { family: "JetBrains Mono", size: 10 },
                                    },
                                },
                                y: {
                                    grid: { color: "rgba(55, 65, 81, 0.3)" },
                                    ticks: {
                                        color: "#6b7280",
                                        font: { family: "JetBrains Mono", size: 10 },
                                        callback: (value) => `R$ ${(value / 1000).toFixed(0)}k`,
                                    },
                                },
                            },
                        },
                    });

                    return () => {
                        if (chartRef.current) {
                            chartRef.current.destroy();
                        }
                    };
                }, [data]);

                return (
                    <div className="chart-container">
                        <canvas ref={canvasRef} />
                    </div>
                );
            };

            // Portfolio percentile bands chart (from historical data)
            const HistoricalPortfolioChart = ({ data }) => {
                const chartRef = useRef(null);
                const canvasRef = useRef(null);

                useEffect(() => {
                    if (!data || !data.portfolioByYear || !canvasRef.current) return;

                    if (chartRef.current) {
                        chartRef.current.destroy();
                    }

                    const ctx = canvasRef.current.getContext("2d");
                    const labels = Array.from(
                        { length: data.portfolioByYear.p50.length },
                        (_, i) => `Ano ${i}`,
                    );

                    chartRef.current = new Chart(ctx, {
                        type: "line",
                        data: {
                            labels,
                            datasets: [
                                {
                                    label: "Percentil 90",
                                    data: data.portfolioByYear.p90,
                                    borderColor: "rgba(139, 92, 246, 0.8)",
                                    backgroundColor: "rgba(139, 92, 246, 0.1)",
                                    fill: "+1",
                                    tension: 0.3,
                                    borderWidth: 1,
                                    pointRadius: 0,
                                },
                                {
                                    label: "Percentil 75",
                                    data: data.portfolioByYear.p75,
                                    borderColor: "rgba(139, 92, 246, 0.6)",
                                    backgroundColor: "rgba(139, 92, 246, 0.1)",
                                    fill: "+1",
                                    tension: 0.3,
                                    borderWidth: 1,
                                    pointRadius: 0,
                                },
                                {
                                    label: "Mediana (P50)",
                                    data: data.portfolioByYear.p50,
                                    borderColor: "#8b5cf6",
                                    backgroundColor: "rgba(139, 92, 246, 0.2)",
                                    fill: "+1",
                                    tension: 0.3,
                                    borderWidth: 2,
                                    pointRadius: 0,
                                },
                                {
                                    label: "Percentil 25",
                                    data: data.portfolioByYear.p25,
                                    borderColor: "rgba(245, 158, 11, 0.6)",
                                    backgroundColor: "rgba(245, 158, 11, 0.1)",
                                    fill: "+1",
                                    tension: 0.3,
                                    borderWidth: 1,
                                    pointRadius: 0,
                                },
                                {
                                    label: "Percentil 10",
                                    data: data.portfolioByYear.p10,
                                    borderColor: "rgba(239, 68, 68, 0.8)",
                                    backgroundColor: "transparent",
                                    fill: false,
                                    tension: 0.3,
                                    borderWidth: 2,
                                    borderDash: [5, 5],
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
                                        font: { family: "Outfit", size: 11 },
                                        usePointStyle: true,
                                        padding: 15,
                                    },
                                },
                                tooltip: {
                                    backgroundColor: "#1a2234",
                                    titleColor: "#fff",
                                    bodyColor: "#9ca3af",
                                    borderColor: "#374151",
                                    borderWidth: 1,
                                    padding: 12,
                                    callbacks: {
                                        label: (ctx) =>
                                            `${ctx.dataset.label}: R$ ${(ctx.raw / 1000000).toFixed(2)}M`,
                                    },
                                },
                            },
                            scales: {
                                x: {
                                    grid: { color: "rgba(55, 65, 81, 0.3)" },
                                    ticks: {
                                        color: "#6b7280",
                                        font: { family: "JetBrains Mono", size: 10 },
                                    },
                                },
                                y: {
                                    grid: { color: "rgba(55, 65, 81, 0.3)" },
                                    ticks: {
                                        color: "#6b7280",
                                        font: { family: "JetBrains Mono", size: 10 },
                                        callback: (value) => `R$ ${(value / 1000000).toFixed(1)}M`,
                                    },
                                },
                            },
                        },
                    });

                    return () => {
                        if (chartRef.current) {
                            chartRef.current.destroy();
                        }
                    };
                }, [data]);

                return (
                    <div className="chart-container">
                        <canvas ref={canvasRef} />
                    </div>
                );
            };
