import { mkdir, readFile, writeFile } from "node:fs/promises";
import { getDouyinSamples, getHistory, getPublicSamples } from "../server.js";

const DATA_DIR = new URL("../data/", import.meta.url);
const HISTORY_LIMITS = [90, 180, 360, 720];

async function writeJson(name, payload) {
  await writeFile(new URL(name, DATA_DIR), `${JSON.stringify(payload, null, 2)}\n`);
}

async function readExistingJson(name) {
  return JSON.parse(await readFile(new URL(name, DATA_DIR), "utf8"));
}

async function getHistoryWithFallback(limit) {
  try {
    return await getHistory(limit);
  } catch (error) {
    const existing = await readExistingJson(`history-${limit}.json`);
    return {
      ...existing,
      source: `${existing.source || "静态历史开奖数据"}（接口暂不可用，沿用上次生成结果）`,
      fetchError: error.message
    };
  }
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });

  const histories = new Map();
  for (const limit of HISTORY_LIMITS) {
    const history = await getHistoryWithFallback(limit);
    histories.set(limit, history);
    await writeJson(`history-${limit}.json`, {
      ...history,
      staticGeneratedAt: new Date().toISOString()
    });
  }

  const baseHistory = histories.get(180) || histories.values().next().value;
  const issue = String(Number(baseHistory.list[0].lotteryDrawNum) + 1);

  try {
    await writeJson("public-samples.json", await getPublicSamples(issue));
  } catch (error) {
    await writeJson("public-samples.json", {
      issue,
      sourceCount: 0,
      mentionCount: 0,
      avoidFront: [],
      avoidBack: [],
      sources: [{ title: "公开样本生成失败", error: error.message }]
    });
  }

  try {
    await writeJson("douyin-samples.json", await getDouyinSamples(issue, ""));
  } catch (error) {
    await writeJson("douyin-samples.json", {
      issue,
      sourceCount: 0,
      mentionCount: 0,
      avoidFront: [],
      avoidBack: [],
      sources: [{ title: "抖音样本生成失败", error: error.message }]
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
