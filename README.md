# A-share-LI

手机可打开的 A 股主板 Serenity 风格观察池应用。

这个项目采用“静态网页 + GitHub Actions 定时生成数据”的结构，不需要你的电脑长期运行后端服务。

## 当前功能

- 只覆盖 A 股主板可买范围：`000/001/002/003/600/601/603/605`
- 每个交易日收盘后由 GitHub Actions 生成最新股票池
- 手机网页展示：
  - 综合评分
  - 可买入信号
  - 可买入价格/下一触发价
  - 观察区间
  - 推荐接入价
  - 突破确认价
  - 不追高线
  - 首次推荐价和推荐后涨跌幅
  - 推荐以来最高涨幅和距高点回撤
  - 失效观察价
  - 是否适合现在介入
  - 产业链逻辑、催化剂、风险
- 保存历史 JSON，方便之后做每日推荐回访和模型复盘

## 本地运行

直接打开 `index.html` 即可查看静态页面。若浏览器限制本地 `fetch`，可启动一个简单服务：

```powershell
python -m http.server 5173
```

然后访问：

```text
http://127.0.0.1:5173
```

## 手动生成数据

需要 Python 3.10+。GitHub Actions 会自动使用 Python 3.11；如果在你的电脑上手动运行，请不要使用过旧的系统 Python。

```powershell
python -m pip install -r requirements.txt
python scripts/generate_pool.py
```

数据会写入：

- `data/latest.json`
- `data/review.json`
- `data/universe_scan.json`
- `data/history/YYYY-MM-DD.json`

## GitHub Pages 部署

推送到 GitHub 后，进入仓库：

1. 打开 `Settings`
2. 进入 `Pages`
3. Source 选择 `Deploy from a branch`
4. Branch 选择 `main`
5. Folder 选择 `/(root)`
6. 点击 `Save`

部署完成后，手机打开 Pages 给出的地址即可。

数据更新工作流仍在 `Actions` 里，每个交易日收盘后自动刷新 `data/latest.json`。

## 重要提示

本项目输出是研究观察和交易纪律辅助，不构成投资建议。A 股数据源、网页抓取和免费接口都可能出现延迟、缺失或限流，关键买卖前需要结合实时行情、公告、财报和个人风险承受能力复核。
