const { useState, useEffect, useRef, useCallback, useMemo } = React;

        // ============================================
        // MAIN APP
        // ============================================
        const App = () => {
            const [params, setParams] = useState({
                initialPortfolioUSD: 1000000,
                initialPortfolioBRL: 0,
                initialFX: 5.80,
                years: 30,
                iterations: 5000,
                sidebarMode: 'simple',
                // Endowment
                endowmentTargetRate: 4.0,
                endowmentAlpha: 0.70,
                useEndowmentCAPE: false,
                initialCAPE: 22,
                medianCAPE: 20,
                capeVolatility: 4.0,
                capeMeanReversionSpeed: 0.15,
                endowmentDrawdownSensitivity: 0.5,
                endowmentGuardrailCap: 0.15,
                // Market
                equityReturn: 8.0,
                equityVolatility: 18.0,
                bondReturn: 5.0,
                bondVolatility: 2.0,
                targetBondPercent: 40,
                tentInitialBondPercent: 40,
                expectedIPCA: 4.5,
                ipcaVolatility: 2.0,
                realSpread: 5.0,
                // GK comparison
                useGuytonKlinger: true,
                preservationThreshold: 0.20,
                prosperityThreshold: 0.20,
                adjustmentPercent: 0.10,
                applyInflationRule: true,
                // Advanced modeling
                useStudentT: true,
                degreesOfFreedom: 5,
                useDynamicCorrelation: true,
                baseCorrelation: -0.4,
                stressCorrelationMultiplier: 2.0,
                useIPCAModel: true,
                useTaxModel: true,
                equityTaxRate: 15,
                fixedIncomeTaxRate: 15,
                // Engine compat
                inflation: 4.5,
                withdrawalRate: 4.0,
                tentDuration: 30,
                useBucketStrategy: false,
                bucketYears: 0,
                useMinimumWithdrawal: false,
                minimumWithdrawalBRL: 120000,
                useINSS: false,
                currentAge: 60,
                inssStartAge: 65,
                inssMonthlyBRL: 3000,
                useSequenceConstraint: false,
                maxNegativeSequence: 10,
                seed: null,
            });

            const [results, setResults] = useState(null);
            const [isRunning, setIsRunning] = useState(false);

            const updateParam = (key, value) => {
                setParams(prev => {
                    const u = { ...prev, [key]: value };
                    if (key === 'endowmentTargetRate') u.withdrawalRate = value;
                    if (key === 'expectedIPCA') { u.inflation = value; }
                    if (key === 'years') u.tentDuration = value;
                    if (key === 'targetBondPercent') u.tentInitialBondPercent = value;
                    if (key === 'sidebarMode' && value === 'simple') u.useEndowmentCAPE = false;
                    return u;
                });
            };

            const runSimulation = () => {
                setIsRunning(true);
                setTimeout(() => {
                    try {
                        const engine = new MonteCarloEngine(params);
                        const r = engine.runMonteCarloComparison(params.iterations);
                        setResults(r);
                    } catch(e) { console.error(e); }
                    setIsRunning(false);
                }, 50);
            };

            const formatCurrency = (val) => {
                if (!val || isNaN(val)) return 'R$ 0';
                if (Math.abs(val) >= 1000000) return `R$ ${(val/1000000).toFixed(2)}M`;
                if (Math.abs(val) >= 1000) return `R$ ${(val/1000).toFixed(0)}k`;
                return `R$ ${val.toFixed(0)}`;
            };

            return (
                <div className="min-h-screen flex flex-col lg:flex-row">
                    {/* Sidebar */}
                    <aside className="w-full lg:w-80 bg-deep border-b lg:border-b-0 lg:border-r border-gray-800 p-4 lg:p-5 lg:overflow-y-auto">
                        <div className="mb-6">
                            <div className="flex items-center gap-2 mb-1">
                                <Icon name="GraduationCap" size={24} className="text-purple-400" />
                                <h1 className="text-xl font-bold">Yale Endowment</h1>
                            </div>
                            <p className="text-xs text-gray-500">Simulador de Aposentadoria por Endowment</p>
                            <a href="index.html" className="flex items-center gap-1 text-xs text-gray-500 hover:text-accent transition-colors mt-1">
                                <Icon name="ArrowLeft" size={14} />
                                <span>← Voltar ao SWR Clássico</span>
                            </a>
                        </div>

                        <div className="flex bg-midnight rounded-lg p-1 mb-6">
                            {['simple','advanced'].map(mode => (
                                <button key={mode} onClick={() => updateParam('sidebarMode', mode)}
                                    className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-colors ${params.sidebarMode === mode ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                                    {mode === 'simple' ? 'Simples' : 'Avançado'}
                                </button>
                            ))}
                        </div>

                        {/* Portfolio */}
                        <div className="mb-6">
                            <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                                <Icon name="Wallet" size={16} /> Portfólio
                            </h2>
                            <DualCurrencyInput label="Patrimônio Inicial" valueUSD={params.initialPortfolioUSD} onChangeUSD={(v) => updateParam('initialPortfolioUSD', v)} fx={params.initialFX} tooltip="Valor total do portfólio em USD (ETFs internacionais)." stepUSD={50000} />
                            <Input label="Taxa de Câmbio" value={params.initialFX} onChange={(v) => updateParam('initialFX', v)} unit="BRL/USD" min={2} max={20} step={0.1} tooltip="Taxa de câmbio inicial BRL/USD." />
                            <Input label="Horizonte" value={params.years} onChange={(v) => updateParam('years', Math.round(v))} unit="anos" min={10} max={60} step={1} tooltip="Número de anos da aposentadoria." />
                            <Input label="Simulações" value={params.iterations} onChange={(v) => updateParam('iterations', Math.round(v))} unit="sims" min={500} max={20000} step={500} tooltip="Número de trajetórias Monte Carlo por estratégia. O total de simulações executadas é 3× este valor (uma por estratégia)." />
                        </div>

                        {/* Endowment Parameters */}
                        <div className="mb-6">
                            <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                                <Icon name="GraduationCap" size={16} /> Parâmetros Endowment
                            </h2>
                            <Input label="Taxa-Alvo de Retirada (x)" value={params.endowmentTargetRate} onChange={(v) => updateParam('endowmentTargetRate', v)} unit="%" min={1} max={10} step={0.1} tooltip="Taxa x na fórmula W(t)=α×W(t-1)+(1-α)×(x×P(t)). Percentual do portfólio retirado sem suavização." />
                            <Input label="Peso de Suavização (α)" value={params.endowmentAlpha} onChange={(v) => updateParam('endowmentAlpha', v)} unit="" min={0.5} max={0.95} step={0.05} tooltip="Peso do saque anterior. α=0.70 → 70% do saque anterior + 30% do alvo atual. Maior α = mais suave e menos volátil." />
                            <Input label="Alocação em Renda Fixa" value={params.targetBondPercent} onChange={(v) => updateParam('targetBondPercent', v)} unit="%" min={0} max={80} step={5} tooltip="Percentual do portfólio em renda fixa. Mantido constante." />

                            {params.sidebarMode === 'advanced' && (
                                <div className="pt-3 mt-3 border-t border-gray-800">
                                    <Toggle label="Ajuste por CAPE" checked={params.useEndowmentCAPE} onChange={(v) => updateParam('useEndowmentCAPE', v)} />
                                    {params.useEndowmentCAPE && (
                                        <>
                                            <Input label="CAPE Inicial" value={params.initialCAPE} onChange={(v) => updateParam('initialCAPE', v)} unit="x" min={7} max={50} step={1} tooltip="Valor inicial do CAPE (P/L ajustado 10a). Histórico S&P500 ≈ 22x." />
                                            <Input label="CAPE Mediano (longo prazo)" value={params.medianCAPE} onChange={(v) => updateParam('medianCAPE', v)} unit="x" min={7} max={40} step={1} tooltip="CAPE de reversão à média no longo prazo." />
                                            <Input label="Volatilidade do CAPE" value={params.capeVolatility} onChange={(v) => updateParam('capeVolatility', v)} unit="" min={1} max={10} step={0.5} tooltip="Desvio padrão anual do processo CAPE (Ornstein-Uhlenbeck)." />
                                            <Input label="Velocidade de Reversão" value={params.capeMeanReversionSpeed} onChange={(v) => updateParam('capeMeanReversionSpeed', v)} unit="" min={0.05} max={0.5} step={0.05} tooltip="Velocidade com que o CAPE reverte à mediana. 0.15 = lenta." />
                                            <Input label="Sensibilidade ao Drawdown" value={params.endowmentDrawdownSensitivity} onChange={(v) => updateParam('endowmentDrawdownSensitivity', v)} unit="" min={0} max={1} step={0.1} tooltip="Quanto o drawdown reduz a taxa de retirada. 0.5 = drawdown 50% reduz taxa em 25%." />
                                            <Input label="Guardrail (cap ±)" value={params.endowmentGuardrailCap} onChange={(v) => updateParam('endowmentGuardrailCap', v)} unit="" min={0.05} max={0.30} step={0.05} tooltip="Variação máxima do saque ano-a-ano. 0.15 = ±15% máximo." />
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Minimum Withdrawal */}
                        <div className="mb-6">
                            <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                                <Icon name="ArrowDownToLine" size={16} /> Saque Mínimo
                            </h2>
                            <Toggle label="Usar Saque Mínimo" checked={params.useMinimumWithdrawal} onChange={(v) => updateParam('useMinimumWithdrawal', v)} />
                            {params.useMinimumWithdrawal && (
                                <Input
                                    label="Saque Mínimo Anual"
                                    value={params.minimumWithdrawalBRL}
                                    onChange={(v) => updateParam('minimumWithdrawalBRL', v)}
                                    unit="BRL"
                                    min={0}
                                    step={10000}
                                    tooltip="Valor mínimo de saque anual em BRL. Quando a fórmula Endowment sugerir um valor abaixo deste, o mínimo é forçado — o que acelera a depleção do portfólio em cenários adversos. O portfólio USD equivale a esse valor dividido pela taxa de câmbio."
                                />
                            )}
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

                        {/* Advanced Market Assumptions */}
                        {params.sidebarMode === 'advanced' && (
                            <div className="mb-6">
                                <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                                    <Icon name="BarChart2" size={16} /> Premissas de Mercado
                                </h2>
                                <Input label="Retorno Médio Equity" value={params.equityReturn} onChange={(v) => updateParam('equityReturn', v)} unit="%" min={-5} max={20} step={0.5} tooltip="Retorno médio anual esperado para ETFs de renda variável." />
                                <Input label="Volatilidade Equity" value={params.equityVolatility} onChange={(v) => updateParam('equityVolatility', v)} unit="%" min={5} max={40} step={1} tooltip="Desvio padrão anual dos retornos de equity." />
                                <Input label="IPCA Esperado" value={params.expectedIPCA} onChange={(v) => updateParam('expectedIPCA', v)} unit="%" min={1} max={15} step={0.5} tooltip="Inflação brasileira esperada (IPCA)." />
                                <Input label="Spread Real (RF)" value={params.realSpread} onChange={(v) => updateParam('realSpread', v)} unit="%" min={0} max={10} step={0.5} tooltip="Prêmio real acima do IPCA para renda fixa." />
                                <Toggle label="Caudas Gordas (T-Student)" checked={params.useStudentT} onChange={(v) => updateParam('useStudentT', v)} />
                                <Toggle label="Correlação Dinâmica USD/BRL" checked={params.useDynamicCorrelation} onChange={(v) => updateParam('useDynamicCorrelation', v)} />
                                <Toggle label="Modelo IPCA Correlacionado" checked={params.useIPCAModel} onChange={(v) => updateParam('useIPCAModel', v)} />
                                <Toggle label="Modelo de Impostos" checked={params.useTaxModel} onChange={(v) => updateParam('useTaxModel', v)} />
                            </div>
                        )}

                        <button onClick={runSimulation} disabled={isRunning}
                            className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${isRunning ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg'}`}>
                            {isRunning ? (
                                <><span className="pulse-slow inline-block">⟳</span> Simulando {params.iterations.toLocaleString()} × 3...</>
                            ) : (
                                <><Icon name="Play" size={16} /> Comparar {params.iterations.toLocaleString()} Trajetórias</>
                            )}
                        </button>

                        {results && (
                            <div className="mt-4 p-3 bg-midnight rounded-lg border border-purple-500/20 text-xs space-y-1">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Seed:</span>
                                    <span className="font-mono text-gray-400">{results.seed}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Portfólio inicial:</span>
                                    <span className="font-mono text-gray-400">{formatCurrency(params.initialPortfolioUSD * params.initialFX)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Saque inicial:</span>
                                    <span className="font-mono text-purple-400">{formatCurrency(params.initialPortfolioUSD * (params.endowmentTargetRate / 100) * params.initialFX)}/ano</span>
                                </div>
                            </div>
                        )}
                    </aside>

                    {/* Main Content */}
                    <main className="flex-1 p-4 lg:p-6 lg:overflow-y-auto">
                        {!results ? (
                            <div className="flex justify-center pt-10">
                                <div className="text-center max-w-md">
                                    <div className="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center bg-purple-500/20">
                                        <Icon name="GraduationCap" size={40} className="text-purple-400" />
                                    </div>
                                    <h2 className="text-2xl font-bold mb-3">Endowment Pessoal</h2>
                                    <p className="text-gray-400 mb-6">
                                        Compare a estratégia <strong className="text-purple-400">Yale Endowment</strong> com SWR Fixo 4% e Guyton-Klinger.
                                        Configure os parâmetros e clique em <strong className="text-purple-400">"Comparar Trajetórias"</strong>.
                                    </p>
                                    <div className="grid grid-cols-2 gap-3 text-left">
                                        {[
                                            { icon: 'Waves', title: 'Suavização α', sub: 'Saque adaptativo e estável' },
                                            { icon: 'BarChart2', title: 'CAPE Ajustado', sub: 'Valuation dinâmico (avançado)' },
                                            { icon: 'GitCompare', title: '3 Estratégias', sub: 'Comparação direta' },
                                            { icon: 'TrendingDown', title: 'Guardrails', sub: 'Variação limitada ±15%' },
                                        ].map(({ icon, title, sub }) => (
                                            <div key={title} className="p-3 bg-surface rounded-lg border border-purple-500/20">
                                                <Icon name={icon} size={18} className="text-purple-400 mb-2" />
                                                <div className="text-sm font-medium">{title}</div>
                                                <div className="text-xs text-gray-500">{sub}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6 fade-in">
                                {/* Stat Cards */}
                                <div className="grid grid-cols-3 gap-4">
                                    <StatCard title="Endowment" value={results.endowment.survivalRate.toFixed(1)} unit="% sobrevivência" icon="GraduationCap" color="purple" subtitle={`${results.endowment.totalSimulations} simulações`} />
                                    <StatCard title="SWR Fixo 4%" value={results.fixed.survivalRate.toFixed(1)} unit="% sobrevivência" icon="Minus" color="info" subtitle="Inflação-ajustado" />
                                    <StatCard title="Guyton-Klinger" value={results.gk.survivalRate.toFixed(1)} unit="% sobrevivência" icon="ArrowUpDown" color="warning" subtitle="Com regras GK" />
                                </div>

                                {/* Survival Bar Chart */}
                                <div className="bg-surface rounded-xl p-4 border border-gray-800">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Icon name="BarChart2" size={18} className="text-purple-400" />
                                        <h3 className="font-semibold">Taxa de Sobrevivência por Estratégia</h3>
                                    </div>
                                    <SurvivalComparisonBar metrics={results.comparisonMetrics} />
                                </div>

                                {/* Comparison Table */}
                                <ComparisonTable metrics={results.comparisonMetrics} formatCurrency={formatCurrency} years={params.years} />

                                {/* Withdrawal Evolution */}
                                <div className="bg-surface rounded-xl p-4 border border-gray-800">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Icon name="TrendingUp" size={18} className="text-purple-400" />
                                        <h3 className="font-semibold">Evolução do Saque Mediano (BRL/ano)</h3>
                                    </div>
                                    <ComparisonLineChart endowment={results.endowment} fixed={results.fixed} gk={results.gk} years={params.years} />
                                </div>

                                {/* Portfolio Fan Chart — Endowment */}
                                <div className="bg-surface rounded-xl p-4 border border-gray-800">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Icon name="GraduationCap" size={18} className="text-purple-400" />
                                        <h3 className="font-semibold">Evolução do Portfólio — Estratégia Endowment</h3>
                                    </div>
                                    <PortfolioChart data={results.endowment.portfolioPercentiles} years={params.years} />
                                </div>

                                {/* CAPE Evolution (advanced mode only) */}
                                {params.useEndowmentCAPE && results.capePercentiles && (
                                    <div className="bg-surface rounded-xl p-4 border border-purple-500/20">
                                        <div className="flex items-center gap-2 mb-4">
                                            <Icon name="Activity" size={18} className="text-purple-400" />
                                            <h3 className="font-semibold">Evolução do CAPE — Fan Chart (P10/P50/P90)</h3>
                                        </div>
                                        <CAPEEvolutionChart capePercentiles={results.capePercentiles} years={params.years} />
                                        <p className="text-xs text-gray-500 mt-3">Trajetórias do índice CAPE ao longo do horizonte de aposentadoria, com reversão à média de {params.medianCAPE}x.</p>
                                    </div>
                                )}

                                {/* Year-10 Distribution */}
                                {results.year10Withdrawals && (
                                    <div className="bg-surface rounded-xl p-4 border border-gray-800">
                                        <div className="flex items-center gap-2 mb-4">
                                            <Icon name="PieChart" size={18} className="text-purple-400" />
                                            <h3 className="font-semibold">Distribuição do Saque no Ano 10</h3>
                                        </div>
                                        <p className="text-xs text-gray-500 mb-4">Histograma de frequência dos saques anuais no ano 10 por estratégia.</p>
                                        <WithdrawalDistributionChart year10Withdrawals={results.year10Withdrawals} />
                                    </div>
                                )}

                                {/* Explainer */}
                                <EndowmentExplainer alpha={params.endowmentAlpha} targetRate={params.endowmentTargetRate} useCape={params.useEndowmentCAPE} />
                            </div>
                        )}
                    </main>
                </div>
            );
        };

        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(<App />);
