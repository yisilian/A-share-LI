const state = {
  data: null,
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

const byId = (id) => document.getElementById(id);

async function loadPool() {
  try {
    const response = await fetch(`data/latest.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
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
  byId("overallSignal").textContent = data.summary?.overall_signal || "-";
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
}

function createStockCard(stock) {
  const template = byId("stockCardTemplate");
  const node = template.content.firstElementChild.cloneNode(true);
  const status = statusMap[stock.status_key] || { label: stock.intervention_status || "观察", className: "" };

  node.querySelector(".stock-name").textContent = stock.name;
  node.querySelector(".stock-code").textContent = `${stock.code} · ${stock.board || "主板"}`;
  node.querySelector(".status-pill").textContent = status.label;
  node.querySelector(".status-pill").classList.add(status.className);
  node.querySelector(".close-price").textContent = formatNumber(stock.close);
  node.querySelector(".watch-zone").textContent = stock.watch_zone || "-";
  node.querySelector(".no-chase").textContent = formatNumber(stock.no_chase_price);
  node.querySelector(".score").textContent = formatNumber(stock.score, 1);
  node.querySelector(".logic").textContent = stock.logic || "";
  node.querySelector(".theme").textContent = stock.theme || "-";
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
