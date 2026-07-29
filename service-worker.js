const CACHE_NAME = "kanji-app-v2";

// 初回訪問時にまとめて取得しておく(オフラインでも起動できるようにするため)
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./src/css/style.css",
  "./src/js/app.js",
  "./src/js/data.js",
  "./src/js/kanjivg.js",
  "./src/js/canvas.js",
  "./src/js/judge.js",
  "./src/js/geometry.js",
  "./src/js/store.js",
  "./src/js/sessionSummary.js",
  "./data/questions.json",
  "./data/kanji_index.json",
  "./data/question_index.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

// KanjiVGのお手本SVGとアイコンは中身が変わらないので、一度取得したらキャッシュを使い続ける。
// それ以外(アプリ本体・問題データ)は妻のエクセル更新やアプリ修正を反映させる必要があるため、
// 常にネットワークを先に見る。キャッシュ優先にすると古いJSや古い問題データが
// iPadに残り続けてしまう。
function isImmutable(url) {
  return url.pathname.includes("/kanjivg/") || url.pathname.includes("/icons/");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, res.clone());
  }
  return res;
}

async function networkFirst(request) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, res.clone());
    }
    return res;
  } catch (err) {
    // オフライン時はここに来る。取得済みのものがあればそれで起動する。
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(isImmutable(url) ? cacheFirst(event.request) : networkFirst(event.request));
});
