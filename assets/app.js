const state = {
  data: null,
  review: null,
  filter: "all",
};

const statusMap = {
  watch: { label: "观察区", className: "status-watch" },
  breakout: { label: "突破确认", className: "status-breakout" },
  wait: { label: "等回踩", className: "status-wait" },
  avoid: { label: "不追高", className: "status-avoid" },
};

const formatNumber = (value, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return Number(value).toFixed(digits);
};

const formatPercent = (value, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  const number = Number(value);
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(digits)}%`;
};

const formatMoney = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return `${(Number(value) / 100000000).toFixed(2)}亿`;
};

const formatSignedNumber = (value, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  const number = Number(value);
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(digits)}`;
};

const returnClass = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "return-flat";
  if (Number(value) > 0) return "return-positive";
  if (Number(value) < 0) return "return-negative";
  return "return-flat";
};

const buySignalClass = (key) => {
  if (key === "pullback_buy" || key === "breakout_buy") return "buy-now";
  if (key === "risk_wait") return "buy-avoid";
  if (key === "avoid") return "buy-avoid";
  return "buy-wait";
};

const formatBuyPrice = (stock) => {
  if (stock.is_buyable_now) return formatNumber(stock.buyable_price);
  const nextPrice = formatNumber(stock.next_buy_trigger_price);
  return nextPrice === "-" ? "未触发" : `待 ${nextPrice}`;
};

const fundFlowClass = (score) => {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return "fund-neutral";
  if (Number(score) >= 3) return "fund-positive";
  if (Number(score) <= -3) return "fund-negative";
  return "fund-neutral";
};

const chipClass = (score) => {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return "chip-neutral";
  if (Number(score) >= 0.4) return "chip-positive";
  if (Number(score) <= -0.3) return "chip-negative";
  return "chip-neutral";
};

const feedbackClass = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "feedback-neutral";
  if (Number(value) > 0.05) return "feedback-positive";
  if (Number(value) < -0.05) return "feedback-negative";
  return "feedback-neutral";
};

const formatFeedbackFactors = (stock) => {
  const factors = stock.feedback_factors || [];
  if (!factors.length) return stock.feedback_note || "暂无足够历史样本，反馈分暂不明显。";
  return factors
    .slice(0, 3)
    .map((factor) => `${factor.label}：${formatSignedNumber(factor.score_effect, 2)}，样本 ${factor.sample_count ?? "-"}`)
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
  const factorText = factors.length
    ? factors
        .slice(0, 2)
        .map(
          (factor) =>
            `${factor.label}: ${formatPercent(factor.price_adjustment_pct, 3)}, 接入后${formatPercent(factor.avg_entry_return_pct)}, 回撤${formatPercent(factor.avg_adverse_drawdown_pct)}, 暴跌率${formatPercent(factor.crash_rate_pct)}`
        )
        .join("；")
    : stock.entry_safety_note || "历史接入价样本不足。";
  return `${stock.entry_safety_label || "接入样本不足"}：安全调整 ${adjustment}。${factorText}`;
};

const byId = (id) => document.getElementById(id);

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
    byId("stockList").innerHTML = `<article class="stock-card"><div class="detail"><p class="logic">数据加载失败：${error.message}</p></div></article>`;
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
  const feedback = data.model_feedback || {};
  const entryFeedback = feedback.entry_effectiveness || {};
  byId("feedbackStatus").textContent = feedback.schema_version
    ? `反馈模型：${feedback.confidence || "低"}置信；样本 ${feedback.observation_count ?? 0} 条；因子 ${feedback.summary?.factor_count ?? 0} 个；单股修正上限 ±${formatNumber(feedback.score_cap, 2)} 分。${feedback.summary?.note || ""}`
    : "反馈模型：等待历史样本积累。";
  byId("sourceStatus").textContent = `更新时间：${data.generated_at || "-"}；数据源：${data.source_status?.quotes || "-"}；${data.source_status?.note || ""}`;

  if (feedback.schema_version && entryFeedback.schema_version) {
    byId("feedbackStatus").textContent += ` 接入有效性：样本 ${entryFeedback.observation_count ?? 0} 条；安全因子 ${entryFeedback.summary?.factor_count ?? 0} 个。${entryFeedback.summary?.note || ""}`;
  }

  const stocks = (data.stocks || []).filter((stock) => {
    if (state.filter === "all") return true;
    if (state.filter === "buyable") return Boolean(stock.is_buyable_now);
    return stock.status_key === state.filter;
  });

  const list = byId("stockList");
  list.innerHTML = "";

  stocks.forEach((stock) => {
    list.appendChild(createStockCard(stock));
  });

  if (!stocks.length) {
    list.innerHTML = '<article class="stock-card"><div class="detail"><p class="logic">当前筛选下没有股票。</p></div></article>';
  }

  renderReviewCenter();
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
  node.querySelector(".theme").textContent = stock.theme || "-";
  node.querySelector(".layer-one").textContent = stock.layer_one_rank
    ? `全主板第 ${stock.layer_one_rank} 名，初筛分 ${formatNumber(stock.layer_one_score)}，当日涨跌 ${formatPercent(stock.layer_one_pct_chg)}，来源：${stock.candidate_source || "-"}`
    : `未进入全主板快照初筛，来源：${stock.candidate_source || "-"}`;
  node.querySelector(".buy-detail").textContent =
    stock.is_buyable_now
      ? `${stock.buy_signal_label || "可买入观察"}：路径 ${stock.buy_price_path || "-"}，可买价 ${formatNumber(stock.buyable_price)}，可买区间 ${formatNumber(stock.buyable_price_lower)}-${formatNumber(stock.buyable_price_upper)}。${stock.buy_price_note || ""}`
      : `${stock.buy_signal_label || "等待触发"}：下一触发价 ${formatNumber(stock.next_buy_trigger_price)}，路径 ${stock.buy_price_path || "-"}。${stock.buy_price_note || ""}`;
  node.querySelector(".fund-detail").textContent =
    `${stock.fund_flow_label || "资金流暂缺"}：今日主力 ${formatMoney(stock.fund_today_main_net)} / ${formatPercent(stock.fund_today_main_net_pct)}，5日主力 ${formatMoney(stock.fund_5d_main_net)} / ${formatPercent(stock.fund_5d_main_net_pct)}，资金分 ${formatNumber(stock.fund_flow_score)}，模型加减分 ${formatNumber(stock.fund_flow_bonus)}。资金流只作趋势质量验证。`;
  node.querySelector(".chip-detail").textContent =
    `${stock.chip_label || "筹码暂缺"}：获利比例 ${formatPercent(stock.chip_profit_ratio)}，平均成本 ${formatNumber(stock.chip_avg_cost)}，现价偏离平均成本 ${formatPercent(stock.chip_cost_gap_pct)}，70%集中度 ${formatPercent(stock.chip_concentration_70)}，90%集中度 ${formatPercent(stock.chip_concentration_90)}，筹码分 ${formatNumber(stock.chip_score)}，模型加减分 ${formatNumber(stock.chip_bonus)}。${stock.chip_note || "筹码只作成本结构与兑现压力验证。"} 来源：${stock.chip_source || "-"}。`;
  node.querySelector(".feedback-detail").textContent =
    `${stock.feedback_label || "回访样本不足"}：反馈分 ${formatSignedNumber(stock.feedback_bonus, 3)}，整体置信 ${stock.feedback_confidence || "低"}。${formatFeedbackFactors(stock)}。${formatPriceFeedback(stock)}`;
  node.querySelector(".entry-detail").textContent =
    `推荐接入价 ${formatNumber(stock.recommended_entry_price)}，接入区间 ${formatNumber(stock.entry_price_lower)}-${formatNumber(stock.entry_price_upper)}，现价偏离 ${formatPercent(stock.entry_gap_pct)}。原接入价 ${formatNumber(stock.base_recommended_entry_price)}。${stock.entry_price_note || ""}`;
  node.querySelector(".feedback-detail").textContent += ` ${formatEntrySafety(stock)}`;
  node.querySelector(".entry-detail").textContent += ` ${formatEntrySafety(stock)}`;
  node.querySelector(".breakout-detail").textContent =
    `突破确认价 ${formatNumber(stock.breakout_confirm_price)}，前高压力 ${formatNumber(stock.resistance_price)}，距现价 ${formatPercent(stock.breakout_gap_pct)}。${stock.breakout_price_note || ""}`;
  node.querySelector(".first-recommend").textContent = tracking.first_recommend_date
    ? `${tracking.first_recommend_date}，首次价 ${formatNumber(tracking.first_recommend_price)}，已回访 ${tracking.tracking_days ?? 0} 天`
    : "等待下一次自动刷新后开始记录";
  node.querySelector(".tracking-detail").textContent = tracking.first_recommend_date
    ? `${tracking.status || "继续观察"}：累计 ${formatPercent(tracking.return_since_first_pct)}，最高 ${formatPercent(tracking.max_return_since_first_pct)}，距高点 ${formatPercent(tracking.drawdown_from_peak_pct)}。${tracking.comment || ""}`
    : "暂无历史推荐快照。";
  node.querySelector(".trigger").textContent = stock.trigger_condition || "-";
  node.querySelector(".position").textContent = stock.position_hint || "-";
  node.querySelector(".catalysts").textContent = (stock.catalysts || []).join("、") || "-";
  node.querySelector(".risks").textContent = (stock.risks || []).join("、") || "-";

  const detail = node.querySelector(".detail");
  node.querySelector(".card-head").addEventListener("click", () => {
    detail.hidden = !detail.hidden;
  });

  return node;
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
  node.querySelector(".review-code").textContent = `#${record.display_rank || record.review_rank || "-"} · ${record.code} · ${record.active_in_current_pool ? "当前池中" : "已调出"}`;
  node.querySelector(".review-return").textContent = formatPercent(reviewReturn);
  node.querySelector(".review-return").classList.add(returnClass(reviewReturn));
  node.querySelector(".review-first").textContent = `${record.first_recommend_date || "-"} / ${formatNumber(record.first_recommend_price)}`;
  node.querySelector(".review-status").textContent = record.review_status || "-";
  if (record.entry_return_from_first_entry_pct !== null && record.entry_return_from_first_entry_pct !== undefined) {
    node.querySelector(".review-status").textContent += ` · 接入${formatPercent(record.entry_return_from_first_entry_pct)} / 回撤${formatPercent(record.entry_drawdown_from_first_entry_pct)}`;
  }
  node.title = record.comment || "";

  return node;
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

loadPool();
