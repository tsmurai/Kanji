"""
開発確認用サーバー。すべての応答に Cache-Control: no-store を付け、
ブラウザ側のキャッシュによって古いJSが表示され続ける問題を防ぐ。
使い方: python tools/serve_no_cache.py [ポート番号(省略時8080)]
"""
import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    # ブラウザは1ページで複数のリソースを並行して取得するため、
    # 単一スレッドのHTTPServerだと片方の接続が滞った際にページ全体が固まる。
    server = ThreadingHTTPServer(("0.0.0.0", port), NoCacheHandler)
    print(f"serving with no-cache headers on 0.0.0.0:{port}")
    server.serve_forever()
