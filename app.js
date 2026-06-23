const IS_GITHUB_PAGES = location.hostname.endsWith("github.io");
const HISTORY_API = IS_GITHUB_PAGES ? null : "/api/history";
const PUBLIC_SAMPLE_API = IS_GITHUB_PAGES ? null : "/api/public-samples";
const DOUYIN_SAMPLE_API = IS_GITHUB_PAGES ? null : "/api/douyin-samples";
const STATIC_DATA_BASE = "./data/";
const FRONT_MAX = 35;
const BACK_MAX = 12;
const COMBO_COUNT = 2;
const AUTO_REFRESH_MS = 15 * 60 * 1000;
const PROBABILITY_METHODS = [
  { id: "uniform", label: "随机基线", weight: 0.15 },
  { id: "bayes", label: "贝叶斯长频", weight: 0.3 },
  { id: "ema", label: "指数近期", weight: 0.4 },
  { id: "miss", label: "遗漏修正", weight: 0.15 }
];
const FRONT_BANDS = [
  { name: "01-07", min: 1, max: 7 },
  { name: "08-14", min: 8, max: 14 },
  { name: "15-21", min: 15, max: 21 },
  { name: "22-28", min: 22, max: 28 },
  { name: "29-35", min: 29, max: 35 }
];
const BACK_BANDS = [
  { name: "01-04", min: 1, max: 4 },
  { name: "05-08", min: 5, max: 8 },
  { name: "09-12", min: 9, max: 12 }
];

const state = {
  draws: [],
  analysis: null,
  publicCrowd: null,
  douyinCrowd: null,
  manualCrowd: null,
  machineReverse: null,
  isLoading: false,
  nextRefreshAt: null
};

const el = {
  dataStatus: document.querySelector("#dataStatus"),
  dataMeta: document.querySelector("#dataMeta"),
  rangeSelect: document.querySelector("#rangeSelect"),
  windowSelect: document.querySelector("#windowSelect"),
  refreshBtn: document.querySelector("#refreshBtn"),
  generateBtn: document.querySelector("#generateBtn"),
  autoUpdateStatus: document.querySelector("#autoUpdateStatus"),
  latestIssue: document.querySelector("#latestIssue"),
  latestDate: document.querySelector("#latestDate"),
  latestBalls: document.querySelector("#latestBalls"),
  poolBalance: document.querySelector("#poolBalance"),
  frontHeatmap: document.querySelector("#frontHeatmap"),
  backHeatmap: document.querySelector("#backHeatmap"),
  frontSummary: document.querySelector("#frontSummary"),
  backSummary: document.querySelector("#backSummary"),
  hotList: document.querySelector("#hotList"),
  frontKill: document.querySelector("#frontKill"),
  backKill: document.querySelector("#backKill"),
  probabilityMeta: document.querySelector("#probabilityMeta"),
  probabilityMethods: document.querySelector("#probabilityMethods"),
  frontProbability: document.querySelector("#frontProbability"),
  backProbability: document.querySelector("#backProbability"),
  comboList: document.querySelector("#comboList"),
  metrics: document.querySelector("#metrics"),
  publicScanBtn: document.querySelector("#publicScanBtn"),
  publicCrowdStatus: document.querySelector("#publicCrowdStatus"),
  publicCrowdResult: document.querySelector("#publicCrowdResult"),
  douyinScanBtn: document.querySelector("#douyinScanBtn"),
  clearDouyinBtn: document.querySelector("#clearDouyinBtn"),
  douyinStatus: document.querySelector("#douyinStatus"),
  douyinInput: document.querySelector("#douyinInput"),
  douyinResult: document.querySelector("#douyinResult"),
  crowdInput: document.querySelector("#crowdInput"),
  analyzeCrowdBtn: document.querySelector("#analyzeCrowdBtn"),
  clearCrowdBtn: document.querySelector("#clearCrowdBtn"),
  crowdResult: document.querySelector("#crowdResult"),
  machineStatus: document.querySelector("#machineStatus"),
  machineInput: document.querySelector("#machineInput"),
  machineAnalyzeBtn: document.querySelector("#machineAnalyzeBtn"),
  clearMachineBtn: document.querySelector("#clearMachineBtn"),
  machineResult: document.querySelector("#machineResult")
};

const fallback = [
  ["26067", "2026-06-17", "06 16 18 19 28 07 11", "791,339,917.07"],
  ["26066", "2026-06-15", "10 13 19 21 30 04 05", "817,519,004.86"],
  ["26065", "2026-06-13", "04 11 12 13 25 04 08", "802,840,285.34"],
  ["26064", "2026-06-10", "03 13 15 17 21 02 07", "787,631,261.17"],
  ["26063", "2026-06-08", "03 15 20 29 31 01 12", "762,261,291.72"],
  ["26062", "2026-06-06", "07 15 20 24 29 04 10", "738,675,961.01"],
  ["26061", "2026-06-03", "10 12 26 31 35 02 12", "807,705,563.71"],
  ["26060", "2026-06-01", "22 28 30 31 34 01 05", "769,160,539.17"],
  ["26059", "2026-05-30", "06 13 17 19 26 07 08", "818,749,861.45"],
  ["26058", "2026-05-27", "07 12 13 18 34 01 05", "786,536,913.60"]
].map(([lotteryDrawNum, lotteryDrawTime, lotteryDrawResult, poolBalanceAfterdraw]) => ({
  lotteryDrawNum,
  lotteryDrawTime,
  lotteryDrawResult,
  poolBalanceAfterdraw
}));

function pad(n) {
  return String(n).padStart(2, "0");
}

function parseDraw(raw) {
  const nums = raw.lotteryDrawResult
    .trim()
    .split(/\s+/)
    .map(Number);
  return {
    issue: raw.lotteryDrawNum,
    date: raw.lotteryDrawTime,
    front: nums.slice(0, 5),
    back: nums.slice(5, 7),
    pool: raw.poolBalanceAfterdraw || raw.poolBalance || "--"
  };
}

async function fetchJson(primaryUrl, fallbackUrl, options = {}) {
  if (primaryUrl) {
    try {
      const response = await fetch(primaryUrl, options);
      if (response.ok) return response.json();
      const errorJson = await response.json().catch(() => ({}));
      throw new Error(errorJson.error || `请求失败：HTTP ${response.status}`);
    } catch (error) {
      if (!fallbackUrl) throw error;
    }
  }

  if (!fallbackUrl) throw new Error("当前部署环境没有可用的数据接口");
  const response = await fetch(`${fallbackUrl}?v=${Date.now()}`);
  if (!response.ok) throw new Error(`静态数据读取失败：HTTP ${response.status}`);
  return response.json();
}

function nextIssue(issue) {
  return String(Number(issue) + 1).padStart(String(issue).length, "0");
}

function ball(number, type = "front") {
  return `<span class="ball ${type}">${pad(number)}</span>`;
}

function countNumbers(draws, max, key) {
  const map = new Map(Array.from({ length: max }, (_, index) => [index + 1, 0]));
  draws.forEach((draw) => draw[key].forEach((n) => map.set(n, map.get(n) + 1)));
  return map;
}

function lastSeen(draws, max, key) {
  const map = new Map();
  for (let n = 1; n <= max; n += 1) {
    const index = draws.findIndex((draw) => draw[key].includes(n));
    map.set(n, index === -1 ? draws.length : index);
  }
  return map;
}

function normalize(value, max) {
  if (!max) return 0;
  return value / max;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function bandFor(number, bands) {
  return bands.find((band) => number >= band.min && number <= band.max);
}

function numbersInBand(band) {
  return Array.from({ length: band.max - band.min + 1 }, (_, index) => band.min + index);
}

function scoreSet(draws, max, key, recentSize) {
  const recent = draws.slice(0, Math.min(recentSize, draws.length));
  const fullCount = countNumbers(draws, max, key);
  const recentCount = countNumbers(recent, max, key);
  const miss = lastSeen(draws, max, key);
  const maxFull = Math.max(...fullCount.values());
  const maxRecent = Math.max(...recentCount.values());
  const maxMiss = Math.max(...miss.values());

  return Array.from({ length: max }, (_, index) => {
    const n = index + 1;
    const full = fullCount.get(n);
    const recentHits = recentCount.get(n);
    const overdue = miss.get(n);
    const heat =
      normalize(recentHits, maxRecent) * 0.5 +
      normalize(full, maxFull) * 0.28 +
      (1 - normalize(overdue, maxMiss)) * 0.22;
    const weak =
      (1 - normalize(recentHits, maxRecent)) * 0.48 +
      (1 - normalize(full, maxFull)) * 0.28 +
      normalize(overdue, maxMiss) * 0.24;
    return {
      n,
      full,
      recent: recentHits,
      miss: overdue,
      heat,
      weak
    };
  });
}

function uniformProbability(max, slots) {
  const base = slots / max;
  return Array.from({ length: max }, (_, index) => ({ n: index + 1, value: base }));
}

function bayesProbability(draws, max, key, slots, alpha = 1) {
  const counts = countNumbers(draws, max, key);
  const totalSlots = draws.length * slots;
  return Array.from({ length: max }, (_, index) => {
    const n = index + 1;
    return {
      n,
      value: ((counts.get(n) + alpha) / (totalSlots + alpha * max)) * slots
    };
  });
}

function exponentialProbability(draws, max, key, slots, halfLife = 28) {
  const counts = new Map(Array.from({ length: max }, (_, index) => [index + 1, 0]));
  let weightTotal = 0;

  draws.forEach((draw, index) => {
    const weight = Math.pow(0.5, index / halfLife);
    weightTotal += weight;
    draw[key].forEach((n) => counts.set(n, counts.get(n) + weight));
  });

  return Array.from({ length: max }, (_, index) => {
    const n = index + 1;
    return {
      n,
      value: counts.get(n) / Math.max(weightTotal, 1)
    };
  });
}

function omissionProbability(draws, max, key, slots) {
  const miss = lastSeen(draws, max, key);
  const base = slots / max;
  const expectedGap = Math.max(1, (max - slots) / slots);
  const raw = Array.from({ length: max }, (_, index) => {
    const n = index + 1;
    const gap = miss.get(n);
    const gapSignal = Math.tanh((gap - expectedGap) / expectedGap);
    const repeatPenalty = gap === 0 ? 0.05 : 0;
    return {
      n,
      value: base * clamp(1 + gapSignal * 0.18 - repeatPenalty, 0.72, 1.28)
    };
  });
  return normalizeProbabilities(raw, slots);
}

function normalizeProbabilities(items, slots) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  return items.map((item) => ({
    ...item,
    value: total ? (item.value / total) * slots : slots / items.length
  }));
}

function valueMap(items) {
  return new Map(items.map((item) => [item.n, item.value]));
}

function probabilitySet(draws, max, key, slots) {
  const methodValues = {
    uniform: uniformProbability(max, slots),
    bayes: bayesProbability(draws, max, key, slots),
    ema: exponentialProbability(draws, max, key, slots),
    miss: omissionProbability(draws, max, key, slots)
  };
  const methodMaps = Object.fromEntries(Object.entries(methodValues).map(([id, items]) => [id, valueMap(items)]));
  const combined = normalizeProbabilities(
    Array.from({ length: max }, (_, index) => {
      const n = index + 1;
      const raw = PROBABILITY_METHODS.reduce((sum, method) => sum + method.weight * methodMaps[method.id].get(n), 0);
      return { n, value: raw };
    }),
    slots
  );

  return combined
    .map((item) => ({
      n: item.n,
      probability: item.value,
      percent: item.value * 100,
      basePercent: (slots / max) * 100,
      bayesPercent: methodMaps.bayes.get(item.n) * 100,
      emaPercent: methodMaps.ema.get(item.n) * 100,
      missPercent: methodMaps.miss.get(item.n) * 100
    }))
    .sort((a, b) => b.probability - a.probability || a.n - b.n)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

function analyze(draws) {
  const windowSize = Number(el.windowSelect.value);
  const front = scoreSet(draws, FRONT_MAX, "front", windowSize);
  const back = scoreSet(draws, BACK_MAX, "back", windowSize);
  const frontProbability = probabilitySet(draws, FRONT_MAX, "front", 5);
  const backProbability = probabilitySet(draws, BACK_MAX, "back", 2);
  const recent = draws.slice(0, Math.min(windowSize, draws.length));
  const sums = recent.map((draw) => draw.front.reduce((a, b) => a + b, 0));
  const oddFront = recent.flatMap((draw) => draw.front).filter((n) => n % 2).length;
  const bigFront = recent.flatMap((draw) => draw.front).filter((n) => n >= 18).length;

  return {
    front,
    back,
    hotFront: [...front].sort((a, b) => b.heat - a.heat).slice(0, 10),
    hotBack: [...back].sort((a, b) => b.heat - a.heat).slice(0, 5),
    killFront: [...front].sort((a, b) => b.weak - a.weak).slice(0, 7),
    killBack: [...back].sort((a, b) => b.weak - a.weak).slice(0, 3),
    frontProbability,
    backProbability,
    metrics: {
      avgSum: Math.round(sums.reduce((a, b) => a + b, 0) / Math.max(sums.length, 1)),
      oddRate: oddFront / Math.max(recent.length * 5, 1),
      bigRate: bigFront / Math.max(recent.length * 5, 1),
      sample: recent.length
    }
  };
}

function renderHeatmap(target, items, type) {
  const max = Math.max(...items.map((item) => item.heat));
  target.innerHTML = items
    .map((item) => {
      const pct = Math.max(10, Math.round(normalize(item.heat, max) * 100));
      return `<div class="heat-cell ${type}" style="--heat:${pct}%">
        <strong>${pad(item.n)}</strong>
        <span>近窗 ${item.recent} / 遗漏 ${item.miss}</span>
      </div>`;
    })
    .join("");
}

function renderRank() {
  const hottest = [
    ...state.analysis.hotFront.slice(0, 6).map((item) => ({ ...item, type: "front" })),
    ...state.analysis.hotBack.slice(0, 3).map((item) => ({ ...item, type: "back" }))
  ];
  const max = Math.max(...hottest.map((item) => item.heat));
  el.hotList.innerHTML = hottest
    .map((item) => `<div class="rank-row">
      ${ball(item.n, item.type)}
      <div class="bar"><span style="--w:${Math.round(normalize(item.heat, max) * 100)}%"></span></div>
      <span class="score">${Math.round(item.heat * 100)}</span>
    </div>`)
    .join("");
}

function renderProbabilityList(target, items, type, topCount) {
  const maxPercent = Math.max(...items.map((item) => item.percent));
  target.innerHTML = items
    .map((item) => {
      const isTop = item.rank <= topCount;
      const width = Math.max(16, Math.round(normalize(item.percent, maxPercent) * 100));
      return `<div class="prob-row ${type} ${isTop ? "top-prob" : ""}" style="--w:${width}%">
        <span class="prob-rank">${item.rank}</span>
        ${ball(item.n, type)}
        <div class="prob-main">
          <div class="prob-line"><span></span></div>
          <span class="prob-detail">贝叶斯 ${item.bayesPercent.toFixed(2)}% / 近期 ${item.emaPercent.toFixed(2)}% / 遗漏 ${item.missPercent.toFixed(2)}%</span>
        </div>
        <strong>${item.percent.toFixed(2)}%</strong>
      </div>`;
    })
    .join("");
}

function renderProbabilityBoard() {
  const frontTop = state.analysis.frontProbability.slice(0, 5).map((item) => pad(item.n)).join(" ");
  const backTop = state.analysis.backProbability.slice(0, 2).map((item) => pad(item.n)).join(" ");
  el.probabilityMeta.textContent = `前 ${frontTop} / 后 ${backTop}`;
  el.probabilityMethods.innerHTML = PROBABILITY_METHODS.map(
    (method) => `<span><strong>${Math.round(method.weight * 100)}%</strong>${method.label}</span>`
  ).join("");
  renderProbabilityList(el.frontProbability, state.analysis.frontProbability, "front", 5);
  renderProbabilityList(el.backProbability, state.analysis.backProbability, "back", 2);
}

function pickWeighted(pool, count, avoid = []) {
  const avoidSet = new Set(avoid);
  const candidates = pool.filter((item) => !avoidSet.has(item.n));
  const selected = [];
  let guard = 0;

  while (selected.length < count && guard < 200) {
    guard += 1;
    const total = candidates.reduce((sum, item) => {
      if (selected.includes(item.n)) return sum;
      return sum + Math.max(item.heat, 0.05);
    }, 0);
    if (!total) break;
    let cursor = Math.random() * total;
    for (const item of candidates) {
      if (selected.includes(item.n)) continue;
      cursor -= Math.max(item.heat, 0.05);
      if (cursor <= 0) {
        selected.push(item.n);
        break;
      }
    }
  }
  return selected.sort((a, b) => a - b);
}

function pickWeightedFromNumbers(numbers, scorePool, count, avoid = []) {
  const scores = new Map(scorePool.map((item) => [item.n, item]));
  const pool = numbers
    .filter((n) => scores.has(n))
    .map((n) => scores.get(n))
    .sort((a, b) => b.heat - a.heat);
  return pickWeighted(pool, count, avoid);
}

function shapeOk(front) {
  const odd = front.filter((n) => n % 2).length;
  const big = front.filter((n) => n >= 18).length;
  const sum = front.reduce((a, b) => a + b, 0);
  return odd >= 1 && odd <= 4 && big >= 1 && big <= 4 && sum >= 65 && sum <= 135;
}

function generateCombos() {
  if (!state.analysis) return;
  const frontPool = [...state.analysis.front].sort((a, b) => b.heat - a.heat);
  const backPool = [...state.analysis.back].sort((a, b) => b.heat - a.heat);
  const publicFrontAvoid = state.publicCrowd?.avoidFront?.slice(0, 5).map((item) => item.n) || [];
  const publicBackAvoid = state.publicCrowd?.avoidBack?.slice(0, 2).map((item) => item.n) || [];
  const douyinFrontAvoid = state.douyinCrowd?.avoidFront?.slice(0, 6).map((item) => item.n) || [];
  const douyinBackAvoid = state.douyinCrowd?.avoidBack?.slice(0, 3).map((item) => item.n) || [];
  const manualFrontAvoid = state.manualCrowd?.front?.slice(0, 4).map((item) => item.n) || [];
  const manualBackAvoid = state.manualCrowd?.back?.slice(0, 2).map((item) => item.n) || [];
  const frontAvoid = [
    ...new Set([
      ...state.analysis.killFront.slice(0, 3).map((item) => item.n),
      ...douyinFrontAvoid,
      ...publicFrontAvoid,
      ...manualFrontAvoid
    ])
  ].slice(0, 10);
  const backAvoid = [
    ...new Set([
      ...state.analysis.killBack.slice(0, 1).map((item) => item.n),
      ...douyinBackAvoid,
      ...publicBackAvoid,
      ...manualBackAvoid
    ])
  ].slice(0, 4);
  const combos = [];
  const seen = new Set();
  let guard = 0;

  while (combos.length < COMBO_COUNT && guard < 500) {
    guard += 1;
    const front = pickWeighted(frontPool, 5, frontAvoid);
    const back = pickWeighted(backPool, 2, backAvoid);
    const key = `${front.join("-")}+${back.join("-")}`;
    if (!shapeOk(front) || seen.has(key)) continue;
    seen.add(key);
    combos.push({ front, back });
  }

  while (combos.length < COMBO_COUNT) {
    combos.push({
      front: pickWeighted(frontPool, 5).sort((a, b) => a - b),
      back: pickWeighted(backPool, 2).sort((a, b) => a - b)
    });
  }

  el.comboList.innerHTML = combos
    .map((combo, index) => {
      const odd = combo.front.filter((n) => n % 2).length;
      const sum = combo.front.reduce((a, b) => a + b, 0);
      return `<div class="combo">
        <span class="combo-index">${index + 1}</span>
        <div class="balls">${combo.front.map((n) => ball(n, "front")).join("")}${combo.back
          .map((n) => ball(n, "back"))
          .join("")}</div>
        <span class="combo-note">前区和值 ${sum} / 奇偶 ${odd}:${5 - odd}</span>
      </div>`;
    })
    .join("");
}

function renderMetrics() {
  const { avgSum, oddRate, bigRate, sample } = state.analysis.metrics;
  el.metrics.innerHTML = `
    <div class="metric"><span>近 ${sample} 期前区均值</span><strong>${avgSum}</strong></div>
    <div class="metric"><span>奇数占比</span><strong>${Math.round(oddRate * 100)}%</strong></div>
    <div class="metric"><span>大号占比</span><strong>${Math.round(bigRate * 100)}%</strong></div>
  `;
}

function render() {
  const latest = state.draws[0];
  state.analysis = analyze(state.draws);

  el.latestIssue.textContent = latest.issue;
  el.latestDate.textContent = latest.date;
  el.poolBalance.textContent = latest.pool ? `${latest.pool} 元` : "--";
  el.latestBalls.innerHTML = latest.front.map((n) => ball(n, "front")).join("") + latest.back.map((n) => ball(n, "back")).join("");

  renderHeatmap(el.frontHeatmap, state.analysis.front, "front");
  renderHeatmap(el.backHeatmap, state.analysis.back, "back");
  el.frontSummary.textContent = `热号 ${state.analysis.hotFront.slice(0, 3).map((x) => pad(x.n)).join(" ")}`;
  el.backSummary.textContent = `热号 ${state.analysis.hotBack.slice(0, 2).map((x) => pad(x.n)).join(" ")}`;
  renderRank();
  renderProbabilityBoard();
  el.frontKill.innerHTML = state.analysis.killFront.map((item) => ball(item.n, "front")).join("");
  el.backKill.innerHTML = state.analysis.killBack.map((item) => ball(item.n, "back")).join("");
  generateCombos();
  renderMetrics();
}

async function loadData() {
  if (state.isLoading) return;
  state.isLoading = true;
  const limit = Number(el.rangeSelect.value);
  el.dataStatus.textContent = "正在同步";
  el.dataMeta.textContent = `计划读取 ${limit} 期`;
  el.refreshBtn.disabled = true;

  try {
    const json = await fetchJson(
      HISTORY_API ? `${HISTORY_API}?limit=${limit}` : null,
      `${STATIC_DATA_BASE}history-${limit}.json`
    );
    state.draws = json.list.map(parseDraw);
    el.dataStatus.textContent = "数据已更新";
    const fetchedAt = json.staticGeneratedAt || json.fetchedAt;
    el.dataMeta.textContent = `${json.source} · ${new Date(fetchedAt).toLocaleString("zh-CN")}`;
  } catch (error) {
    state.draws = fallback.map(parseDraw);
    el.dataStatus.textContent = "使用兜底样例";
    el.dataMeta.textContent = error.message;
  } finally {
    el.refreshBtn.disabled = false;
    state.isLoading = false;
    scheduleNextRefresh();
  }

  render();
  loadPublicSamples();
  loadDouyinSamples();
}

function scheduleNextRefresh() {
  state.nextRefreshAt = Date.now() + AUTO_REFRESH_MS;
  updateAutoRefreshStatus();
}

function updateAutoRefreshStatus() {
  if (!state.nextRefreshAt) {
    el.autoUpdateStatus.textContent = "15 分钟自动更新";
    return;
  }
  const remaining = Math.max(0, state.nextRefreshAt - Date.now());
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  el.autoUpdateStatus.textContent = `下次热度更新 ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

setInterval(() => {
  updateAutoRefreshStatus();
  if (state.nextRefreshAt && Date.now() >= state.nextRefreshAt && !state.isLoading) {
    loadData();
  }
}, 1000);

function renderPublicCrowd(data) {
  const issue = data.issue || (state.draws[0] ? nextIssue(state.draws[0].issue) : "--");
  const sourceLine =
    data.sourceCount > 0
      ? `采到 ${data.sourceCount} 个来源、${data.mentionCount} 处号码提及`
      : "暂未采到有效公开样本";
  const sourceLinks = data.sources
    .filter((source) => source.mentions > 0)
    .slice(0, 5)
    .map((source) => `<a href="${source.url}" target="_blank" rel="noreferrer">${source.title}</a>`)
    .join("");

  el.publicCrowdStatus.textContent = `第 ${issue} 期`;
  el.publicCrowdResult.innerHTML = `
    <span class="mini-title">${sourceLine}</span>
    <div class="sample-grid">
      <div>
        <span class="label">前区避热</span>
        <div class="balls">${(data.avoidFront || []).map((x) => `${ball(x.n, "front")}<span class="score">x${x.count}</span>`).join("") || "<span class=\"score\">暂无</span>"}</div>
      </div>
      <div>
        <span class="label">后区避热</span>
        <div class="balls">${(data.avoidBack || []).map((x) => `${ball(x.n, "back")}<span class="score">x${x.count}</span>`).join("") || "<span class=\"score\">暂无</span>"}</div>
      </div>
    </div>
    <div class="source-list">${sourceLinks || "<span class=\"score\">公开来源没有返回可解析号码，可稍后重试。</span>"}</div>
  `;
}

function renderSampleResult(target, data, emptyText = "暂未采到有效样本") {
  const sourceLine =
    data.sourceCount > 0
      ? `采到 ${data.sourceCount} 个来源、${data.mentionCount} 处号码提及`
      : emptyText;
  const sourceLinks = (data.sources || [])
    .filter((source) => source.mentions > 0 || source.error)
    .slice(0, 5)
    .map((source) => {
      const label = source.error ? `${source.title}：${source.error}` : source.title;
      if (!source.url) return `<span class="score">${label}</span>`;
      return `<a href="${source.url}" target="_blank" rel="noreferrer">${label}</a>`;
    })
    .join("");

  target.innerHTML = `
    <span class="mini-title">${sourceLine}</span>
    <div class="sample-grid">
      <div>
        <span class="label">前区避热</span>
        <div class="balls">${(data.avoidFront || []).map((x) => `${ball(x.n, "front")}<span class="score">x${x.count}</span>`).join("") || "<span class=\"score\">暂无</span>"}</div>
      </div>
      <div>
        <span class="label">后区避热</span>
        <div class="balls">${(data.avoidBack || []).map((x) => `${ball(x.n, "back")}<span class="score">x${x.count}</span>`).join("") || "<span class=\"score\">暂无</span>"}</div>
      </div>
    </div>
    <div class="source-list">${sourceLinks || "<span class=\"score\">可粘贴抖音分享链接、图文文案或截图 OCR 文本后再试。</span>"}</div>
  `;
}

function countSampleNumbers(samples, key, max) {
  const counts = new Map(Array.from({ length: max }, (_, index) => [index + 1, 0]));
  samples.forEach((sample) => {
    sample[key].forEach((n) => counts.set(n, counts.get(n) + 1));
  });
  return [...counts.entries()]
    .filter(([, count]) => count > 0)
    .map(([n, count]) => ({ n, count }))
    .sort((a, b) => b.count - a.count || a.n - b.n);
}

function summarizeTextSamples(issue, text, title) {
  const samples = text
    .split(/\n+/)
    .map(parseCrowdLine)
    .filter((sample) => sample && sample.front.length === 5 && sample.back.length === 2);

  if (!samples.length) {
    return {
      issue,
      sourceCount: 0,
      mentionCount: 0,
      avoidFront: [],
      avoidBack: [],
      sources: []
    };
  }

  return {
    issue,
    sourceCount: 1,
    mentionCount: samples.length,
    avoidFront: countSampleNumbers(samples, "front", FRONT_MAX).slice(0, 8),
    avoidBack: countSampleNumbers(samples, "back", BACK_MAX).slice(0, 4),
    sources: [{ title, source: "手动导入", mentions: samples.length }]
  };
}

function mergeNumberCounts(...groups) {
  const counts = new Map();
  groups.flat().forEach((item) => {
    counts.set(item.n, (counts.get(item.n) || 0) + item.count);
  });
  return [...counts.entries()]
    .map(([n, count]) => ({ n, count }))
    .sort((a, b) => b.count - a.count || a.n - b.n);
}

function mergeSampleData(issue, base, pasted) {
  return {
    issue,
    sourceCount: (base.sourceCount || 0) + (pasted.sourceCount || 0),
    mentionCount: (base.mentionCount || 0) + (pasted.mentionCount || 0),
    avoidFront: mergeNumberCounts(base.avoidFront || [], pasted.avoidFront || []).slice(0, 8),
    avoidBack: mergeNumberCounts(base.avoidBack || [], pasted.avoidBack || []).slice(0, 4),
    sources: [...(base.sources || []), ...(pasted.sources || [])],
    sourceNote: base.sourceNote || "GitHub Pages 静态数据每 15 分钟更新；粘贴内容会在浏览器本地即时解析。"
  };
}

function parseMachinePicks(text) {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const groups = lines
    .map((line) => line.match(/\d{1,2}/g)?.map(Number).filter(Boolean) || [])
    .filter((nums) => nums.length >= 7)
    .map((nums) => ({
      front: nums.slice(0, 5).filter((n) => n >= 1 && n <= 35),
      back: nums.slice(5, 7).filter((n) => n >= 1 && n <= 12)
    }))
    .filter((group) => group.front.length === 5 && group.back.length === 2);

  if (groups.length) return groups.slice(0, 20);

  const all = text.match(/\d{1,2}/g)?.map(Number).filter(Boolean) || [];
  const fallbackGroups = [];
  for (let index = 0; index + 6 < all.length; index += 7) {
    fallbackGroups.push({
      front: all.slice(index, index + 5).filter((n) => n >= 1 && n <= 35),
      back: all.slice(index + 5, index + 7).filter((n) => n >= 1 && n <= 12)
    });
  }
  return fallbackGroups.filter((group) => group.front.length === 5 && group.back.length === 2).slice(0, 20);
}

function bandStats(groups, bands, key) {
  const counts = new Map(bands.map((band) => [band.name, 0]));
  groups.forEach((group) => {
    group[key].forEach((n) => {
      const band = bandFor(n, bands);
      if (band) counts.set(band.name, counts.get(band.name) + 1);
    });
  });
  return bands
    .map((band) => ({ ...band, count: counts.get(band.name) || 0 }))
    .sort((a, b) => b.count - a.count || a.min - b.min);
}

function overlapCount(combo, group) {
  const front = combo.front.filter((n) => group.front.includes(n)).length;
  const back = combo.back.filter((n) => group.back.includes(n)).length;
  return front + back;
}

function maxGroupOverlap(combo, groups) {
  return Math.max(...groups.map((group) => overlapCount(combo, group)));
}

function groupUsage(combo, groups) {
  return groups.map((group, index) => ({
    index: index + 1,
    count: overlapCount(combo, group)
  }));
}

function candidateScores(groups, scores, key, bands) {
  const heat = new Map(scores.map((item) => [item.n, item.heat]));
  const appearances = new Map();
  const bandCounts = new Map(bands.map((band) => [band.name, 0]));

  groups.forEach((group) => {
    group[key].forEach((n) => {
      appearances.set(n, (appearances.get(n) || 0) + 1);
      const band = bandFor(n, bands);
      if (band) bandCounts.set(band.name, bandCounts.get(band.name) + 1);
    });
  });

  const maxAppearances = Math.max(...appearances.values(), 1);
  const maxBandCount = Math.max(...bandCounts.values(), 1);

  return [...appearances.entries()]
    .map(([n, count]) => {
      const band = bandFor(n, bands);
      const bandStrength = band ? normalize(bandCounts.get(band.name), maxBandCount) : 0;
      const repeatPenalty = count > 2 ? 0.08 * (count - 2) : 0;
      return {
        n,
        heat: (heat.get(n) || 0.08) * 0.42 + normalize(count, maxAppearances) * 0.28 + bandStrength * 0.3 - repeatPenalty,
        count,
        band: band?.name || "--"
      };
    })
    .sort((a, b) => b.heat - a.heat || a.n - b.n);
}

function weightedPickCandidate(pool, selected, groups, partialCombo, key, strictCap) {
  const selectedSet = new Set(selected);
  const candidates = pool.filter((item) => {
    if (selectedSet.has(item.n)) return false;
    const nextCombo = {
      front: key === "front" ? [...partialCombo.front, item.n] : partialCombo.front,
      back: key === "back" ? [...partialCombo.back, item.n] : partialCombo.back
    };
    return maxGroupOverlap(nextCombo, groups) <= strictCap;
  });

  const source = candidates.length ? candidates : pool.filter((item) => !selectedSet.has(item.n));
  if (!source.length) return null;
  const total = source.reduce((sum, item) => sum + Math.max(item.heat, 0.05), 0);
  let cursor = Math.random() * total;
  for (const item of source) {
    cursor -= Math.max(item.heat, 0.05);
    if (cursor <= 0) return item.n;
  }
  return source.at(-1).n;
}

function buildMachineCombo(frontCandidates, backCandidates, groups, seedOffset) {
  const front = [];
  const back = [];
  const targetFrontBands = [...new Set(frontCandidates.map((item) => item.band))];
  let guard = 0;

  while (front.length < 5 && guard < 120) {
    guard += 1;
    const bandName = targetFrontBands[(front.length + seedOffset) % Math.max(targetFrontBands.length, 1)];
    const bandPool = frontCandidates.filter((item) => item.band === bandName);
    const pool = bandPool.length ? bandPool : frontCandidates;
    const picked = weightedPickCandidate(pool, front, groups, { front, back }, "front", 2);
    if (picked == null) break;
    front.push(picked);
  }

  guard = 0;
  while (back.length < 2 && guard < 80) {
    guard += 1;
    const picked = weightedPickCandidate(backCandidates, back, groups, { front, back }, "back", 2);
    if (picked == null) break;
    back.push(picked);
  }

  return {
    front: front.sort((a, b) => a - b),
    back: back.sort((a, b) => a - b)
  };
}

function generateMachineCombos(groups) {
  const frontScores = [...state.analysis.front].sort((a, b) => b.heat - a.heat);
  const backScores = [...state.analysis.back].sort((a, b) => b.heat - a.heat);
  const frontBands = bandStats(groups, FRONT_BANDS, "front");
  const backBands = bandStats(groups, BACK_BANDS, "back");
  const frontCandidates = candidateScores(groups, frontScores, "front", FRONT_BANDS);
  const backCandidates = candidateScores(groups, backScores, "back", BACK_BANDS);
  const combos = [];

  for (let index = 0; index < 2; index += 1) {
    let combo = buildMachineCombo(frontCandidates, backCandidates, groups, index);
    let guard = 0;
    while ((combo.front.length < 5 || combo.back.length < 2 || maxGroupOverlap(combo, groups) > 2) && guard < 80) {
      guard += 1;
      combo = buildMachineCombo(frontCandidates, backCandidates, groups, index + guard);
    }
    combos.push({
      ...combo,
      maxOverlap: maxGroupOverlap(combo, groups),
      usage: groupUsage(combo, groups),
      note: `每注机选最多重合 ${maxGroupOverlap(combo, groups)} 个`
    });
  }

  return { frontBands, backBands, frontCandidates, backCandidates, combos };
}

function analyzeMachineReverse() {
  if (!state.analysis) return;
  const groups = parseMachinePicks(el.machineInput.value);
  if (groups.length < 3) {
    el.machineStatus.textContent = "样本不足";
    el.machineResult.innerHTML = `<span class="mini-title">至少粘贴 3 注，最好 10 注。每行 5 个前区 + 2 个后区。</span>`;
    return;
  }

  const result = generateMachineCombos(groups);
  state.machineReverse = result;
  el.machineStatus.textContent = `${groups.length} 注`;
  const frontBandText = result.frontBands
    .map((band) => `<span class="band-pill">${band.name}<strong>${band.count}</strong></span>`)
    .join("");
  const backBandText = result.backBands
    .map((band) => `<span class="band-pill back-band">${band.name}<strong>${band.count}</strong></span>`)
    .join("");
  const candidateText = `
    <div class="balls">${result.frontCandidates.slice(0, 8).map((item) => `${ball(item.n, "front")}<span class="score">x${item.count}</span>`).join("")}</div>
    <div class="balls">${result.backCandidates.slice(0, 5).map((item) => `${ball(item.n, "back")}<span class="score">x${item.count}</span>`).join("")}</div>
  `;
  const combos = result.combos
    .map(
      (combo, index) => `<div class="combo">
        <span class="combo-index">${index + 1}</span>
        <div class="balls">${combo.front.map((n) => ball(n, "front")).join("")}${combo.back
          .map((n) => ball(n, "back"))
          .join("")}</div>
        <span class="combo-note">${combo.note} / ${combo.usage.map((item) => `${item.index}:${item.count}`).join(" ")}</span>
      </div>`
    )
    .join("");

  el.machineResult.innerHTML = `
    <span class="mini-title">按“每注机选最多借 0-2 个号”重组；下面的 x 表示该号在机选样本中出现次数。</span>
    <div class="band-list">${frontBandText}</div>
    <div class="band-list">${backBandText}</div>
    ${candidateText}
    <div class="combo-list">${combos}</div>
  `;
}

async function loadPublicSamples() {
  if (!state.draws.length) return;
  const issue = nextIssue(state.draws[0].issue);
  el.publicScanBtn.disabled = true;
  el.publicCrowdStatus.textContent = "抓取中";
  el.publicCrowdResult.innerHTML = `<span class="mini-title">正在抓取第 ${issue} 期公开网页样本...</span>`;

  try {
    const data = await fetchJson(
      PUBLIC_SAMPLE_API ? `${PUBLIC_SAMPLE_API}?issue=${issue}` : null,
      `${STATIC_DATA_BASE}public-samples.json`
    );
    state.publicCrowd = data;
    renderPublicCrowd(data);
    generateCombos();
  } catch (error) {
    state.publicCrowd = null;
    el.publicCrowdStatus.textContent = "抓取失败";
    el.publicCrowdResult.innerHTML = `<span class="mini-title">${error.message}</span>`;
  } finally {
    el.publicScanBtn.disabled = false;
  }
}

async function loadDouyinSamples() {
  if (!state.draws.length) return;
  const issue = nextIssue(state.draws[0].issue);
  el.douyinScanBtn.disabled = true;
  el.douyinStatus.textContent = "分析中";
  el.douyinResult.innerHTML = `<span class="mini-title">正在尝试抖音公开搜索，并解析你粘贴的内容...</span>`;

  try {
    const data = await fetchDouyinData(issue);
    state.douyinCrowd = data;
    el.douyinStatus.textContent = data.sourceCount > 0 ? `避让 ${data.avoidFront.length + data.avoidBack.length} 个` : "需粘贴";
    renderSampleResult(el.douyinResult, data, "抖音公开搜索被平台校验拦截，未采到可解析图文");
    generateCombos();
  } catch (error) {
    state.douyinCrowd = null;
    el.douyinStatus.textContent = "失败";
    el.douyinResult.innerHTML = `<span class="mini-title">${error.message}</span>`;
  } finally {
    el.douyinScanBtn.disabled = false;
  }
}

async function fetchDouyinData(issue) {
  if (DOUYIN_SAMPLE_API) {
    try {
      return await fetchJson(`${DOUYIN_SAMPLE_API}?issue=${issue}&refresh=${Date.now()}`, null, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: el.douyinInput.value })
      });
    } catch {
      // Static hosts such as GitHub Pages cannot handle POST APIs.
    }
  }

  const staticData = await fetchJson(null, `${STATIC_DATA_BASE}douyin-samples.json`);
  const pasted = summarizeTextSamples(issue, el.douyinInput.value, "粘贴的抖音图文/评论/OCR 文本");
  return mergeSampleData(issue, staticData, pasted);
}

function parseCrowdLine(line) {
  const nums = line.match(/\d{1,2}/g)?.map(Number).filter(Boolean) || [];
  if (nums.length < 7) return null;
  return {
    front: nums.slice(0, 5).filter((n) => n >= 1 && n <= 35),
    back: nums.slice(5, 7).filter((n) => n >= 1 && n <= 12)
  };
}

function analyzeCrowd() {
  const samples = el.crowdInput.value
    .split(/\n+/)
    .map(parseCrowdLine)
    .filter((sample) => sample && sample.front.length === 5 && sample.back.length === 2);

  if (!samples.length) {
    el.crowdResult.innerHTML = `<span class="mini-title">还没有识别到有效样本。每行写 5 个前区 + 2 个后区即可。</span>`;
    return;
  }

  const front = [...countNumbers(samples, FRONT_MAX, "front")]
    .map(([n, count]) => ({ n, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const back = [...countNumbers(samples, BACK_MAX, "back")]
    .map(([n, count]) => ({ n, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  state.manualCrowd = { front, back };

  el.crowdResult.innerHTML = `
    <span class="mini-title">已分析 ${samples.length} 组样本，出现多的会参与组合避热。</span>
    <div class="balls">${front.map((x) => `${ball(x.n, "front")}<span class="score">x${x.count}</span>`).join("")}</div>
    <div class="balls">${back.map((x) => `${ball(x.n, "back")}<span class="score">x${x.count}</span>`).join("")}</div>
  `;
  generateCombos();
}

el.refreshBtn.addEventListener("click", loadData);
el.rangeSelect.addEventListener("change", loadData);
el.windowSelect.addEventListener("change", () => {
  if (state.draws.length) render();
});
el.generateBtn.addEventListener("click", generateCombos);
el.publicScanBtn.addEventListener("click", loadPublicSamples);
el.douyinScanBtn.addEventListener("click", loadDouyinSamples);
el.clearDouyinBtn.addEventListener("click", () => {
  el.douyinInput.value = "";
  el.douyinResult.innerHTML = "";
  el.douyinStatus.textContent = "未抓取";
  state.douyinCrowd = null;
  generateCombos();
});
el.analyzeCrowdBtn.addEventListener("click", analyzeCrowd);
el.clearCrowdBtn.addEventListener("click", () => {
  el.crowdInput.value = "";
  el.crowdResult.innerHTML = "";
  state.manualCrowd = null;
  generateCombos();
});
el.machineAnalyzeBtn.addEventListener("click", analyzeMachineReverse);
el.clearMachineBtn.addEventListener("click", () => {
  el.machineInput.value = "";
  el.machineResult.innerHTML = "";
  el.machineStatus.textContent = "未分析";
  state.machineReverse = null;
});

loadData();
