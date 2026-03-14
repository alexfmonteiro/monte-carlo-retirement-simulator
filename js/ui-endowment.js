const { useState, useEffect, useRef, useCallback, useMemo } = React;

        // ============================================
        // REACT COMPONENTS — SHARED UTILITIES
        // ============================================

        const Icon = ({ name, size = 20, className = "" }) => {
            const ref = useRef(null);
            useEffect(() => {
                if (ref.current) {
                    ref.current.innerHTML = '';
                    const icon = lucide.createElement(lucide.icons[name]);
                    if (icon) {
                        icon.setAttribute('width', size);
                        icon.setAttribute('height', size);
                        if (className) icon.setAttribute('class', className);
                        ref.current.appendChild(icon);
                    }
                }
            }, [name, size, className]);
            return <span ref={ref} className="inline-flex items-center justify-center" />;
        };

        const Tooltip = ({ text }) => {
            const [isOpen, setIsOpen] = useState(false);
            if (!text) return null;
            return (
                <span className="relative ml-1 inline-flex items-center">
                    <span className="cursor-pointer text-gray-500 hover:text-purple-400 transition-colors inline-flex" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsOpen(true); }}>
                        <Icon name="HelpCircle" size={12} />
                    </span>
                    {isOpen && ReactDOM.createPortal(
                        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
                            <div className="absolute inset-0 bg-black/50" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsOpen(false); }} />
                            <div className="relative z-10 w-80 max-w-[90vw] p-4 bg-deep border border-purple-500 rounded-lg shadow-2xl text-sm text-gray-200 leading-relaxed">
                                <button className="absolute top-2 right-2 text-gray-400 hover:text-white p-1" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsOpen(false); }}>
                                    <Icon name="X" size={18} />
                                </button>
                                <div className="pr-6">{text}</div>
                            </div>
                        </div>,
                        document.body
                    )}
                </span>
            );
        };

        const Input = ({ label, value, onChange, unit, min, max, step = 1, tooltip }) => (
            <div className="mb-3">
                <label className="flex items-center text-xs text-gray-400 mb-1 font-medium uppercase tracking-wide">
                    {label}<Tooltip text={tooltip} />
                </label>
                <div className="relative">
                    <input type="number" value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                        min={min} max={max} step={step}
                        className="w-full bg-deep border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-purple-500 input-focus transition-all" />
                    {unit && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">{unit}</span>}
                </div>
            </div>
        );

        const DualCurrencyInput = ({ label, valueUSD, onChangeUSD, fx, tooltip, stepUSD = 10000 }) => {
            const [activeInput, setActiveInput] = useState('usd');
            const handleUSDChange = (v) => onChangeUSD(v);
            const handleBRLChange = (v) => onChangeUSD(v / fx);
            return (
                <div className="mb-3">
                    <label className="flex items-center text-xs text-gray-400 mb-1 font-medium uppercase tracking-wide">
                        {label}<Tooltip text={tooltip} />
                    </label>
                    <div className="flex gap-1">
                        <div className="relative flex-1">
                            <input type="number" value={valueUSD} onChange={(e) => handleUSDChange(parseFloat(e.target.value) || 0)}
                                min={0} step={stepUSD} onFocus={() => setActiveInput('usd')}
                                className={`w-full bg-deep border rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none input-focus transition-all ${activeInput === 'usd' ? 'border-purple-500' : 'border-gray-700'}`} />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">USD</span>
                        </div>
                        <div className="flex items-center px-1 text-gray-600"><Icon name="ArrowLeftRight" size={14} /></div>
                        <div className="relative flex-1">
                            <input type="number" value={Math.round(valueUSD * fx)} onChange={(e) => handleBRLChange(parseFloat(e.target.value) || 0)}
                                min={0} step={stepUSD * fx} onFocus={() => setActiveInput('brl')}
                                className={`w-full bg-deep border rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none input-focus transition-all ${activeInput === 'brl' ? 'border-purple-500' : 'border-gray-700'}`} />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">BRL</span>
                        </div>
                    </div>
                    <div className="text-xs text-gray-600 mt-1 text-center">1 USD = {fx.toFixed(2)} BRL</div>
                </div>
            );
        };

        // BRL Input with USD equivalent display
        const BRLInputWithUSD = ({ label, valueBRL, onChange, fx, tooltip, min = 0, step = 10000 }) => {
            const [activeInput, setActiveInput] = React.useState("brl");
            return (
                <div className="mb-3">
                    <label className="flex items-center text-xs text-gray-400 mb-1 font-medium uppercase tracking-wide">
                        {label}
                        {tooltip && <Tooltip text={tooltip} />}
                    </label>
                    <div className="flex gap-1">
                        <div className="relative flex-1">
                            <input type="number" value={valueBRL}
                                onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                                min={min} step={step} onFocus={() => setActiveInput("brl")}
                                className={`w-full bg-deep border rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none input-focus transition-all ${activeInput === "brl" ? "border-accent" : "border-gray-700"}`} />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">BRL</span>
                        </div>
                        <div className="flex items-center px-1 text-gray-600">⇄</div>
                        <div className="relative flex-1">
                            <input type="number" value={Math.round(valueBRL / fx)}
                                onChange={(e) => onChange((parseFloat(e.target.value) || 0) * fx)}
                                min={0} step={Math.round(step / fx)} onFocus={() => setActiveInput("usd")}
                                className={`w-full bg-deep border rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none input-focus transition-all ${activeInput === "usd" ? "border-accent" : "border-gray-700"}`} />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">USD</span>
                        </div>
                    </div>
                    <div className="text-xs text-gray-600 mt-1 text-center">1 USD = {fx.toFixed(2)} BRL</div>
                </div>
            );
        };

        const Toggle = ({ label, checked, onChange }) => (
            <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</span>
                <button onClick={() => onChange(!checked)} className={`w-11 h-6 rounded-full transition-colors relative ${checked ? 'bg-purple-600' : 'bg-gray-700'}`}>
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'left-6' : 'left-1'}`} />
                </button>
            </div>
        );

        const StatCard = ({ title, value, unit, icon, color = "accent", subtitle }) => {
            const colorClasses = { accent: "text-accent border-accent/30", danger: "text-danger border-danger/30", warning: "text-warning border-warning/30", info: "text-info border-info/30", purple: "text-purple-400 border-purple-400/30" };
            const cls = colorClasses[color] || colorClasses.accent;
            return (
                <div className={`bg-surface rounded-xl p-4 border ${cls} stat-glow`}>
                    <div className="flex items-start justify-between mb-2">
                        <span className="text-xs text-gray-400 uppercase tracking-wide font-medium">{title}</span>
                        <Icon name={icon} size={18} className={cls.split(' ')[0]} />
                    </div>
                    <div className="flex items-baseline gap-1">
                        <span className={`text-2xl font-bold font-mono ${cls.split(' ')[0]}`}>{value}</span>
                        {unit && <span className="text-sm text-gray-500">{unit}</span>}
                    </div>
                    {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
                </div>
            );
        };

        const PortfolioChart = ({ data, years }) => {
            const chartRef = useRef(null);
            const canvasRef = useRef(null);
            useEffect(() => {
                if (!data || !canvasRef.current) return;
                if (chartRef.current) chartRef.current.destroy();
                const ctx = canvasRef.current.getContext('2d');
                const labels = Array.from({ length: years + 1 }, (_, i) => `Ano ${i}`);
                chartRef.current = new Chart(ctx, {
                    type: 'line',
                    data: { labels, datasets: [
                        { label: 'Percentil 90', data: data.p90, borderColor: 'rgba(16,185,129,0.8)', backgroundColor: 'rgba(16,185,129,0.1)', fill: '+1', tension: 0.3, borderWidth: 1, pointRadius: 0 },
                        { label: 'Percentil 75', data: data.p75, borderColor: 'rgba(16,185,129,0.6)', backgroundColor: 'rgba(16,185,129,0.1)', fill: '+1', tension: 0.3, borderWidth: 1, pointRadius: 0 },
                        { label: 'Mediana (P50)', data: data.p50, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.2)', fill: '+1', tension: 0.3, borderWidth: 2, pointRadius: 0 },
                        { label: 'Percentil 25', data: data.p25, borderColor: 'rgba(245,158,11,0.6)', backgroundColor: 'rgba(245,158,11,0.1)', fill: '+1', tension: 0.3, borderWidth: 1, pointRadius: 0 },
                        { label: 'Percentil 10', data: data.p10, borderColor: 'rgba(239,68,68,0.8)', fill: false, tension: 0.3, borderWidth: 2, borderDash: [5,5], pointRadius: 0 }
                    ]},
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        interaction: { intersect: false, mode: 'index' },
                        plugins: {
                            legend: { display: true, position: 'top', labels: { color: '#9ca3af', font: { family: 'Outfit', size: 11 }, usePointStyle: true, padding: 15 } },
                            tooltip: { backgroundColor: '#1a2234', titleColor: '#fff', bodyColor: '#9ca3af', borderColor: '#374151', borderWidth: 1, padding: 12, callbacks: { label: (ctx) => `${ctx.dataset.label}: R$ ${(ctx.raw/1000000).toFixed(2)}M` } }
                        },
                        scales: {
                            x: { grid: { color: 'rgba(55,65,81,0.3)' }, ticks: { color: '#6b7280', font: { family: 'JetBrains Mono', size: 10 } } },
                            y: { grid: { color: 'rgba(55,65,81,0.3)' }, ticks: { color: '#6b7280', font: { family: 'JetBrains Mono', size: 10 }, callback: (v) => `R$ ${(v/1000000).toFixed(1)}M` } }
                        }
                    }
                });
                return () => { if (chartRef.current) chartRef.current.destroy(); };
            }, [data, years]);
            return <div className="chart-container"><canvas ref={canvasRef} /></div>;
        };

        // ============================================
        // ENDOWMENT-SPECIFIC COMPONENTS
        // ============================================

        const ComparisonLineChart = ({ endowment, fixed, gk, years }) => {
            const chartRef = useRef(null);
            const canvasRef = useRef(null);
            useEffect(() => {
                if (!endowment || !canvasRef.current) return;
                if (chartRef.current) chartRef.current.destroy();
                const ctx = canvasRef.current.getContext('2d');
                const labels = Array.from({ length: years + 1 }, (_, i) => `Ano ${i}`);
                chartRef.current = new Chart(ctx, {
                    type: 'line',
                    data: { labels, datasets: [
                        { label: 'Endowment', data: endowment.withdrawalMedians, borderColor: '#8b5cf6', fill: false, tension: 0.3, borderWidth: 2, pointRadius: 0 },
                        { label: 'SWR Fixo 4%', data: fixed.withdrawalMedians, borderColor: '#3b82f6', fill: false, tension: 0.3, borderWidth: 2, pointRadius: 0 },
                        { label: 'Guyton-Klinger', data: gk.withdrawalMedians, borderColor: '#10b981', fill: false, tension: 0.3, borderWidth: 2, pointRadius: 0 }
                    ]},
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        interaction: { intersect: false, mode: 'index' },
                        plugins: {
                            legend: { display: true, position: 'top', labels: { color: '#9ca3af', font: { family: 'Outfit', size: 11 }, usePointStyle: true, padding: 15 } },
                            tooltip: { backgroundColor: '#1a2234', titleColor: '#fff', bodyColor: '#9ca3af', borderColor: '#374151', borderWidth: 1, padding: 12, callbacks: { label: (ctx) => `${ctx.dataset.label}: R$ ${ctx.raw.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` } }
                        },
                        scales: {
                            x: { grid: { color: 'rgba(55,65,81,0.3)' }, ticks: { color: '#6b7280', font: { family: 'JetBrains Mono', size: 10 } } },
                            y: { grid: { color: 'rgba(55,65,81,0.3)' }, ticks: { color: '#6b7280', font: { family: 'JetBrains Mono', size: 10 }, callback: (v) => `R$ ${(v/1000).toFixed(0)}k` } }
                        }
                    }
                });
                return () => { if (chartRef.current) chartRef.current.destroy(); };
            }, [endowment, fixed, gk, years]);
            return <div className="chart-container"><canvas ref={canvasRef} /></div>;
        };

        const SurvivalComparisonBar = ({ metrics }) => {
            const chartRef = useRef(null);
            const canvasRef = useRef(null);
            useEffect(() => {
                if (!metrics || !canvasRef.current) return;
                if (chartRef.current) chartRef.current.destroy();
                const ctx = canvasRef.current.getContext('2d');
                const { survivalRates } = metrics;
                chartRef.current = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: ['Endowment', 'SWR Fixo 4%', 'Guyton-Klinger'],
                        datasets: [{ label: 'Taxa de Sobrevivência (%)', data: [survivalRates.endowment, survivalRates.fixed, survivalRates.gk], backgroundColor: ['rgba(139,92,246,0.7)', 'rgba(59,130,246,0.7)', 'rgba(16,185,129,0.7)'], borderColor: ['#8b5cf6', '#3b82f6', '#10b981'], borderWidth: 2, borderRadius: 6 }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                        plugins: {
                            legend: { display: false },
                            tooltip: { backgroundColor: '#1a2234', titleColor: '#fff', bodyColor: '#9ca3af', borderColor: '#374151', borderWidth: 1, padding: 12, callbacks: { label: (ctx) => `${ctx.raw.toFixed(1)}% sobrevivência` } }
                        },
                        scales: {
                            x: { min: 0, max: 100, grid: { color: 'rgba(55,65,81,0.3)' }, ticks: { color: '#6b7280', font: { family: 'JetBrains Mono', size: 10 }, callback: (v) => `${v}%` } },
                            y: { grid: { display: false }, ticks: { color: '#9ca3af', font: { family: 'Outfit', size: 12 } } }
                        }
                    }
                });
                return () => { if (chartRef.current) chartRef.current.destroy(); };
            }, [metrics]);
            return <div style={{ height: '160px' }}><canvas ref={canvasRef} /></div>;
        };

        const CAPEEvolutionChart = ({ capePercentiles, years }) => {
            const chartRef = useRef(null);
            const canvasRef = useRef(null);
            useEffect(() => {
                if (!capePercentiles || !canvasRef.current) return;
                if (chartRef.current) chartRef.current.destroy();
                const ctx = canvasRef.current.getContext('2d');
                const labels = Array.from({ length: years + 1 }, (_, i) => `Ano ${i}`);
                chartRef.current = new Chart(ctx, {
                    type: 'line',
                    data: { labels, datasets: [
                        { label: 'Percentil 90', data: capePercentiles.p90, borderColor: 'rgba(139,92,246,0.5)', backgroundColor: 'rgba(139,92,246,0.1)', fill: '+1', tension: 0.3, borderWidth: 1, pointRadius: 0 },
                        { label: 'Mediana CAPE', data: capePercentiles.p50, borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.15)', fill: '+1', tension: 0.3, borderWidth: 2, pointRadius: 0 },
                        { label: 'Percentil 10', data: capePercentiles.p10, borderColor: 'rgba(139,92,246,0.4)', fill: false, tension: 0.3, borderWidth: 1, pointRadius: 0, borderDash: [4,4] }
                    ]},
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        interaction: { intersect: false, mode: 'index' },
                        plugins: {
                            legend: { display: true, position: 'top', labels: { color: '#9ca3af', font: { family: 'Outfit', size: 11 }, usePointStyle: true, padding: 15 } },
                            tooltip: { backgroundColor: '#1a2234', titleColor: '#fff', bodyColor: '#9ca3af', borderColor: '#374151', borderWidth: 1, padding: 12, callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(1)}x` } }
                        },
                        scales: {
                            x: { grid: { color: 'rgba(55,65,81,0.3)' }, ticks: { color: '#6b7280', font: { family: 'JetBrains Mono', size: 10 } } },
                            y: { grid: { color: 'rgba(55,65,81,0.3)' }, ticks: { color: '#6b7280', font: { family: 'JetBrains Mono', size: 10 }, callback: (v) => `${v.toFixed(0)}x` } }
                        }
                    }
                });
                return () => { if (chartRef.current) chartRef.current.destroy(); };
            }, [capePercentiles, years]);
            return <div className="chart-container"><canvas ref={canvasRef} /></div>;
        };

        const WithdrawalDistributionChart = ({ year10Withdrawals }) => {
            const chartRef = useRef(null);
            const canvasRef = useRef(null);
            useEffect(() => {
                if (!year10Withdrawals || !canvasRef.current) return;
                if (chartRef.current) chartRef.current.destroy();
                const { endowment, fixed, gk } = year10Withdrawals;
                const allValues = [...endowment, ...fixed, ...gk];
                if (!allValues.length) return;
                const minVal = Math.min(...allValues), maxVal = Math.max(...allValues);
                const numBins = 20, binWidth = (maxVal - minVal) / numBins || 1;
                const buildHist = (vals) => {
                    const bins = Array(numBins).fill(0);
                    vals.forEach(v => { const idx = Math.min(numBins-1, Math.floor((v-minVal)/binWidth)); bins[idx]++; });
                    return bins.map(c => vals.length > 0 ? (c/vals.length)*100 : 0);
                };
                const labels = Array.from({ length: numBins }, (_, i) => `R$ ${((minVal + (i+0.5)*binWidth)/1000).toFixed(0)}k`);
                const ctx = canvasRef.current.getContext('2d');
                chartRef.current = new Chart(ctx, {
                    type: 'bar',
                    data: { labels, datasets: [
                        { label: 'Endowment', data: buildHist(endowment), backgroundColor: 'rgba(139,92,246,0.5)', borderColor: '#8b5cf6', borderWidth: 1, borderRadius: 2 },
                        { label: 'SWR Fixo', data: buildHist(fixed), backgroundColor: 'rgba(59,130,246,0.5)', borderColor: '#3b82f6', borderWidth: 1, borderRadius: 2 },
                        { label: 'Guyton-Klinger', data: buildHist(gk), backgroundColor: 'rgba(16,185,129,0.5)', borderColor: '#10b981', borderWidth: 1, borderRadius: 2 }
                    ]},
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: {
                            legend: { display: true, position: 'top', labels: { color: '#9ca3af', font: { family: 'Outfit', size: 11 }, usePointStyle: true, padding: 15 } },
                            tooltip: { backgroundColor: '#1a2234', titleColor: '#fff', bodyColor: '#9ca3af', borderColor: '#374151', borderWidth: 1, padding: 12, callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(1)}% das simulações` } }
                        },
                        scales: {
                            x: { grid: { display: false }, ticks: { color: '#6b7280', font: { family: 'JetBrains Mono', size: 9 }, maxRotation: 45 } },
                            y: { grid: { color: 'rgba(55,65,81,0.3)' }, ticks: { color: '#6b7280', font: { family: 'JetBrains Mono', size: 10 }, callback: (v) => `${v.toFixed(0)}%` } }
                        }
                    }
                });
                return () => { if (chartRef.current) chartRef.current.destroy(); };
            }, [year10Withdrawals]);
            return <div className="chart-container"><canvas ref={canvasRef} /></div>;
        };

        const ComparisonTable = ({ metrics, formatCurrency, years }) => {
            if (!metrics) return null;
            const { survivalRates, withdrawalAtYear, terminalPortfolio, terminalPortfolioP10, withdrawalVolatility, worstWithdrawal } = metrics;
            const getBest = (row) => ['endowment','fixed','gk'].reduce((a,b) => row[b] > row[a] ? b : a);
            const getWorstKey = (row) => ['endowment','fixed','gk'].reduce((a,b) => row[b] < row[a] ? b : a);
            const cellClass = (key, best, worst) => key === best ? 'text-accent font-semibold' : key === worst ? 'text-danger' : 'text-gray-300';
            const Row = ({ label, row, format, lowerBetter = false, monthlyFmt }) => {
                const best = lowerBetter ? getWorstKey(row) : getBest(row);
                const worst = lowerBetter ? getBest(row) : getWorstKey(row);
                return (
                    <tr className="border-t border-gray-800">
                        <td className="py-2 px-3 text-xs text-gray-400">{label}</td>
                        {['endowment', 'fixed', 'gk'].map(key => (
                            <td key={key} className={`py-2 px-3 text-xs text-right font-mono ${cellClass(key, best, worst)}`}>
                                {format(row[key])}
                                {monthlyFmt && <div className="text-gray-500 font-normal text-xs">{monthlyFmt(row[key] / 12)}/mês</div>}
                            </td>
                        ))}
                    </tr>
                );
            };
            const pct = (v) => `${(v||0).toFixed(1)}%`;
            const cv = (v) => `${((v||0) * 100).toFixed(1)}%`;
            return (
                <div className="bg-surface rounded-xl border border-gray-800 overflow-hidden">
                    <div className="p-4 border-b border-gray-800 flex items-center gap-2">
                        <Icon name="Table" size={18} className="text-purple-400" />
                        <h3 className="font-semibold">Comparação de Métricas</h3>
                        <span className="text-xs text-gray-500 ml-2">Verde = melhor · Vermelho = pior</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-deep">
                                    <th className="py-2 px-3 text-left text-xs text-gray-500 font-medium">Métrica</th>
                                    <th className="py-2 px-3 text-right text-xs text-purple-400 font-medium">Endowment</th>
                                    <th className="py-2 px-3 text-right text-xs text-info font-medium">SWR Fixo</th>
                                    <th className="py-2 px-3 text-right text-xs text-accent font-medium">G-K</th>
                                </tr>
                            </thead>
                            <tbody>
                                <Row label="Taxa de Sobrevivência" row={survivalRates} format={pct} />
                                {withdrawalAtYear && withdrawalAtYear.y5 && <Row label="Saque Mediano — Ano 5" row={withdrawalAtYear.y5} format={formatCurrency} monthlyFmt={formatCurrency} />}
                                {withdrawalAtYear && withdrawalAtYear.y10 && <Row label="Saque Mediano — Ano 10" row={withdrawalAtYear.y10} format={formatCurrency} monthlyFmt={formatCurrency} />}
                                {withdrawalAtYear && withdrawalAtYear.y20 && <Row label="Saque Mediano — Ano 20" row={withdrawalAtYear.y20} format={formatCurrency} monthlyFmt={formatCurrency} />}
                                {withdrawalAtYear && withdrawalAtYear.y30 && years >= 30 && <Row label="Saque Mediano — Ano 30" row={withdrawalAtYear.y30} format={formatCurrency} monthlyFmt={formatCurrency} />}
                                <Row label="Pior Saque (todas as trajetórias)" row={worstWithdrawal} format={formatCurrency} monthlyFmt={formatCurrency} />
                                <Row label="Volatilidade do Saque (CV)" row={withdrawalVolatility} format={cv} lowerBetter={true} />
                                <Row label="Portfólio Final P50" row={terminalPortfolio} format={formatCurrency} />
                                <Row label="Portfólio Final P10" row={terminalPortfolioP10} format={formatCurrency} />
                            </tbody>
                        </table>
                    </div>
                </div>
            );
        };

        const EndowmentExplainer = ({ alpha, targetRate, useCape }) => (
            <div className="bg-surface rounded-xl p-5 border border-purple-500/20">
                <div className="flex items-center gap-2 mb-4">
                    <Icon name="GraduationCap" size={20} className="text-purple-400" />
                    <h3 className="font-semibold">Como Funciona o Endowment Pessoal</h3>
                </div>
                <div className="space-y-4 text-sm text-gray-300">
                    <div>
                        <p className="text-purple-300 font-medium mb-2">Fórmula Base (Modo Simples):</p>
                        <div className="bg-deep rounded-lg p-3 font-mono text-xs text-accent border border-gray-700">
                            W(t) = α × W(t-1) + (1-α) × (x × P(t))
                        </div>
                        <div className="mt-2 space-y-1 text-xs text-gray-400">
                            <p>• <strong className="text-gray-300">α = {(alpha||0.7).toFixed(2)}</strong> — peso do saque anterior (suavização)</p>
                            <p>• <strong className="text-gray-300">x = {(targetRate||4).toFixed(1)}%</strong> — taxa-alvo de retirada</p>
                            <p>• <strong className="text-gray-300">P(t)</strong> — valor do portfólio no início do ano t</p>
                        </div>
                    </div>
                    {useCape && (
                        <div>
                            <p className="text-purple-300 font-medium mb-2">Ajuste por CAPE (Modo Avançado):</p>
                            <div className="bg-deep rounded-lg p-3 font-mono text-xs text-warning border border-gray-700">
                                x(t) = x₀ × (CAPE_médio / CAPE_atual) × (1 − drawdown × sens.)
                            </div>
                            <p className="text-xs text-gray-400 mt-2">Quando o mercado está caro (CAPE alto), a taxa de retirada é reduzida automaticamente. Guardrails de ±15% evitam variações abruptas.</p>
                        </div>
                    )}
                    <div className="pt-3 border-t border-gray-700 text-xs text-gray-400">
                        <strong className="text-gray-300">Origem:</strong> Inspirado na estratégia de endowment da Universidade Yale (David Swensen), adaptada para pessoa física brasileira.
                        A suavização (α) evita oscilações abruptas nos saques, garantindo maior previsibilidade de renda mesmo em mercados voláteis.
                    </div>
                </div>
            </div>
        );
