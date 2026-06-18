import http from "node:http";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const execFileAsync = promisify(execFile);
const PORT = Number(process.env.PORT || 5173);
const API =
  "https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const PUBLIC_SOURCE_INDEXES = [
  {
    name: "中彩网大乐透数据分析",
    url: "https://www.zhcw.com/czfw/sjfx/dlt/",
    base: "https://www.zhcw.com"
  },
  {
    name: "足彩网大乐透预测频道",
    url: "https://news.zgzcw.com/dlt/index.shtml",
    base: "https://news.zgzcw.com"
  }
];
const DOUYIN_SEARCH_TERMS = ["大乐透{issue} 已买", "大乐透{issue} 图文", "大乐透{issue} 号码"];
const DOUYIN_INDEX_TERMS = [
  "site:douyin.com 大乐透{issue} 已买 前区 后区",
  "site:douyin.com 大乐透{issue} 图文 号码",
  "site:douyin.com 大乐透{issue} 推荐 已买"
];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

let cache = new Map();

function send(res, status, data, headers = {}) {
  res.writeHead(status, {
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(data);
}

function sendJson(res, status, payload) {
  send(res, status, JSON.stringify(payload), {
    "Content-Type": "application/json; charset=utf-8"
  });
}

async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  if (!body.trim()) return {};
  return JSON.parse(body);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function fetchPage(pageNo, pageSize) {
  const url = new URL(API);
  url.search = new URLSearchParams({
    gameNo: "85",
    provinceId: "0",
    pageSize: String(pageSize),
    isVerify: "1",
    pageNo: String(pageNo)
  });

  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Referer: "https://www.sporttery.cn/zst/dlt/",
      Accept: "application/json,text/plain,*/*"
    }
  });

  const text = await response.text();
  if (!response.ok || text.trim().startsWith("<")) {
    throw new Error(`体彩接口返回异常：HTTP ${response.status}`);
  }
  return JSON.parse(text);
}

async function getHistory(limit) {
  const pageSize = 30;
  const pagesNeeded = Math.ceil(limit / pageSize);
  const key = `limit:${limit}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < 10 * 60 * 1000) {
    return cached.payload;
  }

  const all = [];
  let meta = null;
  for (let page = 1; page <= pagesNeeded; page += 1) {
    const json = await fetchPage(page, pageSize);
    if (!json?.success || !json?.value?.list) {
      throw new Error(json?.errorMessage || "体彩接口没有返回开奖列表");
    }
    meta = json.value;
    all.push(...json.value.list);
  }

  const payload = {
    source: "中国体彩网公开开奖接口",
    sourceUrl: "https://www.sporttery.cn/zst/dlt/",
    fetchedAt: new Date().toISOString(),
    total: meta?.total || all.length,
    latestPoolDraw: meta?.lastPoolDraw || all[0] || null,
    list: all.slice(0, limit)
  };
  cache.set(key, { time: Date.now(), payload });
  return payload;
}

function decodeEntities(text) {
  return text
    .replace(/&#32;/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<(p|br|div|li|h1|h2|h3)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\n{2,}/g, "\n")
      .trim()
  );
}

function cleanTitle(title) {
  return title
    .replace(/\s+/g, " ")
    .split(/ 来源：| 上期开奖号码| 三区上期| 前区:| 后区:/)[0]
    .trim();
}

function absoluteUrl(href, base) {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    },
    signal: AbortSignal.timeout(9000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function extractUrls(text) {
  return [...new Set(text.match(/https?:\/\/[^\s"'<>，。]+/g) || [])];
}

function extractAnchors(html, source) {
  const anchors = [];
  const regex = /<a\b[^>]*href=["']([^"']+)["'][^>]*(?:title=["']([^"']+)["'])?[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(regex)) {
    const href = absoluteUrl(match[1], source.base);
    if (!href) continue;
    const title = cleanTitle(stripTags(match[2] || match[3] || ""));
    anchors.push({ title, url: href, source: source.name });
  }
  return anchors;
}

function duckDuckGoUrl(query) {
  return `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
}

function unwrapDuckDuckGoUrl(href) {
  try {
    const url = new URL(href, "https://duckduckgo.com");
    const wrapped = url.searchParams.get("uddg");
    return wrapped ? decodeURIComponent(wrapped) : url.href;
  } catch {
    return href;
  }
}

function extractDuckDuckGoResults(html) {
  const results = [];
  const itemRegex = /<div class="result[\s\S]*?(?=<div class="result|<\/body>)/gi;
  for (const item of html.matchAll(itemRegex)) {
    const block = item[0];
    const href = block.match(/class="result__a"[^>]*href="([^"]+)"/i)?.[1];
    const title = cleanTitle(stripTags(block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/i)?.[1] || ""));
    const snippet = stripTags(block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i)?.[1] || "");
    const url = href ? unwrapDuckDuckGoUrl(href) : "";
    if (!title && !snippet) continue;
    results.push({ title, snippet, url });
  }
  return results;
}

async function readChromeDouyinTabs() {
  const script = `
tell application "Google Chrome"
  set outText to ""
  repeat with w in windows
    repeat with t in tabs of w
      set tabUrl to URL of t as text
      if tabUrl contains "douyin.com/search" or tabUrl contains "douyin.com/video" or tabUrl contains "douyin.com/note" then
        set tabTitle to title of t as text
        set tabText to execute t javascript "document.body ? document.body.innerText.slice(0, 20000) : ''"
        set outText to outText & "URL: " & tabUrl & linefeed & "TITLE: " & tabTitle & linefeed & tabText & linefeed & "-----DOUYIN-TAB-----" & linefeed
      end if
    end repeat
  end repeat
  return outText
end tell
`;

  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], {
      timeout: 12000,
      maxBuffer: 1024 * 1024 * 4
    });
    const tabs = stdout
      .split("-----DOUYIN-TAB-----")
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => {
        const url = chunk.match(/^URL:\s*(.+)$/m)?.[1]?.trim() || "";
        const title = chunk.match(/^TITLE:\s*(.+)$/m)?.[1]?.trim() || "Chrome 抖音页面";
        const text = chunk.replace(/^URL:.*$/m, "").replace(/^TITLE:.*$/m, "").trim();
        return { title, url, text };
      });
    return { tabs };
  } catch (error) {
    const message = String(error.stderr || error.message || error);
    const needsPermission = /AppleScript 执行 JavaScript|允许 Apple 事件中的 JavaScript|execute JavaScript/i.test(message);
    return {
      tabs: [],
      error: needsPermission
        ? "Chrome 已打开抖音页面，但需要开启：查看 > 开发者 > 允许 Apple 事件中的 JavaScript"
        : `无法读取 Chrome 抖音标签页：${message.slice(0, 180)}`
    };
  }
}

async function discoverPublicArticles(issue) {
  const discovered = [];
  for (const source of PUBLIC_SOURCE_INDEXES) {
    try {
      const html = await fetchText(source.url);
      const anchors = extractAnchors(html, source)
        .filter((anchor) => {
          const title = anchor.title;
          return (
            title.includes("大乐透") &&
            title.includes(String(issue)) &&
            /(推荐|预测|走势|综合|定胆|杀号|看)/.test(title) &&
            !/(开奖结果|开奖公告|活动|规则|结束的公告)/.test(title)
          );
        })
        .slice(0, 8);
      discovered.push(...anchors);
    } catch {
      discovered.push({
        title: `${source.name}暂时无法访问`,
        url: source.url,
        source: source.name,
        unavailable: true
      });
    }
  }

  const unique = new Map();
  for (const item of discovered) {
    if (!item.unavailable && !unique.has(item.url)) unique.set(item.url, item);
  }
  return [...unique.values()];
}

function numbersFromText(text) {
  return (text.match(/(?<!\d)\d{1,2}(?!\d)/g) || []).map(Number);
}

function addCount(map, n) {
  map.set(n, (map.get(n) || 0) + 1);
}

function extractMentions(html, article) {
  const plain = stripTags(html);
  const lines = plain
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const defaultZone = article.title.includes("后区")
    ? "back"
    : article.title.includes("前区")
      ? "front"
      : null;
  const mentions = [];
  let activeZone = defaultZone;

  for (const line of lines) {
    if (/内容分析|仅供参考|购彩有风险|责任编辑|为您推荐/.test(line)) {
      activeZone = defaultZone;
      continue;
    }
    if (/综合推荐/.test(line)) {
      activeZone = /后区/.test(line) ? "back" : /前区/.test(line) ? "front" : defaultZone;
    }
    const hasKeyword = /(推荐|精选|胆码|独胆|三胆|双胆|胆|看好|关注|参考|复式|单挑|已买|晒|投注|号码)/.test(line);
    const hasContextNumberLine = Boolean(activeZone && /^((前区|后区)?\d+码|精选|独胆|三胆|双胆)/.test(line));
    if (!hasKeyword && !hasContextNumberLine) continue;
    if (/(上期开奖号码|近\d+期|区间划分|大小划分|走势图|开奖)/.test(line)) continue;

    const keywordParts = line.split(/推荐|精选|胆码|独胆|三胆|双胆|胆|看好|关注|参考|复式|单挑|已买|晒|投注|号码/);
    const segment = keywordParts.length > 1 ? keywordParts.at(-1) : line;
    let nums = numbersFromText(segment).filter((n) => n >= 1 && n <= 35);
    if (!nums.length) nums = numbersFromText(line).filter((n) => n >= 1 && n <= 35);
    if (!nums.length) continue;

    if (/(已买|晒|投注|一组|[0-9一二三四五六七八九十]+组)/.test(line) && nums.length >= 14) {
      for (let index = 0; index + 6 < nums.length; index += 7) {
        mentions.push({
          zone: "front",
          nums: nums.slice(index, index + 5).filter((n) => n <= 35),
          line
        });
        mentions.push({
          zone: "back",
          nums: nums.slice(index + 5, index + 7).filter((n) => n <= 12),
          line
        });
      }
      continue;
    }

    const hasBack = /后区|蓝球|后区\d*码/.test(line) || activeZone === "back";
    const hasFront = /前区|红球|龙头|凤尾|第[一二三四五]位/.test(line) || activeZone === "front";

    if (hasBack && !hasFront) {
      const back = nums.filter((n) => n <= 12);
      if (back.length) mentions.push({ zone: "back", nums: back, line });
      continue;
    }

    if (hasFront && !hasBack) {
      const front = nums.filter((n) => n <= 35);
      if (front.length) mentions.push({ zone: "front", nums: front, line });
      continue;
    }

    if (nums.length >= 7) {
      mentions.push({ zone: "front", nums: nums.slice(0, 5).filter((n) => n <= 35), line });
      mentions.push({ zone: "back", nums: nums.slice(5, 7).filter((n) => n <= 12), line });
    } else if (nums.every((n) => n <= 12) && nums.length <= 6) {
      mentions.push({ zone: "back", nums, line });
    } else {
      mentions.push({ zone: "front", nums, line });
    }
  }
  return mentions;
}

function rankedCounts(map, max) {
  return [...map.entries()]
    .map(([n, count]) => ({ n, count }))
    .sort((a, b) => b.count - a.count || a.n - b.n)
    .slice(0, max);
}

function summarizeMentions(issue, sourceItems) {
  const frontCounts = new Map();
  const backCounts = new Map();
  const sources = [];
  let mentionCount = 0;

  for (const item of sourceItems) {
    const mentions = extractMentions(item.html || item.text || "", {
      title: item.title || "",
      url: item.url || ""
    });
    for (const mention of mentions) {
      mentionCount += 1;
      const target = mention.zone === "back" ? backCounts : frontCounts;
      for (const n of mention.nums) addCount(target, n);
    }
    sources.push({
      title: item.title,
      url: item.url,
      source: item.source,
      mentions: mentions.length,
      error: item.error
    });
  }

  return {
    issue: String(issue),
    fetchedAt: new Date().toISOString(),
    front: rankedCounts(frontCounts, 12),
    back: rankedCounts(backCounts, 8),
    avoidFront: rankedCounts(frontCounts, 6),
    avoidBack: rankedCounts(backCounts, 3),
    sourceCount: sources.filter((source) => source.mentions > 0).length,
    mentionCount,
    sources
  };
}

async function getPublicSamples(issue) {
  return getPublicSamplesLegacy(issue);
}

async function getPublicSamplesLegacy(issue) {
  const key = `public-legacy:${issue}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < 15 * 60 * 1000) {
    return cached.payload;
  }

  const articles = await discoverPublicArticles(issue);
  const frontCounts = new Map();
  const backCounts = new Map();
  const sources = [];
  let mentionCount = 0;

  for (const article of articles.slice(0, 12)) {
    try {
      const html = await fetchText(article.url);
      const mentions = extractMentions(html, article);
      for (const mention of mentions) {
        mentionCount += 1;
        const target = mention.zone === "back" ? backCounts : frontCounts;
        for (const n of mention.nums) addCount(target, n);
      }
      sources.push({
        title: article.title,
        url: article.url,
        source: article.source,
        mentions: mentions.length
      });
    } catch (error) {
      sources.push({
        title: article.title,
        url: article.url,
        source: article.source,
        error: error.message
      });
    }
  }

  const payload = {
    issue: String(issue),
    fetchedAt: new Date().toISOString(),
    sourceNote: "仅统计公开网页中的推荐、晒票、已买等文本，不代表官方投注分布。",
    front: rankedCounts(frontCounts, 12),
    back: rankedCounts(backCounts, 8),
    avoidFront: rankedCounts(frontCounts, 6),
    avoidBack: rankedCounts(backCounts, 3),
    sourceCount: sources.filter((source) => source.mentions > 0).length,
    mentionCount,
    sources
  };
  cache.set(key, { time: Date.now(), payload });
  return payload;
}

async function getDouyinSamples(issue, pastedText = "") {
  const sourceItems = [];
  const seenUrls = new Set();
  const pasted = String(pastedText || "").trim();

  const chrome = await readChromeDouyinTabs();
  if (chrome.tabs.length) {
    for (const tab of chrome.tabs) {
      sourceItems.push({
        title: tab.title || "Chrome 抖音搜索页",
        url: tab.url,
        source: "Chrome抖音标签页",
        text: tab.text
      });
    }
  } else if (chrome.error) {
    sourceItems.push({
      title: "Chrome 抖音标签页读取",
      source: "Chrome抖音标签页",
      text: "",
      error: chrome.error
    });
  } else {
    sourceItems.push({
      title: "Chrome 抖音标签页读取",
      source: "Chrome抖音标签页",
      text: "",
      error: "没有发现已打开的抖音搜索/视频/图文标签页"
    });
  }

  if (pasted) {
    sourceItems.push({
      title: "粘贴的抖音图文/评论/OCR 文本",
      source: "抖音手动导入",
      text: pasted
    });
  }

  for (const url of extractUrls(pasted).filter((item) => /douyin\.com|iesdouyin\.com/.test(item))) {
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);
    try {
      const html = await fetchText(url);
      const title =
        cleanTitle(stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")) ||
        "抖音公开分享页";
      sourceItems.push({
        title,
        url,
        source: "抖音分享链接",
        html
      });
    } catch (error) {
      sourceItems.push({
        title: "抖音分享链接无法读取",
        url,
        source: "抖音分享链接",
        text: "",
        error: error.message
      });
    }
  }

  for (const termTemplate of DOUYIN_SEARCH_TERMS) {
    const term = termTemplate.replace("{issue}", String(issue));
    const url = `https://www.douyin.com/search/${encodeURIComponent(term)}`;
    try {
      const html = await fetchText(url);
      const text = stripTags(html);
      if (/byted_acrawler|__ac_signature|window\.location\.reload/.test(html) || text.length < 80) {
        sourceItems.push({
          title: `抖音公开搜索：${term}`,
          url,
          source: "抖音公开搜索",
          text: "",
          error: "抖音搜索页需要浏览器校验，服务端未解析到图文内容"
        });
      } else {
        sourceItems.push({
          title: `抖音公开搜索：${term}`,
          url,
          source: "抖音公开搜索",
          html
        });
      }
    } catch (error) {
      sourceItems.push({
        title: `抖音公开搜索：${term}`,
        url,
        source: "抖音公开搜索",
        text: "",
        error: error.message
      });
    }
  }

  for (const termTemplate of DOUYIN_INDEX_TERMS) {
    const term = termTemplate.replace("{issue}", String(issue));
    const url = duckDuckGoUrl(term);
    try {
      const html = await fetchText(url);
      const results = extractDuckDuckGoResults(html)
        .filter((item) => /douyin\.com|抖音/.test(`${item.url} ${item.title} ${item.snippet}`))
        .slice(0, 6);
      if (!results.length) {
        sourceItems.push({
          title: `搜索索引：${term}`,
          url,
          source: "搜索索引摘要",
          text: "",
          error: "没有找到可解析的抖音摘要"
        });
        continue;
      }
      for (const result of results) {
        sourceItems.push({
          title: result.title || `搜索索引：${term}`,
          url: result.url || url,
          source: "搜索索引摘要",
          text: `${result.title}\n${result.snippet}`
        });
      }
    } catch (error) {
      sourceItems.push({
        title: `搜索索引：${term}`,
        url,
        source: "搜索索引摘要",
        text: "",
        error: error.message
      });
    }
  }

  return {
    ...summarizeMentions(issue, sourceItems),
    sourceNote:
      "抖音搜索/图文可能需要登录、验证码或 App 环境；本工具只解析公开可访问页面和你粘贴的分享文案/OCR 文本。"
  };
}

async function serveStatic(req, res) {
  const requestPath = new URL(req.url, `http://${req.headers.host}`).pathname;
  const safePath = normalize(decodeURIComponent(requestPath)).replace(/^(\.\.[/\\])+/, "");
  const fileName = safePath === "/" ? "index.html" : safePath.slice(1);
  const filePath = join(__dirname, fileName);

  if (!filePath.startsWith(__dirname)) {
    send(res, 403, "Forbidden", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  try {
    const data = await readFile(filePath);
    send(res, 200, data, {
      "Content-Type": MIME[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "public, max-age=60"
    });
  } catch {
    send(res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        name: "dlt-insight-board",
        time: new Date().toISOString()
      });
      return;
    }
    if (url.pathname === "/api/history") {
      const limit = clamp(Number(url.searchParams.get("limit") || 180), 30, 900);
      const data = await getHistory(limit);
      sendJson(res, 200, data);
      return;
    }
    if (url.pathname === "/api/public-samples") {
      let issue = url.searchParams.get("issue");
      if (!issue) {
        const history = await getHistory(30);
        issue = String(Number(history.list[0].lotteryDrawNum) + 1);
      }
      const data = await getPublicSamples(issue);
      sendJson(res, 200, data);
      return;
    }
    if (url.pathname === "/api/douyin-samples") {
      let issue = url.searchParams.get("issue");
      if (!issue) {
        const history = await getHistory(30);
        issue = String(Number(history.list[0].lotteryDrawNum) + 1);
      }
      const body = req.method === "POST" ? await readJsonBody(req) : {};
      const data = await getDouyinSamples(issue, body.text || "");
      sendJson(res, 200, data);
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    sendJson(res, 502, {
      error: error.message || "数据获取失败",
      hint: "可以稍后刷新；体彩接口有时会触发风控。"
    });
  }
});

server.listen(PORT, () => {
  console.log(`大乐透分析站已启动：http://localhost:${PORT}`);
});
