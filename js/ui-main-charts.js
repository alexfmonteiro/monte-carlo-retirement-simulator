const { useState, useEffect, useRef, useCallback, useMemo } = React;

            // Chart component for withdrawals
            const WithdrawalChart = ({ data, years }) => {
                const chartRef = useRef(null);
                const canvasRef = useRef(null);

                useEffect(() => {
                    if (!data || !canvasRef.current) return;

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
                                    label: "Percentil 90",
                                    data: data.p90,
                                    borderColor: "rgba(59, 130, 246, 0.6)",
                                    fill: false,
                                    tension: 0.3,
                                    borderWidth: 1,
                                    pointRadius: 0,
                                },
                                {
                                    label: "Mediana",
                                    data: data.p50,
                                    borderColor: "#3b82f6",
                                    backgroundColor: "rgba(59, 130, 246, 0.1)",
                                    fill: true,
                                    tension: 0.3,
                                    borderWidth: 2,
                                    pointRadius: 0,
                                },
                                {
                                    label: "Percentil 10",
                                    data: data.p10,
                                    borderColor: "rgba(239, 68, 68, 0.8)",
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
                                            `${ctx.dataset.label}: R$ ${ctx.raw.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`,
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
                                    grid: { color: "rgba(55, 65, 81, 0.3)" },
                                    ticks: {
                                        color: "#6b7280",
                                        font: {
                                            family: "JetBrains Mono",
                                            size: 10,
                                        },
                                        callback: (value) =>
                                            `R$ ${(value / 1000).toFixed(0)}k`,
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
                }, [data, years]);

                return (
                    <div className="chart-container">
                        <canvas ref={canvasRef} />
                    </div>
                );
            };

            // Chart component for mean/median withdrawal evolution
            const WithdrawalEvolutionChart = ({
                means,
                medians,
                years,
                minimumWithdrawal,
                useMinimum,
                inssIncomeMeans,
                useINSS,
            }) => {
                const chartRef = useRef(null);
                const canvasRef = useRef(null);

                useEffect(() => {
                    if (!means || !medians || !canvasRef.current) return;

                    if (chartRef.current) {
                        chartRef.current.destroy();
                    }

                    const ctx = canvasRef.current.getContext("2d");
                    const labels = Array.from(
                        { length: years + 1 },
                        (_, i) => `Ano ${i}`,
                    );

                    const datasets = [
                        {
                            label: "Média",
                            data: means,
                            borderColor: "#8b5cf6",
                            backgroundColor: "rgba(139, 92, 246, 0.1)",
                            fill: false,
                            tension: 0.3,
                            borderWidth: 2,
                            pointRadius: 0,
                        },
                        {
                            label: "Mediana",
                            data: medians,
                            borderColor: "#10b981",
                            backgroundColor: "rgba(16, 185, 129, 0.1)",
                            fill: true,
                            tension: 0.3,
                            borderWidth: 2,
                            pointRadius: 0,
                        },
                    ];

                    // Add minimum withdrawal line if enabled
                    if (useMinimum && minimumWithdrawal > 0) {
                        datasets.push({
                            label: "Mínimo Aceitável",
                            data: Array(years + 1).fill(minimumWithdrawal),
                            borderColor: "#ef4444",
                            borderWidth: 2,
                            borderDash: [10, 5],
                            pointRadius: 0,
                            fill: false,
                        });
                    }

                    // Add INSS income line if enabled
                    if (useINSS && inssIncomeMeans && inssIncomeMeans.some(v => v > 0)) {
                        datasets.push({
                            label: 'Renda INSS (média)',
                            data: inssIncomeMeans,
                            borderColor: '#f59e0b',
                            backgroundColor: 'rgba(245, 158, 11, 0.1)',
                            borderWidth: 2,
                            borderDash: [6, 3],
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
                                            `R$ ${(value / 1000).toFixed(0)}k`,
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
                }, [means, medians, years, minimumWithdrawal, useMinimum, inssIncomeMeans, useINSS]);

                return (
                    <div className="chart-container">
                        <canvas ref={canvasRef} />
                    </div>
                );
            };
