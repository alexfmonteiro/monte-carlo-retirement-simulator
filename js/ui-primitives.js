const { useState, useEffect, useRef, useCallback, useMemo } = React;

            // Icon component using Lucide
            const Icon = ({ name, size = 20, className = "" }) => {
                const ref = useRef(null);
                useEffect(() => {
                    if (ref.current) {
                        ref.current.innerHTML = "";
                        const icon = lucide.createElement(lucide.icons[name]);
                        icon.setAttribute("width", size);
                        icon.setAttribute("height", size);
                        if (className) icon.setAttribute("class", className);
                        ref.current.appendChild(icon);
                    }
                }, [name, size, className]);
                return (
                    <span
                        ref={ref}
                        className="inline-flex items-center justify-center"
                    />
                );
            };

            // Tooltip component with expandable info - opens as modal overlay
            const Tooltip = ({ text }) => {
                const [isOpen, setIsOpen] = useState(false);

                if (!text) return null;

                const handleClick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsOpen(true);
                };

                const handleClose = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsOpen(false);
                };

                return (
                    <span className="relative ml-1 inline-flex items-center">
                        <span
                            className="cursor-pointer text-gray-500 hover:text-accent transition-colors inline-flex"
                            onClick={handleClick}
                        >
                            <Icon name="HelpCircle" size={12} />
                        </span>
                        {isOpen &&
                            ReactDOM.createPortal(
                                <div className="fixed inset-0 z-[9999] flex items-center justify-center">
                                    {/* Backdrop */}
                                    <div
                                        className="absolute inset-0 bg-black/50"
                                        onClick={handleClose}
                                    />
                                    {/* Modal */}
                                    <div className="relative z-10 w-80 max-w-[90vw] p-4 bg-deep border border-accent rounded-lg shadow-2xl text-sm text-gray-200 leading-relaxed">
                                        <button
                                            className="absolute top-2 right-2 text-gray-400 hover:text-white p-1"
                                            onClick={handleClose}
                                        >
                                            <Icon name="X" size={18} />
                                        </button>
                                        <div className="pr-6">{text}</div>
                                    </div>
                                </div>,
                                document.body,
                            )}
                    </span>
                );
            };

            // Input component
            const Input = ({
                label,
                value,
                onChange,
                unit,
                min,
                max,
                step = 1,
                tooltip,
            }) => (
                <div className="mb-3">
                    <label className="flex items-center text-xs text-gray-400 mb-1 font-medium uppercase tracking-wide">
                        {label}
                        <Tooltip text={tooltip} />
                    </label>
                    <div className="relative">
                        <input
                            type="number"
                            value={value}
                            onChange={(e) =>
                                onChange(parseFloat(e.target.value) || 0)
                            }
                            min={min}
                            max={max}
                            step={step}
                            className="w-full bg-deep border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono
                                   text-white focus:outline-none focus:border-accent input-focus transition-all"
                        />
                        {unit && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                                {unit}
                            </span>
                        )}
                    </div>
                </div>
            );

            // Dual Currency Input - allows input in USD or BRL with automatic conversion
            const DualCurrencyInput = ({
                label,
                valueUSD,
                valueBRL,
                onChangeUSD,
                onChangeBRL,
                fx,
                tooltip,
                minUSD = 0,
                stepUSD = 10000,
            }) => {
                const [activeInput, setActiveInput] = useState("usd");

                const handleUSDChange = (newUSD) => {
                    onChangeUSD(newUSD);
                    if (onChangeBRL) {
                        onChangeBRL(newUSD * fx);
                    }
                };

                const handleBRLChange = (newBRL) => {
                    if (onChangeBRL) {
                        onChangeBRL(newBRL);
                    }
                    onChangeUSD(newBRL / fx);
                };

                const formatNumber = (num) => {
                    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
                    if (num >= 1000) return `${(num / 1000).toFixed(0)}k`;
                    return num.toFixed(0);
                };

                return (
                    <div className="mb-3">
                        <label className="flex items-center text-xs text-gray-400 mb-1 font-medium uppercase tracking-wide">
                            {label}
                            <Tooltip text={tooltip} />
                        </label>
                        <div className="flex gap-1">
                            <div className="relative flex-1">
                                <input
                                    type="number"
                                    value={valueUSD}
                                    onChange={(e) =>
                                        handleUSDChange(
                                            parseFloat(e.target.value) || 0,
                                        )
                                    }
                                    min={minUSD}
                                    step={stepUSD}
                                    onFocus={() => setActiveInput("usd")}
                                    className={`w-full bg-deep border rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none input-focus transition-all ${
                                        activeInput === "usd"
                                            ? "border-accent"
                                            : "border-gray-700"
                                    }`}
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                                    USD
                                </span>
                            </div>
                            <div className="flex items-center px-1 text-gray-600">
                                <Icon name="ArrowLeftRight" size={14} />
                            </div>
                            <div className="relative flex-1">
                                <input
                                    type="number"
                                    value={Math.round(valueUSD * fx)}
                                    onChange={(e) =>
                                        handleBRLChange(
                                            parseFloat(e.target.value) || 0,
                                        )
                                    }
                                    min={0}
                                    step={stepUSD * fx}
                                    onFocus={() => setActiveInput("brl")}
                                    className={`w-full bg-deep border rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none input-focus transition-all ${
                                        activeInput === "brl"
                                            ? "border-accent"
                                            : "border-gray-700"
                                    }`}
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                                    BRL
                                </span>
                            </div>
                        </div>
                        <div className="text-xs text-gray-600 mt-1 text-center">
                            1 USD = {fx.toFixed(2)} BRL
                        </div>
                    </div>
                );
            };

            // BRL Input with USD equivalent display
            const BRLInputWithUSD = ({
                label,
                valueBRL,
                onChange,
                fx,
                tooltip,
                min = 0,
                step = 10000,
            }) => {
                const [activeInput, setActiveInput] = useState("brl");

                const handleBRLChange = (newBRL) => {
                    onChange(newBRL);
                };

                const handleUSDChange = (newUSD) => {
                    onChange(newUSD * fx);
                };

                return (
                    <div className="mb-3">
                        <label className="flex items-center text-xs text-gray-400 mb-1 font-medium uppercase tracking-wide">
                            {label}
                            <Tooltip text={tooltip} />
                        </label>
                        <div className="flex gap-1">
                            <div className="relative flex-1">
                                <input
                                    type="number"
                                    value={valueBRL}
                                    onChange={(e) =>
                                        handleBRLChange(
                                            parseFloat(e.target.value) || 0,
                                        )
                                    }
                                    min={min}
                                    step={step}
                                    onFocus={() => setActiveInput("brl")}
                                    className={`w-full bg-deep border rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none input-focus transition-all ${
                                        activeInput === "brl"
                                            ? "border-accent"
                                            : "border-gray-700"
                                    }`}
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                                    BRL
                                </span>
                            </div>
                            <div className="flex items-center px-1 text-gray-600">
                                <Icon name="ArrowLeftRight" size={14} />
                            </div>
                            <div className="relative flex-1">
                                <input
                                    type="number"
                                    value={Math.round(valueBRL / fx)}
                                    onChange={(e) =>
                                        handleUSDChange(
                                            parseFloat(e.target.value) || 0,
                                        )
                                    }
                                    min={0}
                                    step={Math.round(step / fx)}
                                    onFocus={() => setActiveInput("usd")}
                                    className={`w-full bg-deep border rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none input-focus transition-all ${
                                        activeInput === "usd"
                                            ? "border-accent"
                                            : "border-gray-700"
                                    }`}
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                                    USD
                                </span>
                            </div>
                        </div>
                        <div className="text-xs text-gray-600 mt-1 text-center">
                            1 USD = {fx.toFixed(2)} BRL
                        </div>
                    </div>
                );
            };

            // Toggle component
            const Toggle = ({ label, checked, onChange }) => (
                <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                        {label}
                    </span>
                    <button
                        onClick={() => onChange(!checked)}
                        className={`w-11 h-6 rounded-full transition-colors relative ${
                            checked ? "bg-accent" : "bg-gray-700"
                        }`}
                    >
                        <span
                            className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                                checked ? "left-6" : "left-1"
                            }`}
                        />
                    </button>
                </div>
            );
