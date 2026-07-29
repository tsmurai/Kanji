// KanjiVGのSVGを取得し、各画(ストローク)を等間隔サンプリングした点列に変換する。
import { kanjivgUrl } from "./data.js";
import { tailTurnAngle } from "./geometry.js";

export const KANJIVG_VIEWBOX = 109;

// KanjiVGの kvg:type は Unicode の CJK Strokes (㇀〜㇣) に対応していて、
// その名前の末尾がその画の終わり方を表している。
//   末尾が「鉤」 → はねる画      (例: ㇚ 竪鉤 = 亅、㇆ 横折鉤 = 月の2画目)
//   末尾が「撇」「捺」「提」 → はらう画 (例: ㇒ 撇 = 丿、㇋ 横折折撇 = しんにょう)
//   それ以外 → とめる画          (例: ㇕ 横折 = 口の2画目)
//
// 以前は末尾の方向転換角度だけで「はね」を推定していたが、それだと
// しんにょう(㇋)のように途中で大きく折れてから払う画を「はね」と誤判定し、
// 正しく書けているのに「はねが不十分」と出てしまっていた。
// 種別が分かる画は種別で判定し、幾何学的な推定は種別が無い画だけに使う。
const HOOK_TYPES = new Set(["㇁", "㇂", "㇃", "㇆", "㇈", "㇉", "㇌", "㇖", "㇚", "㇟", "㇠", "㇡", "㇢"]);
const SWEEP_TYPES = new Set(["㇀", "㇇", "㇋", "㇊", "㇏", "㇒", "㇓", "㇙", "㇝"]);

// 種別が指定されていない画にのみ使う、はね判定の末尾方向転換角度のしきい値(度)
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
  if (HOOK_TYPES.has(head)) return "hane";
  if (SWEEP_TYPES.has(head)) return "harai";
  if (head) return "tome";
  // 種別が無い画(全体の2%弱)だけ、末尾の曲がり方から推定する
  return tailTurnAngle(points) > HANE_ANGLE_THRESHOLD ? "hane" : "tome";
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
