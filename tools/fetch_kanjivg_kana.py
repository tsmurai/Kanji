"""
data/questions.json の答えに含まれる、送り仮名(ひらがな・カタカナ)の
KanjiVGストロークデータを kanjivg/ フォルダに取得する。
漢字と同じフォルダ・同じ命名(codepoint.svg)で保存するので、
アプリ側は文字が漢字かどうかを気にせず同じ仕組みで読み込める。
"""
import json
import re
import time
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
OUT_DIR = ROOT / "kanjivg"

BASE_URL = "https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/{}.svg"
KANJI_RE = re.compile(r"[々一-鿿㐀-䶿]")


def to_codepoint_hex(ch: str) -> str:
    return format(ord(ch), "05x")


def fetch(codepoint: str) -> bytes | None:
    url = BASE_URL.format(codepoint)
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            return resp.read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def main():
    OUT_DIR.mkdir(exist_ok=True)
    with open(DATA_DIR / "questions.json", encoding="utf-8") as f:
        questions = json.load(f)

    kana_chars = set()
    for q in questions:
        for ch in q["answer"]:
            if ch.strip() and not KANJI_RE.match(ch):
                kana_chars.add(ch)

    print(f"kana chars found: {len(kana_chars)} -> {''.join(sorted(kana_chars))}")

    ok, skipped, failed = 0, 0, 0
    missing = []
    for ch in sorted(kana_chars):
        cp = to_codepoint_hex(ch)
        out_path = OUT_DIR / f"{cp}.svg"
        if out_path.exists():
            skipped += 1
            continue
        data = fetch(cp)
        if data is None:
            failed += 1
            missing.append(ch)
        else:
            out_path.write_bytes(data)
            ok += 1
        time.sleep(0.05)

    print(f"done. fetched={ok} skipped(existing)={skipped} missing={failed}")
    if missing:
        print("missing chars:", "".join(missing))


if __name__ == "__main__":
    main()
