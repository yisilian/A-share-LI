# A-share-LI

手机可打开的 A 股主板 Serenity 风格观察池应用。

项目采用“静态网页 + GitHub Actions 定时生成数据”的结构，不需要你的电脑长期运行后端服务。推送到 GitHub Pages 后，手机可以直接访问网页。

## 当前功能

- 只观察 A 股主板可买范围：`000/001/002/003/600/601/603/605`
- 每个交易日按 10:00、14:30、20:00 三个时段自动刷新数据
- GitHub Actions 自动生成最新股票池和回访数据
- 网页展示：
  - 综合评分
  - 可买入信号
  - 可买入价格 / 下一触发价
  - 推荐接入价
  - 突破确认价
  - 不追高线
  - 主力资金流确认
  - 筹码结构
  - 回访收益与模型反馈
  - 产业链逻辑、催化剂、风险
- 回访中心保留历史推荐，即使股票被调出观察池也继续跟踪收益率
- 模拟交易模块：
  - 初始资金 100000 元
  - 以 100 股整数手模拟买入/卖出
  - 按 T+1 规则提示当日买入不可卖
  - 自动用最新观察池价格重估持仓市值和收益
  - 持仓与成交记录保存在当前浏览器本地

## 本地运行

直接打开 `index.html` 可以查看静态页面。若浏览器限制本地 `fetch`，可启动一个简单服务：

```powershell
python -m http.server 5173
```

然后访问：

```text
http://127.0.0.1:5173
```

## 手动生成数据

需要 Python 3.10+。GitHub Actions 默认使用 Python 3.11；如果在本地手动运行，请不要使用过旧的系统 Python。

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

## 重要提示

本项目输出是研究观察、交易纪律辅助和模拟交易记录，不构成确定买卖建议，也不会自动下单。A 股数据源、网页抓取和免费接口都可能出现延迟、缺失或限流；真实交易前需要结合实时行情、公告、财报、交易费用和个人风险承受能力复核。
