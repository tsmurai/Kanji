from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

import excel_to_json


def test_question_ids_are_stable_and_referenceable():
    questions = excel_to_json.load_questions()
    assert questions

    first = questions[0]
    assert "id" in first
    assert "no" in first
    assert "reference" in first
    assert first["reference"] == first["id"]

    lookup = excel_to_json.build_question_lookup(questions)
    assert first["no"] in lookup["byNumber"]
    assert first["id"] in lookup["byReference"]
