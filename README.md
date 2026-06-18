# 大乐透趋势分析台

一个本地静态网站加轻量 Node 代理，用公开开奖数据做大乐透趋势分析。

## 运行

```bash
npm start
```

打开 `http://localhost:5173`。

## 部署到长期网址

当前仓库同时支持两种部署方式：

- GitHub Pages：固定公开网址，使用 GitHub Actions 每 15 分钟生成一次静态数据。
- Render / Railway：完整 Node 后端实时接口，适合后续要更强抓取能力时使用。

### GitHub Pages

推送到 `main` 后，`.github/workflows/pages.yml` 会自动运行：

1. 调用 `node scripts/generate-data.js` 生成 `data/*.json`。
2. 发布到 GitHub Pages。
3. 每 15 分钟按计划重新发布一次，刷新历史开奖、公开网页样本和抖音公开索引摘要。

固定地址格式：

```text
https://bradieroquemore-cpu.github.io/dlt-insight-board/
```

线上静态版无法直接读取用户电脑里的 Chrome 抖音标签页；需要把抖音图文文案、分享链接文字或截图 OCR 文本粘贴到页面里，浏览器会本地即时解析。

### Render

1. 把项目推到 GitHub。
2. 打开 Render，新建 `Web Service`，选择这个仓库。
3. Render 会读取 `render.yaml`；也可以手动设置：
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Health Check Path: `/api/health`
4. 部署成功后，Render 会给一个固定网址，例如 `https://你的服务名.onrender.com`。

### Railway

1. 新建 Railway Project，选择 GitHub 仓库。
2. Start Command 使用 `npm start`。
3. 生成 Public Domain 后即可长期访问。

## 功能

- 同步中国体彩网公开开奖数据，默认近 180 期。
- 展示最新开奖、奖池、前区/后区热度图。
- 计算热门号码、杀号参考、形态指标。
- 生成 2 注统计参考组合。
- 热度、公开样本和抖音样本会在页面打开后自动刷新，并每 15 分钟重新更新一次。
- 抓取公开网页里的大乐透推荐、晒票、已买等文本样本，统计公开热号并在组合生成时避开。
- 页面刷新时自动尝试抖音公开搜索、搜索索引摘要和抖音分享链接采样；抖音触发登录/验证码时，可粘贴图文文案或截图 OCR 文本继续分析。
- 支持粘贴社区或自有号码样本，做本地“人气号码”统计并参与避热。
- 支持粘贴店家机选 10 注，按“每注最多借 0-2 个号”的约束，从机选号码池重组 2 注反推组合。
- 提供开奖、走势和资讯入口。

## 数据说明

历史开奖来自中国体彩网公开接口，页面通过 `server.js` 代理请求，避免浏览器跨域和接口风控问题。

“本期大多数人选的号码”没有官方公开实时分布，本项目不会伪造该数据；公开抓取只统计可访问网页文本中的推荐/晒票/已买号码。如果你有来自社区、群聊或平台展示的样本，也可以粘贴到页面里做本地统计。

## 提醒

彩票开奖结果是随机事件，本工具只做统计分析和娱乐参考，不保证命中，也不提供投注功能。
