const { useState, useEffect, useRef, useCallback, useMemo } = React;

            // Stat card component
            const StatCard = ({
                title,
                value,
                unit,
                icon,
                color = "accent",
                subtitle,
            }) => {
                const colorClasses = {
                    accent: "text-accent border-accent/30",
                    danger: "text-danger border-danger/30",
                    warning: "text-warning border-warning/30",
                    info: "text-info border-info/30",
                };

                return (
                    <div
                        className={`bg-surface rounded-xl p-4 border ${colorClasses[color]} stat-glow`}
                    >
                        <div className="flex items-start justify-between mb-2">
                            <span className="text-xs text-gray-400 uppercase tracking-wide font-medium">
                                {title}
                            </span>
                            <Icon
                                name={icon}
                                size={18}
                                className={colorClasses[color].split(" ")[0]}
                            />
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span
                                className={`text-2xl font-bold font-mono ${colorClasses[color].split(" ")[0]}`}
                            >
                                {value}
                            </span>
                            {unit && (
                                <span className="text-sm text-gray-500">
                                    {unit}
                                </span>
                            )}
                        </div>
                        {subtitle && (
                            <p className="text-xs text-gray-500 mt-1">
                                {subtitle}
                            </p>
                        )}
                    </div>
                );
            };

            // Chart component for portfolio evolution
            const PortfolioChart = ({ data, years }) => {
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
                                    borderColor: "rgba(16, 185, 129, 0.8)",
                                    backgroundColor: "rgba(16, 185, 129, 0.1)",
                                    fill: "+1",
                                    tension: 0.3,
                                    borderWidth: 1,
                                    pointRadius: 0,
                                },
                                {
                                    label: "Percentil 75",
                                    data: data.p75,
                                    borderColor: "rgba(16, 185, 129, 0.6)",
                                    backgroundColor: "rgba(16, 185, 129, 0.1)",
                                    fill: "+1",
                                    tension: 0.3,
                                    borderWidth: 1,
                                    pointRadius: 0,
                                },
                                {
                                    label: "Mediana (P50)",
                                    data: data.p50,
                                    borderColor: "#10b981",
                                    backgroundColor: "rgba(16, 185, 129, 0.2)",
                                    fill: "+1",
                                    tension: 0.3,
                                    borderWidth: 2,
                                    pointRadius: 0,
                                },
                                {
                                    label: "Percentil 25",
                                    data: data.p25,
                                    borderColor: "rgba(245, 158, 11, 0.6)",
                                    backgroundColor: "rgba(245, 158, 11, 0.1)",
                                    fill: "+1",
                                    tension: 0.3,
                                    borderWidth: 1,
                                    pointRadius: 0,
                                },
                                {
                                    label: "Percentil 10",
                                    data: data.p10,
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
                                            `R$ ${(value / 1000000).toFixed(1)}M`,
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
