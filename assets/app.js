const INITIAL_SIM_CASH = 100000;
const SIM_STORAGE_KEY = "a-share-li-simulation-v1";

const state = {
  data: null,
  review: null,
  filter: "all",
  simulation: loadSimulation(),
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
    schemaVersion: 1,
    initialCash: INITIAL_SIM_CASH,
    cash: INITIAL_SIM_CASH,
    positions: {},
    trades: [],
    selectedCode: "",
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
        tradeDate: String(lot.tradeDate || "历史"),
        at: String(lot.at || ""),
      }))
      .filter((lot) => lot.quantity > 0 && isFiniteNumber(lot.price));
    const costBasis = lots.reduce((sum, lot) => sum + lot.quantity * lot.price, 0);
    if (!lots.length || costBasis <= 0) return;
    positions[code] = {
      code,
      name: position.name || code,
      quantity: lots.reduce((sum, lot) => sum + lot.quantity, 0),
      costBasis,
      lots,
      updatedAt: position.updatedAt || new Date().toISOString(),
    };
  });

  const trades = Array.isArray(raw.trades) ? raw.trades.slice(0, 100) : [];
  return {
    schemaVersion: 1,
    initialCash,
    cash,
    positions,
    trades,
    selectedCode: raw.selectedCode || "",
  };
}

function saveSimulation() {
  localStorage.setItem(SIM_STORAGE_KEY, JSON.stringify(state.simulation));
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

function latestPriceFor(code) {
  const stock = findStock(code);
  const candidates = [stock?.live_quote_price, stock?.close, stock?.daily_close];
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
    const unrealized = marketValue - position.costBasis;
    const unrealizedPct = position.costBasis > 0 ? (unrealized / position.costBasis) * 100 : 0;
    return {
      ...position,
      avgCost: averageCost(position),
      latestPrice: price,
      marketValue,
      unrealized,
      unrealizedPct,
      availableQuantity: availableSellQuantity(position),
    };
  });
  const marketValue = positions.reduce((sum, position) => sum + position.marketValue, 0);
  const totalAssets = state.simulation.cash + marketValue;
  const totalReturn = totalAssets - state.simulation.initialCash;
  const totalReturnPct = state.simulation.initialCash > 0 ? (totalReturn / state.simulation.initialCash) * 100 : 0;
  return {
    positions,
    marketValue,
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
  state.simulation.trades = state.simulation.trades.slice(0, 100);
}

function setSimulationMessage(message, type = "info") {
  const element = byId("simulationMessage");
  element.textContent = message || "";
  element.className = `simulation-message ${type}`;
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
  renderSimulationPanel();
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

  renderSimulationPositions(snapshot.positions);
  renderSimulationTrades();
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
            <span>浮动收益</span>
            <strong class="${returnClass(position.unrealized)}">${formatCurrency(position.unrealized)} / ${formatPercent(position.unrealizedPct)}</strong>
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
      return `
        <article class="simulation-row compact">
          <div>
            <strong class="${isBuy ? "buy-now" : "buy-avoid"}">${isBuy ? "买入" : "卖出"} ${escapeHtml(trade.name)}</strong>
            <em>${escapeHtml(trade.tradeDate || "-")} · ${escapeHtml(trade.code)}</em>
          </div>
          <div>
            <span>价格 / 数量</span>
            <strong>${formatNumber(trade.price)} / ${trade.quantity}</strong>
          </div>
          <div>
            <span>成交额</span>
            <strong>${formatCurrency(trade.amount)}${pnlText}</strong>
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
  const amount = price * quantity;
  if (amount > state.simulation.cash + 0.0001) {
    setSimulationMessage(`可用现金不足，本次需要 ${formatCurrency(amount)} 元。`, "error");
    return;
  }

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
  position.quantity += quantity;
  position.costBasis += amount;
  position.lots.push({
    quantity,
    price,
    tradeDate: currentTradeDate(),
    at: new Date().toISOString(),
  });
  position.updatedAt = new Date().toISOString();
  state.simulation.positions[stock.code] = position;
  state.simulation.cash -= amount;
  addTrade({
    type: "buy",
    code: stock.code,
    name: stock.name,
    price,
    quantity,
    amount,
  });
  saveSimulation();
  renderSimulationPanel();
  setSimulationMessage(`已模拟买入 ${stock.name} ${quantity} 股，成交额 ${formatCurrency(amount)} 元。`, "success");
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
  const availableQuantity = availableSellQuantity(position);
  if (quantity > availableQuantity) {
    setSimulationMessage(`可卖数量不足。按 T+1 规则，本交易日买入的数量暂不可卖；当前可卖 ${availableQuantity} 股。`, "error");
    return;
  }

  let remaining = quantity;
  let releasedCost = 0;
  let realizedPnl = 0;
  const today = currentTradeDate();
  position.lots = position.lots.map((lot) => {
    if (remaining <= 0 || lot.tradeDate === today) return lot;
    const take = Math.min(lot.quantity, remaining);
    remaining -= take;
    releasedCost += lot.price * take;
    realizedPnl += (price - lot.price) * take;
    return { ...lot, quantity: lot.quantity - take };
  });

  if (remaining > 0) {
    setSimulationMessage("卖出失败：可卖老仓不足。", "error");
    return;
  }

  position.lots = position.lots.filter((lot) => lot.quantity > 0);
  position.quantity -= quantity;
  position.costBasis = Math.max(0, position.costBasis - releasedCost);
  position.updatedAt = new Date().toISOString();
  if (position.quantity <= 0) {
    delete state.simulation.positions[stock.code];
  } else {
    state.simulation.positions[stock.code] = position;
  }
  const amount = price * quantity;
  state.simulation.cash += amount;
  addTrade({
    type: "sell",
    code: stock.code,
    name: stock.name,
    price,
    quantity,
    amount,
    realizedPnl,
  });
  saveSimulation();
  renderSimulationPanel();
  setSimulationMessage(`已模拟卖出 ${stock.name} ${quantity} 股，已实现收益 ${formatCurrency(realizedPnl)} 元。`, "success");
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
