from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "quantlens.db"

KLINE_WINDOW = 500
WS_HOST = "127.0.0.1"
WS_PORT = 8765

# Demo mode: synthesize ticks when no exchange API key is configured
DEMO_MODE = True
DEMO_TICK_MS = 500