"""
漢字の要.xlsx を読み込み、アプリ用の JSON データを生成する。

出力:
  data/questions.json   … 穴埋め問題(熟語)のリスト
  data/kanji_index.json … 問題から抽出した単漢字のインデックス(苦手度付き)

「結果」列は 4=習熟済み寄り、1=間違いが多い という前提でスコア化している。
「カキコ」「カキコ2」列の意味は未確定のため、今回は使用しない。
"""
import json
import re
import unicodedata
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
XLSX_PATH = ROOT / "漢字の要.xlsx"
DATA_DIR = ROOT / "data"

# 問題データが入っている実データシートのみを対象にする
# (P6, P7... や これまでの× 等は印刷用ワークシートのため対象外)
# ここでは各シートの 1 列目が番号、2 列目が問題文、3 列目が答え、4 列目が結果(習熟度) という前提で読む。
SOURCE_SHEETS = ["P6-", "P48-50,68-93", "P51-52"]
EXCEL_COLUMN_MAP = {
    "number": 0,
    "sentence": 1,
    "answer": 2,
    "result": 3,
}

# 漢字とみなす Unicode 範囲 (CJK統合漢字 + 拡張A + 々)
KANJI_RE = re.compile(
    r"[々一-鿿㐀-䶿]"
)


def extract_kanji_chars(word: str) -> list[str]:
    if not word:
        return []
    return KANJI_RE.findall(word)


def to_codepoint_hex(ch: str) -> str:
    return format(ord(ch), "05x")


def load_questions() -> list[dict]:
    wb = openpyxl.load_workbook(XLSX_PATH, data_only=True)
    questions = []
    seen_ids = set()

    for sheet_name in SOURCE_SHEETS:
        ws = wb[sheet_name]
        rows = ws.iter_rows(min_row=2, values_only=True)
        auto_seq = 0
        for row in rows:
            number = row[EXCEL_COLUMN_MAP["number"]]
            sentence = row[EXCEL_COLUMN_MAP["sentence"]]
            answer = row[EXCEL_COLUMN_MAP["answer"]]
            result = row[EXCEL_COLUMN_MAP["result"]] if len(row) > EXCEL_COLUMN_MAP["result"] else None
            if number is None or sentence is None or answer is None:
                continue

            no_str = str(number).strip()
            # 「言葉ナビ」など番号が重複するものは連番を振って一意化する
            if no_str in seen_ids:
                auto_seq += 1
                qid = f"{sheet_name}:{no_str}:{auto_seq}"
            else:
                qid = f"{sheet_name}:{no_str}"
            seen_ids.add(qid)

            page_match = re.match(r"^(\d+)-", no_str)
            page = int(page_match.group(1)) if page_match else None

            blank_match = re.search(r"【(.+?)】", str(sentence))
            yomi = blank_match.group(1) if blank_match else None

            # 結果セルに改行等が混じっているケースを吸収 ('4\n' など)
            mastery = None
            if isinstance(result, (int, float)):
                mastery = int(result)
            elif isinstance(result, str):
                m = re.search(r"\d+", result)
                if m:
                    mastery = int(m.group())

            # 「尊い（貴い）」のような別解の注記は手書き練習の対象外として取り除く
            clean_answer = re.sub(r"[（(].*?[）)]", "", str(answer).strip()).strip()

            questions.append(
                {
                    "id": qid,
                    "reference": qid,
                    "no": no_str,
                    "page": page,
                    "sentence": str(sentence).strip(),
                    "answer": clean_answer,
                    "yomi": yomi,
                    "mastery": mastery,
                    "source": sheet_name,
                }
            )

    return questions


def build_kanji_index(questions: list[dict]) -> list[dict]:
    index: dict[str, dict] = {}

    for q in questions:
        chars = extract_kanji_chars(q["answer"])
        for ch in chars:
            entry = index.get(ch)
            if entry is None:
                entry = {
                    "char": ch,
                    "codepoint": to_codepoint_hex(ch),
                    "questionIds": [],
                    "masteryValues": [],
                }
                index[ch] = entry
            entry["questionIds"].append(q["id"])
            if q["mastery"] is not None:
                entry["masteryValues"].append(q["mastery"])

    result = []
    for entry in index.values():
        mv = entry.pop("masteryValues")
        count = len(entry["questionIds"])
        worst = min(mv) if mv else None
        avg = round(sum(mv) / len(mv), 2) if mv else None
        # 苦手優先度: 最低スコアが低いほど優先。未評価(mv無し)は中間扱い。
        if worst is None:
            priority = 2
        else:
            priority = 5 - worst
        result.append(
            {
                **entry,
                "count": count,
                "worstMastery": worst,
                "avgMastery": avg,
                "priority": priority,
            }
        )

    result.sort(key=lambda e: (-e["priority"], -e["count"]))
    return result


def build_question_lookup(questions: list[dict]) -> dict:
    by_number: dict[str, list[str]] = {}
    by_reference: dict[str, dict] = {}

    for q in questions:
        number = q["no"]
        by_number.setdefault(number, []).append(q["id"])
        by_reference[q["id"]] = {
            "number": number,
            "reference": q["reference"],
            "source": q["source"],
        }

    return {
        "byNumber": by_number,
        "byReference": by_reference,
    }


def main():
    DATA_DIR.mkdir(exist_ok=True)

    questions = load_questions()
    kanji_index = build_kanji_index(questions)
    question_lookup = build_question_lookup(questions)

    with open(DATA_DIR / "questions.json", "w", encoding="utf-8") as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)

    with open(DATA_DIR / "kanji_index.json", "w", encoding="utf-8") as f:
        json.dump(kanji_index, f, ensure_ascii=False, indent=2)

    with open(DATA_DIR / "question_index.json", "w", encoding="utf-8") as f:
        json.dump(question_lookup, f, ensure_ascii=False, indent=2)

    print(f"questions: {len(questions)}")
    print(f"unique kanji: {len(kanji_index)}")
    print("sample kanji entries:")
    for e in kanji_index[:5]:
        print(" ", e)


if __name__ == "__main__":
    main()
