const state = {
  data: null,
  review: null,
  filter: "all",
};

const statusMap = {
  watch: { label: "观察区", className: "status-watch" },
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

const returnClass = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "return-flat";
  if (Number(value) > 0) return "return-positive";
  if (Number(value) < 0) return "return-negative";
  return "return-flat";
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
  byId("sourceStatus").textContent = `更新时间：${data.generated_at || "-"}；数据源：${data.source_status?.quotes || "-"}；${data.source_status?.note || ""}`;

  const stocks = (data.stocks || []).filter((stock) => {
    if (state.filter === "all") return true;
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
  node.querySelector(".entry-price").textContent = formatNumber(stock.recommended_entry_price);
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
  node.querySelector(".entry-detail").textContent =
    `推荐接入价 ${formatNumber(stock.recommended_entry_price)}，接入区间 ${formatNumber(stock.entry_price_lower)}-${formatNumber(stock.entry_price_upper)}，现价偏离 ${formatPercent(stock.entry_gap_pct)}。${stock.entry_price_note || ""}`;
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
