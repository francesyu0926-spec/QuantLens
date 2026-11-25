from pathlib import Path

# 仅 A 股：设置环境变量 QUANTLENS_MARKET=a_share（默认即为 a_share）

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "quantlens.db"

KLINE_WINDOW = 500
WS_HOST = "127.0.0.1"
WS_PORT = 8765

# Live data poll intervals (seconds)
AKSHARE_POLL_SEC = 5
CRYPTO_POLL_SEC = 5
US_POLL_SEC = 15