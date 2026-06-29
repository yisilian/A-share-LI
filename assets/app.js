const INITIAL_SIM_CASH = 100000;
const SIM_STORAGE_KEY = "a-share-li-simulation-v1";

const DEFAULT_AUTO_SETTINGS = {
  enabled: true,
  maxPositionPct: 0.2,
  maxStocks: 5,
  minScore: 7.5,
  maxBuysPerRun: 2,
  stopLossPct: 0.06,
  takeProfitPct: 0.12,
  trailingStopPct: 0.06,
};

const DEFAULT_FEE_SETTINGS = {
  commissionRate: 0.0003,
  minCommission: 5,
  stampDutyRate: 0.0005,
  transferFeeRate: 0.00001,
};

const state = {
  data: null,
  review: null,
  filter: "all",
  simulation: loadSimulation(),
  autoRunMessage: "",
};

const statusMap = {
  watch: { label: "观察区", className: "status-watch" },
  breakout: { label: "突破确认", className: "status-breakout" },
  wait: { label: "等回踩", className: "status-wait" },
  avoid: { label: "不追高", className: "status-avoid" },
};

const byId = (id) => document.getElementById(id);

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const isFiniteNumber = (value) => value !== null && value !== undefined && Number.isFinite(Number(value));

const formatNumber = (value, digits = 2) => {
  if (!isFiniteNumber(value)) return "-";
  return Number(value).toFixed(digits);
};

const formatCurrency = (value, digits = 2) => {
  if (!isFiniteNumber(value)) return "-";
  return Number(value).toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

const formatPercent = (value, digits = 2) => {
  if (!isFiniteNumber(value)) return "-";
  const number = Number(value);
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(digits)}%`;
};

const formatFundMoney = (value) => {
  if (!isFiniteNumber(value)) return "-";
  return `${(Number(value) / 100000000).toFixed(2)}亿`;
};

const formatSignedNumber = (value, digits = 2) => {
  if (!isFiniteNumber(value)) return "-";
  const number = Number(value);
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(digits)}`;
};

const returnClass = (value) => {
  if (!isFiniteNumber(value)) return "return-flat";
  if (Number(value) > 0) return "return-positive";
  if (Number(value) < 0) return "return-negative";
  return "return-flat";
};

const buySignalClass = (key) => {
  if (key === "pullback_buy" || key === "breakout_buy") return "buy-now";
  if (key === "risk_wait" || key === "avoid") return "buy-avoid";
  return "buy-wait";
};

const fundFlowClass = (score) => {
  if (!isFiniteNumber(score)) return "fund-neutral";
  if (Number(score) >= 3) return "fund-positive";
  if (Number(score) <= -3) return "fund-negative";
  return "fund-neutral";
};

const chipClass = (score) => {
  if (!isFiniteNumber(score)) return "chip-neutral";
  if (Number(score) >= 0.4) return "chip-positive";
  if (Number(score) <= -0.3) return "chip-negative";
  return "chip-neutral";
};

const feedbackClass = (value) => {
  if (!isFiniteNumber(value)) return "feedback-neutral";
  if (Number(value) > 0.05) return "feedback-positive";
  if (Number(value) < -0.05) return "feedback-negative";
  return "feedback-neutral";
};

const formatBuyPrice = (stock) => {
  if (stock.is_buyable_now) return formatNumber(stock.buyable_price);
  const nextPrice = formatNumber(stock.next_buy_trigger_price);
  return nextPrice === "-" ? "未触发" : `等 ${nextPrice}`;
};

const formatFeedbackFactors = (stock) => {
  const factors = stock.feedback_factors || [];
  if (!factors.length) return stock.feedback_note || "暂无足够历史样本，反馈分暂不明显。";
  return factors
    .slice(0, 3)
    .map((factor) => `${factor.label}：${formatSignedNumber(factor.score_effect, 2)}，样本${factor.sample_count ?? "-"}`)
    .join("；");
};

const formatPriceFeedback = (stock) => {
  const adjustment = formatPercent(stock.price_feedback_adjustment_pct, 3);
  if (adjustment === "-") return stock.price_feedback_note || "价格反馈暂缺。";
  return `${stock.price_feedback_label || "价格纪律不变"}：${adjustment}。${stock.price_feedback_note || ""}`;
};

const formatEntrySafety = (stock) => {
  const adjustment = formatPercent(stock.entry_safety_adjustment_pct, 3);
  const factors = stock.entry_safety_factors || [];
  const safetyStatus = stock.entry_safety_block_buy
    ? "可买信号已被接入风控取消。"
    : stock.entry_safety_risk_flag
      ? "带接入风险标记，需等更低价格或更强确认。"
      : "";
  const factorText = factors.length
    ? factors
        .slice(0, 2)
        .map(
          (factor) =>
            `${factor.label}: ${formatPercent(factor.price_adjustment_pct, 3)}，触达后${formatPercent(
              factor.avg_touch_return_pct
            )}，未触达错过${formatPercent(factor.avg_missed_return_pct)}，触达率${formatPercent(
              factor.touch_rate_pct
            )}，回撤${formatPercent(factor.avg_adverse_drawdown_pct)}，暴跌率${formatPercent(factor.crash_rate_pct)}`
        )
        .join("；")
    : stock.entry_safety_note || "历史接入价样本不足。";
  return `${stock.entry_safety_label || "接入样本不足"}：安全调整 ${adjustment}。${safetyStatus}${factorText}`;
};

function createDefaultSimulation() {
  return {
    schemaVersion: 2,
    initialCash: INITIAL_SIM_CASH,
    cash: INITIAL_SIM_CASH,
    positions: {},
    trades: [],
    selectedCode: "",
    autoSettings: { ...DEFAULT_AUTO_SETTINGS },
    feeSettings: { ...DEFAULT_FEE_SETTINGS },
    lastAutoRunKey: "",
    autoLog: [],
  };
}

function loadSimulation() {
  try {
    const raw = JSON.parse(localStorage.getItem(SIM_STORAGE_KEY) || "null");
    return sanitizeSimulation(raw);
  } catch (_) {
    return createDefaultSimulation();
  }
}

function sanitizeSimulation(raw) {
  if (!raw || typeof raw !== "object") return createDefaultSimulation();
  const initialCash = isFiniteNumber(raw.initialCash) && Number(raw.initialCash) > 0 ? Number(raw.initialCash) : INITIAL_SIM_CASH;
  const cash = isFiniteNumber(raw.cash) ? Number(raw.cash) : initialCash;
  const positions = {};
  const autoSettings = normalizeAutoSettings(raw.autoSettings);
  const feeSettings = normalizeFeeSettings(raw.feeSettings);

  Object.entries(raw.positions || {}).forEach(([code, position]) => {
    const quantity = Math.max(0, Math.floor(Number(position.quantity || 0)));
    if (!quantity) return;
    const avgCost = isFiniteNumber(position.avgCost) ? Number(position.avgCost) : Number(position.costBasis || 0) / quantity;
    const rawLots = Array.isArray(position.lots)
      ? position.lots
      : [{ quantity, price: avgCost, tradeDate: "历史", at: position.updatedAt || "" }];
    const lots = rawLots
      .map((lot) => ({
        quantity: Math.max(0, Math.floor(Number(lot.quantity || 0))),
        price: isFiniteNumber(lot.price) ? Number(lot.price) : avgCost,
        costBasis: isFiniteNumber(lot.costBasis)
          ? Number(lot.costBasis)
          : Math.max(0, Math.floor(Number(lot.quantity || 0))) * (isFiniteNumber(lot.price) ? Number(lot.price) : avgCost),
        fees: isFiniteNumber(lot.fees) ? Number(lot.fees) : 0,
        tradeDate: String(lot.tradeDate || "历史"),
        at: String(lot.at || ""),
        stopLossPrice: isFiniteNumber(lot.stopLossPrice) ? Number(lot.stopLossPrice) : null,
        takeProfitPrice: isFiniteNumber(lot.takeProfitPrice) ? Number(lot.takeProfitPrice) : null,
        highestPrice: isFiniteNumber(lot.highestPrice) ? Number(lot.highestPrice) : isFiniteNumber(lot.price) ? Number(lot.price) : avgCost,
        entryReason: lot.entryReason || "",
        source: lot.source || "manual",
      }))
      .filter((lot) => lot.quantity > 0 && isFiniteNumber(lot.price) && isFiniteNumber(lot.costBasis));
    const costBasis = lots.reduce((sum, lot) => sum + lot.quantity * lot.price, 0);
    if (!lots.length || costBasis <= 0) return;
    positions[code] = {
      code,
      name: position.name || code,
      quantity: lots.reduce((sum, lot) => sum + lot.quantity, 0),
      costBasis: lots.reduce((sum, lot) => sum + lot.costBasis, 0),
      lots,
      stopLossPrice: isFiniteNumber(position.stopLossPrice) ? Number(position.stopLossPrice) : null,
      takeProfitPrice: isFiniteNumber(position.takeProfitPrice) ? Number(position.takeProfitPrice) : null,
      highestPrice: isFiniteNumber(position.highestPrice) ? Number(position.highestPrice) : null,
      entryReason: position.entryReason || "",
      updatedAt: position.updatedAt || new Date().toISOString(),
    };
  });

  const trades = Array.isArray(raw.trades) ? raw.trades.slice(0, 100) : [];
  const autoLog = Array.isArray(raw.autoLog) ? raw.autoLog.slice(0, 50) : [];
  return {
    schemaVersion: 2,
    initialCash,
    cash,
    positions,
    trades,
    selectedCode: raw.selectedCode || "",
    autoSettings,
    feeSettings,
    lastAutoRunKey: raw.lastAutoRunKey || "",
    autoLog,
  };
}

function normalizeAutoSettings(raw = {}) {
  return {
    enabled: raw.enabled === undefined ? DEFAULT_AUTO_SETTINGS.enabled : Boolean(raw.enabled),
    maxPositionPct: clampPercent(raw.maxPositionPct, DEFAULT_AUTO_SETTINGS.maxPositionPct, 0.01, 1),
    maxStocks: Math.max(1, Math.min(10, Math.floor(Number(raw.maxStocks ?? DEFAULT_AUTO_SETTINGS.maxStocks)) || DEFAULT_AUTO_SETTINGS.maxStocks)),
    minScore: Math.max(0, Math.min(10, Number(raw.minScore ?? DEFAULT_AUTO_SETTINGS.minScore))),
    maxBuysPerRun: Math.max(1, Math.min(5, Math.floor(Number(raw.maxBuysPerRun ?? DEFAULT_AUTO_SETTINGS.maxBuysPerRun)) || DEFAULT_AUTO_SETTINGS.maxBuysPerRun)),
    stopLossPct: clampPercent(raw.stopLossPct, DEFAULT_AUTO_SETTINGS.stopLossPct, 0.01, 0.3),
    takeProfitPct: clampPercent(raw.takeProfitPct, DEFAULT_AUTO_SETTINGS.takeProfitPct, 0.01, 0.8),
    trailingStopPct: clampPercent(raw.trailingStopPct, DEFAULT_AUTO_SETTINGS.trailingStopPct, 0.01, 0.3),
  };
}

function normalizeFeeSettings(raw = {}) {
  return {
    commissionRate: clampPercent(raw.commissionRate, DEFAULT_FEE_SETTINGS.commissionRate, 0, 0.01),
    minCommission: Math.max(0, Number(raw.minCommission ?? DEFAULT_FEE_SETTINGS.minCommission)),
    stampDutyRate: clampPercent(raw.stampDutyRate, DEFAULT_FEE_SETTINGS.stampDutyRate, 0, 0.01),
    transferFeeRate: clampPercent(raw.transferFeeRate, DEFAULT_FEE_SETTINGS.transferFeeRate, 0, 0.001),
  };
}

function clampPercent(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function saveSimulation() {
  localStorage.setItem(SIM_STORAGE_KEY, JSON.stringify(state.simulation));
}

function feeSettings() {
  state.simulation.feeSettings = normalizeFeeSettings(state.simulation.feeSettings);
  return state.simulation.feeSettings;
}

function autoSettings() {
  state.simulation.autoSettings = normalizeAutoSettings(state.simulation.autoSettings);
  return state.simulation.autoSettings;
}

function calculateTradeFees(type, grossAmount) {
  if (!isFiniteNumber(grossAmount) || Number(grossAmount) <= 0) {
    return { commission: 0, stampDuty: 0, transferFee: 0, total: 0 };
  }
  const settings = feeSettings();
  const amount = Number(grossAmount);
  const commission = settings.commissionRate > 0 ? Math.max(amount * settings.commissionRate, settings.minCommission) : 0;
  const stampDuty = type === "sell" ? amount * settings.stampDutyRate : 0;
  const transferFee = amount * settings.transferFeeRate;
  return {
    commission,
    stampDuty,
    transferFee,
    total: commission + stampDuty + transferFee,
  };
}

function totalTradeFees() {
  return (state.simulation.trades || []).reduce((sum, trade) => sum + Number(trade.fees?.total || trade.feeTotal || 0), 0);
}

function currentTradeDate() {
  return state.data?.as_of_date || new Date().toISOString().slice(0, 10);
}

function stocks() {
  return state.data?.stocks || [];
}

function findStock(code) {
  return stocks().find((stock) => String(stock.code) === String(code));
}

function reviewRecords() {
  return state.review?.records || state.data?.review?.records || [];
}

function findReviewRecord(code) {
  return reviewRecords().find((record) => String(record.code) === String(code));
}

function stockOrReview(code) {
  return findStock(code) || findReviewRecord(code);
}

function latestPriceFor(code) {
  const stock = findStock(code);
  const review = findReviewRecord(code);
  const candidates = [stock?.live_quote_price, stock?.close, stock?.daily_close, review?.latest_price];
  const price = candidates.find((candidate) => isFiniteNumber(candidate) && Number(candidate) > 0);
  return price ? Number(price) : null;
}

function suggestedTradePrice(stock) {
  const candidates = [
    stock?.is_buyable_now ? stock.buyable_price : null,
    stock?.recommended_entry_price,
    stock?.buyable_price,
    stock?.close,
  ];
  const price = candidates.find((candidate) => isFiniteNumber(candidate) && Number(candidate) > 0);
  return price ? Number(price) : null;
}

function computeStopLossPrice(stock, entryPrice) {
  const settings = autoSettings();
  const fallback = entryPrice * (1 - settings.stopLossPct);
  const invalidPrice = Number(stock?.invalid_price);
  if (Number.isFinite(invalidPrice) && invalidPrice > 0 && invalidPrice < entryPrice) {
    return Math.max(invalidPrice, fallback);
  }
  return fallback;
}

function computeTakeProfitPrice(stock, entryPrice) {
  const settings = autoSettings();
  const fallback = entryPrice * (1 + settings.takeProfitPct);
  const resistancePrice = Number(stock?.resistance_price);
  if (Number.isFinite(resistancePrice) && resistancePrice > entryPrice) {
    return Math.min(resistancePrice, fallback);
  }
  return fallback;
}

function averageCost(position) {
  if (!position || !position.quantity) return 0;
  return position.costBasis / position.quantity;
}

function availableSellQuantity(position) {
  const today = currentTradeDate();
  return (position?.lots || [])
    .filter((lot) => lot.tradeDate !== today)
    .reduce((sum, lot) => sum + lot.quantity, 0);
}

function normalizeQuantity(value) {
  const quantity = Math.floor(Number(value || 0) / 100) * 100;
  return quantity >= 100 ? quantity : 0;
}

function portfolioSnapshot() {
  const positions = Object.values(state.simulation.positions || {}).map((position) => {
    const price = latestPriceFor(position.code) ?? averageCost(position);
    const marketValue = position.quantity * price;
    const estimatedSellFees = calculateTradeFees("sell", marketValue);
    const liquidationValue = Math.max(0, marketValue - estimatedSellFees.total);
    const unrealized = liquidationValue - position.costBasis;
    const unrealizedPct = position.costBasis > 0 ? (unrealized / position.costBasis) * 100 : 0;
    const highestPrice = Math.max(
      position.highestPrice || 0,
      price || 0,
      ...(position.lots || []).map((lot) => Number(lot.highestPrice || lot.price || 0))
    );
    return {
      ...position,
      avgCost: averageCost(position),
      latestPrice: price,
      marketValue,
      estimatedSellFees: estimatedSellFees.total,
      liquidationValue,
      unrealized,
      unrealizedPct,
      highestPrice,
      availableQuantity: availableSellQuantity(position),
    };
  });
  const marketValue = positions.reduce((sum, position) => sum + position.marketValue, 0);
  const liquidationValue = positions.reduce((sum, position) => sum + position.liquidationValue, 0);
  const totalAssets = state.simulation.cash + liquidationValue;
  const totalReturn = totalAssets - state.simulation.initialCash;
  const totalReturnPct = state.simulation.initialCash > 0 ? (totalReturn / state.simulation.initialCash) * 100 : 0;
  return {
    positions,
    marketValue,
    liquidationValue,
    totalAssets,
    totalReturn,
    totalReturnPct,
  };
}

function addTrade(trade) {
  state.simulation.trades.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    at: new Date().toISOString(),
    tradeDate: currentTradeDate(),
    ...trade,
  });
  state.simulation.trades = state.simulation.trades.slice(0, 200);
}

function buyPosition(stock, price, quantity, options = {}) {
  const normalizedQuantity = normalizeQuantity(quantity);
  if (!stock || !isFiniteNumber(price) || Number(price) <= 0 || !normalizedQuantity) {
    return { ok: false, message: "买入参数无效。" };
  }
  const grossAmount = Number(price) * normalizedQuantity;
  const fees = calculateTradeFees("buy", grossAmount);
  const totalCost = grossAmount + fees.total;
  if (totalCost > state.simulation.cash + 0.0001) {
    return { ok: false, message: `可用现金不足，本次需要 ${formatCurrency(totalCost)} 元。` };
  }

  const stopLossPrice = computeStopLossPrice(stock, Number(price));
  const takeProfitPrice = computeTakeProfitPrice(stock, Number(price));
  const position =
    state.simulation.positions[stock.code] ||
    {
      code: stock.code,
      name: stock.name,
      quantity: 0,
      costBasis: 0,
      lots: [],
      updatedAt: "",
    };
  position.name = stock.name;
  position.quantity += normalizedQuantity;
  position.costBasis += totalCost;
  position.stopLossPrice = stopLossPrice;
  position.takeProfitPrice = takeProfitPrice;
  position.highestPrice = Math.max(position.highestPrice || 0, Number(price));
  position.entryReason = options.reason || position.entryReason || "";
  position.lots.push({
    quantity: normalizedQuantity,
    price: Number(price),
    grossAmount,
    fees: fees.total,
    costBasis: totalCost,
    tradeDate: currentTradeDate(),
    at: new Date().toISOString(),
    stopLossPrice,
    takeProfitPrice,
    highestPrice: Number(price),
    entryReason: options.reason || "",
    source: options.source || "manual",
  });
  position.updatedAt = new Date().toISOString();
  state.simulation.positions[stock.code] = position;
  state.simulation.cash -= totalCost;
  addTrade({
    type: "buy",
    source: options.source || "manual",
    reason: options.reason || "手动模拟买入",
    code: stock.code,
    name: stock.name,
    price: Number(price),
    quantity: normalizedQuantity,
    amount: grossAmount,
    grossAmount,
    netAmount: totalCost,
    fees,
    stopLossPrice,
    takeProfitPrice,
  });
  return { ok: true, grossAmount, fees, totalCost, quantity: normalizedQuantity, stopLossPrice, takeProfitPrice };
}

function sellPosition(stock, price, quantity, options = {}) {
  const position = state.simulation.positions[stock.code];
  const normalizedQuantity = normalizeQuantity(quantity);
  if (!stock || !position || !position.quantity) {
    return { ok: false, message: "当前没有这只股票的模拟持仓。" };
  }
  if (!isFiniteNumber(price) || Number(price) <= 0 || !normalizedQuantity) {
    return { ok: false, message: "卖出参数无效。" };
  }
  const availableQuantity = availableSellQuantity(position);
  if (normalizedQuantity > availableQuantity) {
    return {
      ok: false,
      message: `可卖数量不足。按 T+1 规则，本交易日买入的数量暂不可卖；当前可卖 ${availableQuantity} 股。`,
    };
  }

  let remaining = normalizedQuantity;
  let releasedCost = 0;
  const today = currentTradeDate();
  position.lots = position.lots.map((lot) => {
    if (remaining <= 0 || lot.tradeDate === today) return lot;
    const take = Math.min(lot.quantity, remaining);
    const perShareCost = lot.costBasis / lot.quantity;
    remaining -= take;
    releasedCost += perShareCost * take;
    return {
      ...lot,
      quantity: lot.quantity - take,
      costBasis: Math.max(0, lot.costBasis - perShareCost * take),
    };
  });

  if (remaining > 0) {
    return { ok: false, message: "卖出失败：可卖老仓不足。" };
  }

  const grossAmount = Number(price) * normalizedQuantity;
  const fees = calculateTradeFees("sell", grossAmount);
  const netAmount = grossAmount - fees.total;
  const realizedPnl = netAmount - releasedCost;
  position.lots = position.lots.filter((lot) => lot.quantity > 0);
  position.quantity -= normalizedQuantity;
  position.costBasis = Math.max(0, position.costBasis - releasedCost);
  position.updatedAt = new Date().toISOString();
  if (position.quantity <= 0) {
    delete state.simulation.positions[stock.code];
  } else {
    state.simulation.positions[stock.code] = position;
  }
  state.simulation.cash += netAmount;
  addTrade({
    type: "sell",
    source: options.source || "manual",
    reason: options.reason || "手动模拟卖出",
    code: stock.code,
    name: stock.name,
    price: Number(price),
    quantity: normalizedQuantity,
    amount: grossAmount,
    grossAmount,
    netAmount,
    fees,
    realizedPnl,
  });
  return { ok: true, grossAmount, fees, netAmount, releasedCost, realizedPnl, quantity: normalizedQuantity };
}

function setSimulationMessage(message, type = "info") {
  const element = byId("simulationMessage");
  element.textContent = message || "";
  element.className = `simulation-message ${type}`;
}

function currentAutoRunKey() {
  return [state.data?.generated_at, state.data?.as_of_date, state.data?.universe_scan?.update_phase_label].filter(Boolean).join("|");
}

function runAutoStrategy({ force = false, quiet = false } = {}) {
  if (!state.data) return { ran: false, events: [] };
  const settings = autoSettings();
  if (!settings.enabled) {
    if (!quiet) setSimulationMessage("自动模拟交易未启用。", "info");
    return { ran: false, events: [] };
  }
  const runKey = currentAutoRunKey();
  if (!runKey) return { ran: false, events: [] };
  if (!force && state.simulation.lastAutoRunKey === runKey) {
    if (!quiet) setSimulationMessage("本次数据快照已经自动检查过，没有重复执行。", "info");
    return { ran: false, events: [] };
  }

  const events = [];
  updatePositionHighs();
  runAutoSells(events);
  runAutoBuys(events);
  state.simulation.lastAutoRunKey = runKey;
  pushAutoLog(runKey, events);
  saveSimulation();

  const message = events.length
    ? `自动策略完成：${events.map((event) => event.summary).join("；")}`
    : "自动策略完成：本次快照没有触发买入或卖出。";
  state.autoRunMessage = message;
  if (!quiet) setSimulationMessage(message, events.length ? "success" : "info");
  return { ran: true, events };
}

function updatePositionHighs() {
  Object.values(state.simulation.positions || {}).forEach((position) => {
    const price = latestPriceFor(position.code);
    if (!price) return;
    position.highestPrice = Math.max(position.highestPrice || 0, price);
    position.lots = (position.lots || []).map((lot) => ({
      ...lot,
      highestPrice: Math.max(lot.highestPrice || lot.price || 0, price),
    }));
  });
}

function runAutoSells(events) {
  Object.values({ ...state.simulation.positions }).forEach((position) => {
    const stock = stockOrReview(position.code) || { code: position.code, name: position.name };
    const price = latestPriceFor(position.code);
    if (!price) return;
    const decision = autoSellDecision(stock, position, price);
    if (!decision.shouldSell) return;
    const quantity = availableSellQuantity(position);
    if (!quantity) {
      events.push({
        type: "hold",
        code: position.code,
        name: position.name,
        summary: `${position.name}触发${decision.reason}，但 T+1 暂不可卖`,
      });
      return;
    }
    const result = sellPosition(stock, price, quantity, { source: "auto", reason: decision.reason });
    if (result.ok) {
      events.push({
        type: "sell",
        code: stock.code,
        name: stock.name,
        summary: `卖出${stock.name}${result.quantity}股/${decision.reason}/费用${formatCurrency(result.fees.total)}`,
      });
    }
  });
}

function autoSellDecision(stock, position, price) {
  const settings = autoSettings();
  const stopLossPrice = position.stopLossPrice || Math.min(...(position.lots || []).map((lot) => lot.stopLossPrice).filter(isFiniteNumber));
  const takeProfitPrice = position.takeProfitPrice || Math.min(...(position.lots || []).map((lot) => lot.takeProfitPrice).filter(isFiniteNumber));
  const highestPrice = Math.max(position.highestPrice || 0, ...(position.lots || []).map((lot) => Number(lot.highestPrice || 0)));
  const trailingStopPrice = highestPrice > 0 ? highestPrice * (1 - settings.trailingStopPct) : null;

  if (isFiniteNumber(stopLossPrice) && price <= Number(stopLossPrice)) {
    return { shouldSell: true, reason: `跌破止损价${formatNumber(stopLossPrice)}` };
  }
  if (isFiniteNumber(takeProfitPrice) && price >= Number(takeProfitPrice)) {
    return { shouldSell: true, reason: `触发止盈价${formatNumber(takeProfitPrice)}` };
  }
  if (isFiniteNumber(trailingStopPrice) && highestPrice > averageCost(position) * 1.04 && price <= trailingStopPrice) {
    return { shouldSell: true, reason: `高点回撤超过${formatPercent(settings.trailingStopPct * 100, 1)}` };
  }
  if (stock.status_key === "avoid" || stock.current_status_key === "avoid" || stock.entry_safety_block_buy) {
    return { shouldSell: true, reason: "模型风险退出" };
  }
  return { shouldSell: false, reason: "" };
}

function runAutoBuys(events) {
  const settings = autoSettings();
  let buys = 0;
  const candidates = [...stocks()]
    .filter((stock) => !state.simulation.positions[stock.code])
    .filter((stock) => Number(stock.score || 0) >= settings.minScore)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));

  for (const stock of candidates) {
    if (buys >= settings.maxBuysPerRun) break;
    if (Object.keys(state.simulation.positions || {}).length >= settings.maxStocks) break;
    const decision = autoBuyDecision(stock);
    if (!decision.shouldBuy) continue;
    const quantity = autoBuyQuantity(decision.price);
    if (!quantity) continue;
    const result = buyPosition(stock, decision.price, quantity, { source: "auto", reason: decision.reason });
    if (!result.ok) continue;
    buys += 1;
    events.push({
      type: "buy",
      code: stock.code,
      name: stock.name,
      summary: `买入${stock.name}${result.quantity}股/${decision.reason}/费用${formatCurrency(result.fees.total)}`,
    });
  }
}

function autoBuyDecision(stock) {
  const price = latestPriceFor(stock.code);
  if (!price) return { shouldBuy: false, reason: "缺少最新价" };
  if (stock.entry_safety_block_buy || stock.buy_signal_key === "risk_wait" || stock.buy_signal_key === "avoid" || stock.status_key === "avoid") {
    return { shouldBuy: false, reason: "风控拦截" };
  }
  const noChasePrice = Number(stock.no_chase_price);
  if (Number.isFinite(noChasePrice) && noChasePrice > 0 && price > noChasePrice) {
    return { shouldBuy: false, reason: "超过不追高线" };
  }

  const entryLower = Number(stock.entry_price_lower);
  const entryUpper = Number(stock.entry_price_upper);
  if (Number.isFinite(entryLower) && Number.isFinite(entryUpper) && price >= entryLower && price <= entryUpper) {
    return { shouldBuy: true, price, reason: `进入接入区间${formatNumber(entryLower)}-${formatNumber(entryUpper)}` };
  }

  const buyableUpper = Number(stock.buyable_price_upper);
  if (stock.is_buyable_now && Number.isFinite(buyableUpper) && price <= buyableUpper) {
    return { shouldBuy: true, price, reason: stock.buy_signal_label || "触发可买入信号" };
  }

  const breakoutPrice = Number(stock.breakout_confirm_price);
  const breakoutUpper = Number(stock.breakout_buy_upper_price || stock.no_chase_price);
  if (stock.buy_signal_key === "breakout_buy" && Number.isFinite(breakoutPrice) && price >= breakoutPrice) {
    if (!Number.isFinite(breakoutUpper) || price <= breakoutUpper) {
      return { shouldBuy: true, price, reason: `突破确认${formatNumber(breakoutPrice)}` };
    }
  }

  return { shouldBuy: false, reason: "未触发阈值" };
}

function autoBuyQuantity(price) {
  const snapshot = portfolioSnapshot();
  const settings = autoSettings();
  const grossLimit = Math.min(state.simulation.cash, snapshot.totalAssets * settings.maxPositionPct);
  let quantity = normalizeQuantity(grossLimit / price);
  while (quantity > 0) {
    const grossAmount = quantity * price;
    const totalCost = grossAmount + calculateTradeFees("buy", grossAmount).total;
    if (totalCost <= state.simulation.cash + 0.0001) return quantity;
    quantity -= 100;
  }
  return 0;
}

function pushAutoLog(runKey, events) {
  state.simulation.autoLog = state.simulation.autoLog || [];
  state.simulation.autoLog.unshift({
    runKey,
    at: new Date().toISOString(),
    tradeDate: currentTradeDate(),
    phase: state.data?.universe_scan?.update_phase_label || "",
    events,
  });
  state.simulation.autoLog = state.simulation.autoLog.slice(0, 50);
}

async function loadPool() {
  try {
    const response = await fetch(`data/latest.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    state.review = state.data.review || null;
    try {
      const reviewResponse = await fetch(`data/review.json?t=${Date.now()}`, { cache: "no-store" });
      if (reviewResponse.ok) {
        state.review = await reviewResponse.json();
      }
    } catch (_) {
      state.review = state.data.review || null;
    }
    render();
  } catch (error) {
    byId("stockList").innerHTML = `<article class="stock-card"><div class="detail"><p class="logic">数据加载失败：${escapeHtml(
      error.message
    )}</p></div></article>`;
    renderSimulationPanel();
  }
}

function render() {
  const { data } = state;
  if (!data) return;

  byId("asOfDate").textContent = data.as_of_date || "-";
  byId("poolCount").textContent = String(data.stocks?.length || 0);
  byId("universeScope").textContent = data.universe_scan?.mainboard_count
    ? `${data.universe_scan.mainboard_count}只→${data.universe_scan.deep_analysis_count || 0}只`
    : "-";
  byId("overallSignal").textContent = data.summary?.overall_signal || "-";
  const averageReturn = state.review?.summary?.average_return_pct ?? data.summary?.tracking?.average_return_pct;
  byId("averageReturn").textContent = formatPercent(averageReturn);
  byId("averageReturn").className = returnClass(averageReturn);
  byId("modelDescription").textContent = data.model?.description || byId("modelDescription").textContent;

  renderModelStatus(data);
  renderStockList();
  runAutoStrategy({ quiet: true });
  renderSimulationPanel();
  if (state.autoRunMessage) setSimulationMessage(state.autoRunMessage, "info");
  renderReviewCenter();
}

function renderModelStatus(data) {
  const feedback = data.model_feedback || {};
  const entryFeedback = feedback.entry_effectiveness || {};
  const marketEnvironment = data.universe_scan?.market_environment || {};
  const segmentation = feedback.segmentation || {};
  const concentration = data.portfolio_concentration || {};
  const topThemes = data.universe_scan?.theme_strength?.top_groups || [];
  const topThemeText = topThemes.length
    ? `；强主题：${topThemes
        .slice(0, 3)
        .map((item) => `${item.theme_group}/${item.label}`)
        .join("、")}`
    : "";
  const phaseText = data.universe_scan?.update_phase_label ? `；更新时间段：${data.universe_scan.update_phase_label}` : "";
  const exposureText = data.summary?.theme_exposure
    ? `；最终主题分布：${Object.entries(data.summary.theme_exposure)
        .map(([key, value]) => `${key}${value}`)
        .join("、")}`
    : "";
  const concentrationText = concentration.schema_version
    ? `；组合拥挤度：${concentration.penalized_count ?? 0}只候选被轻微降权`
    : "";

  byId("feedbackStatus").textContent = feedback.schema_version
    ? `反馈模型：${feedback.confidence || "低"}置信；样本 ${feedback.observation_count ?? 0} 条；因子 ${
        feedback.summary?.factor_count ?? 0
      } 个；单股修正上限 ±${formatNumber(feedback.score_cap, 2)} 分。${feedback.summary?.note || ""}`
    : "反馈模型：等待历史样本积累。";

  byId("sourceStatus").textContent = `更新时间：${data.generated_at || "-"}${phaseText}；市场温度：${
    marketEnvironment.label || "-"
  } / ${formatSignedNumber(marketEnvironment.temperature_score, 2)}；${marketEnvironment.note || ""}${topThemeText}${exposureText}${concentrationText}；数据源：${
    data.source_status?.quotes || "-"
  }；${data.source_status?.note || ""}`;

  if (feedback.schema_version && entryFeedback.schema_version) {
    byId("feedbackStatus").textContent += ` 接入有效性：样本 ${entryFeedback.observation_count ?? 0} 条；触达 ${
      entryFeedback.touched_observation_count ?? 0
    } 条；未触达等待 ${entryFeedback.untouched_wait_observation_count ?? 0} 条；接入风险标记 ${
      data.summary?.entry_risk_flagged ?? 0
    } 只；可买拦截 ${data.summary?.buy_signal_blocked ?? data.summary?.risk_gated ?? 0} 只；市场降级 ${
      data.summary?.market_context_blocked ?? 0
    } 只；安全因子 ${entryFeedback.summary?.factor_count ?? 0} 个。${entryFeedback.summary?.note || ""}`;
    const marketSegments = segmentation.market_regime_counts
      ? Object.entries(segmentation.market_regime_counts)
          .map(([key, value]) => `${key}:${value}`)
          .join("、")
      : "";
    const phaseSegments = segmentation.update_phase_counts
      ? Object.entries(segmentation.update_phase_counts)
          .map(([key, value]) => `${key}:${value}`)
          .join("、")
      : "";
    byId("feedbackStatus").textContent += ` 分层反馈：市场[${marketSegments || "-"}]；时段[${phaseSegments || "-"}]。`;
  }
}

function renderStockList() {
  const filteredStocks = stocks().filter((stock) => {
    if (state.filter === "all") return true;
    if (state.filter === "buyable") return Boolean(stock.is_buyable_now);
    return stock.status_key === state.filter;
  });

  const list = byId("stockList");
  list.innerHTML = "";

  filteredStocks.forEach((stock) => {
    list.appendChild(createStockCard(stock));
  });

  if (!filteredStocks.length) {
    list.innerHTML = '<article class="stock-card"><div class="detail"><p class="logic">当前筛选下没有股票。</p></div></article>';
  }
}

function createStockCard(stock) {
  const template = byId("stockCardTemplate");
  const node = template.content.firstElementChild.cloneNode(true);
  const status = statusMap[stock.status_key] || { label: stock.intervention_status || "观察", className: "" };
  const tracking = stock.tracking || {};
  const trackingReturn = tracking.return_since_first_pct;

  node.querySelector(".stock-name").textContent = stock.name;
  node.querySelector(".stock-code").textContent = `${stock.code} · ${stock.board || "主板"}`;
  node.querySelector(".status-pill").textContent = status.label;
  node.querySelector(".status-pill").classList.add(status.className);
  node.querySelector(".close-price").textContent = formatNumber(stock.close);
  node.querySelector(".buy-signal").textContent = stock.buy_signal_label || "等待触发";
  node.querySelector(".buy-signal").classList.add(buySignalClass(stock.buy_signal_key));
  node.querySelector(".buy-price").textContent = formatBuyPrice(stock);
  node.querySelector(".fund-flow").textContent = stock.fund_flow_label || "资金流暂缺";
  node.querySelector(".fund-flow").classList.add(fundFlowClass(stock.fund_flow_score));
  node.querySelector(".chip-status").textContent = stock.chip_label || "筹码暂缺";
  node.querySelector(".chip-status").classList.add(chipClass(stock.chip_score));
  node.querySelector(".feedback-bonus").textContent = formatSignedNumber(stock.feedback_bonus, 3);
  node.querySelector(".feedback-bonus").classList.add(feedbackClass(stock.feedback_bonus));
  node.querySelector(".entry-price").textContent = formatNumber(stock.recommended_entry_price);
  node.querySelector(".breakout-price").textContent = formatNumber(stock.breakout_confirm_price);
  node.querySelector(".watch-zone").textContent = stock.watch_zone || "-";
  node.querySelector(".no-chase").textContent = formatNumber(stock.no_chase_price);
  node.querySelector(".tracking-return").textContent = formatPercent(trackingReturn);
  node.querySelector(".tracking-return").classList.add(returnClass(trackingReturn));
  node.querySelector(".score").textContent = formatNumber(stock.score, 1);
  node.querySelector(".logic").textContent = stock.logic || "";
  node.querySelector(".theme").textContent = `${stock.theme || "-"}；主题强度 ${
    stock.theme_strength_label || "-"
  } / ${formatNumber(stock.theme_strength_score)}；市场 ${stock.market_temperature_label || "-"}；组合降权 ${formatSignedNumber(
    stock.portfolio_concentration_penalty,
    3
  )}`;
  node.querySelector(".layer-one").textContent = stock.layer_one_rank
    ? `全主板第 ${stock.layer_one_rank} 名，初筛分 ${formatNumber(stock.layer_one_score)}，当日涨跌 ${formatPercent(
        stock.layer_one_pct_chg
      )}，来源：${stock.candidate_source || "-"}`
    : `未进入全主板快照初筛，来源：${stock.candidate_source || "-"}`;
  node.querySelector(".buy-detail").textContent = stock.is_buyable_now
    ? `${stock.buy_signal_label || "可买入观察"}：路径 ${stock.buy_price_path || "-"}，可买价 ${formatNumber(
        stock.buyable_price
      )}，可买区间 ${formatNumber(stock.buyable_price_lower)}-${formatNumber(stock.buyable_price_upper)}。${
        stock.buy_price_note || ""
      }`
    : `${stock.buy_signal_label || "等待触发"}：下一个触发价 ${formatNumber(stock.next_buy_trigger_price)}，路径 ${
        stock.buy_price_path || "-"
      }。${stock.buy_price_note || ""}`;
  node.querySelector(".fund-detail").textContent = `${stock.fund_flow_label || "资金流暂缺"}：今日主力 ${formatFundMoney(
    stock.fund_today_main_net
  )} / ${formatPercent(stock.fund_today_main_net_pct)}，5日主力 ${formatFundMoney(
    stock.fund_5d_main_net
  )} / ${formatPercent(stock.fund_5d_main_net_pct)}，资金分 ${formatNumber(stock.fund_flow_score)}，模型加减分 ${formatNumber(
    stock.fund_flow_bonus
  )}。资金流只作趋势质量验证。`;
  node.querySelector(".chip-detail").textContent = `${stock.chip_label || "筹码暂缺"}：获利比例 ${formatPercent(
    stock.chip_profit_ratio
  )}，平均成本 ${formatNumber(stock.chip_avg_cost)}，现价偏离平均成本 ${formatPercent(
    stock.chip_cost_gap_pct
  )}，70%集中度 ${formatPercent(stock.chip_concentration_70)}，90%集中度 ${formatPercent(
    stock.chip_concentration_90
  )}，筹码分 ${formatNumber(stock.chip_score)}，模型加减分 ${formatNumber(stock.chip_bonus)}。${
    stock.chip_note || "筹码只作成本结构与兑现压力验证。"
  } 来源：${stock.chip_source || "-"}。`;
  node.querySelector(".feedback-detail").textContent = `${stock.feedback_label || "回访样本不足"}：反馈分 ${formatSignedNumber(
    stock.feedback_bonus,
    3
  )}，整体置信 ${stock.feedback_confidence || "低"}。${formatFeedbackFactors(stock)}。${formatPriceFeedback(stock)} ${
    stock.portfolio_concentration_note || ""
  } ${formatEntrySafety(stock)}`;
  node.querySelector(".entry-detail").textContent = `推荐接入价 ${formatNumber(
    stock.recommended_entry_price
  )}，接入区间 ${formatNumber(stock.entry_price_lower)}-${formatNumber(stock.entry_price_upper)}，现价偏离 ${formatPercent(
    stock.entry_gap_pct
  )}。原接入价 ${formatNumber(stock.base_recommended_entry_price)}。${stock.entry_price_note || ""} ${formatEntrySafety(stock)}`;
  node.querySelector(".breakout-detail").textContent = `突破确认价 ${formatNumber(
    stock.breakout_confirm_price
  )}，前高压力 ${formatNumber(stock.resistance_price)}，距现价 ${formatPercent(stock.breakout_gap_pct)}。${
    stock.breakout_price_note || ""
  }`;
  node.querySelector(".first-recommend").textContent = tracking.first_recommend_date
    ? `${tracking.first_recommend_date}，首次价 ${formatNumber(tracking.first_recommend_price)}，已回访 ${
        tracking.tracking_days ?? 0
      } 天`
    : "等待下一次自动刷新后开始记录。";
  node.querySelector(".tracking-detail").textContent = tracking.first_recommend_date
    ? `${tracking.status || "继续观察"}：累计 ${formatPercent(tracking.return_since_first_pct)}，最高 ${formatPercent(
        tracking.max_return_since_first_pct
      )}，距高点 ${formatPercent(tracking.drawdown_from_peak_pct)}。${tracking.comment || ""}`
    : "暂无历史推荐快照。";
  node.querySelector(".trigger").textContent = stock.trigger_condition || "-";
  node.querySelector(".position").textContent = stock.position_hint || "-";
  node.querySelector(".catalysts").textContent = (stock.catalysts || []).join("、") || "-";
  node.querySelector(".risks").textContent = (stock.risks || []).join("、") || "-";

  const detail = node.querySelector(".detail");
  node.querySelector(".card-head").addEventListener("click", () => {
    detail.hidden = !detail.hidden;
  });
  node.querySelector(".trade-pick-button").addEventListener("click", () => {
    selectStockForSimulation(stock);
  });

  return node;
}

function renderSimulationPanel() {
  syncSimulationSelect();
  const snapshot = portfolioSnapshot();

  byId("simulationBadge").textContent = `初始 ${formatCurrency(state.simulation.initialCash, 0)} 元`;
  byId("simTotalAssets").textContent = formatCurrency(snapshot.totalAssets);
  byId("simCash").textContent = formatCurrency(state.simulation.cash);
  byId("simMarketValue").textContent = formatCurrency(snapshot.marketValue);
  byId("simReturn").textContent = `${formatCurrency(snapshot.totalReturn)} / ${formatPercent(snapshot.totalReturnPct)}`;
  byId("simReturn").className = returnClass(snapshot.totalReturn);
  byId("simPositionCount").textContent = String(snapshot.positions.length);
  byId("simTotalFees").textContent = formatCurrency(totalTradeFees());
  byId("simAutoStatus").textContent = autoSettings().enabled ? "已启用" : "已关闭";

  renderAutoStrategyControls();
  renderSimulationPositions(snapshot.positions);
  renderSimulationTrades();
  renderAutoLog();
}

function syncSimulationSelect() {
  const select = byId("simulationStockSelect");
  if (!select) return;
  const current = state.simulation.selectedCode || select.value || stocks()[0]?.code || "";
  select.innerHTML = stocks()
    .map((stock) => `<option value="${escapeHtml(stock.code)}">${escapeHtml(stock.name)} · ${escapeHtml(stock.code)}</option>`)
    .join("");
  const nextCode = stocks().some((stock) => stock.code === current) ? current : stocks()[0]?.code || "";
  state.simulation.selectedCode = nextCode;
  select.value = nextCode;
  if (nextCode && !byId("simulationPriceInput").value) {
    const stock = findStock(nextCode);
    const price = suggestedTradePrice(stock);
    if (price) byId("simulationPriceInput").value = formatNumber(price);
  }
}

function renderAutoStrategyControls() {
  const settings = autoSettings();
  const fees = feeSettings();
  byId("autoStrategyEnabled").checked = settings.enabled;
  byId("autoMaxPositionPct").value = formatNumber(settings.maxPositionPct * 100, 0);
  byId("autoMaxStocks").value = String(settings.maxStocks);
  byId("autoMinScore").value = formatNumber(settings.minScore, 1);
  byId("autoStopLossPct").value = formatNumber(settings.stopLossPct * 100, 1);
  byId("autoTakeProfitPct").value = formatNumber(settings.takeProfitPct * 100, 1);
  byId("autoTrailingStopPct").value = formatNumber(settings.trailingStopPct * 100, 1);
  byId("feeCommissionRate").value = formatNumber(fees.commissionRate * 100, 3);
  byId("feeMinCommission").value = formatNumber(fees.minCommission, 1);
  byId("feeStampDutyRate").value = formatNumber(fees.stampDutyRate * 100, 3);
  byId("feeTransferRate").value = formatNumber(fees.transferFeeRate * 100, 4);
  byId("autoStrategyNote").textContent = `最近检查：${
    state.simulation.lastAutoRunKey ? state.simulation.lastAutoRunKey.split("|")[0] : "尚未执行"
  }。费用默认：佣金万三最低 5 元，卖出印花税 0.05%，过户费 0.001%，都可按你的券商账户调整。`;
}

function renderSimulationPositions(positions) {
  const container = byId("simulationPositions");
  if (!positions.length) {
    container.innerHTML = '<p class="empty-text">暂无模拟持仓。可以从股票卡片点击“用此价模拟买入”，或在上方手动选择股票。</p>';
    return;
  }

  container.innerHTML = positions
    .sort((a, b) => b.marketValue - a.marketValue)
    .map(
      (position) => `
        <article class="simulation-row">
          <div>
            <strong>${escapeHtml(position.name)}</strong>
            <em>${escapeHtml(position.code)} · 可卖 ${position.availableQuantity} 股</em>
          </div>
          <div>
            <span>数量 / 成本</span>
            <strong>${position.quantity} / ${formatNumber(position.avgCost)}</strong>
          </div>
          <div>
            <span>最新价 / 市值</span>
            <strong>${formatNumber(position.latestPrice)} / ${formatCurrency(position.marketValue)}</strong>
          </div>
          <div>
            <span>扣费后浮动收益</span>
            <strong class="${returnClass(position.unrealized)}">${formatCurrency(position.unrealized)} / ${formatPercent(position.unrealizedPct)}</strong>
            <em>止损 ${formatNumber(position.stopLossPrice)} · 止盈 ${formatNumber(position.takeProfitPrice)}</em>
          </div>
        </article>
      `
    )
    .join("");
}

function renderSimulationTrades() {
  const container = byId("simulationTrades");
  const trades = state.simulation.trades || [];
  if (!trades.length) {
    container.innerHTML = '<p class="empty-text">暂无成交记录。模拟成交只保存在当前浏览器，不会同步到真实账户。</p>';
    return;
  }

  container.innerHTML = trades
    .slice(0, 20)
    .map((trade) => {
      const isBuy = trade.type === "buy";
      const pnlText = isBuy || !isFiniteNumber(trade.realizedPnl) ? "" : ` · 已实现 ${formatCurrency(trade.realizedPnl)}`;
      const feeText = trade.fees?.total ? ` · 费用 ${formatCurrency(trade.fees.total)}` : "";
      const sourceText = trade.source === "auto" ? "自动" : "手动";
      return `
        <article class="simulation-row compact">
          <div>
            <strong class="${isBuy ? "buy-now" : "buy-avoid"}">${sourceText}${isBuy ? "买入" : "卖出"} ${escapeHtml(trade.name)}</strong>
            <em>${escapeHtml(trade.tradeDate || "-")} · ${escapeHtml(trade.code)} · ${escapeHtml(trade.reason || "")}</em>
          </div>
          <div>
            <span>价格 / 数量</span>
            <strong>${formatNumber(trade.price)} / ${trade.quantity}</strong>
          </div>
          <div>
            <span>成交额 / 费用</span>
            <strong>${formatCurrency(trade.amount)}${feeText}${pnlText}</strong>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderAutoLog() {
  const container = byId("simulationAutoLog");
  const logs = state.simulation.autoLog || [];
  if (!logs.length) {
    container.innerHTML = '<p class="empty-text">暂无自动策略执行记录。启用后，每次读取到新的数据快照会自动检查一次。</p>';
    return;
  }
  container.innerHTML = logs
    .slice(0, 20)
    .map((log) => {
      const eventText = log.events?.length ? log.events.map((event) => event.summary).join("；") : "未触发交易";
      return `
        <article class="simulation-row compact">
          <div>
            <strong>${escapeHtml(log.tradeDate || "-")} · ${escapeHtml(log.phase || "自动检查")}</strong>
            <em>${escapeHtml(log.runKey || "")}</em>
          </div>
          <div>
            <span>动作</span>
            <strong>${escapeHtml(eventText)}</strong>
          </div>
          <div>
            <span>执行时间</span>
            <strong>${escapeHtml(new Date(log.at).toLocaleString("zh-CN"))}</strong>
          </div>
        </article>
      `;
    })
    .join("");
}

function selectedTradeStock() {
  const code = byId("simulationStockSelect").value;
  return findStock(code);
}

function selectStockForSimulation(stock) {
  state.simulation.selectedCode = stock.code;
  const price = suggestedTradePrice(stock);
  byId("simulationStockSelect").value = stock.code;
  if (price) byId("simulationPriceInput").value = formatNumber(price);
  byId("simulationQuantityInput").value = "100";
  saveSimulation();
  setSimulationMessage(`已带入 ${stock.name}，模拟价 ${price ? formatNumber(price) : "-"}。`, "info");
  byId("simulationPanel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function handleSimulationBuy() {
  const stock = selectedTradeStock();
  if (!stock) {
    setSimulationMessage("请先选择一只股票。", "error");
    return;
  }
  const price = Number(byId("simulationPriceInput").value);
  const quantity = normalizeQuantity(byId("simulationQuantityInput").value);
  if (!isFiniteNumber(price) || price <= 0) {
    setSimulationMessage("请输入有效的模拟价格。", "error");
    return;
  }
  if (!quantity) {
    setSimulationMessage("买入数量需至少 100 股，并按 100 股整数手模拟。", "error");
    return;
  }
  byId("simulationQuantityInput").value = String(quantity);
  const result = buyPosition(stock, price, quantity, { source: "manual", reason: "手动模拟买入" });
  if (!result.ok) {
    setSimulationMessage(result.message, "error");
    return;
  }
  saveSimulation();
  renderSimulationPanel();
  setSimulationMessage(
    `已模拟买入 ${stock.name} ${result.quantity} 股，成交额 ${formatCurrency(result.grossAmount)} 元，费用 ${formatCurrency(
      result.fees.total
    )} 元，止损 ${formatNumber(result.stopLossPrice)}，止盈 ${formatNumber(result.takeProfitPrice)}。`,
    "success"
  );
}

function handleSimulationSell() {
  const stock = selectedTradeStock();
  if (!stock) {
    setSimulationMessage("请先选择一只股票。", "error");
    return;
  }
  const position = state.simulation.positions[stock.code];
  if (!position || !position.quantity) {
    setSimulationMessage("当前没有这只股票的模拟持仓。", "error");
    return;
  }
  const price = Number(byId("simulationPriceInput").value);
  const quantity = normalizeQuantity(byId("simulationQuantityInput").value);
  if (!isFiniteNumber(price) || price <= 0) {
    setSimulationMessage("请输入有效的模拟价格。", "error");
    return;
  }
  if (!quantity) {
    setSimulationMessage("卖出数量需至少 100 股，并按 100 股整数手模拟。", "error");
    return;
  }
  const result = sellPosition(stock, price, quantity, { source: "manual", reason: "手动模拟卖出" });
  if (!result.ok) {
    setSimulationMessage(result.message, "error");
    return;
  }
  saveSimulation();
  renderSimulationPanel();
  setSimulationMessage(
    `已模拟卖出 ${stock.name} ${result.quantity} 股，成交额 ${formatCurrency(result.grossAmount)} 元，费用 ${formatCurrency(
      result.fees.total
    )} 元，已实现收益 ${formatCurrency(result.realizedPnl)} 元。`,
    "success"
  );
}

function resetSimulation() {
  if (!window.confirm("确认重置模拟账户？持仓和成交记录都会清空，初始资金恢复为 100000 元。")) return;
  state.simulation = createDefaultSimulation();
  saveSimulation();
  renderSimulationPanel();
  setSimulationMessage("模拟账户已重置。", "success");
}

function renderReviewCenter() {
  const review = state.review;
  const list = byId("reviewList");
  const records = [...(review?.records || [])].sort((a, b) => {
    const aReturn = Number.isFinite(Number(a.return_since_first_pct)) ? Number(a.return_since_first_pct) : -Infinity;
    const bReturn = Number.isFinite(Number(b.return_since_first_pct)) ? Number(b.return_since_first_pct) : -Infinity;
    if (bReturn !== aReturn) return bReturn - aReturn;
    return String(a.code).localeCompare(String(b.code));
  });
  byId("reviewCount").textContent = `${records.length} 条`;
  list.innerHTML = "";

  if (!records.length) {
    list.innerHTML = '<p class="empty-text">暂无历史推荐回访数据。</p>';
    return;
  }

  records.forEach((record, index) => {
    list.appendChild(createReviewRow({ ...record, display_rank: index + 1 }));
  });
}

function createReviewRow(record) {
  const template = byId("reviewRowTemplate");
  const node = template.content.firstElementChild.cloneNode(true);
  const reviewReturn = record.return_since_first_pct;

  node.querySelector(".review-name").textContent = record.name || record.code;
  node.querySelector(".review-code").textContent = `#${record.display_rank || record.review_rank || "-"} · ${record.code} · ${
    record.active_in_current_pool ? "当前池中" : "已调出"
  }`;
  node.querySelector(".review-return").textContent = formatPercent(reviewReturn);
  node.querySelector(".review-return").classList.add(returnClass(reviewReturn));
  node.querySelector(".review-first").textContent = `${record.first_recommend_date || "-"} / ${formatNumber(record.first_recommend_price)}`;
  node.querySelector(".review-status").textContent = record.review_status || "-";
  if (record.entry_return_from_first_entry_pct !== null && record.entry_return_from_first_entry_pct !== undefined) {
    node.querySelector(".review-status").textContent += ` · 接入${formatPercent(
      record.entry_return_from_first_entry_pct
    )} / 回撤${formatPercent(record.entry_drawdown_from_first_entry_pct)}`;
  }
  if (record.review_primary_attribution || record.review_model_action) {
    node.querySelector(".review-status").textContent += ` · 归因 ${record.review_primary_attribution || "-"} · ${
      record.review_model_action || ""
    }`;
  }
  node.title = record.comment || "";

  return node;
}

function bindSimulationEvents() {
  byId("simulationStockSelect").addEventListener("change", (event) => {
    state.simulation.selectedCode = event.target.value;
    const stock = findStock(event.target.value);
    const price = suggestedTradePrice(stock);
    if (price) byId("simulationPriceInput").value = formatNumber(price);
    saveSimulation();
  });
  byId("simulationBuyButton").addEventListener("click", handleSimulationBuy);
  byId("simulationSellButton").addEventListener("click", handleSimulationSell);
  byId("simulationResetButton").addEventListener("click", resetSimulation);
  byId("autoStrategyRunButton").addEventListener("click", () => {
    runAutoStrategy({ force: false, quiet: false });
    renderSimulationPanel();
  });
  byId("autoStrategyEnabled").addEventListener("change", (event) => {
    state.simulation.autoSettings = { ...autoSettings(), enabled: event.target.checked };
    saveSimulation();
    renderSimulationPanel();
    setSimulationMessage(event.target.checked ? "自动模拟交易已启用。" : "自动模拟交易已关闭。", "info");
  });

  const settingBindings = [
    ["autoMaxPositionPct", "autoSettings", "maxPositionPct", 100],
    ["autoMaxStocks", "autoSettings", "maxStocks", 1],
    ["autoMinScore", "autoSettings", "minScore", 1],
    ["autoStopLossPct", "autoSettings", "stopLossPct", 100],
    ["autoTakeProfitPct", "autoSettings", "takeProfitPct", 100],
    ["autoTrailingStopPct", "autoSettings", "trailingStopPct", 100],
    ["feeCommissionRate", "feeSettings", "commissionRate", 100],
    ["feeMinCommission", "feeSettings", "minCommission", 1],
    ["feeStampDutyRate", "feeSettings", "stampDutyRate", 100],
    ["feeTransferRate", "feeSettings", "transferFeeRate", 100],
  ];

  settingBindings.forEach(([id, group, key, divisor]) => {
    byId(id).addEventListener("change", (event) => {
      const rawValue = Number(event.target.value);
      if (!Number.isFinite(rawValue)) return;
      state.simulation[group] = {
        ...(group === "autoSettings" ? autoSettings() : feeSettings()),
        [key]: rawValue / divisor,
      };
      if (key === "maxStocks") state.simulation[group][key] = Math.floor(rawValue);
      if (key === "minScore" || key === "minCommission") state.simulation[group][key] = rawValue;
      state.simulation.autoSettings = normalizeAutoSettings(state.simulation.autoSettings);
      state.simulation.feeSettings = normalizeFeeSettings(state.simulation.feeSettings);
      saveSimulation();
      renderSimulationPanel();
      setSimulationMessage("自动策略参数已保存。下一次自动检查会按新参数执行。", "info");
    });
  });
}

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
    button.classList.add("active");
    state.filter = button.dataset.filter;
    render();
  });
});

let deferredPrompt;
const installButton = byId("installButton");

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installButton.hidden = true;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

bindSimulationEvents();
loadPool();
