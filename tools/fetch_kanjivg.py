"""
data/kanji_index.json に含まれる各漢字について、KanjiVG のストロークSVGを取得し
kanjivg/ フォルダに保存する。既に取得済みのファイルはスキップする。
"""
import json
import time
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
OUT_DIR = ROOT / "kanjivg"

BASE_URL = "https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/{}.svg"


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
    with open(DATA_DIR / "kanji_index.json", encoding="utf-8") as f:
        kanji_index = json.load(f)

    missing = []
    ok, skipped, failed = 0, 0, 0

    for i, entry in enumerate(kanji_index):
        cp = entry["codepoint"]
        out_path = OUT_DIR / f"{cp}.svg"
        if out_path.exists():
            skipped += 1
            continue
        data = fetch(cp)
        if data is None:
            failed += 1
            missing.append(entry["char"])
        else:
            out_path.write_bytes(data)
            ok += 1
        if (i + 1) % 100 == 0:
            print(f"progress: {i + 1}/{len(kanji_index)}")
        time.sleep(0.02)

    print(f"done. fetched={ok} skipped(existing)={skipped} missing={failed}")
    if missing:
        print("missing chars:", "".join(missing))
        (DATA_DIR / "kanjivg_missing.json").write_text(
            json.dumps(missing, ensure_ascii=False, indent=2), encoding="utf-8"
        )


if __name__ == "__main__":
    main()
