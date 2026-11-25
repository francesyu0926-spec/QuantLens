from .akshare_a import is_a_share


def classify_market(symbol: str) -> str:
    if is_a_share(symbol):
        return "a_share"
    if "/" in symbol:
        return "crypto"
    s = symbol.upper().strip()
    if s and s.replace(".", "").isalnum() and any(ch.isalpha() for ch in s):
        return "us_equity"
    return "unknown"