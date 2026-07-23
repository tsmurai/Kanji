// KanjiVGのSVGを取得し、各画(ストローク)を等間隔サンプリングした点列に変換する。
import { kanjivgUrl } from "./data.js";
import { tailTurnAngle } from "./geometry.js";

export const KANJIVG_VIEWBOX = 109;

// 対角線に沿う払い系のストローク種別(KanjiVGの kvg:type 先頭文字)。
// ㇒ = 左払い(丿), ㇏ = 右払い(乀) の2種は視覚的に明確なため、はらいの目安として使う。
// ㇇ = 横撇(横から左払いへ続く画。例: 予・野 など)も、末尾は㇒と同じ払いのため同様に扱う。
const SWEEP_TYPES = new Set(["㇒", "㇏", "㇇"]);

// ㇕(横折: 例 口・田・日などの「コの字」の曲がり角)は、伝統的な運筆分類でも
// 「横折鉤(はねを伴う曲がり角)」とは明確に区別される、フックのない単純な折れ。
// 幾何学的な角度検出だけだと、この折れ角(しばしば90度前後)を誤って
// 「はね」と判定してしまう(361画・全はね判定の1/3を占めていた)ため、
// この種別はあらかじめ「はね」候補から除外する。
const BEND_ONLY_TYPES = new Set(["㇕"]);

// はね判定に使う末尾方向転換角度のしきい値(度)
// 1段階弱めて、少しだけ緩めに判定する。
export const HANE_ANGLE_THRESHOLD = 45;

const cache = new Map();

function svgPointsFromPath(pathEl, sampleCount) {
  const total = pathEl.getTotalLength();
  const points = [];
  for (let i = 0; i < sampleCount; i++) {
    const len = (total * i) / (sampleCount - 1);
    const p = pathEl.getPointAtLength(len);
    points.push({ x: p.x, y: p.y });
  }
  return { points, length: total };
}

function classifyStroke(kvgType, points) {
  const head = (kvgType || "").charAt(0);
  // 払い系(末尾が㇒のように払って終わる画)を先に判定する。㇇(横撇)のように
  // 途中の折れ角が大きく、角度検出だけだと「はね」に見えてしまう画もここで確定させる。
  if (SWEEP_TYPES.has(head)) return "harai";
  if (!BEND_ONLY_TYPES.has(head) && tailTurnAngle(points) > HANE_ANGLE_THRESHOLD) return "hane";
  return "tome";
}

export async function loadKanjiStrokes(codepoint, sampleCount = 32) {
  if (cache.has(codepoint)) return cache.get(codepoint);

  const res = await fetch(kanjivgUrl(codepoint));
  if (!res.ok) throw new Error(`KanjiVG data not found for ${codepoint}`);
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const pathEls = Array.from(doc.querySelectorAll("path[id]"));

  const strokes = pathEls.map((el, i) => {
    const { points, length } = svgPointsFromPath(el, sampleCount);
    const kvgType = el.getAttribute("kvg:type") || "";
    return {
      index: i,
      d: el.getAttribute("d"),
      kvgType,
      points,
      length,
      shapeType: classifyStroke(kvgType, points),
    };
  });

  const result = { codepoint, strokeCount: strokes.length, strokes, viewBox: KANJIVG_VIEWBOX };
  cache.set(codepoint, result);
  return result;
}
