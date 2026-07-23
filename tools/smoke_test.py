"""
簡易動作確認スクリプト。
`python -m http.server 8080` でアプリを配信した状態で実行する。
ユーザー選択→ホーム→出題→手書き→採点→次の問題、まで一通り自動操作して
コンソールエラーが出ていないかを確認する。
"""
from pathlib import Path

from playwright.sync_api import sync_playwright

SHOT_DIR = Path(__file__).resolve().parent.parent / "tools" / "_screens"


def draw_stroke(page, box, x1, y1, x2, y2):
    page.mouse.move(box["x"] + x1, box["y"] + y1)
    page.mouse.down()
    page.mouse.move(box["x"] + (x1 + x2) / 2, box["y"] + (y1 + y2) / 2, steps=5)
    page.mouse.move(box["x"] + x2, box["y"] + y2, steps=5)
    page.mouse.up()


def main():
    SHOT_DIR.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        page = browser.new_page(viewport={"width": 500, "height": 900})
        errors = []
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda exc: errors.append(f"pageerror: {exc}"))

        page.goto("http://localhost:8080/index.html")
        page.wait_for_selector("#screen-user:not([hidden])")
        page.click(".user-select-btn >> nth=0")
        page.wait_for_selector("#screen-home:not([hidden])")
        page.click("#startPracticeBtn")
        page.wait_for_selector("#screen-practice:not([hidden])")
        page.wait_for_timeout(600)

        print("sentence:", page.inner_text("#questionSentence"))

        canvases = page.query_selector_all(".handwriting-canvas")
        for c in canvases:
            box = c.bounding_box()
            draw_stroke(page, box, 15, 15, box["width"] - 15, 15)
            draw_stroke(page, box, box["width"] / 2, 10, box["width"] / 2, box["height"] - 10)
            draw_stroke(page, box, 15, box["height"] - 15, box["width"] - 15, box["height"] - 15)

        page.screenshot(path=str(SHOT_DIR / "drawn.png"))
        page.click("#gradeBtn")
        page.wait_for_timeout(300)
        page.screenshot(path=str(SHOT_DIR / "result.png"))

        print("resultArea:", page.inner_text("#resultArea"))
        print("console errors (favicon 404 is expected/harmless):", errors)

        browser.close()


if __name__ == "__main__":
    main()
