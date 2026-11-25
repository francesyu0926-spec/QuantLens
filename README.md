# QuantLens

轻量级实时金融行情监控与技术指标分析终端。桌面壳使用 **Tauri + React**，计算与行情引擎使用 **Python FastAPI**（可按架构图对接 ccxt / yfinance / akshare）。

## 架构

```
┌─────────────────┐     WebSocket      ┌──────────────────────────┐
│  React 终端 UI   │ ◄──────────────── │  FastAPI 分发网关 (/ws)   │
│  K线 / 自选 / 信号 │                    └───────────┬──────────────┘
└────────▲────────┘                                │
         │ Tauri WebView                           │ 事件驱动
┌────────┴────────┐                                ▼
│  Tauri (Rust)   │                    ┌──────────────────────────┐
│  可选 Sidecar   │ ──spawn──►         │  采集器 + 指标/策略引擎   │
└─────────────────┘                    │  滑动 K 线窗口 · SQLite   │
                                       └──────────────────────────┘
```

| 模块 | 实现 |
|------|------|
| 行情采集 | A 股 **AKShare** · 加密货币 **CCXT/Binance** · 美股 **yfinance**，均为 1 分钟线轮询 |
| 指标引擎 | `backend/app/indicators.py` — EMA、RSI、MACD、布林带、ATR（pandas / pandas-ta） |
| 策略扫描 | `backend/app/rules.py` — RSI 超卖、布林下轨、EMA 金叉 |
| 实时分发 | `backend/app/main.py` — `ws://127.0.0.1:8765/ws?symbol=BTC/USDT` |
| 本地存储 | SQLite `backend/data/quantlens.db` |
| 前端 | 周期切换、主图 EMA/BOLL/成交量、MACD/RSI 副图、十字光标图例、金叉/死叉标记 |

## 环境要求

- **Node.js** 18+
- **Python** 3.11+
- **Rust + Tauri 依赖**（仅打包桌面客户端时需要；当前机器若未装 Rust，可先跑 Web 模式）

## 快速开始（Web 开发模式）

开两个终端：

**1. 启动后端**

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python run.py
```

**2. 启动前端**

```powershell
cd frontend
copy .env.example .env
npm install --registry https://registry.npmjs.org
npm run dev
```

浏览器或 Vite 地址：<http://localhost:1420>

也可使用脚本：`.\scripts\dev-backend.ps1` / `.\scripts\dev-frontend.ps1`

> 若 `npm install` 仍走过期镜像，请在本机执行：`npm config set registry https://registry.npmjs.org`

## Tauri 桌面端

1. 安装 [Rust](https://rustup.rs/) 与 [Tauri 前置依赖](https://v2.tauri.app/start/prerequisites/)
2. 在 `frontend` 目录安装依赖后：

```powershell
cd frontend
npm run tauri dev
```

（`tauri.conf.json` 位于 `src-tauri/`，构建时会自动拉起前端 dev server。）

可选：将 Python 后端打成 Tauri **sidecar** 并放入 `src-tauri/binaries/quantlens-engine-x86_64-pc-windows-msvc.exe`，桌面启动时会尝试自动拉起引擎。

## 接入真实行情

- **A 股**：`600519`、`000001` → AKShare（东方财富 1 分钟线，失败回退新浪）
- **加密货币**：`BTC/USDT` → CCXT（默认 **KuCoin**；本机若 Binance 返回 451 会自动不可用，可设环境变量 `QUANTLENS_CRYPTO_EXCHANGE=kucoin`）
- **美股**：`AAPL` → yfinance 1 分钟线（近 5 个交易日）

## 目录结构

```
QuantLens/
├── frontend/          # React + Vite UI
├── backend/           # FastAPI 引擎
├── src-tauri/         # Tauri 桌面壳
└── scripts/           # Windows 开发脚本
```

## License

MIT