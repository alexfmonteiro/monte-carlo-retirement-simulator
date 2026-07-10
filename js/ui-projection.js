const { useEffect, useRef } = React;

            // Chart component for the "Projeção" tab: sustainable monthly
            // spending (today's BRL) vs. retirement age, two series
            // (conservative / adjusted-risk) plus a horizontal reference
            // line at the user's target monthly spending. The
            // conservative/adjusted crossing of that reference line is the
            // earliest "comfortable" retirement age, called out in text
            // below the chart.
            const SustainableSpendingByAgeChart = ({
                byAge,
                targetSpendingBRL,
            }) => {
                const chartRef = useRef(null);
                const canvasRef = useRef(null);

                useEffect(() => {
                    if (!byAge || byAge.length === 0 || !canvasRef.current) return;

                    if (chartRef.current) {
                        chartRef.current.destroy();
                    }

                    const ctx = canvasRef.current.getContext("2d");
                    const labels = byAge.map((row) => row.age);
                    const targetMonthly = (targetSpendingBRL || 0) / 12;

                    const datasets = [
                        {
                            label: "Gasto sustentável mensal (conservador)",
                            data: byAge.map((row) => row.monthlyConservative),
                            borderColor: "#3b82f6",
                            backgroundColor: "rgba(59, 130, 246, 0.1)",
                            fill: false,
                            tension: 0.3,
                            borderWidth: 2,
                            pointRadius: 3,
                            pointBackgroundColor: "#3b82f6",
                        },
                        {
                            label: "Gasto sustentável mensal (ajustado)",
                            data: byAge.map((row) => row.monthlyAdjusted),
                            borderColor: "#10b981",
                            backgroundColor: "rgba(16, 185, 129, 0.1)",
                            fill: false,
                            tension: 0.3,
                            borderWidth: 2,
                            pointRadius: 3,
                            pointBackgroundColor: "#10b981",
                        },
                    ];

                    if (targetMonthly > 0) {
                        datasets.push({
                            label: "Gasto alvo (hoje)",
                            data: Array(byAge.length).fill(targetMonthly),
                            borderColor: "#ef4444",
                            borderWidth: 2,
                            borderDash: [8, 5],
                            pointRadius: 0,
                            fill: false,
                        });
                    }

                    chartRef.current = new Chart(ctx, {
                        type: "line",
                        data: { labels, datasets },
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
                                        title: (items) =>
                                            `Idade ${items[0].label}`,
                                        label: (ctx) =>
                                            `${ctx.dataset.label}: R$ ${ctx.raw.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}/mês`,
                                    },
                                },
                            },
                            scales: {
                                x: {
                                    grid: { color: "rgba(55, 65, 81, 0.3)" },
                                    title: {
                                        display: true,
                                        text: "Idade na aposentadoria",
                                        color: "#6b7280",
                                        font: { family: "Outfit", size: 11 },
                                    },
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
                                        callback: (value) =>
                                            `R$ ${(value / 1000).toFixed(1)}k`,
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
                }, [byAge, targetSpendingBRL]);

                // Earliest age at which the adjusted-risk sustainable
                // spending meets or exceeds the user's target — the
                // "earliest comfortable retirement age" callout.
                const targetMonthly = (targetSpendingBRL || 0) / 12;
                const comfortableRow =
                    targetMonthly > 0 && byAge && byAge.length > 0
                        ? byAge.find((row) => row.monthlyAdjusted >= targetMonthly)
                        : null;

                return (
                    <div className="bg-surface rounded-xl p-4 border border-gray-800">
                        <div className="flex items-center gap-2 mb-4">
                            <Icon
                                name="TrendingUp"
                                size={20}
                                className="text-emerald-400"
                            />
                            <h3 className="font-semibold">
                                Gasto sustentável por idade de aposentadoria
                            </h3>
                        </div>
                        <div className="chart-container">
                            <canvas ref={canvasRef} />
                        </div>
                        {targetMonthly > 0 && (
                            <p className="text-xs text-gray-500 mt-3">
                                {comfortableRow ? (
                                    <>
                                        A partir dos{" "}
                                        <span className="text-emerald-400 font-semibold">
                                            {comfortableRow.age} anos
                                        </span>{" "}
                                        o gasto sustentável ajustado por mortalidade já
                                        cobre o gasto alvo de hoje (
                                        {targetMonthly.toLocaleString("pt-BR", {
                                            maximumFractionDigits: 0,
                                        })}
                                        /mês) — essa é a idade mínima confortável para
                                        parar de trabalhar, dentro do horizonte simulado.
                                    </>
                                ) : (
                                    <>
                                        Em nenhuma das idades simuladas o gasto
                                        sustentável ajustado por mortalidade alcança o
                                        gasto alvo de hoje (
                                        {targetMonthly.toLocaleString("pt-BR", {
                                            maximumFractionDigits: 0,
                                        })}
                                        /mês) — considere trabalhar mais anos, reduzir o
                                        gasto alvo, ou revisar a alocação/expectativas de
                                        retorno.
                                    </>
                                )}
                            </p>
                        )}
                    </div>
                );
            };
