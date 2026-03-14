const { useState, useEffect, useRef, useCallback, useMemo } = React;

            // Withdrawal statistics component
            const WithdrawalStats = ({
                results,
                formatCurrency,
                initialWithdrawalBRL,
            }) => {
                const {
                    overallMeanWithdrawal,
                    overallMedianWithdrawal,
                    periodStats,
                    worstWithdrawal,
                } = results;

                const years = results.withdrawalMeans.length - 1;
                const earlyYears = Math.floor(years / 3);
                const midYears = Math.floor((2 * years) / 3);

                return (
                    <div className="bg-surface rounded-xl p-4 border border-gray-800">
                        <div className="flex items-center gap-2 mb-4">
                            <Icon
                                name="Calculator"
                                size={20}
                                className="text-purple-400"
                            />
                            <h3 className="font-semibold">
                                Estatísticas de Saques (BRL/ano)
                            </h3>
                        </div>

                        {/* Overall stats */}
                        <div className="grid grid-cols-3 gap-3 mb-4">
                            <div className="text-center p-3 bg-deep rounded-lg border border-purple-500/20">
                                <div className="text-lg font-mono text-purple-400">
                                    {formatCurrency(overallMeanWithdrawal)}
                                </div>
                                <div className="text-xs text-gray-400">
                                    Média Geral
                                </div>
                            </div>
                            <div className="text-center p-3 bg-deep rounded-lg border border-accent/20">
                                <div className="text-lg font-mono text-accent">
                                    {formatCurrency(overallMedianWithdrawal)}
                                </div>
                                <div className="text-xs text-gray-400">
                                    Mediana Geral
                                </div>
                            </div>
                            <div className="text-center p-3 bg-deep rounded-lg border border-danger/20">
                                <div className="text-lg font-mono text-danger">
                                    {formatCurrency(worstWithdrawal)}
                                </div>
                                <div className="text-xs text-gray-400">
                                    Pior Caso
                                </div>
                            </div>
                        </div>

                        {/* Period breakdown */}
                        <div className="text-xs text-gray-400 mb-2 font-medium">
                            Evolução por Período
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between p-2 bg-deep rounded-lg">
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                                    <span className="text-gray-300">
                                        Anos 1-{earlyYears}
                                    </span>
                                </div>
                                <div className="text-right">
                                    <span className="text-xs text-gray-500 mr-2">
                                        Média:
                                    </span>
                                    <span className="font-mono text-blue-400">
                                        {formatCurrency(periodStats.early.mean)}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center justify-between p-2 bg-deep rounded-lg">
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                                    <span className="text-gray-300">
                                        Anos {earlyYears + 1}-{midYears}
                                    </span>
                                </div>
                                <div className="text-right">
                                    <span className="text-xs text-gray-500 mr-2">
                                        Média:
                                    </span>
                                    <span className="font-mono text-yellow-400">
                                        {formatCurrency(periodStats.mid.mean)}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center justify-between p-2 bg-deep rounded-lg">
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-green-400"></span>
                                    <span className="text-gray-300">
                                        Anos {midYears + 1}-{years}
                                    </span>
                                </div>
                                <div className="text-right">
                                    <span className="text-xs text-gray-500 mr-2">
                                        Média:
                                    </span>
                                    <span className="font-mono text-green-400">
                                        {formatCurrency(periodStats.late.mean)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Comparison with initial */}
                        <div className="mt-4 pt-3 border-t border-gray-700">
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-gray-400">
                                    Saque Inicial:
                                </span>
                                <span className="font-mono text-white">
                                    {formatCurrency(initialWithdrawalBRL)}
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-xs mt-1">
                                <span className="text-gray-400">
                                    Variação Média:
                                </span>
                                <span
                                    className={`font-mono ${overallMeanWithdrawal >= initialWithdrawalBRL ? "text-accent" : "text-warning"}`}
                                >
                                    {(
                                        (overallMeanWithdrawal /
                                            initialWithdrawalBRL -
                                            1) *
                                        100
                                    ).toFixed(1)}
                                    %
                                </span>
                            </div>
                        </div>
                    </div>
                );
            };

            // Failure analysis component
            const FailureAnalysis = ({
                failureCauses,
                avgFailureYear,
                failedCount,
                total,
                failedByDepletion,
            }) => {
                const sortedCauses = Object.entries(failureCauses).sort(
                    ([, a], [, b]) => b - a,
                );

                if (sortedCauses.length === 0) {
                    return (
                        <div className="bg-surface rounded-xl p-4 border border-accent/30">
                            <div className="flex items-center gap-2 mb-3">
                                <Icon
                                    name="ShieldCheck"
                                    size={20}
                                    className="text-accent"
                                />
                                <h3 className="font-semibold text-accent">
                                    Análise de Robustez
                                </h3>
                            </div>
                            <p className="text-gray-400 text-sm">
                                Excelente! Nenhum cenário de falha detectado nas
                                simulações. Sua estratégia demonstra alta
                                resiliência.
                            </p>
                        </div>
                    );
                }

                return (
                    <div className="bg-surface rounded-xl p-4 border border-danger/30">
                        <div className="flex items-center gap-2 mb-3">
                            <Icon
                                name="AlertTriangle"
                                size={20}
                                className="text-danger"
                            />
                            <h3 className="font-semibold text-danger">
                                Cenários de Falha (Depleção)
                            </h3>
                        </div>
                        <div className="space-y-3">
                            <div className="text-sm text-gray-400">
                                <span className="text-white font-mono">
                                    {failedCount}
                                </span>{" "}
                                de {total} simulações tiveram o portfólio zerado
                                {avgFailureYear && (
                                    <span className="ml-2">
                                        (média no ano{" "}
                                        <span className="text-warning font-mono">
                                            {avgFailureYear.toFixed(1)}
                                        </span>
                                        )
                                    </span>
                                )}
                            </div>

                            <div className="space-y-2">
                                {sortedCauses.map(([cause, count]) => (
                                    <div
                                        key={cause}
                                        className="flex items-center gap-2"
                                    >
                                        <div className="flex-1 bg-deep rounded-full h-2 overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-danger to-warning"
                                                style={{
                                                    width: `${(count / failedCount) * 100}%`,
                                                }}
                                            />
                                        </div>
                                        <span className="text-xs text-gray-400 w-48 truncate">
                                            {cause}
                                        </span>
                                        <span className="text-xs font-mono text-gray-500">
                                            {count}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            };

            // Rules explanation component
            const RulesExplanation = ({ ruleStats, survivalRate }) => {
                return (
                    <div className="bg-surface rounded-xl p-4 border border-gray-700">
                        <div className="flex items-center gap-2 mb-3">
                            <Icon
                                name="BookOpen"
                                size={20}
                                className="text-info"
                            />
                            <h3 className="font-semibold">
                                Regras de Guyton-Klinger Aplicadas
                            </h3>
                        </div>
                        <div className="grid grid-cols-3 gap-3 mb-4">
                            <div className="text-center p-3 bg-deep rounded-lg">
                                <div className="text-lg font-mono text-warning">
                                    {ruleStats.preservation}
                                </div>
                                <div className="text-xs text-gray-400">
                                    Preservação
                                </div>
                            </div>
                            <div className="text-center p-3 bg-deep rounded-lg">
                                <div className="text-lg font-mono text-accent">
                                    {ruleStats.prosperity}
                                </div>
                                <div className="text-xs text-gray-400">
                                    Prosperidade
                                </div>
                            </div>
                            <div className="text-center p-3 bg-deep rounded-lg">
                                <div className="text-lg font-mono text-info">
                                    {ruleStats.inflationSkip}
                                </div>
                                <div className="text-xs text-gray-400">
                                    Inflação Pulada
                                </div>
                            </div>
                        </div>
                        <p className="text-xs text-gray-500">
                            {survivalRate >= 95
                                ? "As regras de Guyton-Klinger contribuíram significativamente para a alta taxa de sobrevivência, ajustando os saques dinamicamente conforme o mercado."
                                : survivalRate >= 80
                                  ? "Os gatilhos de preservação foram ativados frequentemente, protegendo o portfólio em cenários adversos. Considere uma taxa de retirada mais conservadora."
                                  : "A alta frequência de ativação dos gatilhos indica que a estratégia está sob estresse. Recomenda-se revisar os parâmetros de retirada."}
                        </p>
                    </div>
                );
            };
